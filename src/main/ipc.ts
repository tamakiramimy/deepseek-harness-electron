import { BrowserWindow, ipcMain, session } from 'electron'
import type { DesktopApi, DesktopSnapshot, HostStatus, MarketStatus, ProxySettings, WorkspaceSummary } from '../shared/contracts.js'
import { DesktopBroker } from './desktop-broker.js'
import { DesktopStore } from './desktop-store.js'
import { HostSupervisor } from './host-supervisor.js'

const IPC_CHANNELS = {
  chooseWorkspace: 'desktop:choose-workspace',
  clearWorkspace: 'desktop:clear-workspace',
  getSnapshot: 'desktop:get-snapshot',
  getProxySettings: 'desktop:get-proxy-settings',
  setProxySettings: 'desktop:set-proxy-settings',
  installMarket: 'desktop:install-market',
  hostStatus: 'desktop:host-status',
  marketStatus: 'desktop:market-status',
} as const

export function registerDesktopIpc(
  mainWindow: BrowserWindow,
  broker: DesktopBroker,
  store: DesktopStore,
  supervisor: HostSupervisor,
  harnessHome: string,
  runtimeRoot: string,
): void {
  const assertMainWindow = (senderId: number): void => {
    if (senderId !== mainWindow.webContents.id) throw new Error('IPC sender is not the application window.')
  }
  ipcMain.handle(IPC_CHANNELS.getSnapshot, (event): DesktopSnapshot => {
    assertMainWindow(event.sender.id)
    return snapshot(store.workspace(), supervisor.currentStatus(), supervisor.currentMarketStatus(), store.proxy())
  })
  ipcMain.handle(IPC_CHANNELS.chooseWorkspace, async (event): Promise<WorkspaceSummary | undefined> => {
    assertMainWindow(event.sender.id)
    const workspace = await broker.chooseWorkspace(mainWindow)
    if (workspace !== undefined) await store.setWorkspace(workspace)
    return workspace
  })
  ipcMain.handle(IPC_CHANNELS.clearWorkspace, async (event): Promise<void> => {
    assertMainWindow(event.sender.id)
    await store.setWorkspace(undefined)
  })
  // Proxy IPC: read saved proxy settings.
  ipcMain.handle(IPC_CHANNELS.getProxySettings, (event): ProxySettings => {
    assertMainWindow(event.sender.id)
    return store.proxy()
  })
  // Proxy IPC: persist new proxy settings and restart the harness to apply them.
  ipcMain.handle(IPC_CHANNELS.setProxySettings, async (event, proxy: ProxySettings): Promise<void> => {
    assertMainWindow(event.sender.id)
    assertProxySettings(proxy)
    await store.setProxy(proxy)
    await applyElectronProxy(proxy)
    await supervisor.restart(harnessHome, runtimeRoot, proxy)
  })
  ipcMain.handle(IPC_CHANNELS.installMarket, (event): void => {
    assertMainWindow(event.sender.id)
    supervisor.installMarket()
  })
  supervisor.subscribe((status) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(IPC_CHANNELS.hostStatus, status)
  })
  supervisor.subscribeMarket((status) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(IPC_CHANNELS.marketStatus, status)
  })
}

export const desktopIpc = IPC_CHANNELS satisfies Record<keyof Omit<DesktopApi, 'version' | 'onHostStatus' | 'onMarketStatus'>, string> & Record<'hostStatus' | 'marketStatus', string>

function snapshot(workspace: WorkspaceSummary | undefined, host: HostStatus, market: MarketStatus, proxy: ProxySettings): DesktopSnapshot {
  return { apiVersion: 1, host, market, proxy, ...(workspace === undefined ? {} : { workspace }) }
}

export async function applyElectronProxy(proxy: ProxySettings): Promise<void> {
  const httpProxy = proxy.httpProxy.trim()
  const httpsProxy = proxy.httpsProxy.trim() || httpProxy
  if (httpProxy === '' && httpsProxy === '') {
    await session.defaultSession.setProxy({ mode: 'direct' })
  } else {
    const rules = [
      ...(httpProxy === '' ? [] : [`http=${httpProxy}`]),
      ...(httpsProxy === '' ? [] : [`https=${httpsProxy}`]),
    ]
    await session.defaultSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: rules.join(';'),
      proxyBypassRules: proxy.noProxy.trim(),
    })
  }
  await session.defaultSession.closeAllConnections()
}

function assertProxySettings(value: unknown): asserts value is ProxySettings {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid proxy settings.')
  const record = value as Record<string, unknown>
  if (typeof record.httpProxy !== 'string'
    || typeof record.httpsProxy !== 'string'
    || typeof record.noProxy !== 'string') {
    throw new Error('Invalid proxy settings.')
  }
}