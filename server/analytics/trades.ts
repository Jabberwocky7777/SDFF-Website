/**
 * Trade tracker (PLAN.md §13) — pure read layer over the ingested trade,
 * weekly-roster and draft data. No network, no Sleeper, unit-testable.
 *
 * The key idea (§13.1): `player_week_roster` already holds who rostered whom
 * every week with per-player points, so attributing a trade's return is just a
 * scoped SUM.
 *
 * Attribution window:
 *   - redraft / keeper / bestball — only the season the trade happened. Rosters
 *     reset each year, so a player you traded for in 2023 stops "counting" once
 *     2023 ends.
 *   - dynasty — every season the asset stayed on your roster, broken out per
 *     year ("2025 points", "2026 points", …).
 *
 * Metrics per season (§13.3 — several, not one):
 *   pointsRostered / pointsStarted / par (started pts minus a replacement-level
 *   starter) / weeksRostered / weeksStarted.
 *
 * Picks resolve to the player drafted at that slot (§13.4). The recursive
 * pick-for-pick "trade tree" is not built yet — single-hop resolution only.
 */
import type { DB } from '../db/index.js'
import { getFamily } from './queries.js'

export interface SeasonLine {
  season: number
  pointsRostered: number
  pointsStarted: number
  par: number
  weeksRostered: number
  weeksStarted: number
}

export interface TradeAssetView {
  type: 'player' | 'pick' | 'faab'
  playerId: string | null
  label: string
  position: string | null
  fromUserId: string | null
  toUserId: string | null
  /** One entry per season this asset produced for the receiver. */
  bySeason: SeasonLine[]
  /** Grand totals across every season above. */
  pointsRostered: number
  pointsStarted: number
  par: number
  weeksRostered: number
  weeksStarted: number
  stillRostered: boolean
  resolvedPlayerId?: string | null
  resolutionStatus?: 'resolved' | 'pending' | 'unresolved'
}

export interface TradeSideView {
  userId: string
  name: string
  received: TradeAssetView[]
  /** Side-wide totals per season (sum of every received asset). */
  bySeason: SeasonLine[]
  totals: {
    pointsRostered: number
    pointsStarted: number
    par: number
    assetsReceived: number
    assetsStillRostered: number
  }
}

export interface TradeView {
  id: string
  season: number
  week: number | null
  date: number | null
  isOffseason: boolean
  teamCount: number
  /** dynasty → multi-season breakdowns; redraft → single season. */
  multiSeason: boolean
  sides: TradeSideView[]
  /** side[0] − side[1] grand started-points for 2-team trades; 0 otherwise. */
  netStartedDiff: number
  headline: string
  /** Roster-week sample size the return has been measured over. */
  weeksElapsed: number
}

// ── helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function emptyLine(season: number): SeasonLine {
  return { season, pointsRostered: 0, pointsStarted: 0, par: 0, weeksRostered: 0, weeksStarted: 0 }
}

function roundLine(l: SeasonLine): SeasonLine {
  return {
    season: l.season,
    pointsRostered: round2(l.pointsRostered),
    pointsStarted: round2(l.pointsStarted),
    par: round2(l.par),
    weeksRostered: l.weeksRostered,
    weeksStarted: l.weeksStarted,
  }
}

/** Merge b into a (mutates a). */
function addLine(a: SeasonLine, b: SeasonLine): void {
  a.pointsRostered += b.pointsRostered
  a.pointsStarted += b.pointsStarted
  a.par += b.par
  a.weeksRostered += b.weeksRostered
  a.weeksStarted += b.weeksStarted
}

/** Fold a list of per-season lines into one keyed map. */
function mergeSeasons(lines: SeasonLine[][]): SeasonLine[] {
  const by = new Map<number, SeasonLine>()
  for (const list of lines) {
    for (const l of list) {
      const cur = by.get(l.season) ?? emptyLine(l.season)
      addLine(cur, l)
      by.set(l.season, cur)
    }
  }
  return [...by.values()].sort((x, y) => x.season - y.season).map(roundLine)
}

function grandTotals(bySeason: SeasonLine[]) {
  return bySeason.reduce(
    (acc, l) => {
      acc.pointsRostered += l.pointsRostered
      acc.pointsStarted += l.pointsStarted
      acc.par += l.par
      acc.weeksRostered += l.weeksRostered
      acc.weeksStarted += l.weeksStarted
      return acc
    },
    { pointsRostered: 0, pointsStarted: 0, par: 0, weeksRostered: 0, weeksStarted: 0 },
  )
}

