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
  exportSupportBundle: () => ipcRenderer.invoke('apex:export-support-bundle'),
  openLogsFolder: () => ipcRenderer.invoke('apex:open-logs-folder'),
  getUpdateState: () => ipcRenderer.invoke('apex:get-update-state'),
  checkForUpdates: () => ipcRenderer.invoke('apex:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('apex:download-update'),
  installUpdate: () => ipcRenderer.invoke('apex:install-update'),
  openReleases: () => ipcRenderer.invoke('apex:open-releases'),
  reportError: (input) => ipcRenderer.invoke('apex:report-renderer-error', input),
  startTelemetry: () => ipcRenderer.invoke('apex:start-telemetry'),
  stopTelemetry: () => ipcRenderer.invoke('apex:stop-telemetry'),
  runTelemetrySelfTest: () => ipcRenderer.invoke('apex:run-telemetry-self-test'),
  inspectTelemetry: (filePath) => ipcRenderer.invoke('apex:inspect-telemetry', filePath),
  installSetup: (input) => ipcRenderer.invoke('apex:install-setup', input),
  openOverlay: () => ipcRenderer.invoke('apex:open-overlay'),
  onTelemetryMessage: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('apex:telemetry-message', listener)
    return () => ipcRenderer.removeListener('apex:telemetry-message', listener)
  },
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('apex:update-state', listener)
    return () => ipcRenderer.removeListener('apex:update-state', listener)
  },
})
