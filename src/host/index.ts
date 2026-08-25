import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { ProxySettings } from '../shared/contracts.js'

const PROTOCOL_VERSION = 1
const STARTUP_TIMEOUT_MS = 20_000
const STARTUP_POLL_INTERVAL_MS = 150
let harnessProcess: ChildProcess | undefined
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
    if (child !== undefined && child.exitCode === null) {
      child.once('exit', () => process.exit(0))
      child.kill('SIGTERM')
    } else {
      process.exit(0)
    }
    return
  }
  if (!isStartMessage(value) || harnessProcess !== undefined) return
  try {
    await startHarness(value.harnessHome, value.runtimeRoot, value.proxy)
  } catch (error) {
    reportFailure(`Official DeepSeek Harness did not become ready: ${errorMessage(error)}`)
  }
}

async function startHarness(harnessHome: string, runtimeRoot: string, proxy: ProxySettings): Promise<void> {
  await mkdir(harnessHome, { recursive: true, mode: 0o700 })
  const port = await findAvailablePort()
  const url = `http://127.0.0.1:${String(port)}`
  const cliPath = await resolveDshCli(runtimeRoot)
  const child = spawn(process.execPath, [
    '--expose-internals',
    cliPath,
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

async function resolveDshCli(runtimeRoot: string): Promise<string> {
  const root = await resolveRuntimeRoot(resolve(runtimeRoot))
  const manifestPath = join(root, 'runtime-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { format?: unknown; entry?: unknown }
  if (manifest.format !== 1 || typeof manifest.entry !== 'string' || manifest.entry.length === 0) {
    throw new Error('DeepSeek-Harness-Dist has an invalid runtime-manifest.json.')
  }
  const cliPath = resolve(root, manifest.entry)
  assertPathInsideRuntime(root, cliPath, 'Runtime manifest entry')
  await access(cliPath)
  return cliPath
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

function reportFailure(detail: string): void {
  process.parentPort.postMessage({ type: 'failed', protocolVersion: PROTOCOL_VERSION, detail })
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