interface FamilyCtx {
  familyId: number
  dynasty: boolean
  names: Map<string, string>
  playerName: Map<string, string>
  playerPos: Map<string, string>
  replacement: Map<string, number>
  latest: { season: number; week: number } | null
  rosteredNow: Set<string>
}

function buildContext(db: DB, familyId: number, dynasty: boolean): FamilyCtx {
  const names = new Map<string, string>()
  for (const r of db
    .prepare(
      `SELECT m.user_id, COALESCE(m.canonical_name, m.display_name, m.user_id) AS name FROM manager m`,
    )
    .all() as Array<{ user_id: string; name: string }>) {
    names.set(r.user_id, r.name)
  }

  const playerName = new Map<string, string>()
  const playerPos = new Map<string, string>()
  for (const p of db
    .prepare(`SELECT player_id, full_name, position FROM player`)
    .all() as Array<{ player_id: string; full_name: string | null; position: string | null }>) {
    if (p.full_name) playerName.set(p.player_id, p.full_name)
    if (p.position) playerPos.set(p.player_id, p.position)
  }

  const replacement = new Map<string, number>()
  const byPos = new Map<string, number[]>()
  for (const row of db
    .prepare(
      `SELECT p.position AS position, pwr.points AS points
       FROM player_week_roster pwr
       JOIN league_season ls ON ls.league_id = pwr.league_id
       JOIN player p ON p.player_id = pwr.player_id
       WHERE ls.family_id = ? AND pwr.started = 1 AND pwr.points IS NOT NULL`,
    )
    .all(familyId) as Array<{ position: string | null; points: number }>) {
    const pos = row.position ?? 'OTHER'
    const list = byPos.get(pos) ?? []
    list.push(row.points)
    byPos.set(pos, list)
  }
  for (const [pos, list] of byPos) {
    list.sort((a, b) => a - b)
    replacement.set(pos, list[Math.floor(list.length * 0.25)] ?? 0)
  }

  const latestRow = db
    .prepare(
      `SELECT ls.season AS season, MAX(pwr.week) AS week
       FROM player_week_roster pwr
       JOIN league_season ls ON ls.league_id = pwr.league_id
       WHERE ls.family_id = ?
         AND ls.season = (
           SELECT MAX(ls2.season) FROM player_week_roster pwr2
           JOIN league_season ls2 ON ls2.league_id = pwr2.league_id
           WHERE ls2.family_id = ?
         )`,
    )
    .get(familyId, familyId) as { season: number | null; week: number | null } | undefined

  const latest =
    latestRow?.season != null && latestRow.week != null
      ? { season: latestRow.season, week: latestRow.week }
      : null

  const rosteredNow = new Set<string>()
  if (latest) {
    for (const r of db
      .prepare(
        `SELECT pwr.user_id AS user_id, pwr.player_id AS player_id
         FROM player_week_roster pwr
         JOIN league_season ls ON ls.league_id = pwr.league_id
         WHERE ls.family_id = ? AND ls.season = ? AND pwr.week = ?`,
      )
      .all(familyId, latest.season, latest.week) as Array<{
      user_id: string | null
      player_id: string
    }>) {
      if (r.user_id) rosteredNow.add(`${r.user_id}:${r.player_id}`)
    }
  }

  return { familyId, dynasty, names, playerName, playerPos, replacement, latest, rosteredNow }
}

interface RawTrade {
  id: string
  season: number
  week: number | null
  created_ms: number | null
  team_count: number | null
  is_offseason: number
}

interface RawAsset {
  asset_type: 'player' | 'pick' | 'faab'
  player_id: string | null
  pick_season: number | null
  pick_round: number | null
  pick_original_roster_id: number | null
  faab_amount: number | null
  from_user_id: string | null
  to_user_id: string | null
}

/**
 * Per-season points a player produced for `userId`, starting at
 * (fromSeason, fromWeek). Dynasty families follow the asset forward; everyone
 * else stops at the end of `fromSeason`.
 */
