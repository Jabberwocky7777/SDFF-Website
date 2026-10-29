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
 *   2. normalized full name + an eligible position must identify exactly one
 *      Sleeper player — "eligible" meaning any of `fantasy_positions`, not just
 *      the headline one, because Sleeper lists Travis Hunter as a `DB` who is
 *      also a WR (the same reason migration 007 exists);
 *   3. failing that, normalized **last** name + eligible position + team, which
 *      is what bridges the first-name variants the two sites disagree on —
 *      Chig/Chigoziem Okonkwo, Gabe/Gabriel Davis, Kenny/Kenneth Gainwell;
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
  /** Raw JSON array from Sleeper, e.g. '["DB","WR"]'. */
  fantasy_positions_json?: string | null
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
  /** Several Sleeper players fit and neither team nor position separated them. */
  ambiguous: AmbiguousMatch[]
}

/**
 * KTC's team codes are its own: `TBB` where Sleeper says `TB`, `NEP` for `NE`,
 * and `FA` instead of no team at all. Without this the team tiebreaker silently
 * failed for nine franchises — which is how Kenny Gainwell (TBB/TB) came out
 * unmatched and Kyle Williams (NEP/NE) stayed ambiguous.
 */
const KTC_TEAM_ALIASES: Record<string, string> = {
  GBP: 'GB',
  JAC: 'JAX',
  KCC: 'KC',
  LVR: 'LV',
  NEP: 'NE',
  NOS: 'NO',
  SFO: 'SF',
  TBB: 'TB',
}

function sleeperTeam(ktcTeam: string | null | undefined): string | null {
  if (!ktcTeam) return null
  const code = ktcTeam.toUpperCase()
  if (code === 'FA') return null
  return KTC_TEAM_ALIASES[code] ?? code
}

/** Every position a Sleeper player can legally fill. */
function eligiblePositions(p: SleeperPlayerRow): string[] {
  const out = new Set<string>()
  if (p.position) out.add(p.position.toUpperCase())
  if (p.fantasy_positions_json) {
    try {
      const parsed: unknown = JSON.parse(p.fantasy_positions_json)
      if (Array.isArray(parsed)) {
        for (const v of parsed) if (typeof v === 'string') out.add(v.toUpperCase())
      }
    } catch {
      // A malformed column is not worth failing a sync over; the headline
      // position above still stands.
    }
  }
  return [...out]
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : name
}

function addTo(index: Map<string, SleeperPlayerRow[]>, key: string, row: SleeperPlayerRow): void {
  const bucket = index.get(key)
  if (bucket) bucket.push(row)
  else index.set(key, [row])
}

export function matchKtcAssets(
  ktcAssets: readonly KtcRankingsAsset[],
  sleeperPlayers: readonly SleeperPlayerRow[],
  overrides: ReadonlyMap<string, number> = new Map(),
): MatchReport {
  const byFullName = new Map<string, SleeperPlayerRow[]>()
  const byLastNameTeam = new Map<string, SleeperPlayerRow[]>()
  for (const p of sleeperPlayers) {
    if (!p.full_name) continue
    const full = normalizePlayerName(p.full_name)
    const last = normalizePlayerName(lastName(p.full_name))
    const team = p.team?.toUpperCase()
    for (const pos of eligiblePositions(p)) {
      addTo(byFullName, `${full}|${pos}`, p)
      if (team) addTo(byLastNameTeam, `${last}|${pos}|${team}`, p)
    }
  }

  // Overrides are stored player_id → ktc_id; invert for lookup by KTC id.
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

    const pos = asset.position.toUpperCase()
    const team = sleeperTeam(asset.team)

    const byName = byFullName.get(`${normalizePlayerName(asset.playerName)}|${pos}`) ?? []
    if (byName.length === 1) {
      report.byKtcId.set(asset.playerID, byName[0].player_id)
      continue
    }
    if (byName.length > 1) {
      const onTeam = team ? byName.filter((c) => c.team?.toUpperCase() === team) : []
      if (onTeam.length === 1) {
        report.byKtcId.set(asset.playerID, onTeam[0].player_id)
      } else {
        report.ambiguous.push({
          ktcId: asset.playerID,
          name: asset.playerName,
          position: asset.position,
          candidates: byName.map((c) => c.player_id),
        })
      }
      continue
    }

    // Nothing on the full name: try the surname, pinned to a team so this
    // cannot wander between two players who merely share one.
    const byLast = team
      ? byLastNameTeam.get(`${normalizePlayerName(lastName(asset.playerName))}|${pos}|${team}`) ?? []
      : []
    if (byLast.length === 1) {
      report.byKtcId.set(asset.playerID, byLast[0].player_id)
    } else if (byLast.length > 1) {
      report.ambiguous.push({
        ktcId: asset.playerID,
        name: asset.playerName,
        position: asset.position,
        candidates: byLast.map((c) => c.player_id),
      })
    } else {
      report.unmatched.push(asset)
    }
  }

  return report
}
