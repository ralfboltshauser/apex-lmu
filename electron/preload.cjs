const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('apexDesktop', {
  getEnvironment: () => ipcRenderer.invoke('apex:get-environment'),
  chooseDirectory: (title) => ipcRenderer.invoke('apex:choose-directory', title),
  chooseFile: (options) => ipcRenderer.invoke('apex:choose-file', options),
  pathExists: (candidatePath) => ipcRenderer.invoke('apex:path-exists', candidatePath),
  discoverLmu: () => ipcRenderer.invoke('apex:discover-lmu'),
  inspectLmuPath: (candidatePath) => ipcRenderer.invoke('apex:inspect-lmu-path', candidatePath),
  openDataFolder: () => ipcRenderer.invoke('apex:open-data-folder'),
  runDiagnostics: () => ipcRenderer.invoke('apex:run-diagnostics'),
  getDiagnostics: () => ipcRenderer.invoke('apex:get-diagnostics'),
  copySupportBundle: () => ipcRenderer.invoke('apex:copy-support-bundle'),
  emailSupportBundle: () => ipcRenderer.invoke('apex:email-support-bundle'),
  exportSupportBundle: () => ipcRenderer.invoke('apex:export-support-bundle'),
  openLogsFolder: () => ipcRenderer.invoke('apex:open-logs-folder'),
  getUpdateState: () => ipcRenderer.invoke('apex:get-update-state'),
  getWhatsNewState: () => ipcRenderer.invoke('apex:get-whats-new-state'),
  acknowledgeWhatsNew: (version) => ipcRenderer.invoke('apex:acknowledge-whats-new', version),
  getLifetimeStats: () => ipcRenderer.invoke('apex:get-lifetime-stats'),
  getLifetimeStatsHealth: () => ipcRenderer.invoke('apex:get-lifetime-stats-health'),
  backupLifetimeStats: () => ipcRenderer.invoke('apex:backup-lifetime-stats'),
  getAnalysisSessions: () => ipcRenderer.invoke('apex:get-analysis-sessions'),
  getAnalysisLap: (sessionId, lapId) => ipcRenderer.invoke('apex:get-analysis-lap', sessionId, lapId),
  getAnalysisHealth: () => ipcRenderer.invoke('apex:get-analysis-health'),
  getAnalysisImportState: () => ipcRenderer.invoke('apex:get-analysis-import-state'),
  getFeedbackState: () => ipcRenderer.invoke('apex:get-feedback-state'),
  listFeedback: () => ipcRenderer.invoke('apex:list-feedback'),
  getFeedback: (feedbackId) => ipcRenderer.invoke('apex:get-feedback', feedbackId),
  getFeedbackAttachment: (feedbackId, attachmentId) => ipcRenderer.invoke('apex:get-feedback-attachment', feedbackId, attachmentId),
  consumeFeedbackThread: () => ipcRenderer.invoke('apex:consume-feedback-thread'),
  submitFeedback: (input) => ipcRenderer.invoke('apex:submit-feedback', input),
  replyFeedback: (feedbackId, body, expectedRevision) => ipcRenderer.invoke('apex:reply-feedback', feedbackId, body, expectedRevision),
  reopenFeedback: (feedbackId, expectedRevision) => ipcRenderer.invoke('apex:reopen-feedback', feedbackId, expectedRevision),
  markFeedbackRead: (feedbackId) => ipcRenderer.invoke('apex:mark-feedback-read', feedbackId),
  syncFeedback: () => ipcRenderer.invoke('apex:sync-feedback'),
  captureFeedback: (input) => ipcRenderer.invoke('apex:capture-feedback', input),
  checkForUpdates: () => ipcRenderer.invoke('apex:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('apex:download-update'),
  installUpdate: () => ipcRenderer.invoke('apex:install-update'),
  openReleases: () => ipcRenderer.invoke('apex:open-releases'),
  reportError: (input) => ipcRenderer.invoke('apex:report-renderer-error', input),
  startTelemetry: () => ipcRenderer.invoke('apex:start-telemetry'),
  stopTelemetry: () => ipcRenderer.invoke('apex:stop-telemetry'),
  runTelemetrySelfTest: () => ipcRenderer.invoke('apex:run-telemetry-self-test'),
  getRecordingState: () => ipcRenderer.invoke('apex:get-recording-state'),
  startRecording: () => ipcRenderer.invoke('apex:start-recording'),
  stopRecording: () => ipcRenderer.invoke('apex:stop-recording'),
  startReplay: () => ipcRenderer.invoke('apex:start-replay'),
  startReplayForTest: () => ipcRenderer.invoke('apex:start-e2e-replay'),
  stopReplay: () => ipcRenderer.invoke('apex:stop-replay'),
  startAnalysisImport: () => ipcRenderer.invoke('apex:start-analysis-import'),
  startAnalysisImportForTest: () => ipcRenderer.invoke('apex:start-e2e-analysis-import'),
  stopAnalysisImport: () => ipcRenderer.invoke('apex:stop-analysis-import'),
  inspectTelemetry: (filePath) => ipcRenderer.invoke('apex:inspect-telemetry', filePath),
  installSetup: (input) => ipcRenderer.invoke('apex:install-setup', input),
  openOverlay: () => ipcRenderer.invoke('apex:open-overlay'),
  closeOverlay: () => ipcRenderer.invoke('apex:close-overlay'),
  getDisplays: () => ipcRenderer.invoke('apex:get-displays'),
  getOverlayState: () => ipcRenderer.invoke('apex:get-overlay-state'),
  getOverlayConfig: () => ipcRenderer.invoke('apex:get-overlay-config'),
  setOverlayConfig: (patch) => ipcRenderer.invoke('apex:set-overlay-config', patch),
  overlayRendererReady: () => ipcRenderer.invoke('apex:overlay-renderer-ready'),
  onTelemetryMessage: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('apex:telemetry-message', listener)
    return () => ipcRenderer.removeListener('apex:telemetry-message', listener)
  },
  onRecordingState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('apex:recording-state', listener)
    return () => ipcRenderer.removeListener('apex:recording-state', listener)
  },
  onAnalysisSessionsChanged: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('apex:analysis-sessions-changed', listener)
    return () => ipcRenderer.removeListener('apex:analysis-sessions-changed', listener)
  },
  onAnalysisImportState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('apex:analysis-import-state', listener)
    return () => ipcRenderer.removeListener('apex:analysis-import-state', listener)
  },
  onFeedbackChanged: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('apex:feedback-changed', listener)
    return () => ipcRenderer.removeListener('apex:feedback-changed', listener)
  },
  onFeedbackShortcut: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('apex:feedback-shortcut', listener)
    return () => ipcRenderer.removeListener('apex:feedback-shortcut', listener)
  },
  onOpenFeedbackThread: (callback) => {
    const listener = (_event, feedbackId) => callback(feedbackId)
    ipcRenderer.on('apex:open-feedback-thread', listener)
    return () => ipcRenderer.removeListener('apex:open-feedback-thread', listener)
  },
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('apex:update-state', listener)
    return () => ipcRenderer.removeListener('apex:update-state', listener)
  },
  onDisplaysChanged: (callback) => {
    const listener = (_event, displays) => callback(displays)
    ipcRenderer.on('apex:displays-changed', listener)
    return () => ipcRenderer.removeListener('apex:displays-changed', listener)
  },
  onOverlayState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('apex:overlay-state', listener)
    return () => ipcRenderer.removeListener('apex:overlay-state', listener)
  },
  onOverlayConfig: (callback) => {
    const listener = (_event, config) => callback(config)
    ipcRenderer.on('apex:overlay-config', listener)
    return () => ipcRenderer.removeListener('apex:overlay-config', listener)
  },
})
