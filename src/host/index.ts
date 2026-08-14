import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, relative, resolve } from 'node:path'

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
    harnessProcess?.kill('SIGTERM')
    return
  }
  if (!isStartMessage(value) || harnessProcess !== undefined) return
  try {
    await startHarness(value.harnessHome, value.runtimeRoot)
  } catch (error) {
    reportFailure(`Official DeepSeek Harness did not become ready: ${errorMessage(error)}`)
  }
}

async function startHarness(harnessHome: string, runtimeRoot: string): Promise<void> {
  await mkdir(harnessHome, { recursive: true, mode: 0o700 })
  const port = await findAvailablePort()
  const url = `http://127.0.0.1:${String(port)}`
  const cliPath = await resolveDshCli(runtimeRoot)
  const child = spawn(process.execPath, [
    '--expose-internals',
    cliPath,
    'web',
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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
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
  const root = resolve(runtimeRoot)
  const manifestPath = join(root, 'runtime-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { format?: unknown; entry?: unknown }
  if (manifest.format !== 1 || typeof manifest.entry !== 'string' || manifest.entry.length === 0) {
    throw new Error('DeepSeek-Harness-Dist has an invalid runtime-manifest.json.')
  }
  const cliPath = resolve(root, manifest.entry)
  const outsideRoot = relative(root, cliPath)
  if (outsideRoot === '' || outsideRoot.startsWith('..') || outsideRoot.includes('../')) {
    throw new Error('DeepSeek-Harness-Dist entry must remain inside its runtime directory.')
  }
  await access(cliPath)
  return cliPath
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

function isStartMessage(value: unknown): value is { readonly type: 'start'; readonly protocolVersion: number; readonly harnessHome: string; readonly runtimeRoot: string } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.type === 'start'
    && record.protocolVersion === PROTOCOL_VERSION
    && typeof record.harnessHome === 'string'
    && typeof record.runtimeRoot === 'string'
}

function isShutdownMessage(value: unknown): value is { readonly type: 'shutdown'; readonly protocolVersion: number } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.type === 'shutdown' && record.protocolVersion === PROTOCOL_VERSION
}
