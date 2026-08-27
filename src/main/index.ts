import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DESKTOP_API_VERSION } from '../shared/contracts.js'
import { DesktopBroker } from './desktop-broker.js'
import { DesktopStore } from './desktop-store.js'
import { HostSupervisor } from './host-supervisor.js'
import { applyElectronProxy, registerDesktopIpc } from './ipc.js'
import { ensurePackagedRuntime } from './runtime-manager.js'

let mainWindow: BrowserWindow | undefined
const supervisor = new HostSupervisor()

function createWindow(): BrowserWindow {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
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
      preload: join(__dirname, '../preload/index.cjs'),
    },
  })
  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  if (rendererUrl !== undefined) {
    installDevelopmentDiagnostics(window)
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

function installDevelopmentDiagnostics(window: BrowserWindow): void {
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (isMainFrame) console.error(`[renderer] failed to load ${validatedUrl}: ${String(errorCode)} ${errorDescription}`)
  })
  window.webContents.on('console-message', ({ level, message, lineNumber, sourceId }) => {
    if (level === 'error' || level === 'warning') {
      console.error(`[renderer:${level}] ${sourceId}:${String(lineNumber)} ${message}`)
    }
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] process exited: ${details.reason}`)
  })
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
  await applyElectronProxy(store.proxy())
  const harnessHome = join(app.getPath('userData'), 'harness')
  const runtimeRoot = await resolveHarnessRuntimeRoot(app.getPath('userData'))
  mainWindow = createWindow()
  registerDesktopIpc(mainWindow, new DesktopBroker(), store, supervisor, harnessHome, runtimeRoot)
  await supervisor.start(harnessHome, runtimeRoot, store.proxy())
  void DESKTOP_API_VERSION
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => supervisor.stop())

async function resolveHarnessRuntimeRoot(userDataDirectory: string): Promise<string> {
  if (app.isPackaged) {
    return ensurePackagedRuntime(join(process.resourcesPath, 'harness-runtime'), userDataDirectory)
  }
  const configured = process.env.DEEPSEEK_HARNESS_DIST
  const candidates = [
    configured === undefined ? undefined : resolve(configured),
    join(app.getPath('userData'), 'DeepSeek-Harness-Dist'),
    join(app.getAppPath(), 'DeepSeek-Harness-Dist'),
  ]
  return candidates.find((candidate): candidate is string => candidate !== undefined && existsSync(candidate))
    ?? candidates.find((candidate): candidate is string => candidate !== undefined)
    ?? join(app.getAppPath(), 'DeepSeek-Harness-Dist')
}
