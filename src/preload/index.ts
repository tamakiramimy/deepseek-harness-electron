import { contextBridge, ipcRenderer } from 'electron'
import { DESKTOP_API_VERSION, type DesktopApi, type HostStatus } from '../shared/contracts.js'
import { desktopIpc } from '../main/ipc.js'

const desktopApi: DesktopApi = Object.freeze({
  version: DESKTOP_API_VERSION,
  getSnapshot: () => ipcRenderer.invoke(desktopIpc.getSnapshot),
  chooseWorkspace: () => ipcRenderer.invoke(desktopIpc.chooseWorkspace),
  clearWorkspace: () => ipcRenderer.invoke(desktopIpc.clearWorkspace),
  onHostStatus: (listener: (status: HostStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: HostStatus): void => listener(status)
    ipcRenderer.on(desktopIpc.hostStatus, handler)
    return () => ipcRenderer.removeListener(desktopIpc.hostStatus, handler)
  },
})

contextBridge.exposeInMainWorld('deepseekDesktop', desktopApi)
