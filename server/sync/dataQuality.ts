/**
 * Detection of matchup weeks whose source scores are unrecoverable.
 *
 * Sleeper sometimes returns a played week with the lineup stripped out: the
 * `starters` array becomes placeholder slot ids ("0") and/or every starter's
 * entry in `players_points` is zeroed. Athens 2019 wk10 and 2020 wk1 are the
 * known cases. Re-syncing does not help — the zeroes come from Sleeper.
 *
 * Those rows still carry a result the league played by, so we keep the W/L and
 * only mark the score as untrustworthy. Records and trade attribution skip
 * flagged rows; standings and head-to-head do not.
 */

/** Value stored in `matchup.data_quality`. NULL means the row is trustworthy. */
export type DataQuality = 'unscored'

export interface QualityCandidate {
  points: number | null
  starters: string[] | null
  startersPoints: number[] | null
}

/** A slot id Sleeper uses for "nobody is here". */
function isEmptySlot(id: string | null | undefined): boolean {
  return !id || id === '0'
}

/**
 * True when the lineup itself looks stripped: at least half the starter slots
 * are placeholders, or all but one starter scored exactly zero. Either alone is
 * a strong signal, but neither is proof — a manager really can abandon a team.
 */
function lineupLooksStripped(c: QualityCandidate): boolean {
  const starters = c.starters ?? []
  if (starters.length === 0) return false
  const empty = starters.filter(isEmptySlot).length
  if (empty * 2 >= starters.length) return true
  const pts = c.startersPoints ?? []
  if (pts.length === 0) return false
  const zeroes = pts.filter((p) => (p ?? 0) === 0).length
  return zeroes >= starters.length - 1
}

/**
 * Classify one week's matchup rows.
 *
 * A row is flagged only when the lineup looks stripped *and* the score is
 * implausible next to the best score anyone posted that week — the second test
 * is what separates a Sleeper data loss from a manager who genuinely punted.
 * Returns one entry per input row, aligned by index.
 */
export function classifyWeek(candidates: QualityCandidate[]): Array<DataQuality | null> {
  const best = Math.max(0, ...candidates.map((c) => c.points ?? 0))
  return candidates.map((c) =>
    c.points != null && lineupLooksStripped(c) && c.points < 0.25 * best ? 'unscored' : null,
  )
}

// ── Max PF cross-check against Sleeper ───────────────────────────────────────

/**
 * Sleeper's own season Max PF for a roster, out of `roster.settings`. It stores
 * the whole-point part and the decimals separately.
 */
export function sleeperMaxPf(settings: Record<string, number> | null | undefined): number | null {
  const s = settings ?? {}
  if (typeof s.ppts !== 'number') return null
  return s.ppts + (typeof s.ppts_decimal === 'number' ? s.ppts_decimal / 100 : 0)
}

export interface MaxPfMismatch {
  rosterId: number
  /** Our season Max PF, summed from matchup.optimal_points. */
  ours: number
  sleeper: number
  diff: number
}

/**
 * Compare our season Max PF per roster against Sleeper's `ppts`.
 *
 * Both are "best possible lineup from every rostered player, taxi and IR
 * included", so they should agree to the cent; a drift means our player pool
 * or slot eligibility is wrong, or Sleeper lost a week's per-player scores.
 * Rosters Sleeper gives no `ppts` for are skipped rather than reported as a
 * mismatch against zero. Returns only the rosters that disagree, worst first.
 */
export function compareMaxPf(
  ours: ReadonlyMap<number, number>,
  sleeper: ReadonlyMap<number, number>,
  tolerance = 0.01,
): MaxPfMismatch[] {
  const out: MaxPfMismatch[] = []
  for (const [rosterId, theirs] of sleeper) {
    const mine = ours.get(rosterId) ?? 0
    const diff = Math.round((mine - theirs) * 100) / 100
    if (Math.abs(diff) > tolerance) {
      out.push({ rosterId, ours: Math.round(mine * 100) / 100, sleeper: theirs, diff })
    }
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
}
