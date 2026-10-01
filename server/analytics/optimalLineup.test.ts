import { describe, expect, it } from 'vitest'
import { optimalLineupPoints, type ScoredPlayer } from './optimalLineup.js'

const p = (position: string, points: number): ScoredPlayer => ({ position, points })

describe('optimalLineupPoints', () => {
  it('fills fixed slots with the best player at each position', () => {
    const roster = [p('QB', 20), p('QB', 25), p('RB', 10), p('RB', 15), p('RB', 5)]
    expect(optimalLineupPoints(['QB', 'RB', 'BN', 'BN'], roster)).toBe(40)
  })

  it('uses leftovers in flex and super-flex slots', () => {
    const roster = [p('QB', 25), p('QB', 22), p('RB', 15), p('RB', 12), p('WR', 18), p('TE', 9)]
    // QB 25, RB 15, WR 18, TE 9, FLEX RB 12, SUPER_FLEX QB 22
    expect(optimalLineupPoints(['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'], roster)).toBe(101)
  })

  it('solves overlapping flex slots exactly', () => {
    // Greedy WRRB first would take the WR 20 and leave REC_FLEX with TE 1.
    const roster = [p('WR', 20), p('RB', 18), p('TE', 1)]
    expect(optimalLineupPoints(['WRRB_FLEX', 'REC_FLEX'], roster)).toBe(38)
  })

  it('leaves a slot empty rather than start a negative score', () => {
    expect(optimalLineupPoints(['K', 'DEF'], [p('K', -2), p('DEF', 7)])).toBe(7)
  })

  it('ignores bench / IR / taxi and players with no known position', () => {
    const roster = [{ position: null, points: 50 }, p('WR', 10)]
    expect(optimalLineupPoints(['WR', 'BN', 'IR', 'TAXI'], roster)).toBe(10)
  })
})
