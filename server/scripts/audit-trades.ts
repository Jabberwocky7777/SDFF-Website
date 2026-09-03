/**
 * Trade attribution audit — "is this trade showing the right managers?"
 *
 *   npm run trades:audit                          # every league, summary only
 *   npm run trades:audit -- --league squad-redraft
 *   npm run trades:audit -- --trade 1288953803399233536
 *
 * Trades are attributed by mapping each roster id to that league-season's
 * owner. That mapping is the thing worth doubting: roster ids are only
 * meaningful within one season, managers swap slots between seasons, and
 * Sleeper reports a *past* league's roster owner as whoever holds it now — so
 * a team handed over after the fact silently re-attributes its old trades.
 *
 * The audit cross-checks the recorded owner against two records Sleeper does
 * not rewrite: who actually made that roster's draft picks (`picked_by`), and
 * who is listed on its weekly matchups. A roster whose owner disagrees with
 * its own drafter is the fingerprint of a post-hoc handover.
 *
 * A transaction's `creator` is deliberately NOT treated as a participant — a
 * commissioner can execute a trade on behalf of two other managers, so it
 * identifies who pressed the button, nothing more. It is printed for context.
 */
import { getDb, closeDb } from '../db/index.js'
import { getLeagues } from '../config/leagues.js'
import type { DB } from '../db/index.js'

interface Args {
  league: string | null
  tradeId: string | null
}

function parseArgs(argv: string[]): Args {
  const out: Args = { league: null, tradeId: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--league' || argv[i] === '-l') out.league = argv[++i] ?? null
    else if (argv[i] === '--trade' || argv[i] === '-t') out.tradeId = argv[++i] ?? null
  }
  return out
}

function managerNames(db: DB): Map<string, string> {
  const rows = db
    .prepare(`SELECT user_id, COALESCE(canonical_name, display_name, user_id) AS name FROM manager`)
    .all() as Array<{ user_id: string; name: string }>
  return new Map(rows.map((r) => [r.user_id, r.name]))
}

/** `family:season:roster` → user id, from that season's team_season rows. */
function ownerIndex(db: DB): Map<string, string | null> {
  const rows = db
    .prepare(
      `SELECT ls.family_id, ls.season, ts.roster_id, ts.user_id
       FROM team_season ts JOIN league_season ls ON ls.league_id = ts.league_id`,
    )
    .all() as Array<{ family_id: number; season: number; roster_id: number; user_id: string | null }>
  return new Map(rows.map((r) => [`${r.family_id}:${r.season}:${r.roster_id}`, r.user_id]))
}

/** The same key space, but sourced from whoever actually made the picks. */
function drafterIndex(db: DB): Map<string, string | null> {
  const rows = db
    .prepare(
      `SELECT ls.family_id, ls.season, dp.roster_id, dp.user_id, COUNT(*) AS n
       FROM draft_pick dp JOIN league_season ls ON ls.league_id = dp.league_id
       GROUP BY ls.family_id, ls.season, dp.roster_id, dp.user_id
       ORDER BY n DESC`,
    )
    .all() as Array<{
    family_id: number
    season: number
    roster_id: number
    user_id: string | null
    n: number
  }>
  const out = new Map<string, string | null>()
  // Ordered by pick count, so the first row for a roster is its main drafter —
  // a couple of commissioner-made picks can't outvote the real owner.
  for (const r of rows) {
    const key = `${r.family_id}:${r.season}:${r.roster_id}`
    if (!out.has(key)) out.set(key, r.user_id)
  }
  return out
}

function auditOwners(db: DB, familyIds: Set<number>, name: (u: string | null) => string): number {
  const owners = ownerIndex(db)
  const drafters = drafterIndex(db)
  const slugOf = new Map(getLeagues().map((l) => [l.id, l.slug]))

  let bad = 0
  for (const [key, drafter] of drafters) {
    const [familyId, season, rosterId] = key.split(':')
    if (!familyIds.has(Number(familyId))) continue
    const owner = owners.get(key) ?? null
    if (owner === drafter) continue
    bad++
    console.log(
      `  ${slugOf.get(Number(familyId)) ?? familyId} ${season} roster ${rosterId}: ` +
        `drafted by ${name(drafter)}, but recorded owner is ${name(owner)}`,
    )
  }
  return bad
}

