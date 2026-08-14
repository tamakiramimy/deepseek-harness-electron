export const DESKTOP_API_VERSION = 1

export type HostState = 'starting' | 'ready' | 'stopped' | 'failed'

export interface HostStatus {
  readonly state: HostState
  readonly detail: string
  readonly startedAt?: number
}

export interface WorkspaceSummary {
  readonly name: string
  readonly path: string
}

export interface DesktopSnapshot {
  readonly apiVersion: typeof DESKTOP_API_VERSION
  readonly host: HostStatus
  readonly workspace?: WorkspaceSummary
}

export interface DesktopApi {
  readonly version: typeof DESKTOP_API_VERSION
  getSnapshot(): Promise<DesktopSnapshot>
  chooseWorkspace(): Promise<WorkspaceSummary | undefined>
  clearWorkspace(): Promise<void>
  onHostStatus(listener: (status: HostStatus) => void): () => void
}
