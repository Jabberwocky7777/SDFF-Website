import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeDraftOrder, getRookieDraftOrder, seedOrder, type DraftTeam } from './rookieDraftOrder.js'
import type { DB } from '../db/index.js'

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
)

// ── Pure ordering: a 12-team SDFF-shaped league ─────────────────────────────

const MAX_PF: Record<number, number> = {
  1: 1900, 2: 1850, 3: 1750, 4: 1700, 5: 1650, 6: 1500,
  7: 1400, 8: 1600, 9: 1800, 10: 1300, 11: 1450, 12: 1350,
}

/** r1 has the best record, r12 the worst. r9 has the most points among non-top-5. */
function twelveTeams(finalRanks: Record<number, number> = {}): DraftTeam[] {
  return Array.from({ length: 12 }, (_, i) => {
    const r = i + 1
    return {
      rosterId: r,
      userId: `U${r}`,
      name: `T${r}`,
      teamName: null,
      wins: 13 - r,
      losses: r - 1,
      ties: 0,
      pointsFor: r === 9 ? 1500 : 1200 - 10 * r,
      maxPointsFor: MAX_PF[r],
      finalRank: finalRanks[r] ?? null,
    }
  })
}

const opts = { playoffTeams: 6, paidPlaces: 3, pointsSeeds: 1, bracketRosterIds: null, useFinalRanks: false }
const slots = (teams: { rosterId: number }[]) => teams.map((t) => t.rosterId)

describe('seedOrder', () => {
  it('gives seeds 1–5 on record and the 6 seed to the best remaining points', () => {
    expect(slots(seedOrder(twelveTeams(), 6, 1)).slice(0, 6)).toEqual([1, 2, 3, 4, 5, 9])
  })

  it('breaks record ties on points for', () => {
    const teams = twelveTeams()
    teams[1].wins = teams[0].wins // r2 ties r1 on record, with fewer points
    teams[1].pointsFor = 2000
    expect(slots(seedOrder(teams, 6, 1)).slice(0, 2)).toEqual([2, 1])
  })
})

describe('computeDraftOrder', () => {
  it('projects money finishes by seed while the season is in progress', () => {
    const order = computeDraftOrder(twelveTeams(), opts)
    // Group 1 (non-playoff) by reverse Max PF, group 2 (seeds 4–6) by reverse
    // Max PF, group 3 = seeds 3, 2, 1 — the 1 seed picks last.
    expect(slots(order)).toEqual([10, 12, 7, 11, 6, 8, 5, 4, 9, 3, 2, 1])
    expect(order.map((t) => t.group)).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3])
    expect(order[11]).toMatchObject({ rosterId: 1, slot: 12, seed: 1, moneyPlace: 1 })
    expect(order[0]).toMatchObject({ rosterId: 10, slot: 1, seed: null, moneyPlace: null })
  })

  it('uses actual final ranks once the season is complete', () => {
    const teams = twelveTeams({ 9: 1, 4: 2, 1: 3, 2: 4, 3: 5, 5: 6 })
    const order = computeDraftOrder(teams, { ...opts, useFinalRanks: true })
    // Non-money playoff teams r5, r3, r2 by reverse Max PF; then 3rd, 2nd, champ.
    expect(slots(order).slice(6)).toEqual([5, 3, 2, 1, 4, 9])
  })

  it('takes the playoff field from the bracket when one is set', () => {
    const bracket = new Set([1, 2, 3, 4, 5, 6]) // commissioner seeded r6 over r9
    const order = computeDraftOrder(twelveTeams(), { ...opts, bracketRosterIds: bracket })
    expect(order.find((t) => t.rosterId === 9)?.group).toBe(1)
    expect(order.find((t) => t.rosterId === 6)?.group).toBe(2)
  })

  it('breaks Max PF ties on lower actual points', () => {
    const teams = twelveTeams()
    teams[9].maxPointsFor = teams[11].maxPointsFor // r10 ties r12; r12 scored less
    expect(slots(computeDraftOrder(teams, opts)).slice(0, 2)).toEqual([12, 10])
  })
})

// ── DB loader ────────────────────────────────────────────────────────────────

/**
 * Six teams, 4-team playoff. Each week 2 beats 1, 4 beats 3, 6 beats 5, and
 * roster r scores 100 + 10r. After 3 weeks: r2/r4/r6 are 3-0 (seeds 1–3 by
 * PF: r6, r4, r2) and the 4 seed goes to the best-scoring loser, r5.
 * Week 4 is in progress with r1 on 1000 points — it must not count.
 */
