import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { DESKTOP_API_VERSION } from '../shared/contracts.js'
import { DesktopBroker } from './desktop-broker.js'
import { DesktopStore } from './desktop-store.js'
import { HostSupervisor } from './host-supervisor.js'
import { registerDesktopIpc } from './ipc.js'

let mainWindow: BrowserWindow | undefined
const supervisor = new HostSupervisor()

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#111b22',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.js'),
    },
  })
  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL !== undefined) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

app.whenReady().then(async () => {
  app.setName('DeepSeek Harness Desktop')
  const singleInstance = app.requestSingleInstanceLock()
  if (!singleInstance) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
  const store = new DesktopStore(app.getPath('userData'))
  await store.load()
  mainWindow = createWindow()
  registerDesktopIpc(mainWindow, new DesktopBroker(), store, supervisor)
  await supervisor.start(join(app.getPath('userData'), 'harness'))
  void DESKTOP_API_VERSION
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => supervisor.stop())
