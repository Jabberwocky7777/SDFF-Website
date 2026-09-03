/**
 * Read layer over the ingested SQLite data. Pure functions of a DB handle —
 * no network, no Sleeper, unit-testable with a fixture DB.
 *
 * Everything here is scoped to a single league *family* (by slug). Cross-league
 * aggregation is deliberately not built yet (leagues stay siloed).
 */
import type { DB } from '../db/index.js'

export interface FamilyRow {
  id: number
  slug: string
  display_name: string
  league_type: string
  sort_order: number
}

export function getFamily(db: DB, slug: string): FamilyRow | undefined {
  return db
    .prepare(`SELECT id, slug, display_name, league_type, sort_order FROM league_family WHERE slug = ?`)
    .get(slug) as FamilyRow | undefined
}

export interface SeasonRow {
  leagueId: string
  season: number
  status: string | null
  totalRosters: number | null
  capabilities: Record<string, unknown> | null
  champion: { userId: string; name: string | null } | null
  runnerUp: { userId: string; name: string | null } | null
}

export function getSeasons(db: DB, slug: string): SeasonRow[] {
  const family = getFamily(db, slug)
  if (!family) return []
  const rows = db
    .prepare(
      `SELECT ls.league_id, ls.season, ls.status, ls.total_rosters, ls.capabilities_json
       FROM league_season ls WHERE ls.family_id = ? ORDER BY ls.season DESC`,
    )
    .all(family.id) as Array<{
    league_id: string
    season: number
    status: string | null
    total_rosters: number | null
    capabilities_json: string | null
  }>

  const placeStmt = db.prepare(
    `SELECT ts.user_id, m.display_name AS name
     FROM team_season ts LEFT JOIN manager m ON m.user_id = ts.user_id
     WHERE ts.league_id = ? AND ts.final_rank = ?`,
  )

  return rows.map((r) => {
    const champ = placeStmt.get(r.league_id, 1) as { user_id: string; name: string | null } | undefined
    const runner = placeStmt.get(r.league_id, 2) as { user_id: string; name: string | null } | undefined
    return {
      leagueId: r.league_id,
      season: r.season,
      status: r.status,
      totalRosters: r.total_rosters,
      capabilities: r.capabilities_json ? JSON.parse(r.capabilities_json) : null,
      champion: champ ? { userId: champ.user_id, name: champ.name } : null,
      runnerUp: runner ? { userId: runner.user_id, name: runner.name } : null,
    }
  })
}

interface RawGame {
  league_id: string
  season: number
  week: number
  user_id: string
  points: number
  opponent_user_id: string | null
  opponent_points: number | null
  result: 'W' | 'L' | 'T'
  is_playoff: number
  is_consolation: number
  median_result: 'W' | 'L' | null
}

/** Every decided regular-season + playoff game in the family (one row per team per game). */
function familyGames(db: DB, slug: string, opts: { season?: number } = {}): RawGame[] {
  const family = getFamily(db, slug)
  if (!family) return []
  const params: unknown[] = [family.id]
  let seasonClause = ''
  if (opts.season != null) {
    seasonClause = ' AND ls.season = ?'
    params.push(opts.season)
  }
  return db
    .prepare(
      `SELECT m.league_id, ls.season, m.week, m.user_id, m.points,
              m.opponent_user_id, m.opponent_points, m.result,
              m.is_playoff, m.is_consolation, m.median_result
       FROM matchup m
       JOIN league_season ls ON ls.league_id = m.league_id
       WHERE ls.family_id = ?${seasonClause}
         AND m.result IS NOT NULL AND m.user_id IS NOT NULL`,
    )
    .all(...params) as RawGame[]
}

function displayNames(db: DB, userIds: Iterable<string>): Map<string, string> {
  const names = new Map<string, string>()
  const stmt = db.prepare(`SELECT display_name, canonical_name FROM manager WHERE user_id = ?`)
  for (const id of new Set(userIds)) {
    const row = stmt.get(id) as { display_name: string | null; canonical_name: string | null } | undefined
    names.set(id, row?.canonical_name ?? row?.display_name ?? id)
  }
  return names
}

