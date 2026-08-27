import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'

interface RuntimePackageManifest {
  readonly format: 1
  readonly archive: string
  readonly target: string
  readonly runtimeVersion: string
  readonly sha256: string
}

interface RuntimeManagerInternals {
  readonly target?: string
  readonly extract?: (archivePath: string, destination: string) => Promise<void>
}

const COMPLETE_MARKER = '.desktop-runtime.json'

export async function ensurePackagedRuntime(
  packageDirectory: string,
  userDataDirectory: string,
  internals: RuntimeManagerInternals = {},
): Promise<string> {
  const target = internals.target ?? `${process.platform}-${process.arch}`
  const manifest = parsePackageManifest(await readFile(join(packageDirectory, 'runtime-package.json'), 'utf8'))
  if (manifest.target !== target) {
    throw new Error(`Packaged Runtime targets ${manifest.target}, but this application requires ${target}.`)
  }
  const archivePath = resolve(packageDirectory, manifest.archive)
  assertPathInside(packageDirectory, archivePath, 'Runtime archive')
  if (basename(archivePath) !== manifest.archive) throw new Error('Runtime archive must be a plain filename.')
  const actualHash = await sha256File(archivePath)
  if (actualHash !== manifest.sha256) throw new Error('Packaged Runtime archive failed its SHA-256 integrity check.')

  const runtimesDirectory = join(userDataDirectory, 'runtimes')
  const runtimeDirectory = join(runtimesDirectory, `${safeSegment(manifest.runtimeVersion)}-${target}`)
  if (await isCompleteRuntime(runtimeDirectory, manifest)) return runtimeDirectory

  await mkdir(runtimesDirectory, { recursive: true, mode: 0o700 })
  const stagingDirectory = join(runtimesDirectory, `.${basename(runtimeDirectory)}-${String(process.pid)}.staging`)
  await rm(stagingDirectory, { recursive: true, force: true })
  await mkdir(stagingDirectory, { recursive: true, mode: 0o700 })
  try {
    await (internals.extract ?? extractRuntimeArchive)(archivePath, stagingDirectory)
    await validateExtractedRuntime(stagingDirectory, target)
    await writeFile(join(stagingDirectory, COMPLETE_MARKER), JSON.stringify(manifest), { encoding: 'utf8', mode: 0o600 })
    await rm(runtimeDirectory, { recursive: true, force: true })
    await rename(stagingDirectory, runtimeDirectory)
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true })
    throw error
  }
  return runtimeDirectory
}

async function isCompleteRuntime(directory: string, manifest: RuntimePackageManifest): Promise<boolean> {
  try {
    const marker = parsePackageManifest(await readFile(join(directory, COMPLETE_MARKER), 'utf8'))
    if (marker.sha256 !== manifest.sha256 || marker.target !== manifest.target) return false
    await validateExtractedRuntime(directory, manifest.target)
    return true
  } catch {
    return false
  }
}

async function validateExtractedRuntime(directory: string, target: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(directory, 'runtime-manifest.json'), 'utf8')) as {
    format?: unknown
    entry?: unknown
    target?: unknown
  }
  if (manifest.format !== 1 || typeof manifest.entry !== 'string' || manifest.entry.length === 0) {
    throw new Error('Extracted Runtime has an invalid runtime-manifest.json.')
  }
  if (manifest.target !== target) {
    throw new Error(`Extracted Runtime target mismatch: expected ${target}, found ${String(manifest.target)}.`)
  }
  const entry = resolve(directory, manifest.entry)
  assertPathInside(directory, entry, 'Extracted Runtime entry')
  await access(entry)
}

function parsePackageManifest(text: string): RuntimePackageManifest {
  const value = JSON.parse(text) as Record<string, unknown>
  if (value.format !== 1
    || typeof value.archive !== 'string'
    || typeof value.target !== 'string'
    || typeof value.runtimeVersion !== 'string'
    || typeof value.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(value.sha256)) {
    throw new Error('Packaged Runtime has an invalid runtime-package.json.')
  }
  return value as unknown as RuntimePackageManifest
}

function safeSegment(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/u.test(value)) throw new Error('Packaged Runtime version is unsafe for a directory name.')
  return value
}

function assertPathInside(root: string, candidate: string, label: string): void {
  const relativePath = relative(resolve(root), candidate)
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label} must remain inside its package directory.`)
  }
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.once('error', reject)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('end', () => resolvePromise(hash.digest('hex')))
  })
}

function extractRuntimeArchive(archivePath: string, destination: string): Promise<void> {
  const command = process.platform === 'win32' ? 'tar.exe' : '/usr/bin/ditto'
  const args = process.platform === 'win32'
    ? ['-xf', archivePath, '-C', destination]
    : ['-x', '-k', archivePath, destination]
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString('utf8')}`.slice(-2_048) })
    child.once('error', reject)
    child.once('exit', code => code === 0
      ? resolvePromise()
      : reject(new Error(`Runtime extraction failed with code ${String(code)}${stderr.trim() === '' ? '' : `: ${stderr.trim()}`}`)))
  })
}