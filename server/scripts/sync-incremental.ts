/**
 * Incremental sync — current season only, all league families.
 *
 *   npm run sync:incremental
 *
 * Cheap enough to run hourly (or every few minutes during games). Re-pulls the
 * live season's matchups/transactions and refreshes the player dictionary if
 * it's stale.
 */
import { getDb, closeDb } from '../db/index.js'
import { getSleeperClient } from '../sleeper/client.js'
import { getLeagues } from '../config/leagues.js'
import { ingestFamily, refreshPlayers } from '../sync/ingest.js'
import { resolveNflState } from '../sync/nflState.js'

async function main(): Promise<void> {
  const db = getDb()
  const client = getSleeperClient()
  const state = await resolveNflState(client)

  await refreshPlayers(client, db, {})

  for (const entry of getLeagues()) {
    await ingestFamily(client, db, entry, {
      mode: 'incremental',
      currentNflWeek: state.week,
      currentNflSeason: state.season,
    })
  }

  console.log(`\nIncremental sync done, ${client.stats.requestCount} Sleeper requests.`)
  closeDb()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