export interface StandingRow {
  userId: string
  name: string
  seasons: number
  wins: number
  losses: number
  ties: number
  winPct: number
  pointsFor: number
  pointsAgainst: number
  ppg: number
  medianWins: number
  medianLosses: number
  playoffAppearances: number
  championships: number
  runnerUps: number
  lastPlaceFinishes: number
  bestFinish: number | null
  regularSeasonWins: number
  playoffWins: number
}

export function getStandings(db: DB, slug: string, season?: number): StandingRow[] {
  const family = getFamily(db, slug)
  if (!family) return []
  const games = familyGames(db, slug, { season: season ?? undefined })
  const names = displayNames(db, games.map((g) => g.user_id))

  const agg = new Map<string, StandingRow>()
  const seasonsSeen = new Map<string, Set<number>>()

  const get = (userId: string): StandingRow => {
    let row = agg.get(userId)
    if (!row) {
      row = {
        userId,
        name: names.get(userId) ?? userId,
        seasons: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winPct: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        ppg: 0,
        medianWins: 0,
        medianLosses: 0,
        playoffAppearances: 0,
        championships: 0,
        runnerUps: 0,
        lastPlaceFinishes: 0,
        bestFinish: null,
        regularSeasonWins: 0,
        playoffWins: 0,
      }
      agg.set(userId, row)
      seasonsSeen.set(userId, new Set())
    }
    return row
  }

  for (const g of games) {
    const row = get(g.user_id)
    seasonsSeen.get(g.user_id)!.add(g.season)
    if (g.result === 'W') row.wins++
    else if (g.result === 'L') row.losses++
    else row.ties++
    row.pointsFor += g.points
    row.pointsAgainst += g.opponent_points ?? 0
    if (g.median_result === 'W') row.medianWins++
    else if (g.median_result === 'L') row.medianLosses++
    if (g.is_playoff) {
      if (g.result === 'W') row.playoffWins++
    } else if (!g.is_consolation) {
      if (g.result === 'W') row.regularSeasonWins++
    }
  }

  // Season-level facts: finishes + playoff appearances.
  const teamSeasons = db
    .prepare(
      `SELECT ts.user_id, ls.season, ts.final_rank, ls.total_rosters,
              json_extract(ls.capabilities_json, '$.playoffTeams') AS playoff_teams,
              ts.regular_season_rank
       FROM team_season ts JOIN league_season ls ON ls.league_id = ts.league_id
       WHERE ls.family_id = ?${season != null ? ' AND ls.season = ?' : ''}
         AND ts.user_id IS NOT NULL AND ls.status = 'complete'`,
    )
    .all(...(season != null ? [family.id, season] : [family.id])) as Array<{
    user_id: string
    season: number
    final_rank: number | null
    total_rosters: number | null
    playoff_teams: number | null
    regular_season_rank: number | null
  }>

  for (const ts of teamSeasons) {
    // Don't materialize a manager who has no games in scope (e.g. a pre-draft
    // roster for a season that hasn't started).
    if (!agg.has(ts.user_id)) continue
    const row = get(ts.user_id)
    if (ts.final_rank === 1) row.championships++
    if (ts.final_rank === 2) row.runnerUps++
    if (ts.final_rank != null && ts.total_rosters != null && ts.final_rank === ts.total_rosters) {
      row.lastPlaceFinishes++
    }
    if (ts.final_rank != null) {
      row.bestFinish = row.bestFinish == null ? ts.final_rank : Math.min(row.bestFinish, ts.final_rank)
    }
    if (
      ts.regular_season_rank != null &&
      ts.playoff_teams != null &&
      ts.regular_season_rank <= ts.playoff_teams
    ) {
      row.playoffAppearances++
    }
  }

  for (const [userId, row] of agg) {
    row.seasons = seasonsSeen.get(userId)!.size
    const decided = row.wins + row.losses
    row.winPct = decided > 0 ? row.wins / decided : 0
    const gp = row.wins + row.losses + row.ties
    row.ppg = gp > 0 ? row.pointsFor / gp : 0
    row.pointsFor = round2(row.pointsFor)
    row.pointsAgainst = round2(row.pointsAgainst)
    row.ppg = round2(row.ppg)
    row.winPct = round3(row.winPct)
  }

  return [...agg.values()].sort(
    (a, b) => b.winPct - a.winPct || b.pointsFor - a.pointsFor,
  )
}

