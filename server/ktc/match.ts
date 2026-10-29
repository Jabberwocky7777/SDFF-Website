/**
 * KTC asset → Sleeper player matching.
 *
 * KTC keys on names, not Sleeper ids, so this is the only bridge between the
 * two. It runs once per sync and the answer is stored in `ktc_asset.player_id`,
 * rather than being redone on every request the way the draft board's
 * frontend-side matching does.
 *
 * Pure: takes two lists, returns the mapping. No DB, no network.
 *
 * Rules, in order:
 *   1. a hand-maintained override wins outright;
 *   2. otherwise normalized name + position must identify exactly one Sleeper
 *      player;
 *   3. if several share that key, the team breaks the tie;
 *   4. anything still ambiguous is left unmatched and reported. A guess here
 *      would silently attach another player's value to a trade.
 *
 * A KTC entry with no Sleeper counterpart is normal (free agents, devy players
 * Sleeper has not added). So is the reverse: KTC ranks 500 assets, so anyone
 * deeper than that has no value to match in the first place.
 */
import { normalizePlayerName } from '../lib/playerName.js'
import { parsePickName } from './client.js'
import type { KtcRankingsAsset } from './schemas.js'

export interface SleeperPlayerRow {
  player_id: string
  full_name: string | null
  position: string | null
  team: string | null
}

export interface AmbiguousMatch {
  ktcId: number
  name: string
  position: string
  candidates: string[]
}

export interface MatchReport {
  /** KTC id → Sleeper player_id, for the assets that matched. */
  byKtcId: Map<number, string>
  /** KTC ids resolved by an override rather than by name. */
  overridden: Set<number>
  /** Player-position assets with no Sleeper counterpart. */
  unmatched: KtcRankingsAsset[]
  /** Several Sleeper players fit and the team did not separate them. */
  ambiguous: AmbiguousMatch[]
}

function key(name: string, position: string): string {
  return `${normalizePlayerName(name)}|${position.toUpperCase()}`
}

export function matchKtcAssets(
  ktcAssets: readonly KtcRankingsAsset[],
  sleeperPlayers: readonly SleeperPlayerRow[],
  overrides: ReadonlyMap<string, number> = new Map(),
): MatchReport {
  const byKey = new Map<string, SleeperPlayerRow[]>()
  for (const p of sleeperPlayers) {
    if (!p.full_name || !p.position) continue
    const k = key(p.full_name, p.position)
    const bucket = byKey.get(k)
    if (bucket) bucket.push(p)
    else byKey.set(k, [p])
  }

  // player_id → ktc_id inverted to ktc_id → player_id.
  const forcedByKtcId = new Map<number, string>()
  for (const [playerId, ktcId] of overrides) forcedByKtcId.set(ktcId, playerId)

  const report: MatchReport = {
    byKtcId: new Map(),
    overridden: new Set(),
    unmatched: [],
    ambiguous: [],
  }

  for (const asset of ktcAssets) {
    const forced = forcedByKtcId.get(asset.playerID)
    if (forced) {
      report.byKtcId.set(asset.playerID, forced)
      report.overridden.add(asset.playerID)
      continue
    }

    // Draft picks are not players — they are matched to trade assets by
    // season/round/tier instead, in server/analytics/ktc.ts.
    if (parsePickName(asset.playerName) !== null) continue

    const candidates = byKey.get(key(asset.playerName, asset.position)) ?? []
    if (candidates.length === 1) {
      report.byKtcId.set(asset.playerID, candidates[0].player_id)
      continue
    }
    if (candidates.length === 0) {
      report.unmatched.push(asset)
      continue
    }

    const team = asset.team?.toUpperCase() ?? null
    const onTeam = team ? candidates.filter((c) => c.team?.toUpperCase() === team) : []
    if (onTeam.length === 1) {
      report.byKtcId.set(asset.playerID, onTeam[0].player_id)
    } else {
      report.ambiguous.push({
        ktcId: asset.playerID,
        name: asset.playerName,
        position: asset.position,
        candidates: candidates.map((c) => c.player_id),
      })
    }
  }

  return report
}
