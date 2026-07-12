const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const { LmuBridgeManager } = require('./lmu-bridge.cjs')
const { inspectTelemetryDatabase } = require('./telemetry-import.cjs')
const { safeInstallSetup } = require('./setup-manager.cjs')

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)
let bridgeManager
let overlayWindow
let mainWindow
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

function createWindow() {
  const window = new BrowserWindow({
    width: 1512,
    height: 982,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#0b0c0d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  mainWindow = window
  window.on('closed', () => { if (mainWindow === window) mainWindow = null })

  if (isDevelopment) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) { overlayWindow.show(); overlayWindow.focus(); return overlayWindow }
  overlayWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  if (isDevelopment) overlayWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/?overlay=1`)
  else overlayWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { overlay: '1' } })
  overlayWindow.on('closed', () => { overlayWindow = null })
  return overlayWindow
}

ipcMain.handle('apex:get-environment', async () => {
  let bridgeAvailable = false
  if (process.platform === 'win32' && bridgeManager) {
    try {
      await fs.access(bridgeManager.getBinaryPath())
      bridgeAvailable = true
    } catch {
      bridgeAvailable = false
    }
  }
  return {
    platform: process.platform,
    version: app.getVersion(),
    userDataPath: app.getPath('userData'),
    bridgeAvailable,
    defaultLmuPath: process.platform === 'win32'
      ? 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate'
      : '',
  }
})

ipcMain.handle('apex:choose-directory', async (_event, title) => {
  const result = await dialog.showOpenDialog({ title, properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('apex:choose-file', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog({
    title: options.title || 'Choose telemetry file',
    properties: ['openFile'],
    filters: options.filters || [],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('apex:path-exists', async (_event, candidatePath) => {
  try {
    await fs.access(candidatePath)
    return true
  } catch {
    return false
  }
})
ipcMain.handle('apex:open-data-folder', () => shell.openPath(app.getPath('userData')))

ipcMain.handle('apex:start-telemetry', () => bridgeManager.start())
ipcMain.handle('apex:stop-telemetry', () => bridgeManager.stop())
ipcMain.handle('apex:run-telemetry-self-test', () => bridgeManager.runSelfTest())
ipcMain.handle('apex:inspect-telemetry', (_event, filePath) => inspectTelemetryDatabase(filePath))
ipcMain.handle('apex:install-setup', (_event, input) => safeInstallSetup({ ...input, backupRoot: app.getPath('userData') }))
ipcMain.handle('apex:open-overlay', () => { createOverlayWindow(); return { ok: true } })

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return
  bridgeManager = new LmuBridgeManager({
    app,
    broadcast: (message) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('apex:telemetry-message', message)
    },
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  bridgeManager?.stop()
  if (process.platform !== 'darwin') app.quit()
})
