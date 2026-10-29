/**
 * Player-name normalization, shared by every server-side name match.
 *
 * External ranking sources (KeepTradeCut, FantasyCalc, the Flock CSV) key on
 * names, not Sleeper ids, so joining them needs one agreed-upon spelling. This
 * is that spelling: lowercase, accents folded, punctuation and whitespace
 * dropped, generational suffix stripped.
 *
 * `src/lib/parseFlockCsv.ts` carries the same function for the browser-side
 * draft board — the two tsconfigs don't share a rootDir, so neither can import
 * the other. Keep them in step: a change here belongs there too.
 */
export function normalizePlayerName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Apostrophes, straight and curly.
    .replace(/['‘’]/g, '')
    .replace(/-/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .replace(/(jr|sr|iv|iii|ii)$/, '')
}
