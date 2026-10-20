import { describe, expect, it } from 'vitest'
import { optimalLineup, optimalLineupPoints, type ScoredPlayer } from './optimalLineup.js'

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

  it('starts a negative score rather than leave the slot empty, as Sleeper does', () => {
    expect(optimalLineupPoints(['K', 'DEF'], [p('K', -2), p('DEF', 7)])).toBe(5)
  })

  it('ignores bench / IR / taxi and players with no known position', () => {
    const roster = [{ position: null, points: 50 }, p('WR', 10)]
    expect(optimalLineupPoints(['WR', 'BN', 'IR', 'TAXI'], roster)).toBe(10)
  })
})

// ── Full assignment ──────────────────────────────────────────────────────────

const q = (playerId: string, position: string, points: number): ScoredPlayer => ({
  playerId,
  position,
  points,
})

/** The SDFF starting lineup. */
const SDFF = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'SUPER_FLEX']

describe('optimalLineup', () => {
  it('names the player in every slot, in roster order', () => {
    const roster = [q('qb1', 'QB', 25), q('rb1', 'RB', 15), q('wr1', 'WR', 18), q('te1', 'TE', 9)]
    const out = optimalLineup(['QB', 'RB', 'WR', 'TE', 'BN'], roster)
    expect(out.total).toBeCloseTo(67)
    expect(out.slots.map((s) => [s.slot, s.playerId])).toEqual([
      ['QB', 'qb1'],
      ['RB', 'rb1'],
      ['WR', 'wr1'],
      ['TE', 'te1'],
    ])
    expect(out.bench).toEqual([])
  })

  it('benches the players the best lineup left out, best first', () => {
    const roster = [q('qb1', 'QB', 25), q('qb2', 'QB', 22), q('rb1', 'RB', 15), q('rb2', 'RB', 12)]
    const out = optimalLineup(['QB', 'RB', 'BN', 'BN'], roster)
    expect(out.total).toBeCloseTo(40)
    expect(out.bench.map((b) => b.playerId)).toEqual(['qb2', 'rb2'])
  })

  it('fills the superflex with the second quarterback', () => {
    const roster = [
      q('qb1', 'QB', 28), q('qb2', 'QB', 24),
      q('rb1', 'RB', 18), q('rb2', 'RB', 14), q('rb3', 'RB', 6),
      q('wr1', 'WR', 22), q('wr2', 'WR', 17), q('wr3', 'WR', 13), q('wr4', 'WR', 11),
      q('te1', 'TE', 10),
    ]
    const out = optimalLineup(SDFF, roster)
    const bySlot = out.slots.map((s) => `${s.slot}:${s.playerId ?? '-'}`)
    expect(bySlot).toEqual([
      'QB:qb1', 'RB:rb1', 'RB:rb2', 'WR:wr1', 'WR:wr2', 'WR:wr3',
      'TE:te1', 'FLEX:wr4', 'FLEX:rb3', 'SUPER_FLEX:qb2',
    ])
    expect(out.total).toBeCloseTo(163)
    expect(out.bench).toEqual([])
  })

  it('fills a slot with a negative score when nothing better is on the roster', () => {
    const out = optimalLineup(['K', 'DEF'], [q('k1', 'K', -2), q('d1', 'DEF', 7)])
    expect(out.total).toBeCloseTo(5)
    expect(out.slots[0]).toMatchObject({ slot: 'K', playerId: 'k1', points: -2 })
    expect(out.bench).toEqual([])
  })

  it('still prefers the least bad option, and only fills what it must', () => {
    const out = optimalLineup(['DEF'], [q('d1', 'DEF', -7), q('d2', 'DEF', -1)])
    expect(out.total).toBeCloseTo(-1)
    expect(out.slots[0].playerId).toBe('d2')
    expect(out.bench.map((b) => b.playerId)).toEqual(['d1'])
  })

  it('leaves a slot empty only when nobody is eligible for it', () => {
    const out = optimalLineup(['QB', 'K'], [q('qb1', 'QB', 12)])
    expect(out.total).toBeCloseTo(12)
    expect(out.slots[1]).toMatchObject({ slot: 'K', playerId: null, points: 0 })
  })

  it('drops excluded players out of the pool and onto the bench', () => {
    const roster = [q('rb1', 'RB', 30), q('rb2', 'RB', 12)]
    const out = optimalLineup(['RB'], roster, { excludePlayerIds: new Set(['rb1']) })
    expect(out.total).toBeCloseTo(12)
    expect(out.slots[0].playerId).toBe('rb2')
    expect(out.bench.map((b) => b.playerId)).toEqual(['rb1'])
  })

  it('benches a player with no known position instead of losing him', () => {
    const out = optimalLineup(['WR'], [{ playerId: 'x', position: null, points: 50 }, q('wr1', 'WR', 10)])
    expect(out.total).toBeCloseTo(10)
    expect(out.bench.map((b) => b.playerId)).toEqual(['x'])
  })

  it('solves overlapping flex slots exactly, and says who went where', () => {
    const out = optimalLineup(['WRRB_FLEX', 'REC_FLEX'], [q('wr1', 'WR', 20), q('rb1', 'RB', 18), q('te1', 'TE', 1)])
    expect(out.total).toBeCloseTo(38)
    expect(out.slots.map((s) => s.playerId)).toEqual(['rb1', 'wr1'])
    expect(out.bench.map((b) => b.playerId)).toEqual(['te1'])
  })
})

