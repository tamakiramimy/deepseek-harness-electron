import { BrowserWindow, ipcMain } from 'electron'
import type { DesktopApi, DesktopSnapshot, HostStatus, WorkspaceSummary } from '../shared/contracts.js'
import { DesktopBroker } from './desktop-broker.js'
import { DesktopStore } from './desktop-store.js'
import { HostSupervisor } from './host-supervisor.js'

const IPC_CHANNELS = {
  chooseWorkspace: 'desktop:choose-workspace',
  clearWorkspace: 'desktop:clear-workspace',
  getSnapshot: 'desktop:get-snapshot',
  hostStatus: 'desktop:host-status',
} as const

export function registerDesktopIpc(
  mainWindow: BrowserWindow,
  broker: DesktopBroker,
  store: DesktopStore,
  supervisor: HostSupervisor,
): void {
  const assertMainWindow = (senderId: number): void => {
    if (senderId !== mainWindow.webContents.id) throw new Error('IPC sender is not the application window.')
  }
  ipcMain.handle(IPC_CHANNELS.getSnapshot, (event): DesktopSnapshot => {
    assertMainWindow(event.sender.id)
    return snapshot(store.workspace(), supervisor.currentStatus())
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
  supervisor.subscribe((status) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(IPC_CHANNELS.hostStatus, status)
  })
}

export const desktopIpc = IPC_CHANNELS satisfies Record<keyof Omit<DesktopApi, 'version' | 'onHostStatus'>, string> & Record<'hostStatus', string>

function snapshot(workspace: WorkspaceSummary | undefined, host: HostStatus): DesktopSnapshot {
  return { apiVersion: 1, host, ...(workspace === undefined ? {} : { workspace }) }
}
