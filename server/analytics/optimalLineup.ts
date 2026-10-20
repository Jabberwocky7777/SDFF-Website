/**
 * Max Points For — the best lineup a team could have started in a week.
 *
 * Every slot that *can* be filled is filled, best total among the ways of
 * doing that — including with a negative score. That isn't an oversight: a
 * roster whose only DEF put up -7 has Sleeper's Max PF -7 points lower, not
 * level. Leaving the slot empty instead put us 1-7 points above Sleeper's
 * `ppts` on 11 of 44 rosters across this hub's four leagues; filling it
 * reconciled every one of them to the cent. (SDFF never showed it — it starts
 * no kicker or defense, and nobody else goes negative.)
 *
 * The players that can fill a set of slots at the same time form a transversal
 * matroid, so the optimum is reached by the matroid greedy: walk the players in
 * descending points and keep each one whose addition still leaves a complete
 * assignment, tested with an augmenting-path search (Kuhn's). That is exact for
 * any shape of slot — overlapping flex types like REC_FLEX + WRRB_FLEX that a
 * greedy fill gets wrong, and players eligible at more than one position, where
 * the old "give each fixed slot the top scorer at that position" shortcut is
 * not sound: a WR/RB in the WR slot can't always be swapped out for a pure RB.
 *
 * Multi-position eligibility is not a curiosity. Sleeper lists Travis Hunter as
 * `position: 'DB'` with `fantasy_positions: ['WR','DB']` and starts him at WR
 * in its own Max PF, so `positions` (from `player.fantasy_positions_json`)
 * decides eligibility and `position` is only what gets displayed.
 *
 * Bench, IR and taxi slots aren't starting slots and are ignored. Note that
 * being *on* IR or taxi doesn't take a player out of the pool: Sleeper's own
 * Max PF counts every rostered player, so ours does too. Callers that want the
 * no-taxi version pass `excludePlayerIds`.
 *
 * `optimalLineup()` returns the assignment itself so a UI can show who should
 * have started; `optimalLineupPoints()` is the total-only wrapper.
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
  /** Optional so callers that only want a total needn't carry ids. */
  playerId?: string | null
  /** The headline position, used for display. */
  position: string | null
  /** Every position he's eligible at. Falls back to `[position]` when absent. */
  positions?: readonly string[] | null
  points: number
}

/** One starting slot of the best lineup. `playerId` is null for an empty slot. */
export interface LineupSlot {
  /** The roster slot's Sleeper name, e.g. 'RB' or 'SUPER_FLEX'. */
  slot: string
  playerId: string | null
  position: string | null
  points: number
}

export interface BenchedPlayer {
  playerId: string | null
  position: string | null
  points: number
}

export interface OptimalLineup {
  total: number
  /** In `rosterPositions` order, one entry per starting slot. */
  slots: LineupSlot[]
  /** Everyone the best lineup left out, highest score first. */
  bench: BenchedPlayer[]
}

export interface OptimalLineupOptions {
  /** Players to leave out of the pool entirely (e.g. this week's taxi squad). */
  excludePlayerIds?: ReadonlySet<string>
}

interface Candidate {
  playerId: string | null
  position: string | null
  positions: readonly string[]
  points: number
}

function eligiblePositions(p: ScoredPlayer): readonly string[] {
  const listed = (p.positions ?? []).filter((x): x is string => !!x)
  if (listed.length > 0) return listed
  return p.position ? [p.position] : []
}

export function optimalLineup(
  rosterPositions: readonly string[],
  players: readonly ScoredPlayer[],
  opts: OptimalLineupOptions = {},
): OptimalLineup {
  const exclude = opts.excludePlayerIds
  const candidates: Candidate[] = []
  const bench: BenchedPlayer[] = []

  for (const p of players) {
    const playerId = p.playerId ?? null
    const positions = eligiblePositions(p)
    // Excluded, unscored, or playing nowhere: still rostered, so still bench.
    if (
      (exclude && playerId != null && exclude.has(playerId)) ||
      !Number.isFinite(p.points) ||
      positions.length === 0
    ) {
      bench.push({ playerId, position: p.position, points: p.points })
      continue
    }
    candidates.push({ playerId, position: p.position, positions, points: p.points })
  }

  // Keep the roster's own slot order for the output, dropping BN/IR/TAXI.
  const starting = rosterPositions
    .map((slot) => ({ slot, eligibility: SLOT_ELIGIBILITY[slot] }))
    .filter(
      (s): s is { slot: string; eligibility: readonly string[] } => s.eligibility !== undefined,
    )

  /** Slot index -> the candidate holding it. */
  const holder = new Array<Candidate | null>(starting.length).fill(null)
  const fits = (c: Candidate, slotIndex: number): boolean =>
    starting[slotIndex].eligibility.some((pos) => c.positions.includes(pos))

  /** Kuhn's augmenting path: seat `c`, moving incumbents along if need be. */
  const seat = (c: Candidate, visited: boolean[]): boolean => {
    // Prefer an empty slot, so nobody is shuffled for no reason — it keeps the
    // printed lineup natural (the QB in QB, his backup in the superflex).
    for (let i = 0; i < starting.length; i++) {
      if (holder[i] === null && !visited[i] && fits(c, i)) {
        visited[i] = true
        holder[i] = c
        return true
      }
    }
    for (let i = 0; i < starting.length; i++) {
      if (visited[i] || !fits(c, i)) continue
      visited[i] = true
      const incumbent = holder[i]
      if (incumbent === null || seat(incumbent, visited)) {
        holder[i] = c
        return true
      }
    }
    return false
  }

  // Descending points over a matroid gives the max-weight basis, and every
  // basis of a matroid is the same size — so this fills as many slots as it
  // can and takes the best total among the ways of doing so.
  candidates.sort((a, b) => b.points - a.points)
  const seated: Candidate[] = []
  for (const c of candidates) {
    if (seat(c, new Array<boolean>(starting.length).fill(false))) seated.push(c)
    else bench.push({ playerId: c.playerId, position: c.position, points: c.points })
  }

  // Which of two identical FLEX slots a player lands in is arbitrary — the
  // total is the same either way — so order them by score to keep the output
  // stable and readable.
  const bySlotLabel = new Map<string, number[]>()
  starting.forEach((s, i) => {
    const list = bySlotLabel.get(s.slot) ?? []
    list.push(i)
    bySlotLabel.set(s.slot, list)
  })
  for (const indexes of bySlotLabel.values()) {
    if (indexes.length < 2) continue
    const filled = indexes
      .map((i) => holder[i])
      .filter((c): c is Candidate => c !== null)
      .sort((a, b) => b.points - a.points)
    indexes.forEach((i, k) => {
      holder[i] = k < filled.length ? filled[k] : null
    })
  }

  return {
    total: seated.reduce((sum, c) => sum + c.points, 0),
    slots: starting.map((s, i) => {
      const c = holder[i]
      return {
        slot: s.slot,
        playerId: c?.playerId ?? null,
        position: c?.position ?? null,
        points: c?.points ?? 0,
      }
    }),
    bench: bench.sort((a, b) => b.points - a.points),
  }
}

export function optimalLineupPoints(
  rosterPositions: readonly string[],
  players: readonly ScoredPlayer[],
  opts: OptimalLineupOptions = {},
): number {
  return optimalLineup(rosterPositions, players, opts).total
}
