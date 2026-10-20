/**
 * Max PF audit — "do our numbers match Sleeper's?"
 *
 *   npm run maxpf:verify
 *   npm run maxpf:verify -- --league sdff --season 2026 --week 6
 *
 * Prints what the live DB now computes next to the figures read straight off
 * Sleeper's own weekly report and season `ppts` for SDFF 2026 through week 6,
 * which were transcribed by hand into EXPECTED below. Three tables:
 *
 *   1. the week's actual / Max PF per team, taxi included
 *   2. the season's Max PF per team, taxi included and taxi excluded
 *   3. the chalk rookie-draft projection
 *
 * Anything in the Δ columns is a bug — in our optimal-lineup maths, in the
 * player dictionary, or (most often) in a week that was ingested before
 * Sleeper's stat corrections landed. Run it after a fresh sync.
 *
 * The expectations are a point-in-time transcript, not a moving target: they
 * stay correct only for SDFF 2026 weeks 1-6, so the script compares against
 * them only when asked for exactly that league-season-week, and otherwise just
 * prints our numbers.
 */
import { closeDb, getDb } from '../db/index.js'
import { getLeagues } from '../config/leagues.js'
import { getMaxPfSeason, getMaxPfWeek } from '../analytics/maxPf.js'
import { getRookieDraftOrder } from '../analytics/rookieDraftOrder.js'
import { compareMaxPf, sleeperMaxPf } from '../sync/dataQuality.js'
import { pptsSnapshotKey } from '../sync/ingest.js'
import { getKv } from '../sync/upsert.js'
import type { DB } from '../db/index.js'

interface Args {
  league: string | null
  season: number
  week: number
}

function parseArgs(argv: string[]): Args {
  const out: Args = { league: null, season: 2026, week: 6 }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--league' || argv[i] === '-l') out.league = argv[++i] ?? null
    else if (argv[i] === '--season' || argv[i] === '-s') out.season = Number(argv[++i])
    else if (argv[i] === '--week' || argv[i] === '-w') out.week = Number(argv[++i])
  }
  return out
}

/** Sleeper's own figures for SDFF 2026 through week 6, transcribed by hand. */
const EXPECTED = {
  season: 2026,
  week: 6,
  /** name -> [week actual, week max] (taxi included) */
  week6: {
    philiphusney: [189.48, 222.5],
    'The Commish': [186.28, 203.68],
    'Drop a Drako': [159.7, 203.88],
    Tedsticles: [148.7, 167.7],
    'Jaxson (Tate)': [148.52, 170.44],
    '1 Wilson 1 Cup': [126.68, 174.92],
    'Jeremiyah Loves Trains': [122.54, 153.34],
    WBoyette: [120.3, 160.22],
    'The Library': [111.92, 149.12],
    'Tank for Jeremiah': [107.44, 122.34],
    'Jacory in the House': [102.52, 130.0],
    NineMonkeys: [89.9, 122.2],
  } as Record<string, [number, number]>,
  /** name -> [season max with taxi, season max without taxi] */
  seasonMax: {
    'Drop a Drako': [1244.12, 1244.12],
    'The Commish': [1196.36, 1196.36],
    'The Library': [1184.18, 1177.58],
    Tedsticles: [1177.5, 1163.74],
    philiphusney: [1155.12, 1152.12],
    '1 Wilson 1 Cup': [1125.26, 1118.36],
    'Jaxson (Tate)': [1109.3, 1109.3],
    WBoyette: [1080.54, 1080.54],
    'Jacory in the House': [1030.78, 1030.78],
    NineMonkeys: [991.32, 988.92],
    'Tank for Jeremiah': [988.92, 988.92],
    'Jeremiyah Loves Trains': [914.16, 894.46],
  } as Record<string, [number, number]>,
  /** The chalk projection after week 6, 1.01 first. */
  order: [
    'Jeremiyah Loves Trains',
    'Tank for Jeremiah',
    'NineMonkeys',
    'Jacory in the House',
    'WBoyette',
    '1 Wilson 1 Cup',
    'The Library',
    'philiphusney',
    'Jaxson (Tate)',
    'Tedsticles',
    'Drop a Drako',
    'The Commish',
  ],
}