export interface H2HRecord {
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  meetings: number
}

/** A vs B, split by phase. `combined` = regular + playoff (consolation excluded). */
export interface H2HCell {
  combined: H2HRecord
  regular: H2HRecord
  playoff: H2HRecord
}

export interface H2HMatrix {
  managers: Array<{ userId: string; name: string }>
  /** cells[a][b] = a's record vs b */
  cells: Record<string, Record<string, H2HCell>>
}

function emptyRecord(): H2HRecord {
  return { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, meetings: 0 }
}

function tallyRecord(rec: H2HRecord, g: { result: 'W' | 'L' | 'T'; points: number; opponent_points: number | null }): void {
  if (g.result === 'W') rec.wins++
  else if (g.result === 'L') rec.losses++
  else rec.ties++
  rec.pointsFor += g.points
  rec.pointsAgainst += g.opponent_points ?? 0
  rec.meetings++
}

function roundRecord(rec: H2HRecord): void {
  rec.pointsFor = round2(rec.pointsFor)
  rec.pointsAgainst = round2(rec.pointsAgainst)
}

export function getH2HMatrix(db: DB, slug: string): H2HMatrix {
  const games = familyGames(db, slug).filter((g) => !g.is_consolation)
  const names = displayNames(db, games.flatMap((g) => [g.user_id, g.opponent_user_id ?? '']))
  names.delete('')

  const cells: Record<string, Record<string, H2HCell>> = {}
  const ensure = (a: string, b: string): H2HCell => {
    cells[a] ??= {}
    cells[a][b] ??= { combined: emptyRecord(), regular: emptyRecord(), playoff: emptyRecord() }
    return cells[a][b]
  }

  for (const g of games) {
    if (!g.opponent_user_id) continue
    const cell = ensure(g.user_id, g.opponent_user_id)
    tallyRecord(cell.combined, g)
    tallyRecord(g.is_playoff ? cell.playoff : cell.regular, g)
  }

  for (const a of Object.keys(cells)) {
    for (const b of Object.keys(cells[a])) {
      roundRecord(cells[a][b].combined)
      roundRecord(cells[a][b].regular)
      roundRecord(cells[a][b].playoff)
    }
  }

  const managers = [...names.entries()]
    .map(([userId, name]) => ({ userId, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { managers, cells }
}

export interface H2HGame {
  season: number
  week: number
  points: number
  opponentPoints: number
  result: 'W' | 'L' | 'T'
  margin: number
  isPlayoff: boolean
  isConsolation: boolean
}

export interface H2HWLT {
  wins: number
  losses: number
  ties: number
}

export interface H2HGameLog {
  a: string
  b: string
  aName: string
  bName: string
  /** combined = regular + playoff (consolation games are excluded everywhere). */
  record: { combined: H2HWLT; regular: H2HWLT; playoff: H2HWLT }
  games: H2HGame[]
}

export function getH2HGameLog(db: DB, slug: string, userA: string, userB: string): H2HGameLog {
  const family = getFamily(db, slug)
  const names = displayNames(db, [userA, userB])
  const empty: H2HGameLog = {
    a: userA,
    b: userB,
    aName: names.get(userA) ?? userA,
    bName: names.get(userB) ?? userB,
    record: {
      combined: { wins: 0, losses: 0, ties: 0 },
      regular: { wins: 0, losses: 0, ties: 0 },
      playoff: { wins: 0, losses: 0, ties: 0 },
    },
    games: [],
  }
  if (!family) return empty

  const rows = db
    .prepare(
      `SELECT ls.season, m.week, m.points, m.opponent_points, m.result, m.is_playoff, m.is_consolation
       FROM matchup m JOIN league_season ls ON ls.league_id = m.league_id
       WHERE ls.family_id = ? AND m.user_id = ? AND m.opponent_user_id = ? AND m.result IS NOT NULL
         AND m.is_consolation = 0
       ORDER BY ls.season, m.week`,
    )
    .all(family.id, userA, userB) as Array<{
    season: number
    week: number
    points: number
    opponent_points: number
    result: 'W' | 'L' | 'T'
    is_playoff: number
    is_consolation: number
  }>

  const record = empty.record
  const bump = (r: H2HWLT, result: 'W' | 'L' | 'T') => {
    if (result === 'W') r.wins++
    else if (result === 'L') r.losses++
    else r.ties++
  }
  const games: H2HGame[] = rows.map((r) => {
    bump(record.combined, r.result)
    bump(r.is_playoff ? record.playoff : record.regular, r.result)
    return {
      season: r.season,
      week: r.week,
      points: round2(r.points),
      opponentPoints: round2(r.opponent_points),
      result: r.result,
      margin: round2(r.points - r.opponent_points),
      isPlayoff: !!r.is_playoff,
      isConsolation: !!r.is_consolation,
    }
  })

  return { ...empty, record, games }
}

export interface RecordEntry {
  label: string
  userId: string | null
  name: string | null
  value: number
  season: number | null
  week: number | null
  detail?: string
}

export function getRecordsBook(db: DB, slug: string): RecordEntry[] {
  const games = familyGames(db, slug)
  if (games.length === 0) return []
  const names = displayNames(db, games.map((g) => g.user_id))
  const nm = (id: string) => names.get(id) ?? id

  const out: RecordEntry[] = []

  const bySortDesc = [...games].sort((a, b) => b.points - a.points)
  const highWeek = bySortDesc[0]
  out.push({
    label: 'Highest single-week score',
    userId: highWeek.user_id,
    name: nm(highWeek.user_id),
    value: round2(highWeek.points),
    season: highWeek.season,
    week: highWeek.week,
  })
  const lowWeek = bySortDesc[bySortDesc.length - 1]
  out.push({
    label: 'Lowest single-week score',
    userId: lowWeek.user_id,
    name: nm(lowWeek.user_id),
    value: round2(lowWeek.points),
    season: lowWeek.season,
    week: lowWeek.week,
  })

  const withMargin = games
    .filter((g) => g.opponent_points != null)
    .map((g) => ({ ...g, margin: g.points - (g.opponent_points ?? 0) }))

  const blowout = [...withMargin].sort((a, b) => b.margin - a.margin)[0]
  out.push({
    label: 'Biggest blowout',
    userId: blowout.user_id,
    name: nm(blowout.user_id),
    value: round2(blowout.margin),
    season: blowout.season,
    week: blowout.week,
    detail: `${round2(blowout.points)}–${round2(blowout.opponent_points ?? 0)}`,
  })

  const nailBiter = [...withMargin]
    .filter((g) => g.margin > 0)
    .sort((a, b) => a.margin - b.margin)[0]
  if (nailBiter) {
    out.push({
      label: 'Closest finish',
      userId: nailBiter.user_id,
      name: nm(nailBiter.user_id),
      value: round2(nailBiter.margin),
      season: nailBiter.season,
      week: nailBiter.week,
      detail: `${round2(nailBiter.points)}–${round2(nailBiter.opponent_points ?? 0)}`,
    })
  }

  const highLoss = [...withMargin].filter((g) => g.result === 'L').sort((a, b) => b.points - a.points)[0]
  if (highLoss) {
    out.push({
      label: 'Highest-scoring loss',
      userId: highLoss.user_id,
      name: nm(highLoss.user_id),
      value: round2(highLoss.points),
      season: highLoss.season,
      week: highLoss.week,
    })
  }
  const lowWin = [...withMargin].filter((g) => g.result === 'W').sort((a, b) => a.points - b.points)[0]
  if (lowWin) {
    out.push({
      label: 'Lowest-scoring win',
      userId: lowWin.user_id,
      name: nm(lowWin.user_id),
      value: round2(lowWin.points),
      season: lowWin.season,
      week: lowWin.week,
    })
  }

  const highCombined = [...withMargin].sort(
    (a, b) => b.points + (b.opponent_points ?? 0) - (a.points + (a.opponent_points ?? 0)),
  )[0]
  out.push({
    label: 'Highest combined score',
    userId: null,
    name: null,
    value: round2(highCombined.points + (highCombined.opponent_points ?? 0)),
    season: highCombined.season,
    week: highCombined.week,
    detail: `${nm(highCombined.user_id)} vs ${
      highCombined.opponent_user_id ? nm(highCombined.opponent_user_id) : '?'
    }`,
  })

  // Streaks.
  const streak = longestStreaks(games)
  if (streak.win) {
    out.push({
      label: 'Longest win streak',
      userId: streak.win.userId,
      name: nm(streak.win.userId),
      value: streak.win.length,
      season: null,
      week: null,
    })
  }
  if (streak.loss) {
    out.push({
      label: 'Longest losing streak',
      userId: streak.loss.userId,
      name: nm(streak.loss.userId),
      value: streak.loss.length,
      season: null,
      week: null,
    })
  }

  return out
}

function longestStreaks(games: RawGame[]): {
  win: { userId: string; length: number } | null
  loss: { userId: string; length: number } | null
} {
  const byUser = new Map<string, RawGame[]>()
  for (const g of games) {
    const list = byUser.get(g.user_id) ?? []
    list.push(g)
    byUser.set(g.user_id, list)
  }
  let win: { userId: string; length: number } | null = null
  let loss: { userId: string; length: number } | null = null
  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.season - b.season || a.week - b.week)
    let curW = 0
    let curL = 0
    for (const g of list) {
      curW = g.result === 'W' ? curW + 1 : 0
      curL = g.result === 'L' ? curL + 1 : 0
      if (!win || curW > win.length) win = { userId, length: curW }
      if (!loss || curL > loss.length) loss = { userId, length: curL }
    }
  }
  return { win, loss }
}

export interface TimelineData {
  seasons: number[]
  managers: Array<{ userId: string; name: string }>
  /** cell[userId][season] = final rank (or null) */
  ranks: Record<string, Record<number, number | null>>
  champions: Record<number, string | null>
}

export function getTimeline(db: DB, slug: string): TimelineData {
  const family = getFamily(db, slug)
  if (!family) return { seasons: [], managers: [], ranks: {}, champions: {} }

  const rows = db
    .prepare(
      `SELECT ls.season, ts.user_id, ts.final_rank
       FROM team_season ts JOIN league_season ls ON ls.league_id = ts.league_id
       WHERE ls.family_id = ? AND ts.user_id IS NOT NULL
       ORDER BY ls.season`,
    )
    .all(family.id) as Array<{ season: number; user_id: string; final_rank: number | null }>

  const names = displayNames(db, rows.map((r) => r.user_id))
  const seasons = [...new Set(rows.map((r) => r.season))].sort((a, b) => a - b)
  const ranks: Record<string, Record<number, number | null>> = {}
  const champions: Record<number, string | null> = {}
  for (const s of seasons) champions[s] = null

  for (const r of rows) {
    ranks[r.user_id] ??= {}
    ranks[r.user_id][r.season] = r.final_rank
    if (r.final_rank === 1) champions[r.season] = r.user_id
  }

  const managers = [...new Set(rows.map((r) => r.user_id))]
    .map((userId) => ({ userId, name: names.get(userId) ?? userId }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { seasons, managers, ranks, champions }
}

export function getManagers(db: DB, slug: string): StandingRow[] {
  // Same shape as all-time standings — the manager list IS the career table.
  return getStandings(db, slug)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
