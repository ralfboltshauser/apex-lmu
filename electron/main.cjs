const { app, BrowserWindow, clipboard, dialog, ipcMain, screen, session, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const { LmuBridgeManager } = require('./lmu-bridge.cjs')
const { inspectTelemetryDatabase } = require('./telemetry-import.cjs')
const { safeInstallSetup } = require('./setup-manager.cjs')
const { DiagnosticsService, serializeError } = require('./diagnostics.cjs')
const { discoverLmu, inspectLmuPath } = require('./lmu-discovery.cjs')
const { UpdateManager } = require('./updater.cjs')
const { buildSupportMailto } = require('./support-mail.cjs')
const { OverlayManager } = require('./overlay-manager.cjs')
const { WhatsNewService } = require('./whats-new.cjs')
const { readE2EConfig } = require('./e2e-config.cjs')
const { StatsDatabase } = require('./stats-database.cjs')

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL)
const e2eConfig = readE2EConfig()
if (e2eConfig) app.setPath('userData', e2eConfig.userDataPath)
let bridgeManager
let overlayManager
let mainWindow
let diagnostics
let updateManager
let whatsNewService
let statsDatabase
let statsError = null
const selfTestWaiters = new Map()
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
  window.on('closed', () => {
    if (mainWindow !== window) return
    mainWindow = null
    void overlayManager?.close()
  })
  window.webContents.on('render-process-gone', (_event, details) => void diagnostics?.record('error', 'renderer', 'process-gone', 'Renderer process stopped.', details))
  window.webContents.on('did-fail-load', (_event, code, description, url) => void diagnostics?.record('error', 'renderer', 'load-failed', description, { code, url }))

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
ipcMain.handle('apex:discover-lmu', async () => {
  const result = await discoverLmu()
  await diagnostics.record(result.found ? 'info' : 'warning', 'discovery', result.found ? 'lmu-found' : 'lmu-not-found', result.found ? 'LMU installation discovered.' : 'LMU installation was not discovered automatically.', result)
  return result
})
ipcMain.handle('apex:inspect-lmu-path', async (_event, candidatePath) => {
  const result = await inspectLmuPath(candidatePath)
  await diagnostics.record(result.status === 'found' ? 'info' : 'warning', 'discovery', 'manual-path-inspected', `Manual LMU path inspection: ${result.status}.`, result)
  return result
})
ipcMain.handle('apex:open-data-folder', () => shell.openPath(app.getPath('userData')))
ipcMain.handle('apex:get-diagnostics', () => diagnostics.getReport({ bridgePath: bridgeManager?.getBinaryPath() }))
ipcMain.handle('apex:run-diagnostics', async () => {
  const result = bridgeManager.runSelfTest()
  await diagnostics.record(result.ok ? 'info' : 'error', 'diagnostics', 'self-test-requested', result.ok ? 'Bridge self-test started.' : 'Bridge self-test could not start.', result)
  let completed = result
  if (result.ok) completed = await new Promise((resolve) => {
    const timer = setTimeout(() => { selfTestWaiters.delete(result.runId); resolve({ ok: false, reason: 'Self-test timed out after 8 seconds.' }) }, 8000)
    selfTestWaiters.set(result.runId, (message) => { clearTimeout(timer); selfTestWaiters.delete(result.runId); resolve(message.state === 'self-test-complete' ? { ok: true } : { ok: false, reason: message.message || message.state }) })
  })
  return diagnostics.getReport({ bridgePath: bridgeManager.getBinaryPath(), selfTest: completed })
})
ipcMain.handle('apex:open-logs-folder', () => shell.openPath(diagnostics.dir))
ipcMain.handle('apex:get-update-state', () => updateManager?.getState())
ipcMain.handle('apex:get-whats-new-state', () => whatsNewService.getState())
ipcMain.handle('apex:acknowledge-whats-new', (_event, version) => whatsNewService.acknowledge(version))
ipcMain.handle('apex:get-lifetime-stats', () => statsDatabase ? statsDatabase.getStats() : { status: 'error', message: statsError || 'Lifetime database is unavailable.', totalDistanceMm: 0, trackedSince: null, vehicles: [] })
ipcMain.handle('apex:get-lifetime-stats-health', () => statsDatabase ? statsDatabase.getHealth() : { status: 'error', message: statsError || 'Lifetime database is unavailable.' })
ipcMain.handle('apex:backup-lifetime-stats', () => statsDatabase ? statsDatabase.createBackup().then((backup) => ({ ok: true, backup })).catch((error) => ({ ok: false, reason: error.message })) : { ok: false, reason: statsError || 'unavailable' })
ipcMain.handle('apex:check-for-updates', () => updateManager?.check(false))
ipcMain.handle('apex:download-update', () => updateManager?.download())
ipcMain.handle('apex:install-update', () => updateManager?.install())
ipcMain.handle('apex:open-releases', () => shell.openExternal('https://github.com/ralfboltshauser/apex-lmu/releases'))
ipcMain.handle('apex:report-renderer-error', (_event, input = {}) => diagnostics.record('error', 'renderer', 'reported-error', String(input.message || 'Renderer error'), { stack: String(input.stack || ''), context: String(input.context || '') }).then(() => ({ ok: true })))
async function getSupportText() {
  const report = await diagnostics.getReport({ bridgePath: bridgeManager?.getBinaryPath() })
  return diagnostics.buildSupportText({ report })
}
ipcMain.handle('apex:copy-support-bundle', async () => {
  const text = await getSupportText()
  clipboard.writeText(text)
  await diagnostics.record('info', 'support', 'bundle-copied', 'Redacted support bundle copied to the clipboard.', { characters: text.length })
  return { ok: true, characters: text.length }
})
ipcMain.handle('apex:email-support-bundle', async () => {
  const text = await getSupportText()
  clipboard.writeText(text)
  const draft = buildSupportMailto({ bundleText: text, version: app.getVersion(), platform: process.platform })
  await shell.openExternal(draft.url)
  await diagnostics.record('info', 'support', 'email-draft-opened', 'Support email draft opened; redacted bundle copied to the clipboard.', { characters: text.length, includedInBody: draft.includedInBody })
  return { ok: true, copied: true, includedInBody: draft.includedInBody, characters: text.length }
})
ipcMain.handle('apex:export-support-bundle', async () => {
  const text = await getSupportText()
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const result = await dialog.showSaveDialog({ title: 'Save Apex debug file', defaultPath: `apex-debug-${stamp}.txt`, filters: [{ name: 'Text debug file', extensions: ['txt'] }] })
  if (result.canceled || !result.filePath) return { ok: false, canceled: true }
  await fs.writeFile(result.filePath, text, 'utf8')
  await diagnostics.record('info', 'support', 'bundle-exported', 'Redacted debug file saved.', { path: result.filePath })
  return { ok: true, path: result.filePath }
})

