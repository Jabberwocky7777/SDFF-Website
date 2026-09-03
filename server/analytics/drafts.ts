/**
 * Historical draft boards — a read-only view of every completed draft in a
 * league family, built from the `draft_pick` rows ingested in Phase 2.
 *
 * Draft-type agnostic: a team's column (slot) is its first overall pick's rank,
 * so snake / linear / 3rd-round-reversal all render correctly.
 */
import type { DB } from '../db/index.js'
import { getFamily } from './queries.js'
import { getPositionalFinishes } from './playerSeason.js'

export interface DraftSlot {
  slot: number
  rosterId: number
  name: string
}

export interface DraftSeasonSummary {
  season: number
  draftId: string
  rounds: number
  teams: number
  totalPicks: number
}

export interface DraftPickView {
  pickNo: number
  round: number
  slot: number
  rosterId: number
  userId: string | null
  managerName: string | null
  viaTrade: boolean
  playerId: string | null
  playerName: string | null
  position: string | null
  nflTeam: string | null
  isKeeper: boolean
  /** Where he finished at his position that season, under this league's scoring. */
  posRank: number | null
  /** His season point total under this league's scoring. */
  seasonPoints: number | null
  /** How many players at this position were taken before him in this draft. */
  posDraftOrder: number | null
}

export interface DraftBoardView extends DraftSeasonSummary {
  slots: DraftSlot[]
  picks: DraftPickView[]
}

interface RawPick {
  draft_id: string
  season: number
  pick_no: number
  round: number
  roster_id: number | null
  user_id: string | null
  player_id: string | null
  is_keeper: number
  full_name: string | null
  position: string | null
  nfl_team: string | null
}

function familyPicks(db: DB, familyId: number, season?: number): RawPick[] {
  const params: unknown[] = [familyId]
  let clause = ''
  if (season != null) {
    clause = ' AND ls.season = ?'
    params.push(season)
  }
  return db
    .prepare(
      `SELECT dp.draft_id, ls.season, dp.pick_no, dp.round, dp.roster_id, dp.user_id,
              dp.player_id, dp.is_keeper,
              p.full_name, p.position, p.team AS nfl_team
       FROM draft_pick dp
       JOIN league_season ls ON ls.league_id = dp.league_id
       LEFT JOIN player p ON p.player_id = dp.player_id
       WHERE ls.family_id = ?${clause}
       ORDER BY ls.season, dp.pick_no`,
    )
    .all(...params) as RawPick[]
}

export function getDraftSeasons(db: DB, slug: string): DraftSeasonSummary[] {
  const family = getFamily(db, slug)
  if (!family) return []
  const rows = db
    .prepare(
      `SELECT ls.season AS season, dp.draft_id AS draft_id,
              MAX(dp.round) AS rounds, COUNT(DISTINCT dp.roster_id) AS teams, COUNT(*) AS total
       FROM draft_pick dp JOIN league_season ls ON ls.league_id = dp.league_id
       WHERE ls.family_id = ?
       GROUP BY dp.draft_id
       ORDER BY ls.season DESC`,
    )
    .all(family.id) as Array<{
    season: number
    draft_id: string
    rounds: number
    teams: number
    total: number
  }>
  return rows.map((r) => ({
    season: r.season,
    draftId: r.draft_id,
    rounds: r.rounds,
    teams: r.teams,
    totalPicks: r.total,
  }))
}

export function getDraftBoard(db: DB, slug: string, season: number): DraftBoardView | null {
  const family = getFamily(db, slug)
  if (!family) return null
  const picks = familyPicks(db, family.id, season)
  if (picks.length === 0) return null

  // A roster's slot = the rank of its earliest overall pick.
  const firstPick = new Map<number, number>()
  for (const p of picks) {
    if (p.roster_id == null) continue
    const cur = firstPick.get(p.roster_id)
    if (cur == null || p.pick_no < cur) firstPick.set(p.roster_id, p.pick_no)
  }
  const orderedRosters = [...firstPick.entries()].sort((a, b) => a[1] - b[1]).map(([rid]) => rid)
  const slotOf = new Map<number, number>()
  orderedRosters.forEach((rid, i) => slotOf.set(rid, i + 1))

  // Column headers + slot-owner lookup — from that season's team_season rows.
  const teamNames = new Map<number, string>()
  const slotOwner = new Map<number, string | null>()
  for (const r of db
    .prepare(
      `SELECT ts.roster_id, ts.user_id, ts.team_name, COALESCE(m.canonical_name, m.display_name) AS manager
       FROM team_season ts
       LEFT JOIN manager m ON m.user_id = ts.user_id
       JOIN league_season ls ON ls.league_id = ts.league_id
       WHERE ls.family_id = ? AND ls.season = ?`,
    )
    .all(family.id, season) as Array<{
    roster_id: number
    user_id: string | null
    team_name: string | null
    manager: string | null
  }>) {
    teamNames.set(r.roster_id, r.team_name?.trim() || r.manager || `Team ${r.roster_id}`)
    slotOwner.set(r.roster_id, r.user_id)
  }

  const managerNames = new Map<string, string>()
  for (const r of db
    .prepare(`SELECT user_id, COALESCE(canonical_name, display_name, user_id) AS name FROM manager`)
    .all() as Array<{ user_id: string; name: string }>) {
    managerNames.set(r.user_id, r.name)
  }

  const teams = orderedRosters.length
  const slots: DraftSlot[] = orderedRosters.map((rid, i) => ({
    slot: i + 1,
    rosterId: rid,
    name: teamNames.get(rid) ?? `Team ${rid}`,
  }))

  // Season finishes, plus where each player sat in his position's draft order,
  // so the board can say whether a pick beat or missed its expectation.
  const finishes = getPositionalFinishes(db, family.id, season)
  const takenAtPosition = new Map<string, number>()

  const pickViews: DraftPickView[] = picks.map((p) => {
    const slot = p.roster_id != null ? slotOf.get(p.roster_id) ?? 0 : 0
    // "via trade" — the pick's slot roster differs from who actually made it.
    const slotOwnerId = p.roster_id != null ? slotOwner.get(p.roster_id) ?? null : null
    const finish = p.player_id ? finishes.get(p.player_id) ?? null : null
    let posDraftOrder: number | null = null
    if (p.position) {
      posDraftOrder = (takenAtPosition.get(p.position) ?? 0) + 1
      takenAtPosition.set(p.position, posDraftOrder)
    }
    return {
      pickNo: p.pick_no,
      round: p.round,
      slot,
      rosterId: p.roster_id ?? 0,
      userId: p.user_id,
      managerName: p.user_id ? managerNames.get(p.user_id) ?? null : null,
      viaTrade: !!(p.user_id && slotOwnerId && p.user_id !== slotOwnerId),
      playerId: p.player_id,
      playerName: p.full_name,
      position: p.position,
      nflTeam: p.nfl_team,
      isKeeper: !!p.is_keeper,
      posRank: finish?.posRank ?? null,
      seasonPoints: finish?.points ?? null,
      posDraftOrder,
    }
  })

  const summary = getDraftSeasons(db, slug).find((s) => s.season === season)

  return {
    season,
    draftId: picks[0].draft_id,
    rounds: summary?.rounds ?? Math.max(...picks.map((p) => p.round)),
    teams,
    totalPicks: picks.length,
    slots,
    picks: pickViews,
  }
}
