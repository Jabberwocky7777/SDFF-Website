import { describe, expect, it } from 'vitest'
import { classifyWeek, type QualityCandidate } from './dataQuality.js'

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