ipcMain.handle('apex:start-telemetry', () => bridgeManager.start())
ipcMain.handle('apex:stop-telemetry', () => bridgeManager.stop())
ipcMain.handle('apex:run-telemetry-self-test', () => bridgeManager.runSelfTest())
ipcMain.handle('apex:get-recording-state', () => bridgeManager.getRecordingState())
ipcMain.handle('apex:start-recording', async () => {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const selected = await dialog.showSaveDialog({ title: 'Record an LMU session', defaultPath: `apex-lmu-session-${stamp}.apexrec`, filters: [{ name: 'Apex LMU recording', extensions: ['apexrec'] }] })
  if (selected.canceled || !selected.filePath) return { ok: false, canceled: true }
  const filePath = selected.filePath.toLowerCase().endsWith('.apexrec') ? selected.filePath : `${selected.filePath}.apexrec`
  await fs.rm(filePath, { force: true })
  const result = bridgeManager.startRecording(filePath, app.getVersion())
  await diagnostics.record(result.ok ? 'info' : 'error', 'recording', result.ok ? 'started' : 'start-failed', result.ok ? 'Raw LMU session recording started.' : 'Raw LMU session recording could not start.', { path: filePath, reason: result.reason })
  return result
})
ipcMain.handle('apex:stop-recording', () => bridgeManager.stopRecording())
ipcMain.handle('apex:start-replay', async () => {
  const selected = await dialog.showOpenDialog({ title: 'Replay an Apex LMU recording', properties: ['openFile'], filters: [{ name: 'Apex LMU recording', extensions: ['apexrec'] }] })
  if (selected.canceled || !selected.filePaths[0]) return { ok: false, canceled: true }
  return bridgeManager.startReplay(selected.filePaths[0])
})
ipcMain.handle('apex:start-e2e-replay', () => e2eConfig ? bridgeManager.startReplay(e2eConfig.replayPath, e2eConfig) : { ok: false, reason: 'e2e-disabled' })
ipcMain.handle('apex:stop-replay', () => bridgeManager.stopReplay())
ipcMain.handle('apex:inspect-telemetry', (_event, filePath) => inspectTelemetryDatabase(filePath))
ipcMain.handle('apex:install-setup', (_event, input) => safeInstallSetup({ ...input, backupRoot: app.getPath('userData') }))
ipcMain.handle('apex:get-displays', () => overlayManager.getDisplays())
ipcMain.handle('apex:get-overlay-state', () => overlayManager.getState())
ipcMain.handle('apex:get-overlay-config', () => overlayManager.getConfig())
ipcMain.handle('apex:set-overlay-config', (_event, patch) => overlayManager.setConfig(patch))
ipcMain.handle('apex:open-overlay', () => overlayManager.open())
ipcMain.handle('apex:close-overlay', () => overlayManager.close())
ipcMain.handle('apex:overlay-renderer-ready', (event) => overlayManager.markRendererReady(event.sender.id))

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return
  diagnostics = new DiagnosticsService({ app })
  whatsNewService = new WhatsNewService({ userDataPath: app.getPath('userData'), currentVersion: app.getVersion(), logger: diagnostics })
  try { statsDatabase = await StatsDatabase.open({ userDataPath: app.getPath('userData'), appVersion: app.getVersion(), logger: diagnostics }) }
  catch (error) { statsError = error.message; void diagnostics.record('error', 'lifetime-stats', 'open-failed', 'Lifetime statistics database was preserved but could not be opened.', { error: error.message }) }
  void diagnostics.record('info', 'app', 'started', 'Apex started.', { version: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged })
  bridgeManager = new LmuBridgeManager({
    app,
    logger: diagnostics,
    broadcast: (message) => {
      try { statsDatabase?.ingest(message) } catch (error) { void diagnostics.record('error', 'lifetime-stats', 'ingest-failed', 'A lifetime distance chunk could not be committed.', { error: error.message }) }
      if (message.runId && (message.state === 'self-test-complete' || message.state === 'error')) selfTestWaiters.get(message.runId)?.(message)
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('apex:telemetry-message', message)
    },
    broadcastRecording: (state) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('apex:recording-state', state)
    },
  })
  updateManager = new UpdateManager({
    app,
    logger: diagnostics,
    broadcast: (state) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('apex:update-state', state)
    },
    beforeInstall: async () => { statsDatabase?.close({ requireDurable: true }) },
  })
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  overlayManager = new OverlayManager({
    app,
    BrowserWindow,
    screen,
    fs,
    diagnostics,
    developmentUrl: isDevelopment ? process.env.VITE_DEV_SERVER_URL : '',
    preloadPath: path.join(__dirname, 'preload.cjs'),
    rendererPath: path.join(__dirname, '..', 'dist', 'index.html'),
    broadcast: (channel, payload) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
    },
  })
  await overlayManager.initialize()
  createWindow()
  if (!e2eConfig) updateManager.start()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

process.on('uncaughtException', (error) => void diagnostics?.record('fatal', 'main', 'uncaught-exception', error.message, serializeError(error)))
process.on('unhandledRejection', (reason) => void diagnostics?.record('error', 'main', 'unhandled-rejection', reason instanceof Error ? reason.message : String(reason), serializeError(reason)))

app.on('window-all-closed', () => {
  bridgeManager?.stop()
  void overlayManager?.shutdown()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  try { statsDatabase?.close() }
  catch (error) { void diagnostics?.record('error', 'lifetime-stats', 'close-failed', 'Lifetime database close failed during app shutdown.', { error: error.message }) }
  void overlayManager?.shutdown()
})
