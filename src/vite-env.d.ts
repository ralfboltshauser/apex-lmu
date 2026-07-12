/// <reference types="vite/client" />

interface ApexEnvironment {
  platform: string
  version: string
  userDataPath: string
  bridgeAvailable: boolean
  defaultLmuPath: string
}

interface ApexDesktopApi {
  getEnvironment(): Promise<ApexEnvironment>
  chooseDirectory(title: string): Promise<string | null>
  chooseFile(options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>
  pathExists(candidatePath: string): Promise<boolean>
  discoverLmu(): Promise<ApexLmuDiscovery>
  inspectLmuPath(candidatePath: string): Promise<ApexLmuAttempt>
  openDataFolder(): Promise<string>
  runDiagnostics(): Promise<ApexDiagnosticReport>
  getDiagnostics(): Promise<ApexDiagnosticReport>
  exportSupportBundle(): Promise<{ ok: boolean; canceled?: boolean; path?: string }>
  openLogsFolder(): Promise<string>
  getUpdateState(): Promise<ApexUpdateState>
  checkForUpdates(): Promise<ApexUpdateState>
  downloadUpdate(): Promise<{ ok: boolean; reason?: string }>
  installUpdate(): Promise<{ ok: boolean; reason?: string }>
  openReleases(): Promise<void>
  reportError(input: { message: string; stack?: string; context?: string }): Promise<{ ok: boolean }>
  startTelemetry(): Promise<{ ok: boolean; reason?: string }>
  stopTelemetry(): Promise<{ ok: boolean }>
  runTelemetrySelfTest(): Promise<{ ok: boolean; reason?: string; runId: string; path?: string }>
  inspectTelemetry(filePath: string): Promise<{
    path: string
    bytes: number
    tables: Array<{ schema: string; name: string; rowCount: number; columns: Array<{ name: string; type: string }> }>
    metadata: Record<string, string>
    channels: Array<{ name: string; frequencyHz: number; unit: string }>
    events: Array<{ name: string; unit: string }>
    lapEvents: Array<{ timestampSeconds: number; lap: number }>
    lapTimes: Array<{ timestampSeconds: number; durationSeconds: number }>
  }>
  installSetup(input: { sourcePath: string; targetDirectory: string }): Promise<{ destination: string; backupPath: string | null; bytes: number }>
  openOverlay(): Promise<{ ok: boolean }>
  onTelemetryMessage(callback: (message: unknown) => void): () => void
  onUpdateState(callback: (state: ApexUpdateState) => void): () => void
}

interface ApexUpdateState { status: 'development' | 'unsupported' | 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'; currentVersion: string; availableVersion: string | null; progress: { percent: number; transferred: number; total: number; bytesPerSecond: number } | null; message: string; releaseNotes: string; releaseUrl: string; error?: { message: string; stack: string; code: string } }

interface ApexLmuCheck { label: string; expected: string; ok: boolean; optional?: boolean }
interface ApexLmuAttempt { source: string; candidate: string; status: 'found' | 'not-found' | 'invalid'; checks: ApexLmuCheck[]; fixes: string[]; technical: string; executable?: string | null; sharedMemoryPath?: string | null }
interface ApexLmuDiscovery { found: ApexLmuAttempt | null; attempts: ApexLmuAttempt[]; trace: string[]; expectations: { appId: string; manifest: string; installFolder: string; executables: string[] } }

interface ApexDiagnosticCheck { id: string; status: 'pass' | 'fail' | 'blocked'; title: string; summary: string; fixes: string[]; details: string }
interface ApexDiagnosticReport { generatedAt: string; checks: ApexDiagnosticCheck[]; logs: string }

interface Window {
  apexDesktop?: ApexDesktopApi
}
