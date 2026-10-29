/**
 * Persistence for KTC assets and their daily values.
 *
 * Every write is an idempotent upsert keyed on `(ktc_id)` / `(ktc_id, date)`,
 * so re-running a backfill, or a snapshot that overlaps days we already have,
 * changes nothing. That is what lets the daily job simply refetch the whole
 * 180-day feed whenever it suspects a gap.
 */
import type { DB } from '../db/index.js'
import { nyDateString } from '../lib/nyDate.js'
import { parsePickName } from './client.js'
import type { MatchReport, SleeperPlayerRow } from './match.js'
import type { KtcPoint, KtcRankingsAsset } from './schemas.js'

export function readSleeperPlayers(db: DB): SleeperPlayerRow[] {
  return db
    .prepare(
      `SELECT player_id, full_name, position, team, fantasy_positions_json FROM player`,
    )
    .all() as SleeperPlayerRow[]
}

/** player_id → ktc_id. */
export function readMatchOverrides(db: DB): Map<string, number> {
  const rows = db
    .prepare(`SELECT player_id, ktc_id FROM ktc_match_override`)
    .all() as Array<{ player_id: string; ktc_id: number }>
  return new Map(rows.map((r) => [r.player_id, r.ktc_id]))
}

/**
 * Write the asset catalogue. An asset that drops out of KTC's top 500 is left
 * in place rather than deleted — its stored history is still the right answer
 * for a trade that happened while it was ranked.
 */
export function upsertAssets(
  db: DB,
  assets: readonly KtcRankingsAsset[],
  match: MatchReport,
): void {
  const stmt = db.prepare(
    `INSERT INTO ktc_asset
       (ktc_id, slug, name, position, team, pick_season, pick_round, pick_tier,
        player_id, match_source, updated_at)
     VALUES (@ktc_id, @slug, @name, @position, @team, @pick_season, @pick_round,
             @pick_tier, @player_id, @match_source, @updated_at)
     ON CONFLICT(ktc_id) DO UPDATE SET
       slug = excluded.slug,
       name = excluded.name,
       position = excluded.position,
       team = excluded.team,
       pick_season = excluded.pick_season,
       pick_round = excluded.pick_round,
       pick_tier = excluded.pick_tier,
       -- Never overwrite a match with nothing: a name KTC temporarily spells
       -- differently should not drop a mapping we already had.
       player_id = COALESCE(excluded.player_id, ktc_asset.player_id),
       match_source = COALESCE(excluded.match_source, ktc_asset.match_source),
       updated_at = excluded.updated_at`,
  )
  const now = Date.now()
  const tx = db.transaction(() => {
    for (const a of assets) {
      const pick = parsePickName(a.playerName)
      const playerId = match.byKtcId.get(a.playerID) ?? null
      stmt.run({
        ktc_id: a.playerID,
        slug: a.slug,
        name: a.playerName,
        position: a.position,
        team: a.team ?? null,
        pick_season: pick?.season ?? null,
        pick_round: pick?.round ?? null,
        pick_tier: pick?.tier ?? null,
        player_id: playerId,
        match_source: playerId
          ? match.overridden.has(a.playerID)
            ? 'manual'
            : 'auto'
          : null,
        updated_at: now,
      })
    }
  })
  tx()
}

/** `ktcId → points`. Returns the number of rows written or refreshed. */
export function upsertValues(db: DB, series: ReadonlyMap<number, readonly KtcPoint[]>): number {
  const known = new Set(
    (db.prepare(`SELECT ktc_id FROM ktc_asset`).all() as Array<{ ktc_id: number }>).map(
      (r) => r.ktc_id,
    ),
  )
  const stmt = db.prepare(
    `INSERT INTO ktc_value (ktc_id, date, value, rank)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ktc_id, date) DO UPDATE SET
       value = excluded.value,
       rank = COALESCE(excluded.rank, ktc_value.rank)`,
  )
  let written = 0
  const tx = db.transaction(() => {
    for (const [ktcId, points] of series) {
      // The foreign key would reject these anyway; skipping keeps a histories
      // feed that is a few hours ahead of the catalogue from failing the run.
      if (!known.has(ktcId)) continue
      for (const p of points) {
        if (!Number.isFinite(p.value)) continue
        stmt.run(ktcId, p.date, Math.round(p.value), null)
        written++
      }
    }
  })
  tx()
  return written
}

/** Today's values straight off the rankings page, ranks included. */
export function upsertSnapshot(db: DB, assets: readonly KtcRankingsAsset[], atMs = Date.now()): number {
  const date = nyDateString(atMs)
  const stmt = db.prepare(
    `INSERT INTO ktc_value (ktc_id, date, value, rank)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ktc_id, date) DO UPDATE SET
       value = excluded.value,
       rank = COALESCE(excluded.rank, ktc_value.rank)`,
  )
  let written = 0
  const tx = db.transaction(() => {
    for (const a of assets) {
      const value = a.superflexValues.value
      if (value == null || !Number.isFinite(value)) continue
      stmt.run(a.playerID, date, Math.round(value), a.superflexValues.rank ?? null)
      written++
    }
  })
  tx()
  return written
}

export interface Coverage {
  earliest: string | null
  latest: string | null
  days: number
  rows: number
}

export function coverage(db: DB): Coverage {
  const row = db
    .prepare(
      // `rows` is a reserved word in SQLite's window-frame syntax, hence the alias.
      `SELECT MIN(date) AS earliest, MAX(date) AS latest,
              COUNT(DISTINCT date) AS days, COUNT(*) AS row_count
       FROM ktc_value`,
    )
    .get() as {
    earliest: string | null
    latest: string | null
    days: number
    row_count: number
  }
  return { earliest: row.earliest, latest: row.latest, days: row.days, rows: row.row_count }
}

/** Earliest stored date for one asset — what decides whether its page is needed. */
export function earliestFor(db: DB, ktcId: number): string | null {
  const row = db
    .prepare(`SELECT MIN(date) AS d FROM ktc_value WHERE ktc_id = ?`)
    .get(ktcId) as { d: string | null } | undefined
  return row?.d ?? null
}

export interface KtcAssetRow {
  ktc_id: number
  slug: string
  name: string
  position: string
  pick_season: number | null
  pick_round: number | null
  pick_tier: string | null
  player_id: string | null
}

/** The asset catalogue, for callers that need to go from a Sleeper id to KTC. */
export function readAssets(db: DB): KtcAssetRow[] {
  return db
    .prepare(
      `SELECT ktc_id, slug, name, position, pick_season, pick_round, pick_tier, player_id
       FROM ktc_asset`,
    )
    .all() as KtcAssetRow[]
}
