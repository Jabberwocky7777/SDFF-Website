/**
 * Ingest orchestration — walk the Sleeper API for a league family, normalize,
 * and persist to SQLite (PLAN.md §5 Phase 2).
 *
 * All writes are idempotent upserts, so any sync is safe to re-run. Progress is
 * recorded in `sync_log`. Gotchas from PLAN.md §7 are handled inline and
 * flagged with `// GOTCHA:` comments.
 */
import type { DB } from '../db/index.js'
import type { SleeperClient } from '../sleeper/client.js'
import type { LeagueRecord } from '../config/leagues.js'
import { walkLeagueChain } from '../sleeper/chain.js'
import { deriveCapabilities, type LeagueCapabilities } from './capabilities.js'
import { deriveFinalRanks } from './brackets.js'
import {
  applyManagerAliases,
  finishSyncLog,
  getKv,
  replaceTradeAssets,
  resolveManager,
  setKv,
  startSyncLog,
  upsertDraftPick,
  upsertLeagueSeason,
  upsertManager,
  upsertMatchup,
  upsertPlayerWeekRoster,
  upsertTeamSeason,
  upsertTrade,
  upsertTradedPick,
  upsertTransaction,
} from './upsert.js'
import type { TradeAssetRow } from './upsert.js'
import type {
  SleeperLeague,
  SleeperMatchup,
  SleeperRoster,
  SleeperTransaction,
  SleeperUser,
} from '../sleeper/schemas.js'

const MAX_NFL_WEEK = 18
const PLAYERS_TTL_MS = 20 * 60 * 60 * 1000 // refresh at most ~once/day (PLAN.md §7)

export interface IngestOptions {
  /** 'backfill' pulls every season; 'incremental' only the current one. */
  mode: 'backfill' | 'incremental'
  /** Re-ingest seasons already marked complete in sync_log. */
  force?: boolean
  currentNflWeek: number
  currentNflSeason: number
  log?: (msg: string) => void
}

// ── Players dictionary ───────────────────────────────────────────────────────

export async function refreshPlayers(
  client: SleeperClient,
  db: DB,
  opts: { force?: boolean; log?: (m: string) => void } = {},
): Promise<number> {
  const log = opts.log ?? console.log
  const last = Number(getKv(db, 'players_refreshed_at') ?? 0)
  if (!opts.force && Date.now() - last < PLAYERS_TTL_MS) {
    log(`[players] fresh (updated ${new Date(last).toISOString()}), skipping`)
    return 0
  }

  log('[players] fetching /players/nfl (~5MB)…')
  const players = await client.getAllPlayers()
  const entries = Object.entries(players)
  const now = Date.now()

  const stmt = db.prepare(
    `INSERT INTO player (player_id, full_name, position, team, age, years_exp, status, updated_at)
     VALUES (@player_id, @full_name, @position, @team, @age, @years_exp, @status, @updated_at)
     ON CONFLICT(player_id) DO UPDATE SET
       full_name = excluded.full_name, position = excluded.position, team = excluded.team,
       age = excluded.age, years_exp = excluded.years_exp, status = excluded.status,
       updated_at = excluded.updated_at`,
  )

  const writeAll = db.transaction((rows: [string, Record<string, unknown>][]) => {
    for (const [id, p] of rows) {
      stmt.run({
        player_id: id,
        full_name:
          ((p.full_name as string) ??
            [p.first_name, p.last_name].filter(Boolean).join(' ')) ||
          null,
        position: (p.position as string) ?? null,
        team: (p.team as string) ?? null,
        age: (p.age as number) ?? null,
        years_exp: (p.years_exp as number) ?? null,
        status: (p.status as string) ?? null,
        updated_at: now,
      })
    }
  })
  writeAll(entries)
  setKv(db, 'players_refreshed_at', String(now))
  log(`[players] wrote ${entries.length} players`)
  return entries.length
}

// ── Normalization helpers ────────────────────────────────────────────────────

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function weeklyMedian(points: number[]): number | null {
  const vals = points.filter((p) => Number.isFinite(p)).sort((a, b) => a - b)
  if (vals.length === 0) return null
  const mid = Math.floor(vals.length / 2)
  return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid]
}

interface NormalizedWeek {
  rows: Parameters<typeof upsertMatchup>[1][]
  playerRows: Parameters<typeof upsertPlayerWeekRoster>[1][]
}

