const { app, BrowserWindow, clipboard, dialog, ipcMain, Notification, safeStorage, screen, session, shell } = require('electron')
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
const { LiveSessionStore } = require('./live-session-store.cjs')
const { FeedbackService } = require('./feedback-service.cjs')
const { TelemetryDatabase } = require('./telemetry-database.cjs')
const { RecordingImportService } = require('./recording-import-service.cjs')
const { buildDriverReview } = require('./driver-review.cjs')
const { getDriverReview } = require('./driver-review-service.cjs')

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
let liveSessionStore
let feedbackService
let pendingFeedbackThreadId = null
let telemetryDatabase
let telemetryDatabaseError = null
let analysisImportService
let quitFlushStarted = false
let quitFlushComplete = false
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
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || !input.shift || String(input.key).toLowerCase() !== 'f') return
    event.preventDefault()
    window.webContents.send('apex:feedback-shortcut')
  })

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
ipcMain.handle('apex:get-garage-stats', () => statsDatabase ? statsDatabase.getGarageStats() : { status: 'error', message: statsError || 'Lifetime database is unavailable.', schemaVersion: 1, catalogVersion: 1, trackedSince: null, totalDistanceMm: 0, totalDrives: 0, omittedModels: 0, models: [] })
ipcMain.handle('apex:get-lifetime-stats-health', () => statsDatabase ? statsDatabase.getHealth() : { status: 'error', message: statsError || 'Lifetime database is unavailable.' })
ipcMain.handle('apex:backup-lifetime-stats', () => statsDatabase ? statsDatabase.createBackup().then((backup) => ({ ok: true, backup })).catch((error) => ({ ok: false, reason: error.message })) : { ok: false, reason: statsError || 'unavailable' })
ipcMain.handle('apex:get-analysis-sessions', () => {
  const sessions = new Map((telemetryDatabase?.listSessions() ?? []).map((entry) => [entry.id, entry]))
  for (const entry of liveSessionStore?.listSessions() ?? []) sessions.set(entry.id, entry)
  return [...sessions.values()].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
})
ipcMain.handle('apex:get-analysis-lap', async (_event, sessionId, lapId) => {
  if (typeof sessionId !== 'string' || typeof lapId !== 'string' || !/^[a-z0-9-]{1,96}$/i.test(sessionId) || !/^[a-z0-9-]{1,96}$/i.test(lapId)) return null
  await telemetryDatabase?.flush()
  return telemetryDatabase?.getLap(sessionId, lapId) ?? liveSessionStore?.getLap(sessionId, lapId) ?? null
})
ipcMain.handle('apex:get-driver-review', async (_event, sessionId, selectedLapId) => {
  try {
    return await getDriverReview({ telemetryDatabase, liveSessionStore, buildDriverReview, sessionId, selectedLapId })
  } catch (error) {
    void diagnostics?.record('error', 'driver-review', 'build-failed', 'A driver review was withheld because its measured evidence could not be validated.', { error: error instanceof Error ? error.message : String(error) })
    return null
  }
})
ipcMain.handle('apex:get-analysis-health', () => ({ ...(liveSessionStore?.getHealth() ?? { schemaVersion: 1, qualityPolicyVersion: 'lap-quality-v2', revision: 0, memoryBudgetBytes: 64 * 1024 * 1024, telemetryFrames: 0, statuses: 0, sessions: 0, completedLaps: 0, incompleteLaps: 0, evictedLapPayloads: 0 }), storage: telemetryDatabase?.getHealth() ?? { status: 'error', message: telemetryDatabaseError || 'unavailable' } }))
ipcMain.handle('apex:get-analysis-import-state', () => analysisImportService?.getState() ?? { schemaVersion: 1, status: 'error', fileName: null, bytesProcessed: 0, bytesTotal: 0, frames: 0, sessions: 0, laps: 0, importedSessions: 0, importedLaps: 0, duplicate: false, sessionIds: [], reason: 'storage-unavailable' })
ipcMain.handle('apex:get-feedback-state', () => feedbackService?.getState() ?? { status: 'ready', pending: 0, unread: 0, needsAnswer: 0, items: [] })
ipcMain.handle('apex:list-feedback', () => feedbackService?.list() ?? [])
ipcMain.handle('apex:get-feedback', (_event, feedbackId) => typeof feedbackId === 'string' && feedbackId.length <= 96 ? feedbackService?.load(feedbackId) ?? null : null)
ipcMain.handle('apex:get-feedback-attachment', (_event, feedbackId, attachmentId) => {
  if (typeof feedbackId !== 'string' || feedbackId.length > 96 || typeof attachmentId !== 'string' || attachmentId.length > 96) throw new Error('Feedback screenshot ID is invalid')
  return feedbackService.attachment(feedbackId, attachmentId)
})
ipcMain.handle('apex:consume-feedback-thread', () => { const feedbackId = pendingFeedbackThreadId; pendingFeedbackThreadId = null; return feedbackId })
ipcMain.handle('apex:submit-feedback', async (_event, input = {}) => {
  if (!feedbackService || !mainWindow || mainWindow.isDestroyed()) throw new Error('Feedback service is unavailable')
  const display = screen.getDisplayMatching(mainWindow.getBounds())
  const context = {
    ...input.context,
    appVersion: app.getVersion(),
    platform: process.platform,
    screen: { width: display.size.width, height: display.size.height, scaleFactor: display.scaleFactor },
    redactionVersion: 1,
  }
  return feedbackService.submit({ ...input, context })
})
ipcMain.handle('apex:reply-feedback', (_event, feedbackId, body, expectedRevision) => {
  if (typeof feedbackId !== 'string' || feedbackId.length > 96 || typeof body !== 'string') throw new Error('Feedback reply is invalid')
  return feedbackService.reply(feedbackId, body, expectedRevision)
})
ipcMain.handle('apex:reopen-feedback', (_event, feedbackId, expectedRevision) => {
  if (typeof feedbackId !== 'string' || feedbackId.length > 96) throw new Error('Feedback ID is invalid')
  return feedbackService.reopen(feedbackId, expectedRevision)
})
ipcMain.handle('apex:mark-feedback-read', (_event, feedbackId) => typeof feedbackId === 'string' && feedbackId.length <= 96 ? feedbackService.markRead(feedbackId) : feedbackService.getState())
ipcMain.handle('apex:sync-feedback', () => feedbackService.sync())
ipcMain.handle('apex:capture-feedback', async (_event, input = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Apex window is unavailable')
  const content = mainWindow.getContentBounds()
  const rect = input.rect || {}
  const selectedRect = {
    x: Math.max(0, Math.min(content.width - 1, Math.floor(Number(rect.x) || 0))),
    y: Math.max(0, Math.min(content.height - 1, Math.floor(Number(rect.y) || 0))),
    width: Math.max(1, Math.min(content.width, Math.ceil(Number(rect.width) || 1))),
    height: Math.max(1, Math.min(content.height, Math.ceil(Number(rect.height) || 1))),
  }
  selectedRect.width = Math.min(selectedRect.width, content.width - selectedRect.x)
  selectedRect.height = Math.min(selectedRect.height, content.height - selectedRect.y)
  const [fullImage, selectedImage] = await Promise.all([mainWindow.webContents.capturePage(), mainWindow.webContents.capturePage(selectedRect)])
  const encode = (image, maximumWidth) => {
    const original = image.getSize()
    const resized = original.width > maximumWidth ? image.resize({ width: maximumWidth, quality: 'good' }) : image
    const size = resized.getSize()
    return { dataUrl: `data:image/jpeg;base64,${resized.toJPEG(80).toString('base64')}`, width: size.width, height: size.height }
  }
  return { fullWindow: encode(fullImage, 1920), selectedArea: encode(selectedImage, 1200) }
})
ipcMain.handle('apex:check-for-updates', () => updateManager?.check(false))
ipcMain.handle('apex:download-update', () => updateManager?.download())
ipcMain.handle('apex:install-update', () => updateManager?.install())
ipcMain.handle('apex:open-releases', () => shell.openExternal('https://github.com/ralfboltshauser/apex-lmu/releases'))
ipcMain.handle('apex:report-renderer-error', (_event, input = {}) => diagnostics.record('error', 'renderer', 'reported-error', String(input.message || 'Renderer error'), { stack: String(input.stack || ''), context: String(input.context || '') }).then(() => ({ ok: true })))
async function getSupportText() {
  const report = await diagnostics.getReport({ bridgePath: bridgeManager?.getBinaryPath() })
  return diagnostics.buildSupportText({ report, analysis: liveSessionStore?.getHealth() ?? null })
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
ipcMain.handle('apex:stop-telemetry', () => bridgeManager.stopLive())
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
ipcMain.handle('apex:start-analysis-import', async () => {
  const selected = await dialog.showOpenDialog({ title: 'Import an Apex recording into Analysis', properties: ['openFile'], filters: [{ name: 'Apex LMU recording', extensions: ['apexrec'] }] })
  if (selected.canceled || !selected.filePaths[0]) return { ok: false, canceled: true }
  return analysisImportService?.start(selected.filePaths[0]) ?? { ok: false, reason: 'storage-unavailable' }
})
ipcMain.handle('apex:start-e2e-analysis-import', () => e2eConfig ? analysisImportService?.start(e2eConfig.replayPath) ?? { ok: false, reason: 'storage-unavailable' } : { ok: false, reason: 'e2e-disabled' })
ipcMain.handle('apex:stop-analysis-import', () => analysisImportService?.stop() ?? { ok: false, reason: 'not-importing' })
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
  try { telemetryDatabase = await TelemetryDatabase.open({ userDataPath: app.getPath('userData'), appVersion: app.getVersion(), logger: diagnostics }) }
  catch (error) { telemetryDatabaseError = error.message; void diagnostics.record('error', 'telemetry-history', 'open-failed', 'Local lap history was preserved but could not be opened.', { error: error.message }) }
  liveSessionStore = new LiveSessionStore({
    logger: diagnostics,
    onLapFinalized: async (event) => {
      const result = await telemetryDatabase?.enqueueFinalized(event)
      if (!result?.written) return result
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('apex:analysis-sessions-changed', { schemaVersion: 1, revision: liveSessionStore?.revision ?? 0, kind: 'lap' })
      return result
    },
    onSessionFinalized: (summary) => telemetryDatabase?.enqueueSessionFinalized(summary),
  })
  whatsNewService = new WhatsNewService({ userDataPath: app.getPath('userData'), currentVersion: app.getVersion(), logger: diagnostics })
  try { statsDatabase = await StatsDatabase.open({ userDataPath: app.getPath('userData'), appVersion: app.getVersion(), logger: diagnostics }) }
  catch (error) { statsError = error.message; void diagnostics.record('error', 'lifetime-stats', 'open-failed', 'Lifetime statistics database was preserved but could not be opened.', { error: error.message }) }
  void diagnostics.record('info', 'app', 'started', 'Apex started.', { version: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged })
  bridgeManager = new LmuBridgeManager({
    app,
    logger: diagnostics,
    broadcast: (message) => {
      if (analysisImportService?.owns(message)) {
        analysisImportService.ingest(message)
        return
      }
      try { statsDatabase?.ingest(message) } catch (error) { void diagnostics.record('error', 'lifetime-stats', 'ingest-failed', 'A lifetime distance chunk could not be committed.', { error: error.message }) }
      let analysisResult = { changed: false, notify: false }
      try { analysisResult = liveSessionStore.ingest(message) } catch (error) { void diagnostics.record('error', 'analysis-session', 'ingest-failed', 'The in-memory analysis session rejected a bridge message.', { error: error.message }) }
      if (message.runId && (message.state === 'self-test-complete' || message.state === 'error')) selfTestWaiters.get(message.runId)?.(message)
      const rendererMessage = message.type === 'telemetry' && analysisResult.sessionId
        ? { ...message, desktopSessionId: analysisResult.sessionId, desktopLapId: analysisResult.lapId, desktopSessionStartedAt: analysisResult.startedAt }
        : message
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('apex:telemetry-message', rendererMessage)
        if (analysisResult.notify) window.webContents.send('apex:analysis-sessions-changed', { schemaVersion: 1, revision: analysisResult.revision, kind: analysisResult.kind })
      }
    },
    broadcastRecording: (state) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('apex:recording-state', state)
    },
    onReplayFinished: (result) => analysisImportService?.handleReplayFinished(result),
  })
  if (telemetryDatabase) {
    analysisImportService = new RecordingImportService({
      userDataPath: app.getPath('userData'),
      appVersion: app.getVersion(),
      database: telemetryDatabase,
      bridgeManager,
      logger: diagnostics,
      broadcast: (state) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send('apex:analysis-import-state', state) },
      onCommitted: () => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send('apex:analysis-sessions-changed', { schemaVersion: 1, revision: liveSessionStore?.revision ?? 0, kind: 'import' }) },
    })
    await analysisImportService.initialize().catch((error) => void diagnostics.record('error', 'recording-import', 'initialize-failed', 'Private recording import staging could not be initialized.', { error: error.message }))
  }
  updateManager = new UpdateManager({
    app,
    logger: diagnostics,
    broadcast: (state) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('apex:update-state', state)
    },
    beforeInstall: async () => { bridgeManager?.stop(); await analysisImportService?.dispose(); await telemetryDatabase?.close({ requireDurable: true }); statsDatabase?.close({ requireDurable: true }) },
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
  const openFeedbackThread = (feedbackId) => {
    pendingFeedbackThreadId = feedbackId
    if (!mainWindow || mainWindow.isDestroyed()) createWindow()
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    if (!mainWindow.webContents.isLoadingMainFrame()) mainWindow.webContents.send('apex:open-feedback-thread', feedbackId)
  }
  feedbackService = new FeedbackService({
    app,
    safeStorage,
    logger: diagnostics,
    broadcast: (channel, payload) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload) },
    notify: ({ feedbackId, body }) => {
      if (!Notification.isSupported()) return
      const notification = new Notification({ title: 'Apex for LMU', body: body || 'Feedback updated' })
      notification.on('click', () => openFeedbackThread(feedbackId))
      notification.show()
    },
  })
  await feedbackService.initialize().catch((error) => void diagnostics.record('warning', 'feedback', 'initialize-failed', 'Feedback synchronization will retry later.', { error: error.message }))
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
  feedbackService?.stop()
  void overlayManager?.shutdown()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (quitFlushComplete) return
  event.preventDefault()
  if (quitFlushStarted) return
  quitFlushStarted = true
  bridgeManager?.stop()
  feedbackService?.stop()
  void (async () => {
    try { await analysisImportService?.dispose() }
    catch (error) { void diagnostics?.record('error', 'recording-import', 'close-failed', 'Private recording import cleanup failed during app shutdown.', { error: error.message }) }
    try { await telemetryDatabase?.close() }
    catch (error) { void diagnostics?.record('error', 'telemetry-history', 'close-failed', 'Local lap history close failed during app shutdown.', { error: error.message }) }
    try { statsDatabase?.close() }
    catch (error) { void diagnostics?.record('error', 'lifetime-stats', 'close-failed', 'Lifetime database close failed during app shutdown.', { error: error.message }) }
    await overlayManager?.shutdown()
    quitFlushComplete = true
    app.quit()
  })()
})
