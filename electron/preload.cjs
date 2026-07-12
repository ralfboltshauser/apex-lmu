const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('apexDesktop', {
  getEnvironment: () => ipcRenderer.invoke('apex:get-environment'),
  chooseDirectory: (title) => ipcRenderer.invoke('apex:choose-directory', title),
  chooseFile: (options) => ipcRenderer.invoke('apex:choose-file', options),
  pathExists: (candidatePath) => ipcRenderer.invoke('apex:path-exists', candidatePath),
  openDataFolder: () => ipcRenderer.invoke('apex:open-data-folder'),
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
})
