import { spawn, type ChildProcess } from 'node:child_process'
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path'
import type { ProxySettings } from '../shared/contracts.js'

const PROTOCOL_VERSION = 1
const STARTUP_TIMEOUT_MS = 20_000
const STARTUP_POLL_INTERVAL_MS = 150
/** Directory under DSH_HOME holding the package-manager shims put on the harness child's PATH. */
const SHIM_DIRECTORY = '.desktop-bin'
/** The community plugin market, seeded into the web profile on first run. */
const MARKET_PACKAGE = 'dshmarket'
/** A market install fetches from the registry; bounded so a dead network cannot wedge startup. */
const PROVISION_TIMEOUT_MS = 120_000
/** How long a failed market install is left alone before the next start retries it. */
const PROVISION_RETRY_AFTER_MS = 24 * 60 * 60 * 1_000
let harnessProcess: ChildProcess | undefined
/** The provisioning CLI run, tracked only so a shutdown mid-install does not orphan its pnpm. */
let provisionProcess: ChildProcess | undefined
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
    const child = harnessProcess
    harnessProcess = undefined
    // A quit during provisioning would otherwise leave its pnpm running after this exits.
    provisionProcess?.kill('SIGTERM')
    provisionProcess = undefined
    if (child !== undefined && child.exitCode === null) {
      child.once('exit', () => process.exit(0))
      child.kill('SIGTERM')
    } else {
      process.exit(0)
    }
    return
  }
  // `starting` and not just `harnessProcess`: provisioning runs before the
  // harness is spawned, so a second start message would seed the market twice.
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
  // PATH first: `dsh plugin` (and the market UI, which goes through it) spawns
  // its package manager by bare name, so without a shim an end user without a
  // global pnpm gets exit 127 on every plugin install.
  const shimDirectory = await writePackageManagerShims(harnessHome, runtime.packageManagerPath)
  await provisionMarket(harnessHome, runtime.cliPath, shimDirectory, proxy)
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
      ...process.env,
      DSH_HOME: harnessHome,
      ELECTRON_RUN_AS_NODE: '1',
      PATH: shimPath(shimDirectory),
      ...proxyEnvironment(proxy),
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
  }
  if (manifest.format !== 1 || typeof manifest.entry !== 'string' || manifest.entry.length === 0) {
    throw new Error('DeepSeek-Harness-Dist has an invalid runtime-manifest.json.')
  }
  const cliPath = resolve(root, manifest.entry)
  assertPathInsideRuntime(root, cliPath, 'Runtime manifest entry')
  await access(cliPath)
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

/**
 * Write `pnpm`/`node` shims into DSH_HOME and return their directory. Each
 * re-executes this Electron binary as Node (ELECTRON_RUN_AS_NODE), so a plugin
 * install needs no Node or pnpm installed on the user's machine. Rewritten
 * every start: the runtime path moves when the app is updated or relocated.
 */
async function writePackageManagerShims(harnessHome: string, packageManagerPath: string | undefined): Promise<string> {
  const shimDirectory = join(harnessHome, SHIM_DIRECTORY)
  await mkdir(shimDirectory, { recursive: true, mode: 0o700 })
  if (packageManagerPath === undefined) return shimDirectory
  const shims = process.platform === 'win32'
    ? [
        { name: 'pnpm.cmd', body: windowsShim([process.execPath, packageManagerPath]) },
        { name: 'node.cmd', body: windowsShim([process.execPath]) },
      ]
    : [
        { name: 'pnpm', body: posixShim([process.execPath, packageManagerPath]) },
        { name: 'node', body: posixShim([process.execPath]) },
      ]
  for (const shim of shims) {
    const shimPath = join(shimDirectory, shim.name)
    await writeFile(shimPath, shim.body, 'utf8')
    await chmod(shimPath, 0o700)
  }
  return shimDirectory
}