function attributePlayer(
  db: DB,
  ctx: FamilyCtx,
  playerId: string,
  userId: string,
  fromSeason: number,
  fromWeek: number,
): SeasonLine[] {
  const seasonClause = ctx.dynasty
    ? '(ls.season > @s OR (ls.season = @s AND pwr.week >= @w))'
    : '(ls.season = @s AND pwr.week >= @w)'

  const rows = db
    .prepare(
      `SELECT ls.season AS season, pwr.points AS points, pwr.started AS started
       FROM player_week_roster pwr
       JOIN league_season ls ON ls.league_id = pwr.league_id
       WHERE ls.family_id = @fam AND pwr.player_id = @pid AND pwr.user_id = @uid
         AND pwr.points IS NOT NULL AND ${seasonClause}`,
    )
    .all({ fam: ctx.familyId, pid: playerId, uid: userId, s: fromSeason, w: fromWeek }) as Array<{
    season: number
    points: number
    started: number
  }>

  const pos = ctx.playerPos.get(playerId) ?? 'OTHER'
  const repl = ctx.replacement.get(pos) ?? ctx.replacement.get('OTHER') ?? 0

  const by = new Map<number, SeasonLine>()
  for (const r of rows) {
    const line = by.get(r.season) ?? emptyLine(r.season)
    line.pointsRostered += r.points
    line.weeksRostered++
    if (r.started) {
      line.pointsStarted += r.points
      line.par += r.points - repl
      line.weeksStarted++
    }
    by.set(r.season, line)
  }
  return [...by.values()].sort((a, b) => a.season - b.season).map(roundLine)
}

function resolvePick(
  db: DB,
  ctx: FamilyCtx,
  asset: RawAsset,
): { playerId: string | null; status: 'resolved' | 'pending' | 'unresolved' } {
  if (asset.pick_season == null || asset.pick_round == null) {
    return { playerId: null, status: 'unresolved' }
  }
  const draftExists = db
    .prepare(
      `SELECT 1 FROM draft_pick dp JOIN league_season ls ON ls.league_id = dp.league_id
       WHERE ls.family_id = ? AND ls.season = ? LIMIT 1`,
    )
    .get(ctx.familyId, asset.pick_season)
  if (!draftExists) return { playerId: null, status: 'pending' }

  const hit = db
    .prepare(
      `SELECT dp.player_id AS player_id
       FROM draft_pick dp JOIN league_season ls ON ls.league_id = dp.league_id
       WHERE ls.family_id = ? AND ls.season = ? AND dp.round = ? AND dp.roster_id = ? LIMIT 1`,
    )
    .get(ctx.familyId, asset.pick_season, asset.pick_round, asset.pick_original_roster_id) as
    | { player_id: string | null }
    | undefined

  return hit?.player_id
    ? { playerId: hit.player_id, status: 'resolved' }
    : { playerId: null, status: 'unresolved' }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}
function pickLabel(a: RawAsset): string {
  const rd = a.pick_round ? ordinal(a.pick_round) : '?'
  return `${a.pick_season ?? '?'} ${rd}-round pick`
}

function buildAsset(db: DB, ctx: FamilyCtx, trade: RawTrade, a: RawAsset, userId: string): TradeAssetView {
  const sinceWeek = trade.is_offseason ? 1 : Math.max(1, trade.week ?? 1)

  const base: TradeAssetView = {
    type: a.asset_type,
    playerId: a.player_id,
    label:
      a.asset_type === 'player'
        ? ctx.playerName.get(a.player_id ?? '') ?? 'Unknown player'
        : a.asset_type === 'faab'
          ? `$${a.faab_amount ?? 0} FAAB`
          : pickLabel(a),
    position: a.player_id ? ctx.playerPos.get(a.player_id) ?? null : null,
    fromUserId: a.from_user_id,
    toUserId: a.to_user_id,
    bySeason: [],
    pointsRostered: 0,
    pointsStarted: 0,
    par: 0,
    weeksRostered: 0,
    weeksStarted: 0,
    stillRostered: false,
  }

  let attributedPlayerId: string | null = null
  let fromSeason = trade.season
  if (a.asset_type === 'player' && a.player_id) {
    attributedPlayerId = a.player_id
  } else if (a.asset_type === 'pick') {
    const { playerId, status } = resolvePick(db, ctx, a)
    base.resolvedPlayerId = playerId
    base.resolutionStatus = status
    if (playerId) {
      attributedPlayerId = playerId
      fromSeason = a.pick_season ?? trade.season
      base.label = `${pickLabel(a)} → ${ctx.playerName.get(playerId) ?? 'Unknown'}`
      base.position = ctx.playerPos.get(playerId) ?? null
    }
  }

  if (attributedPlayerId) {
    base.bySeason = attributePlayer(db, ctx, attributedPlayerId, userId, fromSeason, sinceWeek)
    const g = grandTotals(base.bySeason)
    base.pointsRostered = round2(g.pointsRostered)
    base.pointsStarted = round2(g.pointsStarted)
    base.par = round2(g.par)
    base.weeksRostered = g.weeksRostered
    base.weeksStarted = g.weeksStarted
    base.stillRostered = ctx.rosteredNow.has(`${userId}:${attributedPlayerId}`)
  }

  return base
}

