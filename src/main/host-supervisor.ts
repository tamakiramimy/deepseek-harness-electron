import { utilityProcess, type UtilityProcess } from 'electron'
import { fileURLToPath } from 'node:url'
import type { HostStatus } from '../shared/contracts.js'

const HOST_PROTOCOL_VERSION = 1

export class HostSupervisor {
  private process: UtilityProcess | undefined
  private stopping = false
  private status: HostStatus = { state: 'stopped', detail: 'Desktop Host has not started.' }
  private readonly listeners = new Set<(status: HostStatus) => void>()

  currentStatus(): HostStatus {
    return this.status
  }

  subscribe(listener: (status: HostStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(harnessHome: string, runtimeRoot: string): Promise<void> {
    if (this.process !== undefined) return
    this.stopping = false
    this.publish({ state: 'starting', detail: 'Starting isolated Desktop Host.' })
    const entry = fileURLToPath(new URL('./host.js', import.meta.url))
    const child = utilityProcess.fork(entry, [], {
      env: { ...process.env, DSH_HOME: harnessHome },
      serviceName: 'DeepSeek Harness Desktop Host',
      stdio: 'pipe',
    })
    this.process = child
    child.on('message', (message: unknown) => this.handleMessage(message))
    child.on('exit', (code) => {
      this.process = undefined
      this.publish({
        state: this.stopping || code === 0 ? 'stopped' : 'failed',
        detail: this.stopping || code === 0 ? 'Desktop Host stopped.' : `Desktop Host exited with code ${String(code)}.`,
      })
    })
    child.on('error', (type) => {
      this.publish({ state: 'failed', detail: `Desktop Host error: ${type}.` })
    })
    child.postMessage({ type: 'start', protocolVersion: HOST_PROTOCOL_VERSION, harnessHome, runtimeRoot })
  }

  stop(): void {
    this.stopping = true
    const child = this.process
    if (child === undefined) return
    child.postMessage({ type: 'shutdown', protocolVersion: HOST_PROTOCOL_VERSION })
    const timeout = setTimeout(() => child.kill(), 2_000)
    timeout.unref()
  }

  private handleMessage(message: unknown): void {
    if (isHostFailureMessage(message)) {
      this.publish({ state: 'failed', detail: message.detail })
      return
    }
    if (!isHostReadyMessage(message)) return
    if (message.protocolVersion !== HOST_PROTOCOL_VERSION || !isLoopbackHarnessUrl(message.url)) {
      this.publish({ state: 'failed', detail: 'Desktop Host protocol version mismatch.' })
      this.stop()
      return
    }
    this.publish({ state: 'ready', detail: message.detail, startedAt: message.startedAt, url: message.url })
  }

  private publish(status: HostStatus): void {
    this.status = status
    for (const listener of this.listeners) listener(status)
  }
}

interface HostReadyMessage {
  readonly type: 'ready'
  readonly protocolVersion: number
  readonly detail: string
  readonly startedAt: number
  readonly url: string
}

interface HostFailureMessage {
  readonly type: 'failed'
  readonly protocolVersion: number
  readonly detail: string
}

function isHostReadyMessage(value: unknown): value is HostReadyMessage {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.type === 'ready'
    && typeof record.protocolVersion === 'number'
    && typeof record.detail === 'string'
    && typeof record.startedAt === 'number'
    && typeof record.url === 'string'
}

function isHostFailureMessage(value: unknown): value is HostFailureMessage {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.type === 'failed'
    && typeof record.protocolVersion === 'number'
    && typeof record.detail === 'string'
}

function isLoopbackHarnessUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port !== ''
  } catch {
    return false
  }
}
