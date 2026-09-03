/**
 * All-play & luck metrics — the schedule-independent view.
 *
 * Each week, a team is compared against *every other* team that played that
 * week, not just its actual opponent. That yields:
 *   - all-play record / win%   → strength independent of schedule
 *   - expected wins            → sum of weekly all-play win rate
 *   - schedule luck            → actual wins − expected wins  (+ = lucky)
 *   - points above median      → per-week, summed
 *
 * Pure function of a DB handle. Scoped to one league family.
 */
import type { DB } from '../db/index.js'
import { getFamily } from './queries.js'

export interface AllPlayRow {
  userId: string
  name: string
  weeks: number
  actualWins: number
  actualLosses: number
  allPlayWins: number
  allPlayLosses: number
  allPlayTies: number
  allPlayWinPct: number
  expectedWins: number
  scheduleLuck: number
  pointsAboveMedian: number
}

interface WeekScore {
  league_id: string
  week: number
  user_id: string
  points: number
  result: 'W' | 'L' | 'T'
}

export function getAllPlay(db: DB, slug: string, season?: number): AllPlayRow[] {
  const family = getFamily(db, slug)
  if (!family) return []

  const params: unknown[] = [family.id]
  let seasonClause = ''
  if (season != null) {
    seasonClause = ' AND ls.season = ?'
    params.push(season)
  }

  // Regular-season games only (exclude playoff + consolation).
  const rows = db
    .prepare(
      `SELECT m.league_id, m.week, m.user_id, m.points, m.result
       FROM matchup m JOIN league_season ls ON ls.league_id = m.league_id
       WHERE ls.family_id = ?${seasonClause}
         AND m.result IS NOT NULL AND m.user_id IS NOT NULL
         AND m.points IS NOT NULL
         AND m.is_playoff = 0 AND m.is_consolation = 0`,
    )
    .all(...params) as WeekScore[]

  if (rows.length === 0) return []

  const names = new Map<string, string>()
  {
    const stmt = db.prepare(`SELECT display_name, canonical_name FROM manager WHERE user_id = ?`)
    for (const id of new Set(rows.map((r) => r.user_id))) {
      const m = stmt.get(id) as { display_name: string | null; canonical_name: string | null } | undefined
      names.set(id, m?.canonical_name ?? m?.display_name ?? id)
    }
  }

  const agg = new Map<string, AllPlayRow>()
  const ensure = (userId: string): AllPlayRow => {
    let r = agg.get(userId)
    if (!r) {
      r = {
        userId,
        name: names.get(userId) ?? userId,
        weeks: 0,
        actualWins: 0,
        actualLosses: 0,
        allPlayWins: 0,
        allPlayLosses: 0,
        allPlayTies: 0,
        allPlayWinPct: 0,
        expectedWins: 0,
        scheduleLuck: 0,
        pointsAboveMedian: 0,
      }
      agg.set(userId, r)
    }
    return r
  }

  // Group by league_id + week.
  const byWeek = new Map<string, WeekScore[]>()
  for (const row of rows) {
    const key = `${row.league_id}:${row.week}`
    const list = byWeek.get(key) ?? []
    list.push(row)
    byWeek.set(key, list)
  }

  for (const week of byWeek.values()) {
    const n = week.length
    if (n < 2) continue
    const sorted = [...week].map((w) => w.points).sort((a, b) => a - b)
    const median =
      n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2]

    for (const team of week) {
      const row = ensure(team.user_id)
      row.weeks++
      if (team.result === 'W') row.actualWins++
      else if (team.result === 'L') row.actualLosses++

      let w = 0
      let l = 0
      let t = 0
      for (const other of week) {
        if (other === team) continue
        if (team.points > other.points) w++
        else if (team.points < other.points) l++
        else t++
      }
      row.allPlayWins += w
      row.allPlayLosses += l
      row.allPlayTies += t
      row.expectedWins += (w + t / 2) / (n - 1)
      row.pointsAboveMedian += team.points - median
    }
  }

  const out = [...agg.values()].map((r) => {
    const denom = r.allPlayWins + r.allPlayLosses + r.allPlayTies
    r.allPlayWinPct = denom > 0 ? round3((r.allPlayWins + r.allPlayTies / 2) / denom) : 0
    r.expectedWins = round2(r.expectedWins)
    r.scheduleLuck = round2(r.actualWins - r.expectedWins)
    r.pointsAboveMedian = round2(r.pointsAboveMedian)
    return r
  })

  return out.sort((a, b) => b.allPlayWinPct - a.allPlayWinPct)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
