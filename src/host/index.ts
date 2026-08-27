import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { ProxySettings } from '../shared/contracts.js'
import { createProxyEnvironment } from './proxy-environment.js'
import { shimPath, writeRuntimeShims } from './runtime-shims.js'

const PROTOCOL_VERSION = 1
const STARTUP_TIMEOUT_MS = 20_000
const STARTUP_POLL_INTERVAL_MS = 150
/** The community plugin market, seeded into the web profile on first run. */
const MARKET_PACKAGE = 'dshmarket'
/** A user-requested market install is bounded and never blocks core Harness startup. */
const MARKET_INSTALL_TIMEOUT_MS = 120_000
const MAX_COMMAND_ERROR_LENGTH = 2_048
let harnessProcess: ChildProcess | undefined
let provisionProcess: ChildProcess | undefined
let activeRuntime: ActiveRuntimeContext | undefined
let starting = false
let stopping = false

process.parentPort.on('message', (event) => {
  void handleParentMessage(event.data)
})

process.on('uncaughtException', () => reportFailure('Desktop Host encountered an unrecoverable error.'))
process.on('unhandledRejection', () => reportFailure('Desktop Host encountered an unrecoverable error.'))

async function handleParentMessage(value: unknown): Promise<void> {
  if (isShutdownMessage(value)) {
    stopping = true
    activeRuntime = undefined
    const child = harnessProcess
    harnessProcess = undefined
    if (provisionProcess !== undefined) void terminateProcessTree(provisionProcess)
    provisionProcess = undefined
    if (child !== undefined && child.exitCode === null) {
      child.once('exit', () => process.exit(0))
      child.kill('SIGTERM')
    } else {
      process.exit(0)
    }
    return
  }
  if (isInstallMarketMessage(value)) {
    if (activeRuntime !== undefined && provisionProcess === undefined) void installMarket(activeRuntime)
    return
  }
  if (!isStartMessage(value) || starting || harnessProcess !== undefined) return
  starting = true
  try {
    await startHarness(value.harnessHome, value.runtimeRoot, value.proxy)
  } catch (error) {
    reportFailure(`Official DeepSeek Harness did not become ready: ${errorMessage(error)}`)
  } finally {
    starting = false
  }
}

async function startHarness(harnessHome: string, runtimeRoot: string, proxy: ProxySettings): Promise<void> {
  await mkdir(harnessHome, { recursive: true, mode: 0o700 })
  const runtime = await resolveRuntime(runtimeRoot)
  const shimDirectory = await writeRuntimeShims(harnessHome, runtime)
  activeRuntime = { harnessHome, runtime, shimDirectory, proxy }
  const port = await findAvailablePort()
  const url = `http://127.0.0.1:${String(port)}`
  const child = spawn(process.execPath, [
    '--expose-internals',
    runtime.cliPath,
    'web',
    // Prevent the harness from opening the OS default browser;
    // the Electron shell embeds the Web UI in an iframe instead.
    '--no-open',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ], {
    cwd: harnessHome,
    env: {
      ...createProxyEnvironment(process.env, proxy),
      DSH_HOME: harnessHome,
      ELECTRON_RUN_AS_NODE: '1',
      PATH: shimPath(shimDirectory),
    },
    stdio: 'ignore',
  })
  harnessProcess = child
  child.once('error', () => reportFailure('Official DeepSeek Harness could not start.'))
  child.once('exit', (code) => {
    harnessProcess = undefined
    if (!stopping) reportFailure(`Official DeepSeek Harness exited with code ${String(code)}.`)
  })
  await waitForWebUi(url, child)
  process.parentPort.postMessage({
    type: 'ready',
    protocolVersion: PROTOCOL_VERSION,
    detail: 'Official DeepSeek Harness Web UI is ready.',
    startedAt: Date.now(),
    url,
  })
  const marketInstalled = await profileHasMarket(join(harnessHome, 'profiles', 'web'))
  reportMarket(marketInstalled ? 'installed' : 'not-installed', marketInstalled
    ? 'Plugin market is installed.'
    : 'Plugin market is optional and not installed.')
}

interface ResolvedRuntime {
  readonly cliPath: string
  /** Absolute path of the bundled pnpm entry, or undefined for a runtime that predates it. */
  readonly packageManagerPath: string | undefined
}

