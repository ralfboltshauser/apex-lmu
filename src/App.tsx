import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  Database,
  FolderSearch,
  Gauge,
  HardDrive,
  Radio,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { Shell, type ViewId } from './components/Shell'
import { WhatsNewDialog } from './components/ReleaseNotes'
import { Badge, Button } from './components/ui'
import { HomeView } from './views/HomeView'
import { LiveView } from './views/LiveView'
import { AnalyzeView } from './views/AnalyzeView'
import { StrategyView } from './views/StrategyView'
import { FuelCalculatorView } from './views/FuelCalculatorView'
import { SetupsView } from './views/SetupsView'
import { OverlaysView } from './views/OverlaysView'
import { SettingsView } from './views/SettingsView'
import { DesktopTelemetryAdapter, emptyFuelTracker, MockTelemetryAdapter, updateFuelTracker, type LiveFuelEstimate, type TelemetryFrame } from './core'
import { appMessages } from './i18n/appMessages'
import { formatMessage, useMessages } from './i18n'
import { pendingReleaseNotes, type ReleaseNote } from './release-notes'
import { buildMeasuredTrackSnapshot, type MeasuredLapRecord, type MeasuredTrackSnapshot } from './engine'
import { FeedbackProvider } from './feedback/FeedbackProvider'
import { FeedbackView } from './feedback/FeedbackView'

type Toast = { id: number; title: string; body: string }
const LMU_PATH_KEY = 'apex:lmu-installation-path'
const FUEL_PROFILE_PREFIX = 'apex:fuel-profile:'

function fuelProfileKey(track: string, car: string) {
  return `${FUEL_PROFILE_PREFIX}${encodeURIComponent(`${track}\0${car}`)}`
}

function loadFuelProfile(track: string, car: string) {
  try {
    const value = JSON.parse(window.localStorage.getItem(fuelProfileKey(track, car)) || '{}') as { fuel?: unknown; laps?: unknown }
    const fuel = Array.isArray(value.fuel) ? value.fuel.filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item > 0).slice(-20) : []
    const laps = Array.isArray(value.laps) ? value.laps.filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item >= 10).slice(-20) : []
    return { fuel, laps }
  } catch { return { fuel: [], laps: [] } }
}

function saveFuelProfile(track: string, car: string, fuel: readonly number[], laps: readonly number[]) {
  try { window.localStorage.setItem(fuelProfileKey(track, car), JSON.stringify({ fuel, laps })) } catch { /* Live calculation still works for this run. */ }
}

type DetectionNotice =
  | { kind: 'searchCommon' | 'desktopOnly' | 'confirmedManually' | 'invalid' | 'inaccessible' }
  | { kind: 'foundVia'; source: string }
  | { kind: 'checked'; count: number }

