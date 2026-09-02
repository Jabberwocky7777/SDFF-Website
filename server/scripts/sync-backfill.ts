/**
 * Full historical ingest.
 *
 *   npm run sync:backfill -- --league all
 *   npm run sync:backfill -- --league sdff
 *   npm run sync:backfill -- --league squad-redraft --force
 *
 * Idempotent and resumable: completed seasons already in sync_log are skipped
 * unless --force is passed.
 */
import { getDb, closeDb } from '../db/index.js'
import { getSleeperClient } from '../sleeper/client.js'
import { getLeagues } from '../config/leagues.js'
import { ingestFamily, refreshPlayers } from '../sync/ingest.js'
import { resolveNflState } from '../sync/nflState.js'

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  let leagueArg = 'all'
  let force = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--league' || argv[i] === '-l') leagueArg = argv[++i]
    else if (argv[i] === '--force') force = true
  }

  const db = getDb()
  const client = getSleeperClient()
  const state = await resolveNflState(client)

  const all = getLeagues()
  const targets =
    leagueArg === 'all' ? all : all.filter((l) => l.slug === leagueArg)
  if (targets.length === 0) {
    console.error(`Unknown league "${leagueArg}". Known: ${all.map((l) => l.slug).join(', ')}`)
    process.exit(1)
  }

  await refreshPlayers(client, db, {})

  const started = Date.now()
  for (const entry of targets) {
    await ingestFamily(client, db, entry, {
      mode: 'backfill',
      force,
      currentNflWeek: state.week,
      currentNflSeason: state.season,
    })
  }

  console.log(
    `\nBackfill complete in ${((Date.now() - started) / 1000).toFixed(1)}s, ` +
      `${client.stats.requestCount} Sleeper requests.`,
  )
  closeDb()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