function seededDb(): DB {
  const db = new Database(':memory:')
  for (const f of fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  }
  db.prepare(
    `INSERT INTO league_family (id, slug, display_name, league_type, current_league_id)
     VALUES (1,'d','D','dynasty','L26')`,
  ).run()
  db.prepare(
    `INSERT INTO league_season (league_id, family_id, season, status, playoff_week_start, playoff_teams, roster_positions_json)
     VALUES ('L26',1,2026,'in_season',15,4,'["WR","BN"]')`,
  ).run()
  for (let r = 1; r <= 6; r++) {
    db.prepare(`INSERT INTO manager (user_id, display_name) VALUES (?,?)`).run(`U${r}`, `M${r}`)
    db.prepare(`INSERT INTO team_season (league_id, roster_id, user_id) VALUES ('L26',?,?)`).run(r, `U${r}`)
  }
  db.prepare(`INSERT INTO player (player_id, position) VALUES ('p1','WR'), ('p2','WR')`).run()

  const mk = db.prepare(
    `INSERT INTO matchup (league_id, week, matchup_id, roster_id, user_id, points, opponent_roster_id, result,
                          players_json, players_points_json)
     VALUES ('L26', @week, @mid, @r, @u, @p, @or, @res, @pj, @ppj)`,
  )
  for (let week = 1; week <= 4; week++) {
    for (let r = 1; r <= 6; r++) {
      const opp = r % 2 === 1 ? r + 1 : r - 1
      const p = week === 4 && r === 1 ? 1000 : 100 + 10 * r
      const oppP = week === 4 && opp === 1 ? 1000 : 100 + 10 * opp
      // r1's week-1 bench WR scored 500: its Max PF outruns r3's despite fewer points.
      const bench = week === 1 && r === 1
      mk.run({
        week,
        mid: Math.ceil(r / 2),
        r,
        u: `U${r}`,
        p,
        or: opp,
        res: p > oppP ? 'W' : 'L',
        pj: bench ? '["p1","p2"]' : null,
        ppj: bench ? '{"p1":110,"p2":500}' : null,
      })
    }
  }
  db.prepare(
    `INSERT INTO traded_pick (league_id, pick_season, round, original_roster_id, current_owner_roster_id)
     VALUES ('L26','2027',1,3,6)`,
  ).run()
  return db
}

const NOW = Date.parse('2026-10-01T23:00:00Z') // Thursday, week 4 underway

function sync(db: DB, startedAt: number): void {
  db.prepare(
    `INSERT INTO sync_log (league_id, scope, started_at, finished_at, status) VALUES ('L26','season:L26',?,?,'ok')`,
  ).run(startedAt, startedAt + 1000)
}

describe('getRookieDraftOrder', () => {
  it('orders from finished weeks only and applies traded picks', () => {
    const db = seededDb()
    sync(db, NOW - 5 * 60_000)
    const out = getRookieDraftOrder(db, 'd', NOW)

    expect(out).toMatchObject({ season: 2026, draftYear: 2027, status: 'projected', throughWeek: 3 })
    expect(out.nextUpdateAt).toBe(Date.parse('2026-10-06T11:00:00Z'))
    expect(slots(out.teams)).toEqual([3, 1, 5, 2, 4, 6])

    const r1 = out.teams.find((t) => t.rosterId === 1)!
    expect(r1).toMatchObject({ wins: 0, losses: 3, pointsFor: 330, maxPointsFor: 720 })

    expect(out.rounds).toHaveLength(4)
    expect(out.rounds[0][0]).toMatchObject({ label: '1.01', originalRosterId: 3, ownerRosterId: 6, traded: true, ownerName: 'M6' })
    expect(out.rounds[1][0]).toMatchObject({ label: '2.01', ownerRosterId: 3, traded: false })
  })

  it('holds back a final week until a sync has run after it went final', () => {
    const db = seededDb()
    sync(db, Date.parse('2026-09-28T23:00:00Z')) // Monday night of week 3
    expect(getRookieDraftOrder(db, 'd', NOW).throughWeek).toBe(2)
  })

  it('waits when no week is final yet', () => {
    const db = seededDb()
    const out = getRookieDraftOrder(db, 'd', Date.parse('2026-09-13T20:00:00Z'))
    expect(out).toMatchObject({ status: 'waiting', throughWeek: 0, teams: [] })
  })

  it('returns nothing for an unknown league', () => {
    expect(getRookieDraftOrder(seededDb(), 'nope', NOW).status).toBe('none')
  })
})
