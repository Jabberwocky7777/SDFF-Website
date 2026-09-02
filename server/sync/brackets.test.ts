import { describe, expect, it } from 'vitest'
import { deriveFinalRanks } from './brackets.js'
import type { BracketMatch } from '../sleeper/schemas.js'

describe('deriveFinalRanks', () => {
  it('places teams from a standard 6-team winners bracket', () => {
    // 6-team bracket, seeds 1-2 bye. p:1 final, p:3 third-place game, p:5 fifth.
    const winners: BracketMatch[] = [
      { r: 1, m: 1, t1: 3, t2: 6, w: 3, l: 6 },
      { r: 1, m: 2, t1: 4, t2: 5, w: 4, l: 5 },
      { r: 2, m: 3, t1: 1, t2: 3, w: 1, l: 3 },
      { r: 2, m: 4, t1: 2, t2: 4, w: 2, l: 4 },
      { r: 3, m: 5, t1: 1, t2: 2, w: 1, l: 2, p: 1 },
      { r: 3, m: 6, t1: 3, t2: 4, w: 4, l: 3, p: 3 },
      { r: 3, m: 7, t1: 6, t2: 5, w: 5, l: 6, p: 5 },
    ]
    const ranks = deriveFinalRanks(winners, [], 10)
    expect(ranks.get(1)).toBe(1)
    expect(ranks.get(2)).toBe(2)
    expect(ranks.get(4)).toBe(3)
    expect(ranks.get(3)).toBe(4)
    expect(ranks.get(5)).toBe(5)
    expect(ranks.get(6)).toBe(6)
  })

  it('ignores matches without a placement and clamps out-of-range ranks', () => {
    const winners: BracketMatch[] = [
      { r: 1, m: 1, t1: 1, t2: 2, w: 1, l: 2 }, // no p — not placed
      { r: 2, m: 2, t1: 1, t2: 3, w: 1, l: 3, p: 1 },
    ]
    const ranks = deriveFinalRanks(winners, [], 4)
    expect(ranks.get(1)).toBe(1)
    expect(ranks.get(3)).toBe(2)
    expect(ranks.has(2)).toBe(false)
  })

  it('returns an empty map when there are no brackets', () => {
    expect(deriveFinalRanks([], [], 12).size).toBe(0)
  })
})