async function resolveRuntime(runtimeRoot: string): Promise<ResolvedRuntime> {
  const root = await resolveRuntimeRoot(resolve(runtimeRoot))
  const manifestPath = join(root, 'runtime-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    format?: unknown
    entry?: unknown
    packageManagerEntry?: unknown
    target?: unknown
  }
  if (manifest.format !== 1 || typeof manifest.entry !== 'string' || manifest.entry.length === 0) {
    throw new Error('DeepSeek-Harness-Dist has an invalid runtime-manifest.json.')
  }
  const cliPath = resolve(root, manifest.entry)
  assertPathInsideRuntime(root, cliPath, 'Runtime manifest entry')
  await access(cliPath)
  const target = `${process.platform}-${process.arch}`
  if (manifest.target !== undefined && manifest.target !== target) {
    throw new Error(`DeepSeek-Harness-Dist targets ${String(manifest.target)}, but this application requires ${target}.`)
  }
  return { cliPath, packageManagerPath: await resolvePackageManager(root, manifest.packageManagerEntry) }
}

/** Absent or unusable is not fatal: the harness still boots, only plugin installs need pnpm. */
async function resolvePackageManager(root: string, entry: unknown): Promise<string | undefined> {
  if (entry === undefined) return undefined
  if (typeof entry !== 'string' || entry.length === 0) {
    throw new Error('DeepSeek-Harness-Dist has an invalid runtime package manager entry.')
  }
  const packageManagerPath = resolve(root, entry)
  assertPathInsideRuntime(root, packageManagerPath, 'Runtime package manager entry')
  return await pathExists(packageManagerPath) ? packageManagerPath : undefined
}

interface ActiveRuntimeContext {
  readonly harnessHome: string
  readonly runtime: ResolvedRuntime
  readonly shimDirectory: string
  readonly proxy: ProxySettings
}

async function installMarket(context: ActiveRuntimeContext): Promise<void> {
  const { harnessHome, runtime, shimDirectory, proxy } = context
  const profileDirectory = join(harnessHome, 'profiles', 'web')
  if (await profileHasMarket(profileDirectory)) {
    reportMarket('installed', 'Plugin market is already installed.')
    return
  }
  if (runtime.packageManagerPath === undefined) {
    reportMarket('failed', 'The embedded Runtime has no package manager; core Harness remains available.')
    return
  }
  reportMarket('installing', 'Installing the optional plugin market.')
  const failure = await runCli(runtime.cliPath, ['plugin', '--profile', 'web', 'add', MARKET_PACKAGE], harnessHome, shimDirectory, proxy)
  if (stopping) return
  reportMarket(failure === undefined ? 'installed' : 'failed', failure === undefined
    ? 'Plugin market installed. Harness will restart to load it.'
    : `Plugin market installation failed; core Harness is still available. ${failure}`)
}

async function profileHasMarket(profileDirectory: string): Promise<boolean> {
  try {
    const manifest = JSON.parse(await readFile(join(profileDirectory, 'package.json'), 'utf8')) as {
      dsh?: { profile?: { bundles?: unknown } }
    }
    const bundles = manifest.dsh?.profile?.bundles
    return Array.isArray(bundles) && bundles.includes(MARKET_PACKAGE)
  } catch {
    return false
  }
}

/** Run the harness CLI to completion. Returns undefined on success, else a reason. */
function runCli(
  cliPath: string,
  args: readonly string[],
  harnessHome: string,
  shimDirectory: string,
  proxy: ProxySettings,
): Promise<string | undefined> {
  return new Promise((resolvePromise) => {
    let stderr = ''
    let timedOut = false
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: harnessHome,
      env: {
        ...createProxyEnvironment(process.env, proxy),
        DSH_HOME: harnessHome,
        ELECTRON_RUN_AS_NODE: '1',
        PATH: shimPath(shimDirectory),
      },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    provisionProcess = child
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-MAX_COMMAND_ERROR_LENGTH)
    })
    const timeout = setTimeout(() => {
      timedOut = true
      void terminateProcessTree(child).then(() => settle(`${args.join(' ')} timed out`))
    }, MARKET_INSTALL_TIMEOUT_MS)
    timeout.unref()
    const settle = (reason: string | undefined): void => {
      clearTimeout(timeout)
      provisionProcess = undefined
      resolvePromise(reason)
    }
    child.once('error', (error) => settle(errorMessage(error)))
    child.once('exit', (code) => {
      if (timedOut) return
      const detail = sanitizeCommandError(stderr)
      settle(code === 0 ? undefined : `${args.join(' ')} exited with code ${String(code)}${detail === '' ? '' : `: ${detail}`}`)
    })
  })
}

