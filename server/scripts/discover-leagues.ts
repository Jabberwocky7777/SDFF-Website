/**
 * League discovery CLI.
 *
 *   npm run leagues:discover -- --username <sleeper_username>
 *   npm run leagues:discover -- --user-id <sleeper_user_id> --seasons 2018-2026
 *
 * Prints every league the user is in, newest season first, with the length of
 * its previous_league_id history chain — so you can paste the right
 * currentLeagueId into config/leagues.json instead of hunting through the app.
 */
import { SleeperClient } from '../sleeper/client.js'
import { walkLeagueChain } from '../sleeper/chain.js'
import { loadLeaguesConfig } from '../config/leagues.js'

interface Args {
  username?: string
  userId?: string
  seasons: number[]
  full: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { seasons: [], full: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--username' || a === '-u') args.username = argv[++i]
    else if (a === '--user-id') args.userId = argv[++i]
    else if (a === '--seasons') args.seasons = expandSeasons(argv[++i])
    else if (a === '--full') args.full = true
  }
  if (args.seasons.length === 0) {
    const now = new Date().getFullYear()
    args.seasons = expandSeasons(`${now - 10}-${now}`)
  }
  return args
}

function expandSeasons(spec: string | undefined): number[] {
  if (!spec) return []
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const range = part.split('-').map((n) => Number(n.trim()))
    if (range.length === 2 && range.every(Number.isFinite)) {
      for (let y = range[0]; y <= range[1]; y++) out.add(y)
    } else if (Number.isFinite(range[0])) {
      out.add(range[0])
    }
  }
  return [...out].sort((a, b) => a - b)
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'league'
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  let username = args.username
  let userId = args.userId
  if (!username && !userId) {
    try {
      username = loadLeaguesConfig().sleeperUsername
    } catch {
      /* no config yet — that's fine for discovery */
    }
  }
  if (!username && !userId) {
    console.error(
      'Provide --username <name> or --user-id <id> (or set sleeperUsername in config/leagues.json).',
    )
    process.exit(1)
  }

  const client = new SleeperClient()

  if (!userId) {
    const user = await client.getUser(username!)
    if (!user) {
      console.error(`No Sleeper user found for "${username}".`)
      process.exit(1)
    }
    userId = user.user_id
    console.log(`Resolved "${username}" -> user_id ${userId}\n`)
  }

  // league_id -> newest season it appears in
  const newest = new Map<string, { season: number; name: string }>()
  for (const season of args.seasons) {
    const leagues = await client.getUserLeagues(userId, season)
    for (const lg of leagues) {
      const prev = newest.get(lg.league_id)
      if (!prev || season > prev.season) {
        newest.set(lg.league_id, { season, name: lg.name })
      }
    }
  }

  if (newest.size === 0) {
    console.log('No leagues found in the scanned season range.')
    return
  }

  // Keep only the newest league in each previous_league_id family.
  const rows: Array<{
    leagueId: string
    name: string
    season: number
    chainLength: number
    seasons: number[]
  }> = []

  const consumed = new Set<string>()
  const sorted = [...newest.entries()].sort((a, b) => b[1].season - a[1].season)

  for (const [leagueId, meta] of sorted) {
    if (consumed.has(leagueId)) continue
    const { entries } = await walkLeagueChain(client, leagueId)
    for (const e of entries) consumed.add(e.leagueId)
    rows.push({
      leagueId,
      name: meta.name,
      season: meta.season,
      chainLength: entries.length,
      seasons: entries.map((e) => e.season),
    })
  }

  rows.sort((a, b) => b.season - a.season || a.name.localeCompare(b.name))

  console.log(`Found ${rows.length} league famil${rows.length === 1 ? 'y' : 'ies'}:\n`)
  for (const r of rows) {
    console.log(`  ${r.name}`)
    console.log(`    currentLeagueId : ${r.leagueId}`)
    console.log(`    suggested slug  : ${slugify(r.name)}`)
    console.log(
      `    history         : ${r.chainLength} season${r.chainLength === 1 ? '' : 's'}` +
        (r.seasons.length ? ` (${r.seasons[0]}–${r.seasons[r.seasons.length - 1]})` : ''),
    )
    console.log('')
  }

  console.log(`(${client.stats.requestCount} Sleeper requests)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