describe('optimalLineup with multi-position players', () => {
  const SDFF_SHORT = ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX']

  it('starts a DB/WR at WR, the way Sleeper does', () => {
    // Travis Hunter: position 'DB', fantasy_positions ['WR','DB']. A league
    // with no DB slot still gets to use him, which is worth 14.9 - 5.2 here.
    const hunter: ScoredPlayer = {
      playerId: 'hunter',
      position: 'DB',
      positions: ['WR', 'DB'],
      points: 14.9,
    }
    const roster = [
      q('qb1', 'QB', 20), q('rb1', 'RB', 10), q('wr1', 'WR', 15),
      q('wr2', 'WR', 5.2), q('te1', 'TE', 20.9), q('te2', 'TE', 17.1),
      hunter,
    ]
    const out = optimalLineup(SDFF_SHORT, roster)
    expect(out.total).toBeCloseTo(20 + 10 + 15 + 14.9 + 20.9 + 17.1)
    expect(out.slots.map((s) => s.playerId)).toEqual([
      'qb1', 'rb1', 'wr1', 'hunter', 'te1', 'te2',
    ])
    // He's displayed as what Sleeper calls him, not as what he filled.
    expect(out.slots[3]).toMatchObject({ slot: 'WR', position: 'DB' })
    expect(out.bench.map((b) => b.playerId)).toEqual(['wr2'])
  })

  it('falls back to the primary position when no list is given', () => {
    const out = optimalLineup(['DB'], [{ playerId: 'h', position: 'DB', points: 9 }])
    expect(out.total).toBeCloseTo(9)
    expect(out.slots[0].playerId).toBe('h')
  })

  it('treats an empty position list as no position at all', () => {
    const out = optimalLineup(['WR'], [{ playerId: 'x', position: 'WR', positions: [], points: 9 }])
    expect(out.slots[0].playerId).toBe('x')
  })

  it('does not strand a single-position player behind a flexible one', () => {
    // The naive "fixed slots take the top scorer at that position" shortcut
    // puts the WR/RB in RB (he outscores rb1) and then has nobody for WR.
    const flexible: ScoredPlayer = {
      playerId: 'both', position: 'RB', positions: ['WR', 'RB'], points: 30,
    }
    const out = optimalLineup(['RB', 'WR'], [flexible, q('rb1', 'RB', 12)])
    expect(out.total).toBeCloseTo(42)
    expect(out.slots.map((s) => s.playerId)).toEqual(['rb1', 'both'])
  })
})
