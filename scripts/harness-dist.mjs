import { spawn } from 'node:child_process'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { patchHarnessModelCapabilities, validateHarnessModelCapabilities } from './patch-harness-model-capabilities.mjs'
import { patchHarnessWin32DirectoryPicker, validateHarnessWin32DirectoryPicker } from './patch-harness-win32-directory-picker.mjs'
import { pruneRuntimeForTarget, validatePrunedRuntime } from './prune-runtime.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = resolve(process.env.DEEPSEEK_HARNESS_DIST ?? join(projectRoot, 'DeepSeek-Harness-Dist'))
const action = process.argv[2]
const manifestPath = join(distRoot, 'runtime-manifest.json')
const packagePath = join(distRoot, 'package.json')
const runtimeTarget = process.env.DEEPSEEK_HARNESS_TARGET
// pnpm ships inside the runtime because `dsh plugin` reaches its package
// manager by bare name (spawnSync('pnpm', ...)), so plugin installs — the
// community market's included — need one on PATH. The Desktop Host puts a shim
// for this entry on the harness child's PATH; see src/host/index.ts.
const PACKAGE_MANAGER_ENTRY = 'node_modules/pnpm/bin/pnpm.cjs'

switch (action) {
  case '--init':
    await initializeDist()
    break
  case '--install':
    await initializeDist()
    await run('npm', ['install', '--omit=dev', '--ignore-scripts=false', '--no-audit', '--no-fund'], distRoot)
    await patchHarnessModelCapabilities(distRoot)
    await patchHarnessWin32DirectoryPicker(distRoot)
    if (runtimeTarget !== undefined) await pruneRuntimeForTarget(distRoot, runtimeTarget)
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
  const dependencies = {
    '@deepseek-ai/dsh': process.env.DEEPSEEK_HARNESS_VERSION ?? '0.1.1-rc.2',
    pnpm: process.env.DEEPSEEK_HARNESS_PNPM_VERSION ?? '11.15.1',
  }
  let manifest = { name: 'deepseek-harness-dist', private: true, type: 'module', dependencies }
  try {
    // Keep an existing runtime's pinned versions, but adopt any dependency it
    // predates — a runtime initialized before pnpm shipped here has no package
    // manager, and its plugin installs would fail with exit 127.
    const existing = JSON.parse(await readFile(packagePath, 'utf8'))
    manifest = { ...existing, dependencies: { ...dependencies, ...existing.dependencies } }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await writeFile(packagePath, JSON.stringify(manifest, null, 2).concat('\n'), 'utf8')
  try {
    await access(manifestPath)
  } catch {
    await writeManifest()
  }
  console.log(`DeepSeek Harness runtime directory: ${distRoot}`)
}

async function writeManifest(target = undefined) {
  const runtimeVersion = await readInstalledRuntimeVersion()
  // Recorded only once installed, so a manifest written by --init (before any
  // node_modules exists) stays valid; --install rewrites it afterwards.
  const packageManagerInstalled = await pathExists(join(distRoot, PACKAGE_MANAGER_ENTRY))
  await writeFile(manifestPath, JSON.stringify({
    format: 1,
    entry: 'node_modules/@deepseek-ai/dsh/lib/bin.js',
    ...(packageManagerInstalled ? { packageManagerEntry: PACKAGE_MANAGER_ENTRY } : {}),
    ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
    ...(target === undefined ? {} : { target }),
  }, null, 2).concat('\n'), 'utf8')
  if (runtimeVersion !== undefined) {
    console.log(`DeepSeek Harness runtime version: ${runtimeVersion}`)
  }
  if (!packageManagerInstalled) {
    console.warn('DeepSeek Harness runtime has no bundled package manager; profile plugin installs will need pnpm on PATH.')
  }
}

async function readInstalledRuntimeVersion() {
  try {
    const runtimePackage = JSON.parse(await readFile(join(distRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'))
    if (typeof runtimePackage.version !== 'string' || runtimePackage.version.length === 0) {
      throw new Error('Installed @deepseek-ai/dsh package has an invalid version.')
    }
    return runtimePackage.version
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
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
  // Optional so runtimes predating the bundled package manager still validate.
  if (manifest.packageManagerEntry !== undefined) {
    if (typeof manifest.packageManagerEntry !== 'string' || manifest.packageManagerEntry.length === 0) {
      throw new Error(`Invalid runtime package manager entry: ${runtimeManifestPath}`)
    }
    const packageManager = resolve(runtimeRoot, manifest.packageManagerEntry)
    assertPathInside(runtimeRoot, packageManager, 'Runtime package manager entry')
    await access(packageManager)
  }
  if (manifest.runtimeVersion !== undefined) {
    const runtimePackage = JSON.parse(await readFile(join(runtimeRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'))
    if (manifest.runtimeVersion !== runtimePackage.version) {
      throw new Error(`Runtime version mismatch: expected ${manifest.runtimeVersion}, found ${runtimePackage.version}.`)
    }
  }
  await validateHarnessModelCapabilities(runtimeRoot)
  await validateHarnessWin32DirectoryPicker(runtimeRoot)
  if (expectedTarget !== undefined) await validatePrunedRuntime(runtimeRoot, expectedTarget)
  if (expectedTarget?.startsWith('win32-') === true) {
    await validateWindowsRuntimeAssets(runtimeRoot, expectedTarget)
  }
  return entry
}

async function validateWindowsRuntimeAssets(runtimeRoot, target) {
  const arch = target.slice('win32-'.length)
  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error(`Unsupported Windows runtime target: ${target}`)
  }
  const required = [
    join('node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib', 'worker.cjs'),
    join('node_modules', '@koromix', `koffi-win32-${arch}`, 'package.json'),
    join('node_modules', '@vscode', `ripgrep-win32-${arch}`, 'bin', 'rg.exe'),
    join('node_modules', 'node-pty', 'prebuilds', target, 'conpty.node'),
    join('node_modules', 'node-pty', 'prebuilds', target, 'conpty_console_list.node'),
    join('node_modules', 'node-pty', 'prebuilds', target, 'conpty', 'OpenConsole.exe'),
    join('node_modules', 'node-pty', 'prebuilds', target, 'conpty', 'conpty.dll'),
  ]
  for (const entry of required) {
    await access(join(runtimeRoot, entry))
  }
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
