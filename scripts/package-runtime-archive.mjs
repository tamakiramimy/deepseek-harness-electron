import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = resolve(process.env.DEEPSEEK_HARNESS_DIST ?? join(projectRoot, 'DeepSeek-Harness-Dist'))
const outputDirectory = resolve(process.env.DEEPSEEK_HARNESS_PACKAGE ?? join(projectRoot, 'runtime-package'))
const runtimeManifest = JSON.parse(await readFile(join(runtimeRoot, 'runtime-manifest.json'), 'utf8'))
if (runtimeManifest.format !== 1
  || typeof runtimeManifest.target !== 'string'
  || typeof runtimeManifest.runtimeVersion !== 'string') {
  throw new Error('Runtime must declare format, target and runtimeVersion before it can be archived.')
}

await mkdir(outputDirectory, { recursive: true })
const archivePath = join(outputDirectory, `DeepSeek-Harness-Dist-${runtimeManifest.target}.zip`)
await rm(archivePath, { force: true })
await archiveRuntime(runtimeRoot, archivePath)
const manifest = {
  format: 1,
  archive: basename(archivePath),
  target: runtimeManifest.target,
  runtimeVersion: runtimeManifest.runtimeVersion,
  sha256: await sha256File(archivePath),
}
await writeFile(join(outputDirectory, 'runtime-package.json'), JSON.stringify(manifest, null, 2).concat('\n'), 'utf8')
console.log(`Packaged ${manifest.target} Runtime ${manifest.runtimeVersion}: ${archivePath}`)

function archiveRuntime(source, destination) {
  if (process.platform === 'win32') {
    const script = '$ErrorActionPreference="Stop"; $items=Get-ChildItem -LiteralPath $env:DSH_RUNTIME_SOURCE -Force; Compress-Archive -Path $items.FullName -DestinationPath $env:DSH_RUNTIME_ARCHIVE -CompressionLevel Optimal -Force'
    return run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], projectRoot, {
      ...process.env,
      DSH_RUNTIME_SOURCE: source,
      DSH_RUNTIME_ARCHIVE: destination,
    })
  }
  return run('/usr/bin/zip', ['-qry', destination, '.'], source, process.env)
}

function run(command, args, cwd, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => code === 0
      ? resolvePromise()
      : reject(new Error(`${command} exited with code ${String(code)}.`)))
  })
}

function sha256File(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.once('error', reject)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('end', () => resolvePromise(hash.digest('hex')))
  })
}