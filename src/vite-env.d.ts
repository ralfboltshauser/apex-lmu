/// <reference types="vite/client" />

interface ApexEnvironment {
  platform: string
  version: string
  userDataPath: string
  bridgeAvailable: boolean
  defaultLmuPath: string
}

type ApexOverlayWidgetId = 'relative' | 'delta' | 'inputs' | 'fuel'
interface ApexDisplay {
  id: string
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  rotation: 0 | 90 | 180 | 270
  primary: boolean
}
interface ApexOverlayWidgetConfig {
  id: ApexOverlayWidgetId
  enabled: boolean
  bounds: { x: number; y: number; width: number; height: number }
}
interface ApexOverlayConfig {
  version: 1
  displayId: string | null
  displayFingerprint: string | null
  opacity: number
  clickThrough: boolean
  widgets: ApexOverlayWidgetConfig[]
}
interface ApexOverlayState {
  status: 'closed' | 'opening' | 'ready' | 'error'
  displayId: string | null
  message: string
  fallbackFrom: string | null
}

type ApexFeedbackStatus = 'new' | 'acknowledged' | 'investigating' | 'needs_user_answer' | 'user_answered' | 'in_progress' | 'resolved' | 'dismissed' | 'duplicate' | 'reopened'
interface ApexFeedbackImage { dataUrl: string; width: number; height: number }
interface ApexFeedbackElementContext { feedbackId?: string; selector: string; tagName: string; role?: string; accessibleName?: string; cssClasses?: string; selectedText?: string; nearbyText?: string; rect: { x: number; y: number; width: number; height: number } }
interface ApexFeedbackContext { view: string; appVersion: string; language: 'en' | 'de'; platform: string; source?: 'live' | 'demo' | 'offline'; screen: { width: number; height: number; scaleFactor: number }; viewport: { width: number; height: number }; element: ApexFeedbackElementContext; redactionVersion: 1 }
interface ApexFeedbackMessage { id: string; actor: 'human' | 'agent' | 'system'; kind: 'comment' | 'question' | 'answer' | 'status' | 'resolution'; body: string; createdAt: string }
interface ApexFeedbackAttachment { id: string; kind: 'selected-area' | 'full-window'; mediaType: string; width: number; height: number; bytes: number; sha256: string; createdAt: string }
interface ApexFeedbackItem { id: string; reference: string; clientRequestId?: string; status: ApexFeedbackStatus; revision: number; firstMessage: string; view?: string; appVersion?: string; language?: string; platform?: string; context?: ApexFeedbackContext; messages?: ApexFeedbackMessage[]; attachments?: ApexFeedbackAttachment[]; resolutionSummary?: string | null; duplicateOf?: string | null; createdAt: string; updatedAt: string; resolvedAt?: string | null; syncState?: 'queued' | 'synced' }
interface ApexFeedbackState { status: 'ready' | 'syncing' | 'error'; pending: number; unread: number; needsAnswer: number; items: ApexFeedbackItem[] }

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
  copySupportBundle(): Promise<{ ok: boolean; characters: number }>
  emailSupportBundle(): Promise<{ ok: boolean; copied: boolean; includedInBody: boolean; characters: number }>
  exportSupportBundle(): Promise<{ ok: boolean; canceled?: boolean; path?: string }>
  openLogsFolder(): Promise<string>
  getUpdateState(): Promise<ApexUpdateState>
  getWhatsNewState(): Promise<ApexWhatsNewState>
  acknowledgeWhatsNew(version: string): Promise<{ ok: boolean; reason?: string; alreadyAcknowledged?: boolean; state?: ApexWhatsNewState }>
  getLifetimeStats(): Promise<ApexLifetimeStats>
  getLifetimeStatsHealth(): Promise<ApexLifetimeStatsHealth>
  backupLifetimeStats(): Promise<{ ok: boolean; reason?: string; backup?: { file: string; bytes: number; sha256: string; createdAt: string } }>
  getAnalysisSessions(): Promise<ApexAnalysisSessionSummary[]>
  getAnalysisLap(sessionId: string, lapId: string): Promise<ApexAnalysisLapPayload | null>
  getAnalysisHealth(): Promise<ApexAnalysisHealth>
  getFeedbackState(): Promise<ApexFeedbackState>
  listFeedback(): Promise<ApexFeedbackItem[]>
  getFeedback(feedbackId: string): Promise<ApexFeedbackItem | null>
  getFeedbackAttachment(feedbackId: string, attachmentId: string): Promise<{ dataUrl: string }>
  consumeFeedbackThread(): Promise<string | null>
  submitFeedback(input: { comment: string; context: Omit<ApexFeedbackContext, 'appVersion' | 'platform' | 'screen' | 'redactionVersion'>; selectedArea?: ApexFeedbackImage | null; fullWindow?: ApexFeedbackImage | null }): Promise<ApexFeedbackItem | null>
  replyFeedback(feedbackId: string, body: string, expectedRevision: number): Promise<ApexFeedbackItem | null>
  reopenFeedback(feedbackId: string, expectedRevision: number): Promise<ApexFeedbackItem | null>
  markFeedbackRead(feedbackId: string): Promise<ApexFeedbackState>
  syncFeedback(): Promise<ApexFeedbackState>
  captureFeedback(input: { rect: ApexFeedbackElementContext['rect'] }): Promise<{ selectedArea: ApexFeedbackImage; fullWindow: ApexFeedbackImage }>
  checkForUpdates(): Promise<ApexUpdateState>
  downloadUpdate(): Promise<{ ok: boolean; reason?: string }>
  installUpdate(): Promise<{ ok: boolean; reason?: string }>
  openReleases(): Promise<void>
  reportError(input: { message: string; stack?: string; context?: string }): Promise<{ ok: boolean }>
  startTelemetry(): Promise<{ ok: boolean; reason?: string }>
  stopTelemetry(): Promise<{ ok: boolean }>
  runTelemetrySelfTest(): Promise<{ ok: boolean; reason?: string; runId: string; path?: string }>
  getRecordingState(): Promise<ApexRecordingState>
  startRecording(): Promise<{ ok: boolean; canceled?: boolean; reason?: string; path?: string }>
  stopRecording(): Promise<{ ok: boolean; reason?: string }>
  startReplay(): Promise<{ ok: boolean; canceled?: boolean; reason?: string; path?: string }>
  startReplayForTest(): Promise<{ ok: boolean; reason?: string; path?: string; runId?: string }>
  stopReplay(): Promise<{ ok: boolean; reason?: string }>
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
  openOverlay(): Promise<{ ok: boolean; reason?: string; state: ApexOverlayState }>
  closeOverlay(): Promise<{ ok: boolean; state: ApexOverlayState }>
  getDisplays(): Promise<ApexDisplay[]>
  getOverlayState(): Promise<ApexOverlayState>
  getOverlayConfig(): Promise<ApexOverlayConfig>
  setOverlayConfig(patch: Partial<Pick<ApexOverlayConfig, 'displayId' | 'opacity' | 'clickThrough' | 'widgets'>>): Promise<ApexOverlayConfig>
  overlayRendererReady(): Promise<{ ok: boolean }>
  onTelemetryMessage(callback: (message: unknown) => void): () => void
  onRecordingState(callback: (state: ApexRecordingState) => void): () => void
  onAnalysisSessionsChanged(callback: (state: { schemaVersion: 1; revision: number; kind: 'sample' | 'lap' | 'session' | 'status' }) => void): () => void
  onFeedbackChanged(callback: (state: ApexFeedbackState) => void): () => void
  onFeedbackShortcut(callback: () => void): () => void
  onOpenFeedbackThread(callback: (feedbackId: string) => void): () => void
  onUpdateState(callback: (state: ApexUpdateState) => void): () => void
  onDisplaysChanged(callback: (displays: ApexDisplay[]) => void): () => void
  onOverlayState(callback: (state: ApexOverlayState) => void): () => void
  onOverlayConfig(callback: (config: ApexOverlayConfig) => void): () => void
}

