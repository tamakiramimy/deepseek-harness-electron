import { app, utilityProcess, type UtilityProcess } from 'electron'
import { fileURLToPath } from 'node:url'
import type { HostStatus } from '../shared/contracts.js'

const HOST_PROTOCOL_VERSION = 1

export class HostSupervisor {
  private process: UtilityProcess | undefined
  private status: HostStatus = { state: 'stopped', detail: 'Desktop Host has not started.' }
  private readonly listeners = new Set<(status: HostStatus) => void>()

  currentStatus(): HostStatus {
    return this.status
  }

  subscribe(listener: (status: HostStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(harnessHome: string): Promise<void> {
    if (this.process !== undefined) return
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
        state: code === 0 ? 'stopped' : 'failed',
        detail: code === 0 ? 'Desktop Host stopped.' : `Desktop Host exited with code ${String(code)}.`,
      })
    })
    child.on('error', (type) => {
      this.publish({ state: 'failed', detail: `Desktop Host error: ${type}.` })
    })
    child.postMessage({ type: 'hello', protocolVersion: HOST_PROTOCOL_VERSION })
  }

  stop(): void {
    this.process?.kill()
  }

  private handleMessage(message: unknown): void {
    if (!isHostReadyMessage(message)) return
    if (message.protocolVersion !== HOST_PROTOCOL_VERSION) {
      this.publish({ state: 'failed', detail: 'Desktop Host protocol version mismatch.' })
      this.stop()
      return
    }
    this.publish({ state: 'ready', detail: message.detail, startedAt: message.startedAt })
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
}

function isHostReadyMessage(value: unknown): value is HostReadyMessage {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.type === 'ready'
    && typeof record.protocolVersion === 'number'
    && typeof record.detail === 'string'
    && typeof record.startedAt === 'number'
}
