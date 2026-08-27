import { contextBridge, ipcRenderer } from 'electron'
import { DESKTOP_API_VERSION, type DesktopApi, type HostStatus, type MarketStatus, type ProxySettings } from '../shared/contracts.js'
import { desktopIpc } from '../main/ipc.js'

const desktopApi: DesktopApi = Object.freeze({
  version: DESKTOP_API_VERSION,
  getSnapshot: () => ipcRenderer.invoke(desktopIpc.getSnapshot),
  chooseWorkspace: () => ipcRenderer.invoke(desktopIpc.chooseWorkspace),
  clearWorkspace: () => ipcRenderer.invoke(desktopIpc.clearWorkspace),
  // Proxy settings: read and persist via IPC to the main process.
  getProxySettings: () => ipcRenderer.invoke(desktopIpc.getProxySettings),
  setProxySettings: (proxy: ProxySettings) => ipcRenderer.invoke(desktopIpc.setProxySettings, proxy),
  installMarket: () => ipcRenderer.invoke(desktopIpc.installMarket),
  onHostStatus: (listener: (status: HostStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: HostStatus): void => listener(status)
    ipcRenderer.on(desktopIpc.hostStatus, handler)
    return () => ipcRenderer.removeListener(desktopIpc.hostStatus, handler)
  },
  onMarketStatus: (listener: (status: MarketStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: MarketStatus): void => listener(status)
    ipcRenderer.on(desktopIpc.marketStatus, handler)
    return () => ipcRenderer.removeListener(desktopIpc.marketStatus, handler)
  },
})

contextBridge.exposeInMainWorld('deepseekDesktop', desktopApi)