function normalizeWeek(
  db: DB,
  leagueId: string,
  season: number,
  week: number,
  matchups: SleeperMatchup[],
  rosterUser: Map<number, string | null>,
  playoffRosterIds: Set<number>,
  capabilities: LeagueCapabilities,
): NormalizedWeek {
  const rows: NormalizedWeek['rows'] = []
  const playerRows: NormalizedWeek['playerRows'] = []

  // Group by matchup_id to find opponents.
  const byMatchup = new Map<number, SleeperMatchup[]>()
  for (const m of matchups) {
    if (m.matchup_id == null) continue
    const list = byMatchup.get(m.matchup_id) ?? []
    list.push(m)
    byMatchup.set(m.matchup_id, list)
  }

  const isPlayoffWeek = week >= capabilities.playoffWeekStart
  const median = capabilities.hasMedianScoring
    ? weeklyMedian(matchups.map((m) => (m.points ?? NaN) as number))
    : null

  for (const m of matchups) {
    const rosterId = m.roster_id
    const userId = resolveManager(db, rosterUser.get(rosterId) ?? null)
    const points = numOrNull(m.points)

    let opponent: SleeperMatchup | undefined
    if (m.matchup_id != null) {
      opponent = byMatchup.get(m.matchup_id)?.find((o) => o.roster_id !== rosterId)
    }
    const oppPoints = numOrNull(opponent?.points)

    let result: 'W' | 'L' | 'T' | null = null
    if (points != null && oppPoints != null) {
      result = points > oppPoints ? 'W' : points < oppPoints ? 'L' : 'T'
    }

    let medianResult: 'W' | 'L' | null = null
    if (median != null && points != null) medianResult = points > median ? 'W' : 'L'

    const inPlayoffBracket = playoffRosterIds.has(rosterId)
    rows.push({
      leagueId,
      week,
      matchupId: m.matchup_id ?? null,
      rosterId,
      userId,
      points,
      opponentRosterId: opponent?.roster_id ?? null,
      opponentUserId: opponent
        ? resolveManager(db, rosterUser.get(opponent.roster_id) ?? null)
        : null,
      opponentPoints: oppPoints,
      result,
      isPlayoff: isPlayoffWeek && inPlayoffBracket,
      isConsolation: isPlayoffWeek && !inPlayoffBracket,
      medianResult,
      startersJson: m.starters ? JSON.stringify(m.starters) : null,
      startersPointsJson: m.starters_points ? JSON.stringify(m.starters_points) : null,
      playersJson: m.players ? JSON.stringify(m.players) : null,
      playersPointsJson: m.players_points ? JSON.stringify(m.players_points) : null,
    })

    // Flatten weekly roster snapshot (PLAN.md §13.1).
    const starters = new Set(m.starters ?? [])
    const pts = m.players_points ?? {}
    for (const pid of m.players ?? []) {
      playerRows.push({
        leagueId,
        season,
        week,
        playerId: pid,
        rosterId,
        userId,
        points: numOrNull(pts[pid]),
        started: starters.has(pid),
      })
    }
  }

  return { rows, playerRows }
}

type TradeAssetDraft = Omit<TradeAssetRow, 'tradeId'>

function parseTrade(
  txn: SleeperTransaction,
  ctx: { leagueId: string; familyId: number; season: number; rosterUser: Map<number, string | null> },
  db: DB,
): { assets: TradeAssetDraft[]; week: number | null } {
  const assets: TradeAssetDraft[] = []
  const user = (rid: number | null | undefined) =>
    rid == null ? null : resolveManager(db, ctx.rosterUser.get(rid) ?? null)

  // Player adds: player_id -> roster_id that received them. Drops in a trade are
  // the other side's adds, so `adds` alone covers who got what.
  for (const [playerId, toRoster] of Object.entries(txn.adds ?? {})) {
    const fromRoster =
      Object.entries(txn.drops ?? {}).find(([pid]) => pid === playerId)?.[1] ?? null
    assets.push({
      assetType: 'player',
      playerId,
      pickSeason: null,
      pickRound: null,
      pickOriginalRosterId: null,
      faabAmount: null,
      fromRosterId: fromRoster,
      toRosterId: toRoster,
      fromUserId: user(fromRoster),
      toUserId: user(toRoster),
    })
  }

  for (const pick of txn.draft_picks ?? []) {
    assets.push({
      assetType: 'pick',
      playerId: null,
      pickSeason: Number(pick.season),
      pickRound: pick.round,
      pickOriginalRosterId: pick.roster_id,
      faabAmount: null,
      fromRosterId: pick.previous_owner_id ?? null,
      toRosterId: pick.owner_id ?? null,
      fromUserId: user(pick.previous_owner_id ?? null),
      toUserId: user(pick.owner_id ?? null),
    })
  }

  for (const wb of txn.waiver_budget ?? []) {
    assets.push({
      assetType: 'faab',
      playerId: null,
      pickSeason: null,
      pickRound: null,
      pickOriginalRosterId: null,
      faabAmount: wb.amount,
      fromRosterId: wb.sender,
      toRosterId: wb.receiver,
      fromUserId: user(wb.sender),
      toUserId: user(wb.receiver),
    })
  }

  return { assets, week: txn.leg ?? null }
}