async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return
  if (process.platform === 'win32') {
    await new Promise<void>((resolvePromise) => {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.once('error', () => resolvePromise())
      killer.once('exit', () => resolvePromise())
    })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

function sanitizeCommandError(value: string): string {
  return value
    .replaceAll(/\/\/[^/@\s]+:[^/@\s]+@/g, '//***:***@')
    .replaceAll(/[\r\n]+/g, ' ')
    .trim()
}

async function resolveRuntimeRoot(root: string): Promise<string> {
  if (await pathExists(join(root, 'runtime-manifest.json'))) return root

  const indexPath = join(root, 'runtime-index.json')
  if (!await pathExists(indexPath)) {
    throw new Error('DeepSeek-Harness-Dist must contain runtime-manifest.json or runtime-index.json.')
  }
  const index = JSON.parse(await readFile(indexPath, 'utf8')) as { format?: unknown; runtimes?: unknown }
  if (index.format !== 1 || typeof index.runtimes !== 'object' || index.runtimes === null || Array.isArray(index.runtimes)) {
    throw new Error('DeepSeek-Harness-Dist has an invalid runtime-index.json.')
  }
  const target = `${process.platform}-${process.arch}`
  const runtimeDirectory = (index.runtimes as Record<string, unknown>)[target]
  if (typeof runtimeDirectory !== 'string' || runtimeDirectory.length === 0) {
    throw new Error(`DeepSeek-Harness-Dist does not include a runtime for ${target}.`)
  }
  const selectedRoot = resolve(root, runtimeDirectory)
  assertPathInsideRuntime(root, selectedRoot, 'Runtime bundle target')
  if (!await pathExists(join(selectedRoot, 'runtime-manifest.json'))) {
    throw new Error(`DeepSeek-Harness-Dist runtime ${target} has no runtime-manifest.json.`)
  }
  return selectedRoot
}

function assertPathInsideRuntime(root: string, candidate: string, label: string): void {
  const relativePath = relative(root, candidate)
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label} must remain inside DeepSeek-Harness-Dist.`)
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address !== 'object' || address === null) {
        server.close()
        reject(new Error('Unable to allocate a loopback port.'))
        return
      }
      server.close((error) => error === undefined ? resolve(address.port) : reject(error))
    })
  })
}

async function waitForWebUi(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Official Harness exited before it became ready.')
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) {
        await response.body?.cancel()
        return
      }
    } catch {
      // The process may still be loading its plugin tree.
    }
    await delay(STARTUP_POLL_INTERVAL_MS)
  }
  throw new Error('Official Harness startup timed out.')
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function report(type: 'failed' | 'progress', detail: string): void {
  process.parentPort.postMessage({ type, protocolVersion: PROTOCOL_VERSION, detail })
}

function reportMarket(state: 'not-installed' | 'installing' | 'installed' | 'failed', detail: string): void {
  process.parentPort.postMessage({ type: 'market', protocolVersion: PROTOCOL_VERSION, state, detail })
}

function reportFailure(detail: string): void {
  report('failed', detail)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown startup error.'
}

function isStartMessage(value: unknown): value is { readonly type: 'start'; readonly protocolVersion: number; readonly harnessHome: string; readonly runtimeRoot: string; readonly proxy: ProxySettings } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.type === 'start'
    && record.protocolVersion === PROTOCOL_VERSION
    && typeof record.harnessHome === 'string'
    && typeof record.runtimeRoot === 'string'
    && isProxySettings(record.proxy)
}

function isShutdownMessage(value: unknown): value is { readonly type: 'shutdown'; readonly protocolVersion: number } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.type === 'shutdown' && record.protocolVersion === PROTOCOL_VERSION
}

function isInstallMarketMessage(value: unknown): value is { readonly type: 'install-market'; readonly protocolVersion: number } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.type === 'install-market' && record.protocolVersion === PROTOCOL_VERSION
}

function isProxySettings(value: unknown): value is ProxySettings {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.httpProxy === 'string'
    && typeof record.httpsProxy === 'string'
    && typeof record.noProxy === 'string'
}
