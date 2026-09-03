import { describe, expect, it } from 'vitest'
import { rankSeasonScoring } from './playerSeason.js'

const positions = new Map<string, string | null>([
  ['rb1', 'RB'],
  ['rb2', 'RB'],
  ['rb3', 'RB'],
  ['wr1', 'WR'],
  ['dl1', 'DL'],
  ['unknown', null],
])

// Half PPR with a first-down bonus — enough to separate it from plain PPR.
const scoring = { rush_yd: 0.1, rec_yd: 0.1, rec: 0.5, rec_fd: 0.5, rush_td: 6, fum_lost: -2 }

describe('rankSeasonScoring', () => {
  it('scores players with the league’s own settings and ranks within position', () => {
    const ranked = rankSeasonScoring({
      scoring,
      positions,
      stats: {
        rb1: { gp: 17, rush_yd: 1000, rush_td: 10, rec: 40, rec_yd: 300, rec_fd: 20 },
        rb2: { gp: 17, rush_yd: 1200, rush_td: 4, rec: 10, rec_yd: 80, rec_fd: 4 },
        wr1: { gp: 17, rec: 100, rec_yd: 1400, rec_fd: 60 },
      },
    })
    const by = new Map(ranked.map((r) => [r.playerId, r]))
    // rb1: 100 + 60 + 20 + 30 + 10 = 220. rb2: 120 + 24 + 5 + 8 + 2 = 159.
    expect(by.get('rb1')!.points).toBeCloseTo(220)
    expect(by.get('rb2')!.points).toBeCloseTo(159)
    expect(by.get('rb1')!.posRank).toBe(1)
    expect(by.get('rb2')!.posRank).toBe(2)
    // Ranks are per position, so the top WR is WR1 regardless of the RB totals.
    expect(by.get('wr1')!.posRank).toBe(1)
  })

  it('subtracts negative categories', () => {
    const [only] = rankSeasonScoring({
      scoring,
      positions,
      stats: { rb1: { gp: 10, rush_yd: 500, fum_lost: 3 } },
    })
    expect(only.points).toBeCloseTo(44) // 50 − 6
  })

  it('drops players who never played, so a rank means something', () => {
    const ranked = rankSeasonScoring({
      scoring,
      positions,
      stats: {
        rb1: { gp: 17, rush_yd: 1000 },
        rb2: { gp: 0, rush_yd: 0 },
        rb3: { gp: 12, rush_yd: 400 },
      },
    })
    expect(ranked.map((r) => r.playerId).sort()).toEqual(['rb1', 'rb3'])
    expect(ranked.find((r) => r.playerId === 'rb3')!.posRank).toBe(2)
  })

  it('ignores positions nobody drafts and players with no position on record', () => {
    const ranked = rankSeasonScoring({
      scoring,
      positions,
      stats: {
        dl1: { gp: 17, rush_yd: 900 },
        unknown: { gp: 17, rush_yd: 900 },
        missing: { gp: 17, rush_yd: 900 },
      },
    })
    expect(ranked).toEqual([])
  })

  it('tolerates non-numeric and unscored stat keys', () => {
    const [only] = rankSeasonScoring({
      scoring,
      positions,
      stats: { rb1: { gp: 17, rush_yd: 1000, team: 'ATL', pts_ppr: 300, off_snp: 700 } },
    })
    // Only rush_yd is in the scoring settings; pts_ppr and off_snp are not.
    expect(only.points).toBeCloseTo(100)
  })

  it('skips players whose stat bag shares nothing with the scoring settings', () => {
    const ranked = rankSeasonScoring({
      scoring,
      positions,
      stats: { rb1: { gp: 17, off_snp: 700 }, rb2: null },
    })
    expect(ranked).toEqual([])
  })
})