function posixShim(command: readonly string[]): string {
  const quoted = command.map((part) => `'${part.replaceAll("'", `'\\''`)}'`).join(' ')
  return `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec ${quoted} "$@"\n`
}

function windowsShim(command: readonly string[]): string {
  // Windows paths cannot contain a double quote, so quoting alone is enough.
  const quoted = command.map((part) => `"${part}"`).join(' ')
  return `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n${quoted} %*\r\n`
}

function shimPath(shimDirectory: string): string {
  const inherited = process.env.PATH ?? ''
  return inherited === '' ? shimDirectory : `${shimDirectory}${delimiter}${inherited}`
}

/**
 * Seed the community plugin market into the web profile the first time it is
 * missing. Best effort by design: the market is an out-of-tree npm dependency,
 * so seeding needs the registry, and a failure here must leave a bootable
 * profile rather than block the app. `dsh plugin` only rewrites the profile
 * manifest after its install succeeds, so a failed attempt changes nothing.
 */
async function provisionMarket(
  harnessHome: string,
  cliPath: string,
  shimDirectory: string,
  proxy: ProxySettings,
): Promise<void> {
  const profileDirectory = join(harnessHome, 'profiles', 'web')
  if (await profileHasMarket(profileDirectory)) return
  const marker = join(profileDirectory, '.market-seed-failed')
  if (await isWithinRetryWindow(marker)) return
  report('progress', 'Installing the DeepSeek Harness plugin market.')
  const failure = await runCli(cliPath, ['plugin', '--profile', 'web', 'add', MARKET_PACKAGE], harnessHome, shimDirectory, proxy)
  // A shutdown killed the install; the marker would misreport a real failure.
  if (failure === undefined || stopping) return
  // mkdir because a failure before `dsh plugin` initialized the profile leaves no directory.
  await mkdir(profileDirectory, { recursive: true, mode: 0o700 })
  await writeFile(marker, `${new Date().toISOString()} ${failure}\n`, 'utf8')
  report('progress', `Continuing without the plugin market: ${failure}`)
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

async function isWithinRetryWindow(marker: string): Promise<boolean> {
  try {
    const attempted = Date.parse((await readFile(marker, 'utf8')).slice(0, 24))
    return Number.isFinite(attempted) && Date.now() - attempted < PROVISION_RETRY_AFTER_MS
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
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: harnessHome,
      env: {
        ...process.env,
        DSH_HOME: harnessHome,
        ELECTRON_RUN_AS_NODE: '1',
        PATH: shimPath(shimDirectory),
        ...proxyEnvironment(proxy),
      },
      stdio: 'ignore',
    })
    provisionProcess = child
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      resolvePromise(`${args.join(' ')} timed out`)
    }, PROVISION_TIMEOUT_MS)
    timeout.unref()
    const settle = (reason: string | undefined): void => {
      clearTimeout(timeout)
      provisionProcess = undefined
      resolvePromise(reason)
    }
    child.once('error', (error) => settle(errorMessage(error)))
    child.once('exit', (code) => {
      settle(code === 0 ? undefined : `${args.join(' ')} exited with code ${String(code)}`)
    })
  })
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

/** Convert ProxySettings to HTTP_PROXY/HTTPS_PROXY/NO_PROXY environment variables
 *  for the harness child process. Also sets NODE_USE_ENV_PROXY=1 so that
 *  Node's undici fetch honours the proxy environment variables. */
function proxyEnvironment(proxy: ProxySettings): Record<string, string> {
  const env: Record<string, string> = {}
  if (proxy.httpProxy !== '') env.HTTP_PROXY = proxy.httpProxy
  if (proxy.httpsProxy !== '') env.HTTPS_PROXY = proxy.httpsProxy
  if (proxy.noProxy !== '') env.NO_PROXY = proxy.noProxy
  if (proxy.httpProxy !== '' || proxy.httpsProxy !== '') {
    // Node 24 opt-in (and newer default): make undici `fetch` honour the env proxy.
    env.NODE_USE_ENV_PROXY = '1'
  }
  return env
}

function isProxySettings(value: unknown): value is ProxySettings {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.httpProxy === 'string'
    && typeof record.httpsProxy === 'string'
    && typeof record.noProxy === 'string'
}