/** Teams renamed since the figures above were transcribed. */
const ALIASES: Record<string, readonly string[]> = {
  'Jaxson (Tate)': ['Tate me from behind Bijan', 'brianshrum'],
}

/**
 * Sleeper's weekly report labels teams by *team name* while we key everything
 * off the manager, and the names drift between its own screens ("Tate/Jaxson"
 * vs "Jaxson (Tate)"), so match either identity, loosely.
 */
const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function matchName(
  team: { name: string; teamName?: string | null },
  expected: readonly string[],
): string | null {
  const keys = [team.name, team.teamName].filter((x): x is string => !!x).map(key)
  for (const k of keys) {
    const exact = expected.find(
      (e) => key(e) === k || (ALIASES[e] ?? []).some((a) => key(a) === k),
    )
    if (exact) return exact
  }
  for (const k of keys) {
    const loose = expected.find((e) => key(e).includes(k) || k.includes(key(e)))
    if (loose) return loose
  }
  return null
}

/** Prefer the team name, which is what Sleeper's own report shows. */
const label = (t: { name: string; teamName?: string | null }): string => t.teamName || t.name

const num = (n: number, width = 9): string => n.toFixed(2).padStart(width)
const delta = (ours: number, theirs: number): string => {
  const d = Math.round((ours - theirs) * 100) / 100
  return (d === 0 ? '·' : (d > 0 ? '+' : '') + d.toFixed(2)).padStart(8)
}

function dynastySlug(): string | null {
  const leagues = getLeagues()
  return (leagues.find((l) => l.type === 'dynasty') ?? leagues[0])?.slug ?? null
}

