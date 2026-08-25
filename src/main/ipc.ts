import { BrowserWindow, ipcMain } from 'electron'
import type { DesktopApi, DesktopSnapshot, HostStatus, ProxySettings, WorkspaceSummary } from '../shared/contracts.js'
import { DesktopBroker } from './desktop-broker.js'
import { DesktopStore } from './desktop-store.js'
import { HostSupervisor } from './host-supervisor.js'

const IPC_CHANNELS = {
  chooseWorkspace: 'desktop:choose-workspace',
  clearWorkspace: 'desktop:clear-workspace',
  getSnapshot: 'desktop:get-snapshot',
  getProxySettings: 'desktop:get-proxy-settings',
  setProxySettings: 'desktop:set-proxy-settings',
  hostStatus: 'desktop:host-status',
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
    return snapshot(store.workspace(), supervisor.currentStatus(), store.proxy())
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
    await supervisor.restart(harnessHome, runtimeRoot, proxy)
  })
  supervisor.subscribe((status) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(IPC_CHANNELS.hostStatus, status)
  })
}

export const desktopIpc = IPC_CHANNELS satisfies Record<keyof Omit<DesktopApi, 'version' | 'onHostStatus'>, string> & Record<'hostStatus', string>

function snapshot(workspace: WorkspaceSummary | undefined, host: HostStatus, proxy: ProxySettings): DesktopSnapshot {
  return { apiVersion: 1, host, proxy, ...(workspace === undefined ? {} : { workspace }) }
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