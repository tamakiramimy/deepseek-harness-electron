export const DESKTOP_API_VERSION = 1

export type HostState = 'starting' | 'ready' | 'stopped' | 'failed'

export interface HostStatus {
  readonly state: HostState
  readonly detail: string
  readonly startedAt?: number
  /** Loopback URL of the running official Harness Web UI. */
  readonly url?: string
}

export type MarketState = 'not-installed' | 'installing' | 'installed' | 'failed'

export interface MarketStatus {
  readonly state: MarketState
  readonly detail: string
}

export const EMPTY_MARKET_STATUS: MarketStatus = {
  state: 'not-installed',
  detail: 'Plugin market is optional and not installed.',
}

export interface WorkspaceSummary {
  readonly name: string
  readonly path: string
}

/**
 * Outbound proxy configuration for the harness runtime.
 * Translates to HTTP_PROXY / HTTPS_PROXY / NO_PROXY environment variables
 * when spawning the harness child process. Empty strings mean "not set".
 */
export interface ProxySettings {
  readonly httpProxy: string
  readonly httpsProxy: string
  readonly noProxy: string
}

export const EMPTY_PROXY: ProxySettings = {
  httpProxy: '',
  httpsProxy: '',
  noProxy: '',
}

export interface DesktopSnapshot {
  readonly apiVersion: typeof DESKTOP_API_VERSION
  readonly host: HostStatus
  readonly market: MarketStatus
  readonly workspace?: WorkspaceSummary
  readonly proxy: ProxySettings
}

export interface DesktopApi {
  readonly version: typeof DESKTOP_API_VERSION
  getSnapshot(): Promise<DesktopSnapshot>
  chooseWorkspace(): Promise<WorkspaceSummary | undefined>
  clearWorkspace(): Promise<void>
  getProxySettings(): Promise<ProxySettings>
  setProxySettings(proxy: ProxySettings): Promise<void>
  installMarket(): Promise<void>
  onHostStatus(listener: (status: HostStatus) => void): () => void
  onMarketStatus(listener: (status: MarketStatus) => void): () => void
}