/** Sleeper's season Max PF per roster, as of the last snapshot we stored. */
function storedPpts(db: DB, leagueId: string, week: number): Map<number, number> | null {
  const raw = getKv(db, pptsSnapshotKey(leagueId, week))
  if (!raw) return null
  try {
    return new Map(JSON.parse(raw) as Array<[number, number]>)
  } catch {
    return null
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const slug = args.league ?? dynastySlug()
  if (!slug) {
    console.error('No leagues configured — add one from Settings first.')
    process.exitCode = 1
    return
  }
  const compare = slug === dynastySlug() && args.season === EXPECTED.season && args.week === EXPECTED.week

  const db = getDb()
  console.log(`\n=== Max PF audit · ${slug} · ${args.season} week ${args.week} ===`)
  if (!compare) {
    console.log('(no transcribed Sleeper figures for this league-season-week — printing ours only)')
  }

  // 1. The week.
  const week = getMaxPfWeek(db, slug, args.season, args.week)
  if (!week) {
    console.log(`\nNo finished week ${args.week} on record. Has the sync run?`)
  } else {
    console.log(`\n-- Week ${args.week}, taxi included --`)
    console.log(
      'manager                     actual  expected       Δ    max PF  expected       Δ   eff',
    )
    let bad = 0
    for (const t of week.teams) {
      const match = compare ? matchName(t, Object.keys(EXPECTED.week6)) : null
      const exp = match ? EXPECTED.week6[match] : null
      if (exp && (Math.abs(t.actual - exp[0]) > 0.01 || Math.abs(t.max - exp[1]) > 0.01)) bad++
      console.log(
        `${label(t).padEnd(24)} ${num(t.actual)} ${exp ? num(exp[0]) : '        -'}` +
          ` ${exp ? delta(t.actual, exp[0]) : '       -'}` +
          ` ${num(t.max)} ${exp ? num(exp[1]) : '        -'}` +
          ` ${exp ? delta(t.max, exp[1]) : '       -'}` +
          ` ${(t.efficiency * 100).toFixed(1).padStart(5)}%`,
      )
    }
    if (compare) console.log(bad === 0 ? 'week 6: all 12 teams match Sleeper' : `week 6: ${bad} teams disagree`)
    if (week.taxiInferred) console.log('note: this week’s taxi status is inferred')
  }

  // 2. The season, both ways.
  const withTaxi = getMaxPfSeason(db, slug, args.season)
  const noTaxi = getMaxPfSeason(db, slug, args.season, { includeTaxi: false })
  if (withTaxi && noTaxi) {
    const noTaxiBy = new Map(noTaxi.teams.map((t) => [t.rosterId, t]))
    console.log(`\n-- Season Max PF through week ${withTaxi.weeks.at(-1)} --`)
    console.log(
      'manager                   taxi in  expected       Δ  taxi out  expected       Δ',
    )
    let bad = 0
    for (const t of withTaxi.teams) {
      const out = noTaxiBy.get(t.rosterId)
      const match = compare ? matchName(t, Object.keys(EXPECTED.seasonMax)) : null
      const exp = match ? EXPECTED.seasonMax[match] : null
      if (exp && (Math.abs(t.max - exp[0]) > 0.01 || Math.abs((out?.max ?? 0) - exp[1]) > 0.01)) bad++
      console.log(
        `${label(t).padEnd(24)} ${num(t.max)} ${exp ? num(exp[0]) : '        -'}` +
          ` ${exp ? delta(t.max, exp[0]) : '       -'}` +
          ` ${num(out?.max ?? 0)} ${exp ? num(exp[1]) : '        -'}` +
          ` ${exp && out ? delta(out.max, exp[1]) : '       -'}`,
      )
    }
    if (compare) {
      console.log(bad === 0 ? 'season: all 12 teams match Sleeper both ways' : `season: ${bad} teams disagree`)
    }
    if (withTaxi.blunder) {
      const b = withTaxi.blunder
      console.log(
        `worst week: ${b.name} wk ${b.week} left ${b.leftOnBench.toFixed(2)} on the bench` +
          ` (${b.actual.toFixed(2)} of ${b.max.toFixed(2)})`,
      )
    }

    // 3. Against Sleeper's own ppts, live from the rosters we last stored.
    const leagueRow = db
      .prepare(
        `SELECT ls.league_id, ls.raw_json FROM league_season ls
         JOIN league_family f ON f.id = ls.family_id
         WHERE f.slug = ? AND ls.season = ?`,
      )
      .get(slug, args.season) as { league_id: string } | undefined
    const snapshot = leagueRow ? storedPpts(db, leagueRow.league_id, args.week) : null
    if (snapshot) {
      const ours = new Map(withTaxi.teams.map((t) => [t.rosterId, t.max]))
      const mismatches = compareMaxPf(ours, snapshot)
      console.log(
        `\nvs Sleeper ppts snapshot at week ${args.week}: ` +
          (mismatches.length === 0
            ? `all ${snapshot.size} rosters agree`
            : mismatches.map((m) => `r${m.rosterId} ${m.diff > 0 ? '+' : ''}${m.diff}`).join(', ')),
      )
    } else {
      console.log(`\nNo Sleeper ppts snapshot stored for week ${args.week} yet (it is written as a week goes final).`)
      // sleeperMaxPf is still worth a mention so the reader knows where the
      // live comparison in the sync gets its number from.
      void sleeperMaxPf
    }
  }

  // 4. The chalk draft projection.
  const order = getRookieDraftOrder(db, slug)
  if (order.teams.length > 0) {
    console.log(`\n-- ${order.draftYear} rookie draft order (${order.status}) --`)
    let bad = 0
    order.teams.forEach((t, i) => {
      const expName = compare ? EXPECTED.order[i] : null
      const ok = !expName || matchName(t, [expName]) !== null
      if (!ok) bad++
      console.log(
        `1.${String(t.slot).padStart(2, '0')}  ${label(t).padEnd(24)}` +
          ` ${t.seed != null ? `${t.seed} seed` : 'missed'}`.padEnd(9) +
          ` max PF ${num(t.maxPointsFor)}` +
          (expName ? `   expected ${expName}${ok ? '' : '  <-- MISMATCH'}` : ''),
      )
    })
    if (compare) console.log(bad === 0 ? 'order: matches the expected chalk projection' : `order: ${bad} slots differ`)
  }

  console.log('')
  closeDb()
}

main()
