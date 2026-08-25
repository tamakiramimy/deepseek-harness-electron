import { access, rm, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = join(projectRoot, 'DeepSeek-Harness-Dist')
const releaseRoot = join(projectRoot, 'release', 'mac-arm64')
// The packaged app also looks for the runtime beside the .app bundle
// (see resolveHarnessRuntimeRoot -> packagedRuntimeCandidates).
const linkPath = join(releaseRoot, 'DeepSeek-Harness-Dist')
// Remove the legacy inside-bundle link so the "beside the .app" location always wins.
const legacyLink = join(releaseRoot, 'DeepSeek Harness Desktop.app', 'Contents', 'MacOS', 'DeepSeek-Harness-Dist')

try {
  await access(join(runtimeRoot, 'runtime-manifest.json'))
} catch {
  console.error(`Runtime not found at ${runtimeRoot}. Run "pnpm harness:dist:install" first.`)
  process.exit(1)
}

try {
  await access(join(releaseRoot, 'DeepSeek Harness Desktop.app'))
} catch {
  console.error(`Packaged app not found under ${releaseRoot}. Run "pnpm package:mac:arm64" first.`)
  process.exit(1)
}

await rm(linkPath, { recursive: true, force: true })
await rm(legacyLink, { force: true })
await symlink(runtimeRoot, linkPath, 'dir')
console.log(`Linked runtime: ${linkPath}`)
console.log(`            -> ${runtimeRoot}`)