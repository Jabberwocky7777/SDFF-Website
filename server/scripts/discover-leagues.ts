/**
 * League discovery CLI (also available in the admin UI's "add league" picker).
 *
 *   npm run leagues:discover -- --username <sleeper_username>
 */
import { SleeperClient } from '../sleeper/client.js'
import { discoverLeagueFamilies } from '../sleeper/discover.js'

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'league'
  )
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  let username: string | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--username' || argv[i] === '-u') username = argv[++i]
  }
  if (!username) {
    console.error('Usage: npm run leagues:discover -- --username <sleeper_username>')
    process.exit(1)
  }

  const client = new SleeperClient()
  const families = await discoverLeagueFamilies(client, username)
  if (families.length === 0) {
    console.log('No leagues found.')
    return
  }

  console.log(`\nFound ${families.length} league famil${families.length === 1 ? 'y' : 'ies'}:\n`)
  for (const f of families) {
    console.log(`  ${f.name}  [${f.type}]`)
    console.log(`    currentLeagueId : ${f.currentLeagueId}`)
    console.log(`    suggested slug  : ${slugify(f.name)}`)
    console.log(
      `    history         : ${f.seasonsAvailable} season${f.seasonsAvailable === 1 ? '' : 's'}` +
        (f.seasonRange ? ` (${f.seasonRange[0]}–${f.seasonRange[1]})` : ''),
    )
    console.log('')
  }
  console.log(`(${client.stats.requestCount} Sleeper requests)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
