import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { EMPTY_PROXY, type ProxySettings, type WorkspaceSummary } from '../shared/contracts.js'

interface DesktopStoreData {
  readonly workspace?: WorkspaceSummary
  readonly proxy?: ProxySettings
}

const EMPTY_STORE: DesktopStoreData = {}

export class DesktopStore {
  private readonly path: string
  private data: DesktopStoreData = EMPTY_STORE

  constructor(userDataDirectory: string) {
    this.path = join(userDataDirectory, 'desktop-state.json')
  }

  async load(): Promise<void> {
    try {
      const text = await readFile(this.path, 'utf8')
      const candidate = JSON.parse(text) as unknown
      this.data = isDesktopStoreData(candidate) ? candidate : EMPTY_STORE
    } catch (error: unknown) {
      if (isMissingFile(error)) return
      throw error
    }
  }

  workspace(): WorkspaceSummary | undefined {
    return this.data.workspace
  }

  /** Returns saved proxy settings, or EMPTY_PROXY if never configured. */
  proxy(): ProxySettings {
    return this.data.proxy ?? EMPTY_PROXY
  }

  async setWorkspace(workspace: WorkspaceSummary | undefined): Promise<void> {
    // When clearing workspace, preserve proxy settings if they exist.
    const next: DesktopStoreData = workspace === undefined
      ? (this.data.proxy === undefined ? EMPTY_STORE : { proxy: this.data.proxy })
      : { ...this.data, workspace }
    await this.persist(next)
  }

  /** Persist proxy settings and trigger a harness restart so they take effect. */
  async setProxy(proxy: ProxySettings): Promise<void> {
    await this.persist({ ...this.data, proxy })
  }

  private async persist(next: DesktopStoreData): Promise<void> {
    this.data = next
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.tmp`
    await writeFile(temporaryPath, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, this.path)
  }
}

function isDesktopStoreData(value: unknown): value is DesktopStoreData {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.workspace !== undefined && !isWorkspaceSummary(record.workspace)) return false
  if (record.proxy !== undefined && !isProxySettings(record.proxy)) return false
  return true
}

function isWorkspaceSummary(value: unknown): value is WorkspaceSummary {
  return typeof value === 'object' && value !== null
    && typeof (value as Record<string, unknown>).name === 'string'
    && typeof (value as Record<string, unknown>).path === 'string'
}

function isProxySettings(value: unknown): value is ProxySettings {
  return typeof value === 'object' && value !== null
    && typeof (value as Record<string, unknown>).httpProxy === 'string'
    && typeof (value as Record<string, unknown>).httpsProxy === 'string'
    && typeof (value as Record<string, unknown>).noProxy === 'string'
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
}