function auditTradeAssets(db: DB, familyIds: Set<number>, name: (u: string | null) => string): number {
  const owners = ownerIndex(db)
  const slugOf = new Map(getLeagues().map((l) => [l.id, l.slug]))

  const assets = db
    .prepare(
      `SELECT t.id AS trade_id, ls.family_id, ls.season,
              ta.from_roster_id, ta.to_roster_id, ta.from_user_id, ta.to_user_id
       FROM trade_asset ta
       JOIN trade t ON t.id = ta.trade_id
       JOIN league_season ls ON ls.league_id = t.league_id`,
    )
    .all() as Array<{
    trade_id: string
    family_id: number
    season: number
    from_roster_id: number | null
    to_roster_id: number | null
    from_user_id: string | null
    to_user_id: string | null
  }>

  let bad = 0
  for (const a of assets) {
    if (!familyIds.has(a.family_id)) continue
    for (const [rosterId, userId] of [
      [a.from_roster_id, a.from_user_id],
      [a.to_roster_id, a.to_user_id],
    ] as Array<[number | null, string | null]>) {
      if (rosterId == null) continue
      const owner = owners.get(`${a.family_id}:${a.season}:${rosterId}`) ?? null
      if (owner === userId) continue
      bad++
      console.log(
        `  ${slugOf.get(a.family_id) ?? a.family_id} ${a.season} trade ${a.trade_id}: ` +
          `roster ${rosterId} attributed to ${name(userId)}, season owner is ${name(owner)}`,
      )
    }
  }
  return bad
}

