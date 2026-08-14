import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(join(fileURLToPath(import.meta.url), '..', '..'))
const releaseRoot = join(projectRoot, 'release')
const files = (await readdir(releaseRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && isInstallerFile(entry.name))
  .map((entry) => join(releaseRoot, entry.name))
const checksums = []

for (const file of files) {
  const data = await readFile(file)
  const digest = createHash('sha256').update(data).digest('hex')
  checksums.push(`${digest}  ${file.slice(releaseRoot.length + 1)}`)
}

await writeFile(join(releaseRoot, 'SHA256SUMS.txt'), checksums.sort().join('\n').concat('\n'), 'utf8')
console.log(`Wrote checksums for ${String(checksums.length)} installer files.`)

function isInstallerFile(name) {
  return name.endsWith('.dmg')
    || name.endsWith('.AppImage')
    || name.endsWith('.deb')
    || name.endsWith('.exe')
    || name.endsWith('.blockmap')
}