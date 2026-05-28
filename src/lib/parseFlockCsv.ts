export type Position = 'QB' | 'RB' | 'WR' | 'TE'

export interface FlockPlayer {
  name: string
  team: string
  position: Position
  expertRank: number
  tier: string | null
}

function inferTier(rank: number): string {
  const r = Math.floor(rank)
  if (r <= 8)   return 'S'
  if (r <= 20)  return 'A'
  if (r <= 36)  return 'B'
  if (r <= 60)  return 'C'
  if (r <= 84)  return 'D'
  if (r <= 120) return 'E'
  if (r <= 160) return 'F'
  return 'G'
}

const VALID_POSITIONS = new Set<string>(['QB', 'RB', 'WR', 'TE'])

export function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    // Remove apostrophes (straight and curly)
    .replace(/['‘’]/g, '')
    .replace(/-/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    // Strip trailing generational suffixes
    .replace(/(jr|sr|iv|iii|ii)$/, '')
}

export function parseFlockCsv(raw: string): FlockPlayer[] {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    throw new Error('CSV appears empty — must have a header row and data rows.')
  }

  // Detect column indices by name (case-insensitive, robust to reordering)
  const headerCols = lines[0].split(',').map((c) => c.trim().toLowerCase())
  const nameIdx = headerCols.indexOf('name')
  const teamIdx = headerCols.indexOf('team')
  const posIdx = headerCols.indexOf('position')
  const rankIdx = headerCols.indexOf('expert rank')
  const tierIdx = headerCols.indexOf('tier')

  if (nameIdx === -1) throw new Error('CSV is missing a "Name" column.')
  if (rankIdx === -1) throw new Error('CSV is missing an "Expert Rank" column.')

  const players: FlockPlayer[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const name = cols[nameIdx]?.trim() ?? ''
    const team = teamIdx >= 0 ? (cols[teamIdx]?.trim() ?? '') : ''
    const rawPos = posIdx >= 0 ? (cols[posIdx]?.trim().toUpperCase() ?? '') : ''
    const rankStr = cols[rankIdx]?.trim() ?? ''

    if (!name) continue
    if (!VALID_POSITIONS.has(rawPos)) continue

    const expertRank = parseFloat(rankStr)
    if (isNaN(expertRank)) continue

    const tierRaw = tierIdx >= 0 ? (cols[tierIdx]?.trim() ?? '') : ''
    const tier = tierRaw ? tierRaw.toUpperCase() : inferTier(expertRank)

    players.push({
      name,
      team,
      position: rawPos as Position,
      expertRank,
      tier,
    })
  }

  if (players.length < 10) {
    throw new Error(
      `CSV must contain at least 10 valid QB/RB/WR/TE rows (found ${players.length}). ` +
      'Make sure the Position column contains QB, RB, WR, or TE.',
    )
  }

  return players.sort((a, b) => a.expertRank - b.expertRank)
}
