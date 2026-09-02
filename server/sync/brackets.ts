/**
 * Derive final league placement from the playoff brackets (PLAN.md §2, §7).
 *
 * `final_rank` is NOT given by Sleeper directly. The winners bracket decides
 * places 1..2k; the losers/toilet bracket decides the bottom places. Each
 * bracket match may carry `p` — the placement that match plays for — where the
 * winner takes `p` and the loser takes `p + 1`.
 *
 * This is best-effort: leagues configure brackets inconsistently, and the plan
 * says to hand-verify a few. Teams we can't place are left `null` and callers
 * fall back to regular-season rank.
 */
import type { BracketMatch } from '../sleeper/schemas.js'

function asRosterId(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isInteger(n) ? n : null
}

export function deriveFinalRanks(
  winners: BracketMatch[],
  losers: BracketMatch[],
  totalRosters: number,
): Map<number, number> {
  const ranks = new Map<number, number>()

  // Winners bracket: `p` counts from the top (1, 3, 5, ...).
  for (const match of winners) {
    if (match.p == null) continue
    const w = asRosterId(match.w)
    const l = asRosterId(match.l)
    if (w != null && !ranks.has(w)) ranks.set(w, match.p)
    if (l != null && !ranks.has(l)) ranks.set(l, match.p + 1)
  }

  // Losers bracket: `p` here is an offset within the bottom of the standings.
  // Sleeper numbers it from 1 inside the losers bracket, so the real place is
  // measured up from the bottom: place = totalRosters - (bracketSize) + p ...
  // In practice the losers bracket holds `playoff_teams` seeds too, and its
  // `p:1` final decides the very last place. We map p -> place from the bottom.
  const losersPlaced: Array<{ roster: number; p: number; isWinner: boolean }> = []
  for (const match of losers) {
    if (match.p == null) continue
    const w = asRosterId(match.w)
    const l = asRosterId(match.l)
    if (w != null) losersPlaced.push({ roster: w, p: match.p, isWinner: true })
    if (l != null) losersPlaced.push({ roster: l, p: match.p, isWinner: false })
  }
  if (losersPlaced.length > 0) {
    const maxP = Math.max(...losersPlaced.map((x) => x.p))
    // The losers bracket occupies the last `maxP + 1` standings slots.
    const bottomBlockStart = totalRosters - (maxP + 1)
    for (const { roster, p, isWinner } of losersPlaced) {
      if (ranks.has(roster)) continue
      // Within the losers bracket, winning your `p` match means a better
      // (lower) finish: place = bottomBlockStart + p, loser gets +1.
      ranks.set(roster, bottomBlockStart + p + (isWinner ? 0 : 1))
    }
  }

  // Clamp to a sane range.
  for (const [roster, rank] of ranks) {
    if (rank < 1 || rank > totalRosters) ranks.delete(roster)
  }

  return ranks
}