function buildView(db: DB, ctx: FamilyCtx, trade: RawTrade): TradeView {
  const assets = db
    .prepare(
      `SELECT asset_type, player_id, pick_season, pick_round, pick_original_roster_id,
              faab_amount, from_user_id, to_user_id
       FROM trade_asset WHERE trade_id = ?`,
    )
    .all(trade.id) as RawAsset[]

  const userIds = new Set<string>()
  for (const a of assets) {
    if (a.to_user_id) userIds.add(a.to_user_id)
    if (a.from_user_id) userIds.add(a.from_user_id)
  }

  const sides: TradeSideView[] = [...userIds].map((userId) => {
    const received = assets
      .filter((a) => a.to_user_id === userId)
      .map((a) => buildAsset(db, ctx, trade, a, userId))

    const bySeason = mergeSeasons(received.map((r) => r.bySeason))
    const g = grandTotals(bySeason)

    return {
      userId,
      name: ctx.names.get(userId) ?? userId,
      received,
      bySeason,
      totals: {
        pointsRostered: round2(g.pointsRostered),
        pointsStarted: round2(g.pointsStarted),
        par: round2(g.par),
        assetsReceived: received.length,
        assetsStillRostered: received.filter((r) => r.stillRostered).length,
      },
    }
  })

  const weeksElapsed = Math.max(
    0,
    ...sides.map((s) => s.bySeason.reduce((n, l) => n + l.weeksRostered, 0)),
  )

  let netStartedDiff = 0
  let headline = 'Not enough games have been played since this trade to judge it.'
  if (sides.length === 2 && weeksElapsed > 0) {
    netStartedDiff = round2(sides[0].totals.pointsStarted - sides[1].totals.pointsStarted)
    const [ahead, behind] = netStartedDiff >= 0 ? sides : [sides[1], sides[0]]
    const gap = Math.abs(netStartedDiff)
    const span = ctx.dynasty && sides.some((s) => s.bySeason.length > 1) ? ' so far' : ''
    headline =
      gap < 1
        ? `Dead even${span} — ${sides[0].name} and ${sides[1].name}'s returns are within a point.`
        : `${ahead.name}'s side has started ${gap.toFixed(1)} more points than ${behind.name}'s${span}.`
  }

  return {
    id: trade.id,
    season: trade.season,
    week: trade.week,
    date: trade.created_ms,
    isOffseason: !!trade.is_offseason,
    teamCount: trade.team_count ?? sides.length,
    multiSeason: ctx.dynasty,
    sides,
    netStartedDiff,
    headline,
    weeksElapsed,
  }
}

// ── public API ───────────────────────────────────────────────────────────────

function isDynasty(type: string): boolean {
  return type === 'dynasty'
}

export function getTradeFeed(
  db: DB,
  slug: string,
  opts: { season?: number; userId?: string; limit?: number } = {},
): TradeView[] {
  const family = getFamily(db, slug)
  if (!family) return []
  const ctx = buildContext(db, family.id, isDynasty(family.league_type))

  const params: unknown[] = [family.id]
  let where = 'family_id = ?'
  if (opts.season != null) {
    where += ' AND season = ?'
    params.push(opts.season)
  }
  const trades = db
    .prepare(
      `SELECT id, season, week, created_ms, team_count, is_offseason
       FROM trade WHERE ${where} ORDER BY COALESCE(created_ms, 0) DESC, season DESC`,
    )
    .all(...params) as RawTrade[]

  let views = trades.map((t) => buildView(db, ctx, t))
  if (opts.userId) views = views.filter((v) => v.sides.some((s) => s.userId === opts.userId))
  if (opts.limit != null) views = views.slice(0, opts.limit)
  return views
}

export function getTradeDetail(db: DB, slug: string, tradeId: string): TradeView | null {
  const family = getFamily(db, slug)
  if (!family) return null
  const trade = db
    .prepare(
      `SELECT id, season, week, created_ms, team_count, is_offseason
       FROM trade WHERE id = ? AND family_id = ?`,
    )
    .get(tradeId, family.id) as RawTrade | undefined
  if (!trade) return null
  return buildView(db, buildContext(db, family.id, isDynasty(family.league_type)), trade)
}
