/**
 * Max Points For — the best lineup a team could have started in a week.
 *
 * Fixed single-position slots (QB, RB, …) take the top scorers at that
 * position: any optimal lineup can swap a flex player with a same-position
 * fixed starter without changing the total, so this is always safe. The flex
 * slots that remain are solved exactly by search over a small candidate pool
 * (the best few leftover players per position), which handles overlapping flex
 * types like REC_FLEX + WRRB_FLEX that a greedy fill can get wrong.
 *
 * Bench, IR and taxi slots aren't starting slots and are ignored.
 */

/** Positions each starting slot accepts. Anything not listed isn't a starter. */
const SLOT_ELIGIBILITY: Record<string, readonly string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  DL: ['DL', 'DE', 'DT'],
  LB: ['LB'],
  DB: ['DB', 'CB', 'S'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'DE', 'DT', 'LB', 'DB', 'CB', 'S'],
}

export interface ScoredPlayer {
  position: string | null
  points: number
}

export function optimalLineupPoints(
  rosterPositions: readonly string[],
  players: readonly ScoredPlayer[],
): number {
  const byPos = new Map<string, number[]>()
  for (const p of players) {
    if (!p.position || !Number.isFinite(p.points)) continue
    const list = byPos.get(p.position) ?? []
    list.push(p.points)
    byPos.set(p.position, list)
  }
  for (const list of byPos.values()) list.sort((a, b) => b - a)

  const slots = rosterPositions
    .map((s) => SLOT_ELIGIBILITY[s])
    .filter((e): e is readonly string[] => e !== undefined)
  const fixed = slots.filter((e) => e.length === 1)
  const flex = slots.filter((e) => e.length > 1)

  let total = 0
  for (const [pos] of fixed) {
    const list = byPos.get(pos)
    const best = list?.shift()
    // Leaving a slot empty beats starting a negative score.
    if (best !== undefined && best > 0) total += best
  }

  if (flex.length === 0) return total

  // No flex slot can use more than flex.length players from one position.
  const pool: { position: string; points: number }[] = []
  for (const [position, list] of byPos) {
    for (const points of list.slice(0, flex.length)) pool.push({ position, points })
  }
  const used = new Array<boolean>(pool.length).fill(false)

  const search = (i: number): number => {
    if (i === flex.length) return 0
    let best = search(i + 1) // leave this slot empty
    for (let j = 0; j < pool.length; j++) {
      if (used[j] || pool[j].points <= 0 || !flex[i].includes(pool[j].position)) continue
      used[j] = true
      best = Math.max(best, pool[j].points + search(i + 1))
      used[j] = false
    }
    return best
  }

  return total + search(0)
}