function Onboarding({ onComplete, onDemo }: { onComplete: () => void; onDemo: () => void }) {
  const messages = useMessages(appMessages)
  const m = messages.onboarding
  const [step, setStep] = useState(0)
  const [checking, setChecking] = useState(false)
  const [found, setFound] = useState(false)
  const [detectedPath, setDetectedPath] = useState('')
  const [detectionNotice, setDetectionNotice] = useState<DetectionNotice>({ kind: 'searchCommon' })
  const [systemReport, setSystemReport] = useState<ApexDiagnosticReport | null>(null)
  const [discovery, setDiscovery] = useState<ApexLmuDiscovery | null>(null)
  const [manualPath, setManualPath] = useState('')
  const detectionMessage = (() => {
    if (detectionNotice.kind === 'foundVia') return formatMessage(m.connection.discovery.foundVia, { source: detectionNotice.source })
    if (detectionNotice.kind === 'checked') return detectionNotice.count === 1
      ? m.connection.discovery.checkedOne
      : formatMessage(m.connection.discovery.checkedMany, { count: detectionNotice.count })
    return m.connection.discovery[detectionNotice.kind]
  })()

  const detect = async () => {
    setChecking(true)
    try {
      if (!window.apexDesktop) {
        setFound(false)
        setDetectionNotice({ kind: 'desktopOnly' })
        return
      }
      const result = await window.apexDesktop.discoverLmu()
      setDiscovery(result)
      setFound(Boolean(result.found))
      setDetectedPath(result.found?.candidate || '')
      setManualPath(result.found?.candidate || manualPath)
      if (result.found) window.localStorage.setItem(LMU_PATH_KEY, result.found.candidate)
      setDetectionNotice(result.found
        ? { kind: 'foundVia', source: result.found.source.replaceAll('-', ' ') }
        : { kind: 'checked', count: result.attempts.length })
    } finally {
      setChecking(false)
    }
  }

  const chooseInstallation = async () => {
    const selected = await window.apexDesktop?.chooseDirectory(m.connection.chooseDialog)
    if (!selected) return
    setManualPath(selected)
    await inspectManualPath(selected)
  }

  const inspectManualPath = async (value = manualPath) => {
    if (!window.apexDesktop || !value.trim()) return
    setChecking(true)
    try {
      const attempt = await window.apexDesktop.inspectLmuPath(value)
      setFound(attempt.status === 'found')
      setDetectedPath(attempt.status === 'found' ? attempt.candidate : '')
      if (attempt.status === 'found') window.localStorage.setItem(LMU_PATH_KEY, attempt.candidate)
      setDetectionNotice({ kind: attempt.status === 'found' ? 'confirmedManually' : attempt.status === 'invalid' ? 'invalid' : 'inaccessible' })
      setDiscovery((current) => ({ found: attempt.status === 'found' ? attempt : null, attempts: [...(current?.attempts || []), attempt], trace: [...(current?.trace || []), formatMessage(m.connection.discovery.manualInspection, { candidate: attempt.candidate, status: attempt.status })], expectations: current?.expectations || { appId: '2399420', manifest: 'steamapps\\appmanifest_2399420.acf', installFolder: 'steamapps\\common\\<installdir>', executables: ['Le Mans Ultimate.exe', 'LMU.exe'] } }))
    } finally { setChecking(false) }
  }

  const verifySystem = async () => {
    setChecking(true)
    try { if (window.apexDesktop) setSystemReport(await window.apexDesktop.runDiagnostics()) }
    finally { setChecking(false) }
  }

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-label={m.welcomeAria}>
      <div className="onboarding-modal">
        <div className="onboarding-modal__top">
          <div className="brand brand--onboarding">
            <div className="brand__mark" aria-hidden="true"><svg viewBox="0 0 28 28"><path d="M4 20.5 12.5 5h5L24 20.5h-5.2l-1.4-3.4H9.7l-1.8 3.4H4Z" /><path className="brand__cut" d="m11.6 13.4 2.8-5.2 2 5.2h-4.8Z" /></svg></div>
            <div><strong>{messages.common.productName}</strong><span>{messages.shell.brandSuffix}</span></div>
          </div>
          <button type="button" className="icon-button" aria-label={m.close} onClick={onComplete}><X size={18} /></button>
        </div>

        <div className="onboarding-progress" aria-label={formatMessage(m.progress, { step: step + 1 })}>
          {[0, 1, 2].map((item) => <span key={item} className={item <= step ? 'is-active' : ''} />)}
        </div>

        {step === 0 && <div className="onboarding-step onboarding-step--welcome">
          <div className="onboarding-illustration">
            <div className="onboarding-illustration__rings"><span /><span /><span /><Gauge size={35} /></div>
            <div className="onboarding-illustration__card onboarding-illustration__card--one"><small>{m.illustration.fuelToFinish}</small><strong>43.1 L</strong><Badge tone="positive">+1.7 L</Badge></div>
            <div className="onboarding-illustration__card onboarding-illustration__card--two"><small>{m.illustration.biggestGain}</small><strong>{m.illustration.corner}</strong><span>{m.illustration.available}</span></div>
          </div>
          <Badge tone="accent"><Sparkles size={12} /> {m.welcome.badge}</Badge>
          <h1>{m.welcome.title}</h1>
          <p>{m.welcome.summary}</p>
          <div className="onboarding-principles"><span><ShieldCheck size={15} /> {m.welcome.fullyLocal}</span><span><Database size={15} /> {m.welcome.yourData}</span><span><HardDrive size={15} /> {m.welcome.openSource}</span></div>
          <Button onClick={() => setStep(1)}>{m.welcome.setup} <ArrowRight size={15} /></Button>
          <button type="button" className="text-button" onClick={() => { onDemo(); onComplete() }}>{m.welcome.exploreDemo}</button>
        </div>}

        {step === 1 && <div className="onboarding-step onboarding-step--connection">
          <div className="onboarding-step__icon"><FolderSearch size={25} /></div>
          <div className="eyebrow">{m.connection.step}</div><h1>{m.connection.title}</h1><p>{m.connection.summary}</p>
          <div className={`detection-card ${found ? 'is-found' : ''}`}>
            <div className="detection-card__icon">{found ? <Check size={20} /> : <Radio size={20} />}</div>
            <div><strong>{found ? m.connection.found : m.connection.automaticDetection}</strong><span data-feedback-redact={found ? 'local-path' : undefined}>{found ? detectedPath : detectionMessage}</span></div>
            {!found && <Button variant="secondary" size="sm" onClick={() => void detect()}>{checking ? m.connection.searching : m.connection.detect}</Button>}
            {found && <Badge tone="positive">{m.connection.interfaceFound}</Badge>}
          </div>
          {!found && discovery && <div className="manual-path"><label htmlFor="lmu-path">{m.connection.installationFolder}</label><div data-feedback-redact="local-path"><input id="lmu-path" value={manualPath} onChange={(event) => setManualPath(event.target.value)} placeholder={m.connection.folderPlaceholder} onKeyDown={(event) => { if (event.key === 'Enter') void inspectManualPath() }} /><Button variant="secondary" size="sm" onClick={() => void inspectManualPath()} disabled={!manualPath.trim() || checking}>{m.connection.check}</Button><Button variant="secondary" size="sm" onClick={() => void chooseInstallation()}>{m.connection.browse}</Button></div><small>{m.connection.browseHint}</small></div>}
          {discovery && <details className="discovery-details" data-feedback-redact="local-path"><summary>{m.connection.discoveryDetails}</summary><div><p>{m.connection.discoveryExplanationBefore} <code>{discovery.expectations.appId}</code>. {m.connection.discoveryExplanationAfter} <code>{discovery.expectations.manifest}</code>.</p>{discovery.attempts.map((attempt, index) => <section key={`${attempt.candidate}-${index}`}><strong>{attempt.candidate}</strong><span>{attempt.source} · {attempt.status}</span>{attempt.checks.map((check) => <small key={check.label} className={check.ok ? 'is-ok' : check.optional ? 'is-optional' : 'is-fail'}>{check.ok ? '✓' : check.optional ? '○' : '×'} {check.label}: {m.connection.expected} {check.expected}{check.optional ? ` (${m.connection.optional})` : ''}</small>)}{attempt.fixes.map((fix) => <small key={fix}>{m.connection.fix} {fix}</small>)}</section>)}<pre>{discovery.trace.join('\n')}</pre></div></details>}
          <div className="connection-facts"><div><i><Check size={12} /></i><span><strong>{m.connection.liveTelemetry}</strong>{m.connection.officialSharedMemory}</span></div><div><i><Check size={12} /></i><span><strong>{m.connection.recordedSessions}</strong>{m.connection.nativeDuckDb}</span></div><div><i><Check size={12} /></i><span><strong>{m.connection.setupManagement}</strong>{m.connection.backups}</span></div></div>
          {found && <div className="onboarding-system-check"><Button variant="secondary" size="sm" onClick={() => void verifySystem()} disabled={checking}>{checking ? m.connection.testingBridge : m.connection.runSystemCheck}</Button>{systemReport && <span className={systemReport.checks.some((item) => item.status === 'fail') ? 'is-warning' : 'is-pass'}>{formatMessage(m.connection.checksPassed, { passed: systemReport.checks.filter((item) => item.status === 'pass').length, total: systemReport.checks.length })}</span>}</div>}
          {systemReport?.checks.filter((item) => item.status !== 'pass').map((item) => <div className="onboarding-fix" data-feedback-redact="diagnostic-details" key={item.id}><strong>{item.title}</strong><span>{item.summary}</span>{item.fixes[0] && <small>{m.connection.fix} {item.fixes[0]}</small>}</div>)}
          <div className="onboarding-step__actions"><Button variant="secondary" onClick={() => setStep(0)}>{m.connection.back}</Button><Button disabled={!found || !systemReport || systemReport.checks.some((item) => item.status === 'fail')} onClick={() => setStep(2)}>{m.connection.continue} <ArrowRight size={15} /></Button></div>
        </div>}

        {step === 2 && <div className="onboarding-step onboarding-step--ready">
          <div className="ready-check"><Check size={34} /></div><Badge tone="positive">{m.ready.passed}</Badge><h1>{m.ready.title}</h1><p>{m.ready.summary}</p>
          <div className="ready-summary"><div><span>{m.ready.dataSource}</span><strong>{m.ready.officialRate}</strong></div><div><span>{m.ready.storage}</span><strong>{m.ready.localOnly}</strong></div><div><span>{m.ready.overlayLayout}</span><strong>{m.ready.essential}</strong></div></div>
          <Button onClick={onComplete}>{m.ready.openCommandCenter} <ArrowRight size={15} /></Button>
          <button type="button" className="text-button" onClick={() => { onDemo(); onComplete() }}>{m.ready.openWithDemo}</button>
        </div>}
      </div>
    </div>
  )
}

