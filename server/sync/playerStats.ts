/**
 * Populates `player_season_scoring` — each NFL player's season total and
 * positional finish under a given league family's scoring settings.
 *
 * The raw season stat bag comes from Sleeper once per season and is cached on
 * disk, so backfilling nine seasons across four families is nine fetches rather
 * than thirty-six. The per-family scoring is applied locally.
 */
import type { DB } from '../db/index.js'
import type { SleeperClient } from '../sleeper/client.js'
import type { SeasonStats } from '../sleeper/schemas.js'
import { readJsonFile, writeJsonFile } from '../lib/jsonFile.js'
import { rankSeasonScoring } from '../analytics/playerSeason.js'

const STATS_TTL_MS = 24 * 60 * 60 * 1000

interface CachedStats {
  cachedAt: number
  data: SeasonStats
}

function cacheName(season: number): string {
  return `season_stats_${season}.json`
}

/**
 * Season stats for `season`, from disk when fresh. Returns null when Sleeper
 * has nothing for that year — seasons older than its coverage simply get no
 * positional finishes rather than failing the sync.
 */
export async function loadSeasonStats(
  client: SleeperClient,
  season: number,
): Promise<SeasonStats | null> {
  const cached = readJsonFile<CachedStats | null>(cacheName(season), null)
  if (cached && Date.now() - cached.cachedAt < STATS_TTL_MS) return cached.data

  let fresh: SeasonStats | null
  try {
    fresh = await client.getSeasonStats(season)
  } catch (err) {
    // A stale cache beats no ranks at all.
    if (cached) return cached.data
    throw err
  }
  if (!fresh) return cached?.data ?? null

  writeJsonFile(cacheName(season), { cachedAt: Date.now(), data: fresh } satisfies CachedStats)
  return fresh
}

function playerPositions(db: DB): Map<string, string | null> {
  const rows = db.prepare(`SELECT player_id, position FROM player`).all() as Array<{
    player_id: string
    position: string | null
  }>
  return new Map(rows.map((r) => [r.player_id, r.position]))
}

/**
 * Recompute positional finishes for one family-season. No-op when the season
 * has no stored scoring settings or Sleeper has no stats for that year.
 * Returns how many players were ranked.
 */
export async function syncSeasonScoring(
  db: DB,
  client: SleeperClient,
  familyId: number,
  season: number,
  positions?: Map<string, string | null>,
): Promise<number> {
  const row = db
    .prepare(
      `SELECT ls.scoring_settings_json AS scoring
       FROM league_season ls
       WHERE ls.family_id = ? AND ls.season = ?
       LIMIT 1`,
    )
    .get(familyId, season) as { scoring: string | null } | undefined
  if (!row?.scoring) return 0

  let scoring: Record<string, number>
  try {
    scoring = JSON.parse(row.scoring) as Record<string, number>
  } catch {
    return 0
  }

  const stats = await loadSeasonStats(client, season)
  if (!stats) return 0

  const ranked = rankSeasonScoring({
    stats,
    positions: positions ?? playerPositions(db),
    scoring,
  })
  if (ranked.length === 0) return 0

  const insert = db.prepare(
    `INSERT INTO player_season_scoring (family_id, season, player_id, position, points, pos_rank, games)
     VALUES (@familyId, @season, @playerId, @position, @points, @posRank, @games)
     ON CONFLICT(family_id, season, player_id) DO UPDATE SET
       position = excluded.position,
       points = excluded.points,
       pos_rank = excluded.pos_rank,
       games = excluded.games`,
  )
  const clear = db.prepare(`DELETE FROM player_season_scoring WHERE family_id = ? AND season = ?`)

  db.transaction(() => {
    clear.run(familyId, season)
    for (const p of ranked) {
      insert.run({
        familyId,
        season,
        playerId: p.playerId,
        position: p.position,
        points: p.points,
        posRank: p.posRank,
        games: p.games,
      })
    }
  })()

  return ranked.length
}

/**
 * Recompute finishes for every season a family has on record. Positions are
 * loaded once and shared across seasons.
 */
export async function syncFamilyScoring(
  db: DB,
  client: SleeperClient,
  familyId: number,
): Promise<void> {
  const seasons = (
    db
      .prepare(`SELECT season FROM league_season WHERE family_id = ? ORDER BY season`)
      .all(familyId) as Array<{ season: number }>
  ).map((r) => r.season)
  if (seasons.length === 0) return

  const positions = playerPositions(db)
  for (const season of seasons) {
    try {
      await syncSeasonScoring(db, client, familyId, season, positions)
    } catch (err) {
      // One unavailable season shouldn't abort the rest of the backfill.
      console.warn(`[sync] season scoring failed for family ${familyId} ${season}:`, err)
    }
  }
}
