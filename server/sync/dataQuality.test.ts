import { describe, expect, it } from 'vitest'
import { classifyWeek, compareMaxPf, sleeperMaxPf, type QualityCandidate } from './dataQuality.js'

/** A normal nine-man lineup that scored `points`. */
function healthy(points: number): QualityCandidate {
  const per = points / 9
  return {
    points,
    starters: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    startersPoints: Array(9).fill(per),
  }
}

/** Sleeper's failure mode: placeholder slot ids, one real player left. */
function placeholderSlots(points: number): QualityCandidate {
  return {
    points,
    starters: ['0', '0', '0', '0', '0', '0', '0', '1264', '0'],
    startersPoints: [0, 0, 0, 0, 0, 0, 0, points, 0],
  }
}

/** The other failure mode: a real lineup whose per-player points were zeroed. */
function zeroedPoints(points: number): QualityCandidate {
  return {
    points,
    starters: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    startersPoints: [0, 0, 0, 0, 0, 0, 0, points, 0],
  }
}

describe('classifyWeek', () => {
  it('flags placeholder lineups that scored a fraction of the week’s best', () => {
    const flags = classifyWeek([healthy(152.98), placeholderSlots(6), healthy(140), healthy(136)])
    expect(flags).toEqual([null, 'unscored', null, null])
  })

  it('flags a real lineup whose points Sleeper zeroed out', () => {
    const flags = classifyWeek([healthy(152.98), zeroedPoints(7)])
    expect(flags).toEqual([null, 'unscored'])
  })

  it('leaves a genuinely terrible week alone when the lineup was intact', () => {
    // 42 out of a 168-point week is bad, not broken — the lineup is full.
    const flags = classifyWeek([healthy(168.76), healthy(42.12), healthy(96.6)])
    expect(flags).toEqual([null, null, null])
  })

  it('leaves a stripped lineup alone when it still put up a real score', () => {
    // One or two empty slots is a manager's problem, not a data problem, and the
    // score is nowhere near low enough to be an artefact.
    const nearlyFull: QualityCandidate = {
      points: 126.4,
      starters: ['1', '2', '3', '4', '0', '0', '7', '8', '9'],
      startersPoints: [20, 18, 22, 15, 0, 0, 19, 16, 16.4],
    }
    expect(classifyWeek([healthy(150), nearlyFull])).toEqual([null, null])
  })

  it('ignores rows with no lineup or no score at all', () => {
    const flags = classifyWeek([
      healthy(150),
      { points: null, starters: ['0', '0'], startersPoints: [0, 0] },
      { points: 3, starters: null, startersPoints: null },
    ])
    expect(flags).toEqual([null, null, null])
  })

  it('does not flag an entire week that simply scored low', () => {
    // Every team stripped would mean the week max is stripped too; with nothing
    // to compare against, the ratio test keeps them.
    const flags = classifyWeek([placeholderSlots(6), placeholderSlots(7)])
    expect(flags).toEqual([null, null])
  })
})

describe('sleeperMaxPf', () => {
  it('rejoins the whole points and the decimals', () => {
    expect(sleeperMaxPf({ ppts: 1244, ppts_decimal: 12 })).toBeCloseTo(1244.12)
    expect(sleeperMaxPf({ ppts: 988 })).toBe(988)
  })

  it('is null when Sleeper reports no ppts at all', () => {
    expect(sleeperMaxPf({})).toBeNull()
    expect(sleeperMaxPf(null)).toBeNull()
  })
})

describe('compareMaxPf', () => {
  const sleeper = new Map([
    [1, 1244.12],
    [2, 1196.36],
    [3, 991.32],
  ])

  it('says nothing when every roster agrees to the cent', () => {
    expect(compareMaxPf(new Map(sleeper), sleeper)).toEqual([])
  })

  it('tolerates a cent of float drift', () => {
    const ours = new Map([...sleeper, [1, 1244.125]])
    expect(compareMaxPf(ours, sleeper)).toEqual([])
  })

  it('reports the rosters that disagree, worst first', () => {
    const ours = new Map([
      [1, 1234.12],
      [2, 1196.36],
      [3, 1011.32],
    ])
    expect(compareMaxPf(ours, sleeper)).toEqual([
      { rosterId: 3, ours: 1011.32, sleeper: 991.32, diff: 20 },
      { rosterId: 1, ours: 1234.12, sleeper: 1244.12, diff: -10 },
    ])
  })

  it('reports a roster we have no number for at all', () => {
    expect(compareMaxPf(new Map(), new Map([[7, 100]]))).toEqual([
      { rosterId: 7, ours: 0, sleeper: 100, diff: -100 },
    ])
  })

  it('ignores a roster Sleeper has no number for', () => {
    expect(compareMaxPf(new Map([[7, 100]]), new Map())).toEqual([])
  })
})