export default function App() {
  const appCopy = useMessages(appMessages)
  const m = appCopy.app
  const [view, setView] = useState<ViewId>('home')
  const [demoRunning, setDemoRunning] = useState(false)
  const [tick, setTick] = useState(0)
  const [onboarding, setOnboarding] = useState(() => window.localStorage.getItem('apex:onboarded') !== 'true')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [whatsNew, setWhatsNew] = useState<readonly ReleaseNote[]>([])
  const demoAdapter = useRef(new MockTelemetryAdapter({ autoTick: true, stepMs: 80, seed: 963 }))
  const desktopAdapter = useRef(new DesktopTelemetryAdapter())
  const fuelTracker = useRef(emptyFuelTracker())
  const analysisLapCache = useRef(new Map<string, ApexAnalysisLapPayload>())
  const demoRunningRef = useRef(false)
  const viewRef = useRef<ViewId>('home')
  const lastUpdateNotice = useRef('')
  const [realConnected, setRealConnected] = useState(false)
  const [liveConnectionMessage, setLiveConnectionMessage] = useState(m.connection.starting)
  const [liveFrame, setLiveFrame] = useState<TelemetryFrame | null>(null)
  const [liveFuel, setLiveFuel] = useState<LiveFuelEstimate | null>(null)
  const [measuredTrack, setMeasuredTrack] = useState<MeasuredTrackSnapshot | null>(null)
  const [analysisSessions, setAnalysisSessions] = useState<readonly ApexAnalysisSessionSummary[]>([])
  demoRunningRef.current = demoRunning
  viewRef.current = view

  const addToast = (title: string, body: string) => {
    const id = Date.now()
    setToasts((current) => [...current.slice(-2), { id, title, body }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4200)
  }

  const completeOnboarding = () => {
    window.localStorage.setItem('apex:onboarded', 'true')
    setOnboarding(false)
  }

  useEffect(() => {
    let cancelled = false
    void window.apexDesktop?.getWhatsNewState()
      .then((state) => { if (!cancelled) setWhatsNew(pendingReleaseNotes(state)) })
      .catch((error) => void window.apexDesktop?.reportError({ message: error instanceof Error ? error.message : String(error), context: 'whats-new-state' }))
    return () => { cancelled = true }
  }, [])

  const acknowledgeWhatsNew = async (openHistory: boolean) => {
    const version = whatsNew[0]?.version
    if (!version || !window.apexDesktop) return
    const result = await window.apexDesktop.acknowledgeWhatsNew(version)
    if (!result.ok) throw new Error(result.reason || 'Unable to acknowledge release notes')
    if (openHistory) {
      window.localStorage.setItem('apex:settings-section', 'about')
      setView('settings')
      window.queueMicrotask(() => window.dispatchEvent(new CustomEvent('apex:settings-section', { detail: 'about' })))
    }
    setWhatsNew([])
  }

  const toggleDemo = () => {
    setDemoRunning((current) => {
      addToast(current ? m.demo.stopped : m.demo.connected, current ? m.demo.waiting : m.demo.streaming)
      return !current
    })
  }

  const importTelemetry = async () => {
    const selected = await window.apexDesktop?.chooseFile({
      title: m.telemetry.chooseTitle,
      filters: [{ name: m.telemetry.filterName, extensions: ['duckdb', 'db'] }],
    })
    if (selected) {
      try {
        const inspection = await window.apexDesktop!.inspectTelemetry(selected)
        const track = inspection.metadata.TrackName || m.telemetry.fallbackSession
        addToast(m.telemetry.inspected, formatMessage(m.telemetry.inspectedBody, { track, laps: inspection.lapTimes.length, channels: inspection.channels.length }))
      } catch (error) {
        addToast(m.telemetry.inspectFailed, error instanceof Error ? error.message : String(error))
      }
    }
    if (!window.apexDesktop) addToast(m.telemetry.desktopReady, m.telemetry.desktopReadyBody)
  }

  const importSetup = async () => {
    if (!window.apexDesktop) {
      addToast(m.setup.desktopTitle, m.setup.desktopBody)
      return
    }
    const sourcePath = await window.apexDesktop.chooseFile({ title: m.setup.chooseTitle, filters: [{ name: m.setup.filterName, extensions: ['svm'] }] })
    if (!sourcePath) return
    const targetDirectory = await window.apexDesktop.chooseDirectory(m.setup.chooseTrackFolder)
    if (!targetDirectory) return
    try {
      const result = await window.apexDesktop.installSetup({ sourcePath, targetDirectory })
      addToast(m.setup.installed, result.backupPath ? m.setup.backedUp : result.destination.split(/[\\/]/).pop() ?? result.destination)
    } catch (error) {
      addToast(m.setup.failed, error instanceof Error ? error.message : String(error))
    }
  }

  const openOverlay = () => {
    if (!window.apexDesktop) { addToast(m.overlay.desktopTitle, m.overlay.desktopBody); return }
    void window.apexDesktop.openOverlay()
      .then((result) => addToast(result.ok ? m.overlay.opened : m.overlay.failed, result.ok ? m.overlay.openedBody : m.overlay.failedBody))
      .catch((error) => addToast(m.overlay.failed, error instanceof Error ? error.message : String(error)))
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [view])

  useEffect(() => {
    if (!window.apexDesktop) return
    return window.apexDesktop.onUpdateState((state) => {
      if (!['available', 'downloaded'].includes(state.status)) return
      const key = `${state.status}:${state.availableVersion}`
      if (lastUpdateNotice.current === key) return
      lastUpdateNotice.current = key
      addToast(state.status === 'downloaded' ? m.update.ready : formatMessage(m.update.available, { version: state.availableVersion ?? '' }), state.status === 'downloaded' ? m.update.readyBody : m.update.availableBody)
    })
  }, [m])

  useEffect(() => {
    const report = (event: ErrorEvent | PromiseRejectionEvent) => {
      const reason = 'reason' in event ? event.reason : event.error
      const error = reason instanceof Error ? reason : new Error('message' in event ? event.message : String(reason))
      void window.apexDesktop?.reportError({ message: error.message, stack: error.stack, context: event.type })
    }
    window.addEventListener('error', report)
    window.addEventListener('unhandledrejection', report)
    return () => { window.removeEventListener('error', report); window.removeEventListener('unhandledrejection', report) }
  }, [])

  useEffect(() => {
    const adapter = demoAdapter.current
    if (!demoRunning) {
      void adapter.disconnect()
      return
    }
    const unsubscribe = adapter.subscribe((frame) => {
      if (viewRef.current === 'home' || viewRef.current === 'live') { setTick(frame.sequence); setLiveFrame(frame) }
    })
    void adapter.connect()
    return () => unsubscribe()
  }, [demoRunning])

  useEffect(() => {
    if (!window.apexDesktop?.getAnalysisSessions || !window.apexDesktop.getAnalysisLap || !window.apexDesktop.onAnalysisSessionsChanged) return
    let cancelled = false
    let refreshing = false
    let refreshPending = false
    const refresh = async () => {
      const sessions = await window.apexDesktop!.getAnalysisSessions()
      if (cancelled) return
      setAnalysisSessions(sessions)
      const session = sessions.find((candidate) => candidate.state !== 'finished') ?? sessions[0]
      if (!session) { setMeasuredTrack(null); return }
      if (session.currentLapId) analysisLapCache.current.delete(`${session.id}:${session.currentLapId}`)
      const clean = session.laps.filter((lap) => lap.state === 'complete' && lap.quality === 'clean' && lap.samplesAvailable).slice(-3)
      const fallback = [...session.laps].reverse().find((lap) => lap.state === 'complete' && lap.quality !== 'ineligible' && lap.samplesAvailable)
        ?? session.laps.find((lap) => lap.id === session.currentLapId && lap.samplesAvailable)
      const selected = clean.at(-1) ?? fallback
      if (!selected) { setMeasuredTrack(null); return }
      const requested = clean.length > 0 ? clean : [selected]
      for (const lap of requested) {
        const key = `${session.id}:${lap.id}`
        if (!analysisLapCache.current.has(key)) {
          const payload = await window.apexDesktop!.getAnalysisLap(session.id, lap.id)
          if (payload) analysisLapCache.current.set(key, payload)
        }
      }
      if (cancelled) return
      const laps: MeasuredLapRecord[] = session.laps.map((lap) => ({
        id: lap.id, number: lap.number, state: lap.state, quality: lap.quality,
        samples: analysisLapCache.current.get(`${session.id}:${lap.id}`)?.samples ?? [],
      }))
      const selectedPayload = analysisLapCache.current.get(`${session.id}:${selected.id}`)
      setMeasuredTrack(buildMeasuredTrackSnapshot({ id: session.id, trackName: session.track.name, layoutName: session.track.layout, trackLengthM: session.track.lengthM, laps, trackModel: selectedPayload?.trackModel }, selected.id))
    }
    const scheduleRefresh = async () => {
      if (refreshing) { refreshPending = true; return }
      refreshing = true
      try {
        do { refreshPending = false; await refresh() } while (refreshPending && !cancelled)
      } finally { refreshing = false }
    }
    const reportRefresh = (context: string) => { void scheduleRefresh().catch((error) => void window.apexDesktop?.reportError({ message: error instanceof Error ? error.message : String(error), context })) }
    const unsubscribe = window.apexDesktop.onAnalysisSessionsChanged(() => reportRefresh('analysis-session-refresh'))
    reportRefresh('analysis-session-initial-load')
    return () => { cancelled = true; unsubscribe() }
  }, [])

  useEffect(() => {
    const adapter = desktopAdapter.current
    let cancelled = false
    let unsubscribeFrame = () => {}
    let unsubscribeStatus = () => {}
    void window.apexDesktop?.getEnvironment().then((environment) => {
      if (cancelled || environment.platform !== 'win32') return
      unsubscribeFrame = adapter.subscribe((frame) => {
        const previousFuel = fuelTracker.current
        let nextFuel = updateFuelTracker(previousFuel, frame)
        if (nextFuel.sessionId && nextFuel.sessionId !== previousFuel.sessionId) {
          const saved = loadFuelProfile(nextFuel.trackName, nextFuel.carName)
          nextFuel = { ...nextFuel, fuelSamplesLiters: saved.fuel, lapTimeSamplesSeconds: saved.laps }
        }
        if ((nextFuel.fuelSamplesLiters.length !== previousFuel.fuelSamplesLiters.length || nextFuel.lapTimeSamplesSeconds.length !== previousFuel.lapTimeSamplesSeconds.length) && nextFuel.sessionId) {
          saveFuelProfile(nextFuel.trackName, nextFuel.carName, nextFuel.fuelSamplesLiters, nextFuel.lapTimeSamplesSeconds)
        }
        fuelTracker.current = nextFuel
        if (fuelTracker.current.sessionId) setLiveFuel(fuelTracker.current)
        if (!demoRunningRef.current && (viewRef.current === 'home' || viewRef.current === 'live' || viewRef.current === 'fuel')) { setLiveFrame(frame); setTick(frame.sequence) }
      })
      unsubscribeStatus = adapter.subscribeStatus((status) => {
        setRealConnected(status.state === 'connected' && status.framesReceived > 0)
        setLiveConnectionMessage(status.error || status.detail || (status.state === 'connecting' ? m.connection.waiting : m.connection.offline))
      })
      void adapter.connect()
    })
    return () => { cancelled = true; unsubscribeFrame(); unsubscribeStatus(); void adapter.disconnect() }
  }, [m.connection.offline, m.connection.waiting])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key.toLowerCase() === 'l') setView('live')
      if (event.key.toLowerCase() === 'a') setView('analyze')
      if (event.key.toLowerCase() === 'f') setView('fuel')
      if (event.key.toLowerCase() === 's') setView('strategy')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const openReplay = () => { setDemoRunning(false); setView('live') }
    window.addEventListener('apex:open-replay', openReplay)
    return () => window.removeEventListener('apex:open-replay', openReplay)
  }, [])

  const source = demoRunning ? 'demo' as const : realConnected ? 'live' as const : 'offline' as const
  const renderView = () => {
    switch (view) {
      case 'live': return <LiveView source={source} tick={tick} frame={liveFrame} measuredTrack={measuredTrack} connectionMessage={liveConnectionMessage} onStartDemo={() => setDemoRunning(true)} onTroubleshoot={() => { window.localStorage.setItem('apex:settings-section', 'diagnostics'); setView('settings'); window.queueMicrotask(() => window.dispatchEvent(new CustomEvent('apex:settings-section', { detail: 'diagnostics' }))) }} />
      case 'fuel': return <FuelCalculatorView live={liveFuel} />
      case 'analyze': return <AnalyzeView measuredTrack={measuredTrack} analysisSessions={analysisSessions} />
      case 'strategy': return <StrategyView />
      case 'setups': return <SetupsView onImport={importSetup} />
      case 'overlays': return <OverlaysView onOpenOverlay={openOverlay} />
      case 'feedback': return <FeedbackView />
      case 'settings': return <SettingsView />
      default: return <HomeView source={source} frame={liveFrame} onNavigate={setView} onImport={importTelemetry} />
    }
  }

  return (
    <>
      <FeedbackProvider view={view} source={source} onOpenView={() => setView('feedback')}>
        <Shell view={view} onViewChange={setView} connected={demoRunning || realConnected} demoRunning={demoRunning} onToggleDemo={toggleDemo}>
          {renderView()}
        </Shell>
      </FeedbackProvider>
      {onboarding && <Onboarding onComplete={completeOnboarding} onDemo={() => setDemoRunning(true)} />}
      {!onboarding && whatsNew.length > 0 && <WhatsNewDialog releases={whatsNew} onDone={() => acknowledgeWhatsNew(false)} onViewAll={() => acknowledgeWhatsNew(true)} />}
      <div className="toast-region" data-feedback-redact="notifications" aria-live="polite">
        {toasts.map((toast) => <div className="toast" key={toast.id}><div><Check size={15} /></div><span><strong>{toast.title}</strong><small>{toast.body}</small></span><button type="button" aria-label={appCopy.common.dismiss} onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X size={14} /></button></div>)}
      </div>
    </>
  )
}
