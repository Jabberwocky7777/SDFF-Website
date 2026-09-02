// Copy non-TS server assets that `tsc` doesn't emit into dist-server/.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const copies = [
  ['server/db/migrations', 'dist-server/db/migrations'],
]

for (const [from, to] of copies) {
  const src = join(root, from)
  const dest = join(root, to)
  if (!existsSync(src)) {
    console.warn(`[copy-server-assets] skip missing ${from}`)
    continue
  }
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true })
  console.log(`[copy-server-assets] ${from} -> ${to}`)
}
