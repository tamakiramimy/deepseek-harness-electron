import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { WorkspaceSummary } from '../shared/contracts.js'

interface DesktopStoreData {
  readonly workspace?: WorkspaceSummary
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

  async setWorkspace(workspace: WorkspaceSummary | undefined): Promise<void> {
    this.data = workspace === undefined ? EMPTY_STORE : { workspace }
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.tmp`
    await writeFile(temporaryPath, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, this.path)
  }
}

function isDesktopStoreData(value: unknown): value is DesktopStoreData {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.workspace === undefined) return true
  const workspace = record.workspace
  return typeof workspace === 'object' && workspace !== null
    && typeof (workspace as Record<string, unknown>).name === 'string'
    && typeof (workspace as Record<string, unknown>).path === 'string'
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
}
