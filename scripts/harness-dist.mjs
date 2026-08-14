import { spawn } from 'node:child_process'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = resolve(process.env.DEEPSEEK_HARNESS_DIST ?? join(projectRoot, 'DeepSeek-Harness-Dist'))
const action = process.argv[2]
const manifestPath = join(distRoot, 'runtime-manifest.json')
const packagePath = join(distRoot, 'package.json')
const runtimeTarget = process.env.DEEPSEEK_HARNESS_TARGET

switch (action) {
  case '--init':
    await initializeDist()
    break
  case '--install':
    await initializeDist()
    await run('npm', ['install', '--omit=dev', '--ignore-scripts=false'], distRoot)
    await writeManifest(runtimeTarget)
    break
  case '--validate':
    await validateDist()
    break
  case '--bundle-index':
    await writeBundleIndex()
    break
  case '--bundle-validate':
    await validateBundle()
    break
  default:
    throw new Error('Usage: node scripts/harness-dist.mjs --init|--install|--validate|--bundle-index|--bundle-validate')
}

async function initializeDist() {
  await mkdir(distRoot, { recursive: true })
  try {
    await access(packagePath)
  } catch {
    await writeFile(packagePath, JSON.stringify({
      name: 'deepseek-harness-dist',
      private: true,
      type: 'module',
      dependencies: {
        '@deepseek-ai/dsh': process.env.DEEPSEEK_HARNESS_VERSION ?? 'latest',
      },
    }, null, 2).concat('\n'), 'utf8')
  }
  try {
    await access(manifestPath)
  } catch {
    await writeManifest()
  }
  console.log(`DeepSeek Harness runtime directory: ${distRoot}`)
}

async function writeManifest(target = undefined) {
  await writeFile(manifestPath, JSON.stringify({
    format: 1,
    entry: 'node_modules/@deepseek-ai/dsh/lib/bin.js',
    ...(target === undefined ? {} : { target }),
  }, null, 2).concat('\n'), 'utf8')
}

async function validateDist() {
  await validateRuntimeDirectory(distRoot, runtimeTarget)
  console.log(`Validated DeepSeek Harness runtime entry: ${resolve(distRoot, JSON.parse(await readFile(manifestPath, 'utf8')).entry)}`)
}

async function writeBundleIndex() {
  const runtimes = {}
  for (const entry of await readdir(distRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const runtimeRoot = join(distRoot, entry.name)
    if (!await pathExists(join(runtimeRoot, 'runtime-manifest.json'))) continue
    const manifest = JSON.parse(await readFile(join(runtimeRoot, 'runtime-manifest.json'), 'utf8'))
    if (typeof manifest.target !== 'string' || manifest.target.length === 0) {
      throw new Error(`Runtime ${entry.name} must declare a target in runtime-manifest.json.`)
    }
    if (Object.hasOwn(runtimes, manifest.target)) {
      throw new Error(`Runtime bundle contains duplicate target ${manifest.target}.`)
    }
    await validateRuntimeDirectory(runtimeRoot, manifest.target)
    runtimes[manifest.target] = entry.name
  }
  if (Object.keys(runtimes).length === 0) {
    throw new Error('Runtime bundle contains no platform runtime directories.')
  }
  await writeFile(join(distRoot, 'runtime-index.json'), JSON.stringify({ format: 1, runtimes }, null, 2).concat('\n'), 'utf8')
  console.log(`Wrote Runtime Bundle index with ${String(Object.keys(runtimes).length)} platform entries.`)
}

async function validateBundle() {
  const indexPath = join(distRoot, 'runtime-index.json')
  const index = JSON.parse(await readFile(indexPath, 'utf8'))
  if (index.format !== 1 || typeof index.runtimes !== 'object' || index.runtimes === null || Array.isArray(index.runtimes)) {
    throw new Error(`Invalid runtime bundle index: ${indexPath}`)
  }
  const runtimes = index.runtimes
  const targets = Object.entries(runtimes)
  if (targets.length === 0) throw new Error('Runtime bundle index contains no platform runtimes.')
  for (const [target, directory] of targets) {
    if (typeof directory !== 'string' || directory.length === 0) {
      throw new Error(`Runtime bundle entry ${target} has an invalid directory.`)
    }
    const runtimeRoot = resolve(distRoot, directory)
    assertPathInside(distRoot, runtimeRoot, `Runtime bundle entry ${target}`)
    await validateRuntimeDirectory(runtimeRoot, target)
  }
  console.log(`Validated Runtime Bundle with ${String(targets.length)} platform entries.`)
}

async function validateRuntimeDirectory(runtimeRoot, expectedTarget = undefined) {
  const runtimeManifestPath = join(runtimeRoot, 'runtime-manifest.json')
  const manifest = JSON.parse(await readFile(runtimeManifestPath, 'utf8'))
  if (manifest.format !== 1 || typeof manifest.entry !== 'string' || manifest.entry.length === 0) {
    throw new Error(`Invalid runtime manifest: ${runtimeManifestPath}`)
  }
  if (manifest.target !== undefined && (typeof manifest.target !== 'string' || manifest.target.length === 0)) {
    throw new Error(`Invalid runtime target: ${runtimeManifestPath}`)
  }
  if (expectedTarget !== undefined && manifest.target !== expectedTarget) {
    throw new Error(`Runtime target mismatch: expected ${expectedTarget}.`)
  }
  const entry = resolve(runtimeRoot, manifest.entry)
  assertPathInside(runtimeRoot, entry, 'Runtime manifest entry')
  await access(entry)
  return entry
}

function assertPathInside(root, candidate, label) {
  const relativePath = relative(root, candidate)
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label} must remain inside DeepSeek-Harness-Dist.`)
  }
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function run(command, args, cwd) {
  const executable = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : command
  const executableArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', [command, ...args].join(' ')]
    : args
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, executableArgs, { cwd, env: process.env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${executable} exited with code ${String(code)}.`)))
  })
}