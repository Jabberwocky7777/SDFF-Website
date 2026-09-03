import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    env: {
      // The cache proxy writes through to CACHE_DIR, which otherwise defaults
      // to the repo's own `cache/` — so running the suite overwrote real
      // entries (nfl_players, ktc_rankings, …) with `{ok: "<key>"}` fixtures
      // and left the draft board crashing on a ranking source that was
      // suddenly an object instead of an array.
      CACHE_DIR: path.join(os.tmpdir(), 'sdff-test-cache'),
    },
  },
})