// ── One league-season ────────────────────────────────────────────────────────

async function ingestSeason(
  client: SleeperClient,
  db: DB,
  args: {
    familyId: number
    leagueId: string
    season: number
    league: SleeperLeague
    seasonsAvailable: number
    isComplete: boolean
    maxWeek: number
    log: (m: string) => void
  },
): Promise<void> {
  const { familyId, leagueId, season, league, log } = args

  const [users, rosters, tradedPicks, drafts] = await Promise.all([
    client.getLeagueUsers(leagueId),
    client.getRosters(leagueId),
    client.getTradedPicks(leagueId),
    client.getLeagueDrafts(leagueId),
  ])

  const capabilities = deriveCapabilities({
    league,
    seasonsAvailable: args.seasonsAvailable,
    tradedPicksCount: tradedPicks.length,
    isRookieDraft: drafts.some((d) => {
      const t = (d.settings ?? {}) as Record<string, unknown>
      return (t.rounds as number) != null && (t.rounds as number) <= 5 && season > 2000
    }),
  })

  const settings = (league.settings ?? {}) as Record<string, unknown>
  upsertLeagueSeason(db, {
    leagueId,
    familyId,
    season,
    status: league.status ?? null,
    previousLeagueId: league.previous_league_id ?? null,
    totalRosters: league.total_rosters ?? rosters.length,
    playoffWeekStart: (settings.playoff_week_start as number) ?? null,
    playoffTeams: (settings.playoff_teams as number) ?? null,
    scoringSettingsJson: league.scoring_settings ? JSON.stringify(league.scoring_settings) : null,
    rosterPositionsJson: league.roster_positions ? JSON.stringify(league.roster_positions) : null,
    settingsJson: JSON.stringify(settings),
    capabilitiesJson: JSON.stringify(capabilities),
    rawJson: JSON.stringify(league),
  })

  // Managers (global identity). GOTCHA: owner_id can be null for
  // commissioner-managed "orphan" teams — attribute to a synthetic manager.
  const usersById = new Map<string, SleeperUser>()
  for (const u of users) {
    usersById.set(u.user_id, u)
    upsertManager(db, {
      userId: u.user_id,
      displayName: u.display_name ?? u.username ?? null,
      avatar: u.avatar ?? null,
    })
  }
  const ORPHAN = '__orphan__'
  upsertManager(db, { userId: ORPHAN, displayName: 'Orphan Team', avatar: null, isSynthetic: true })

  const rosterUser = new Map<number, string | null>()
  for (const r of rosters) {
    const rawOwner = r.owner_id ?? ORPHAN
    const ownerId = resolveManager(db, rawOwner)
    rosterUser.set(r.roster_id, ownerId)
  }

  // Regular-season rank by (wins, points_for). Sleeper's roster wins/losses are
  // the H2H regular-season record even in median leagues.
  const rosterStats = rosters.map((r) => {
    const s = (r.settings ?? {}) as Record<string, number>
    const pf = (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100
    const pa = (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100
    return { roster: r, wins: s.wins ?? 0, losses: s.losses ?? 0, ties: s.ties ?? 0, pf, pa }
  })
  const ranked = [...rosterStats].sort((a, b) => b.wins - a.wins || b.pf - a.pf)
  const rankByRoster = new Map<number, number>()
  ranked.forEach((x, i) => rankByRoster.set(x.roster.roster_id, i + 1))

  for (const st of rosterStats) {
    const r: SleeperRoster = st.roster
    const meta = (r.metadata ?? {}) as Record<string, unknown>
    upsertTeamSeason(db, {
      leagueId,
      rosterId: r.roster_id,
      userId: rosterUser.get(r.roster_id) ?? null,
      coOwnerIdsJson: r.co_owners ? JSON.stringify(r.co_owners) : null,
      teamName:
        (usersById.get(r.owner_id ?? '')?.metadata?.team_name as string | undefined) ??
        (meta.team_name as string | undefined) ??
        null,
      wins: st.wins,
      losses: st.losses,
      ties: st.ties,
      pointsFor: st.pf,
      pointsAgainst: st.pa,
      division: ((r.settings ?? {}) as Record<string, number>).division ?? null,
      regularSeasonRank: rankByRoster.get(r.roster_id) ?? null,
      finalRank: null,
    })
  }

  // Brackets → playoff roster set + final_rank.
  const [winners, losers] = await Promise.all([
    client.getWinnersBracket(leagueId),
    client.getLosersBracket(leagueId),
  ])
  const playoffRosterIds = new Set<number>()
  for (const match of winners) {
    for (const key of ['t1', 't2', 'w', 'l'] as const) {
      const v = match[key]
      const n = typeof v === 'string' ? Number(v) : v
      if (typeof n === 'number' && Number.isInteger(n)) playoffRosterIds.add(n)
    }
  }

  const totalRosters = league.total_rosters ?? rosters.length
  if (args.isComplete && (winners.length > 0 || losers.length > 0)) {
    const finalRanks = deriveFinalRanks(winners, losers, totalRosters)
    for (const [rosterId, rank] of finalRanks) {
      db.prepare(
        `UPDATE team_season SET final_rank = ? WHERE league_id = ? AND roster_id = ?`,
      ).run(rank, leagueId, rosterId)
    }
    log(`  final ranks: ${finalRanks.size}/${totalRosters} teams placed`)
  }

  // GOTCHA: "week counts changed" — the NFL went 16→17 games in 2021 and
  // fantasy playoff schedules shifted. Don't ingest NFL weeks past the fantasy
  // championship: bound by the winners bracket's last round.
  const maxBracketRound = Math.max(0, ...winners.map((m) => m.r ?? 0))
  const lastFantasyWeek =
    maxBracketRound > 0
      ? capabilities.playoffWeekStart + maxBracketRound - 1
      : args.maxWeek
  const weekCeiling = Math.min(args.maxWeek, lastFantasyWeek)

  // Matchups + weekly roster snapshots.
  let weekCount = 0
  for (let week = 1; week <= weekCeiling; week++) {
    const matchups = await client.getMatchups(leagueId, week)
    if (matchups.length === 0) continue
    // GOTCHA: `points` is null for weeks that never happened AND 0 for a week
    // that exists but hasn't been played yet (e.g. the current week pre-kickoff).
    // A real played week always has someone above 0 — use that to skip both.
    if (!matchups.some((m) => (numOrNull(m.points) ?? 0) > 0)) continue

    const { rows, playerRows } = normalizeWeek(
      db,
      leagueId,
      season,
      week,
      matchups,
      rosterUser,
      playoffRosterIds,
      capabilities,
    )
    const writeWeek = db.transaction(() => {
      for (const row of rows) upsertMatchup(db, row)
      for (const pr of playerRows) upsertPlayerWeekRoster(db, pr)
    })
    writeWeek()
    weekCount++
  }
  log(`  matchups: ${weekCount} weeks`)

  // Transactions + trades. GOTCHA: offseason trades land in week 0 or 1
  // depending on timing — loop from 0 and dedupe on transaction_id (upsert).
  let txnCount = 0
  let tradeCount = 0
  for (let week = 0; week <= args.maxWeek; week++) {
    const txns = await client.getTransactions(leagueId, week)
    if (txns.length === 0) continue
    const writeTxns = db.transaction(() => {
      for (const txn of txns) {
        const waiverBid =
          ((txn.settings ?? {}) as Record<string, number>).waiver_bid ?? null
        upsertTransaction(db, {
          id: txn.transaction_id,
          leagueId,
          week: txn.leg ?? week,
          type: txn.type,
          status: txn.status ?? null,
          createdMs: txn.created ?? null,
          rosterIdsJson: txn.roster_ids ? JSON.stringify(txn.roster_ids) : null,
          addsJson: txn.adds ? JSON.stringify(txn.adds) : null,
          dropsJson: txn.drops ? JSON.stringify(txn.drops) : null,
          draftPicksJson: txn.draft_picks ? JSON.stringify(txn.draft_picks) : null,
          waiverBid,
          rawJson: JSON.stringify(txn),
        })
        txnCount++

        // GOTCHA: only ingest completed trades — vetoed/failed have other status.
        if (txn.type === 'trade' && txn.status === 'complete') {
          const { assets } = parseTrade(txn, { leagueId, familyId, season, rosterUser }, db)
          const rosterIds = txn.roster_ids ?? []
          upsertTrade(db, {
            id: txn.transaction_id,
            leagueId,
            familyId,
            season,
            week: txn.leg ?? week,
            createdMs: txn.created ?? null,
            teamCount: rosterIds.length || null,
            rosterIdsJson: JSON.stringify(rosterIds),
            isOffseason: (txn.leg ?? week) <= 1,
          })
          replaceTradeAssets(db, txn.transaction_id, assets)
          tradeCount++
        }
      }
    })
    writeTxns()
  }
  log(`  transactions: ${txnCount} (${tradeCount} trades)`)

  // Traded picks (current ownership snapshot).
  for (const tp of tradedPicks) {
    upsertTradedPick(db, {
      leagueId,
      pickSeason: tp.season,
      round: tp.round,
      originalRosterId: tp.roster_id,
      currentOwnerRosterId: tp.owner_id,
      previousOwnerRosterId: tp.previous_owner_id ?? null,
    })
  }

  // Drafts.
  let pickCount = 0
  for (const draft of drafts) {
    const picks = await client.getDraftPicks(draft.draft_id)
    const writePicks = db.transaction(() => {
      for (const p of picks) {
        const rid = typeof p.roster_id === 'string' ? Number(p.roster_id) : p.roster_id
        upsertDraftPick(db, {
          draftId: draft.draft_id,
          pickNo: p.pick_no,
          leagueId,
          season,
          round: p.round ?? null,
          rosterId: Number.isInteger(rid) ? (rid as number) : null,
          userId: resolveManager(db, p.picked_by ?? null),
          playerId: p.player_id ?? null,
          isKeeper: p.is_keeper === true,
        })
        pickCount++
      }
    })
    writePicks()
  }
  log(`  draft picks: ${pickCount}`)
}

// ── Family / all ─────────────────────────────────────────────────────────────

export async function ingestFamily(
  client: SleeperClient,
  db: DB,
  entry: LeagueRecord,
  opts: IngestOptions,
): Promise<void> {
  const log = opts.log ?? console.log
  const syncId = startSyncLog(db, entry.currentLeagueId, `${opts.mode}:${entry.slug}`)

  try {
    log(`\n=== ${entry.displayName} (${entry.slug}) ===`)
    const { entries: chain } = await walkLeagueChain(client, entry.currentLeagueId)
    if (chain.length === 0) throw new Error(`No leagues found for ${entry.slug}`)

    const familyId = entry.id

    // Manager aliases (admin-managed, PLAN.md §7) — applied before ingest so
    // resolveManager() collapses merged identities everywhere.
    applyManagerAliases(db)

    const seasonsToIngest =
      opts.mode === 'incremental'
        ? chain.filter((c) => c.season === opts.currentNflSeason || c.status !== 'complete')
        : chain

    for (const seasonEntry of seasonsToIngest) {
      const isComplete = seasonEntry.status === 'complete'
      const alreadyDone =
        isComplete &&
        !opts.force &&
        (db
          .prepare(
            `SELECT 1 FROM sync_log WHERE league_id = ? AND scope = ? AND status = 'ok' LIMIT 1`,
          )
          .get(seasonEntry.leagueId, `season:${seasonEntry.leagueId}`) as unknown)

      if (alreadyDone) {
        log(`\n-- ${seasonEntry.season} (${seasonEntry.leagueId}) — already synced, skipping`)
        continue
      }

      log(`\n-- ${seasonEntry.season} (${seasonEntry.leagueId}) status=${seasonEntry.status}`)
      const seasonSyncId = startSyncLog(db, seasonEntry.leagueId, `season:${seasonEntry.leagueId}`)
      try {
        const maxWeek =
          isComplete || seasonEntry.season < opts.currentNflSeason
            ? MAX_NFL_WEEK
            : Math.min(opts.currentNflWeek, MAX_NFL_WEEK)

        await ingestSeason(client, db, {
          familyId,
          leagueId: seasonEntry.leagueId,
          season: seasonEntry.season,
          league: seasonEntry.league,
          seasonsAvailable: chain.length,
          isComplete,
          maxWeek,
          log,
        })
        finishSyncLog(db, seasonSyncId, 'ok')
      } catch (err) {
        finishSyncLog(db, seasonSyncId, 'error', { error: (err as Error).message })
        throw err
      }
    }

    finishSyncLog(db, syncId, 'ok')
    log(`\n=== ${entry.slug} done (${client.stats.requestCount} Sleeper requests total) ===`)
  } catch (err) {
    finishSyncLog(db, syncId, 'error', { error: (err as Error).message })
    throw err
  }
}

export async function ingestAll(
  client: SleeperClient,
  db: DB,
  entries: LeagueRecord[],
  opts: IngestOptions,
): Promise<void> {
  await refreshPlayers(client, db, { log: opts.log })
  for (const entry of entries) {
    await ingestFamily(client, db, entry, opts)
  }
}
