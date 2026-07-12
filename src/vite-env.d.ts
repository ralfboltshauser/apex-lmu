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
  openDataFolder(): Promise<string>
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
}

interface Window {
  apexDesktop?: ApexDesktopApi
}
