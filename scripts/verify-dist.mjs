// Guards against publishing without build output: 0.3.7 shipped to npm with no
// dist at all because prepublishOnly's build was skipped. Fails the pack when
// any published entry point is missing.
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const required = [pkg.main, pkg.module, pkg.types].filter(Boolean)
const missing = required.filter((p) => !existsSync(resolve(root, p)))

if (missing.length > 0) {
  console.error(`[verify-dist] missing published entry points: ${missing.join(', ')}`)
  console.error('[verify-dist] run "yarn build" before packing.')
  process.exit(1)
}
console.log(`[verify-dist] ok (${required.join(', ')})`)