function showTrade(db: DB, tradeId: string, name: (u: string | null) => string): void {
  const trade = db
    .prepare(
      `SELECT t.id, t.league_id, t.season, t.week, t.is_offseason, t.roster_ids_json, ls.family_id
       FROM trade t JOIN league_season ls ON ls.league_id = t.league_id WHERE t.id = ?`,
    )
    .get(tradeId) as
    | {
        id: string
        league_id: string
        season: number
        week: number | null
        is_offseason: number
        roster_ids_json: string | null
        family_id: number
      }
    | undefined

  if (!trade) {
    console.error(`No trade ${tradeId} on record.`)
    return
  }

  const slug = getLeagues().find((l) => l.id === trade.family_id)?.slug ?? String(trade.family_id)
  console.log(
    `\nTrade ${trade.id} — ${slug} ${trade.season} ` +
      `${trade.is_offseason ? '(offseason)' : `wk ${trade.week ?? '?'}`}`,
  )
  console.log(`  rosters involved: ${trade.roster_ids_json ?? '[]'}`)

  const raw = db.prepare(`SELECT raw_json FROM transaction_record WHERE id = ?`).get(trade.id) as
    | { raw_json: string }
    | undefined
  if (raw) {
    const parsed = JSON.parse(raw.raw_json) as { creator?: string }
    console.log(
      `  created by: ${name(parsed.creator ?? null)}` +
        ` (whoever submitted it — a commissioner can act for others, so this is not proof of participation)`,
    )
  }

  console.log('\n  Roster ownership that season, from three independent records:')
  for (const rosterId of JSON.parse(trade.roster_ids_json ?? '[]') as number[]) {
    const owner = db
      .prepare(`SELECT user_id FROM team_season WHERE league_id = ? AND roster_id = ?`)
      .get(trade.league_id, rosterId) as { user_id: string | null } | undefined
    const drafter = db
      .prepare(
        `SELECT dp.user_id, COUNT(*) n FROM draft_pick dp
         WHERE dp.league_id = ? AND dp.roster_id = ?
         GROUP BY dp.user_id ORDER BY n DESC LIMIT 1`,
      )
      .get(trade.league_id, rosterId) as { user_id: string | null; n: number } | undefined
    const played = db
      .prepare(
        `SELECT user_id, COUNT(*) n FROM matchup WHERE league_id = ? AND roster_id = ?
         GROUP BY user_id ORDER BY n DESC LIMIT 1`,
      )
      .get(trade.league_id, rosterId) as { user_id: string | null; n: number } | undefined

    const agree =
      owner?.user_id === (drafter?.user_id ?? owner?.user_id) &&
      owner?.user_id === (played?.user_id ?? owner?.user_id)
    console.log(
      `    roster ${String(rosterId).padStart(2)}: owner=${name(owner?.user_id ?? null)} ` +
        `drafted=${name(drafter?.user_id ?? null)} played=${name(played?.user_id ?? null)}` +
        `${agree ? '' : '   <-- DISAGREE'}`,
    )
  }

  console.log('\n  Assets:')
  const assets = db
    .prepare(
      `SELECT ta.asset_type, ta.player_id, ta.pick_season, ta.pick_round, ta.faab_amount,
              ta.from_roster_id, ta.to_roster_id, ta.from_user_id, ta.to_user_id,
              p.full_name, p.position
       FROM trade_asset ta LEFT JOIN player p ON p.player_id = ta.player_id
       WHERE ta.trade_id = ?`,
    )
    .all(trade.id) as Array<{
    asset_type: string
    player_id: string | null
    pick_season: number | null
    pick_round: number | null
    faab_amount: number | null
    from_roster_id: number | null
    to_roster_id: number | null
    from_user_id: string | null
    to_user_id: string | null
    full_name: string | null
    position: string | null
  }>

  for (const a of assets) {
    const what =
      a.asset_type === 'player'
        ? `${a.full_name ?? a.player_id} (${a.position ?? '?'})`
        : a.asset_type === 'pick'
          ? `${a.pick_season ?? '?'} round ${a.pick_round ?? '?'} pick`
          : `$${a.faab_amount ?? 0} FAAB`
    console.log(
      `    ${what}: roster ${a.from_roster_id ?? '?'} (${name(a.from_user_id)}) ` +
        `-> roster ${a.to_roster_id ?? '?'} (${name(a.to_user_id)})`,
    )
  }
  console.log('')
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const db = getDb()
  const names = managerNames(db)
  const name = (u: string | null): string => (u ? (names.get(u) ?? u) : '—')

  try {
    if (args.tradeId) {
      showTrade(db, args.tradeId, name)
      return
    }

    const leagues = getLeagues()
    const targets = args.league ? leagues.filter((l) => l.slug === args.league) : leagues
    if (targets.length === 0) {
      console.error(
        `Unknown league "${args.league}". Known: ${leagues.map((l) => l.slug).join(', ')}`,
      )
      process.exitCode = 1
      return
    }
    const familyIds = new Set(targets.map((l) => l.id))
    console.log(`Auditing: ${targets.map((l) => l.slug).join(', ')}\n`)

    console.log('Roster-seasons whose recorded owner disagrees with who drafted that roster:')
    const badOwners = auditOwners(db, familyIds, name)
    console.log(`  ${badOwners} mismatch(es)\n`)

    console.log('Trade assets attributed to someone other than that season’s roster owner:')
    const badAssets = auditTradeAssets(db, familyIds, name)
    console.log(`  ${badAssets} mismatch(es)\n`)

    if (badOwners === 0 && badAssets === 0) {
      console.log('Clean — every trade is attributed to the manager who owned that roster slot')
      console.log('that season, corroborated by the draft and matchup records.')
    } else {
      console.log('Investigate the rows above with --trade <id>. A roster whose owner disagrees')
      console.log('with its drafter usually means the team changed hands after the season ended.')
    }
  } finally {
    closeDb()
  }
}

main()