interface ApexUpdateState { status: 'development' | 'unsupported' | 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'; currentVersion: string; availableVersion: string | null; progress: { percent: number; transferred: number; total: number; bytesPerSecond: number } | null; message: string; releaseNotes: string; releaseUrl: string; error?: { message: string; stack: string; code: string } }
interface ApexWhatsNewState { schemaVersion: 1; currentVersion: string; firstSeenVersion: string; lastAcknowledgedVersion: string | null }
interface ApexLifetimeVehicleStats { id: string; name: string; className: string; distanceMm: number; sessions: number; firstSeenAt: string; lastSeenAt: string }
interface ApexLifetimeStats { status: 'ready' | 'future-schema' | 'error' | 'closed'; schemaVersion?: number; algorithmVersion?: string; message?: string; trackedSince: string | null; totalDistanceMm: number; vehicles: ApexLifetimeVehicleStats[] }
interface ApexLifetimeStatsHealth { status: 'ready' | 'future-schema' | 'error' | 'closed' | 'read-only'; schemaVersion?: number; algorithmVersion?: string; message?: string; path?: string; lastBackup?: { file: string; bytes: number; sha256: string; createdAt: string } | null }
interface ApexRecordingState { status: 'idle' | 'starting' | 'recording' | 'stopping' | 'replaying' | 'complete' | 'error'; path: string | null; frames: number; bytes: number; durationSeconds: number; message: string }

type ApexAnalysisSource = 'live' | 'recording-replay'
type ApexAnalysisSessionState = 'active' | 'interrupted' | 'finished'
type ApexAnalysisLapState = 'current' | 'complete' | 'incomplete'
type ApexAnalysisLapQuality = 'clean' | 'limited' | 'ineligible'
type ApexAnalysisLapReason = 'ai-control' | 'coverage-low' | 'incomplete' | 'lap-counter-jump' | 'lap-invalidated' | 'missing-sample' | 'pit' | 'position-discontinuity' | 'remote-control' | 'replay-control' | 'sample-compacted' | 'sample-overflow' | 'sequence-gap' | 'source-interrupted' | 'telemetry-gap' | 'time-reset' | 'unknown-control'
interface ApexAnalysisLapSummary { id: string; number: number; state: ApexAnalysisLapState; quality: ApexAnalysisLapQuality; reasons: ApexAnalysisLapReason[]; lapTimeMs: number | null; coverage: number; maximumGapM: number; sampleCount: number; samplesAvailable: boolean; replayable?: boolean; referenceEligible?: boolean; trackModelEligible?: boolean; officialTimePending?: boolean; payloadHash?: string }
interface ApexAnalysisSessionSummary { schemaVersion: 1; qualityPolicyVersion: string; revision: number; id: string; source: ApexAnalysisSource; state: ApexAnalysisSessionState; startedAt: string; endedAt: string | null; track: { name: string; layout: string; lengthM: number }; car: { id: number; name: string; class: string }; laps: ApexAnalysisLapSummary[]; currentLapId: string | null; interruptionCount: number; sourceSegmentCount: number }
interface ApexAnalysisSample { distanceM: number; rawDistanceM?: number; distanceIndexM?: number; x: number; y?: number; z: number; brake: number; throttle: number; steering: number; clutch?: number; gear?: number; rpm?: number; pathLateralM?: number | null; trackEdgeM?: number | null; countLapFlag?: number | null; speedKph: number; elapsedSeconds: number; lapElapsedSeconds: number }
interface ApexTrackModel { schemaVersion: 1; algorithmVersion: string; trackKey: string; trackLengthM: number; binSizeM: number; coverage: number; published: boolean; lateralSign: number; seamGapM: number; maximumJumpM: number; sourceHash: string; geometryHash: string; points: Array<{ distanceM: number; x: number; y: number; z: number; observations: number; spreadM: number; confidence: number }> }
interface ApexAnalysisLapPayload { schemaVersion: 1; session: ApexAnalysisSessionSummary; lap: ApexAnalysisLapSummary; samples: ApexAnalysisSample[] | null; payloadHash?: string; trackModel?: ApexTrackModel | null; personalBest?: { session: ApexAnalysisSessionSummary; lap: ApexAnalysisLapSummary; samples: ApexAnalysisSample[] } | null }
interface ApexAnalysisHealth { schemaVersion: 1; qualityPolicyVersion: string; revision: number; memoryBudgetBytes: number; telemetryFrames: number; statuses: number; sessions: number; completedLaps: number; incompleteLaps: number; evictedLapPayloads: number; storage?: { status: string; path?: string; message?: string } }

interface ApexLmuCheck { label: string; expected: string; ok: boolean; optional?: boolean }
interface ApexLmuAttempt { source: string; candidate: string; status: 'found' | 'not-found' | 'invalid'; checks: ApexLmuCheck[]; fixes: string[]; technical: string; executable?: string | null; sharedMemoryPath?: string | null }
interface ApexLmuDiscovery { found: ApexLmuAttempt | null; attempts: ApexLmuAttempt[]; trace: string[]; expectations: { appId: string; manifest: string; installFolder: string; executables: string[] } }

interface ApexDiagnosticCheck { id: string; status: 'pass' | 'fail' | 'blocked'; title: string; summary: string; fixes: string[]; details: string }
interface ApexDiagnosticReport { generatedAt: string; checks: ApexDiagnosticCheck[]; logs: string }

interface Window {
  apexDesktop?: ApexDesktopApi
}
