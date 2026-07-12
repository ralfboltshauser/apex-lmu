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
import { Badge, Button } from './components/ui'
import { HomeView } from './views/HomeView'
import { LiveView } from './views/LiveView'
import { AnalyzeView } from './views/AnalyzeView'
import { StrategyView } from './views/StrategyView'
import { SetupsView } from './views/SetupsView'
import { OverlaysView } from './views/OverlaysView'
import { SettingsView } from './views/SettingsView'
import { DesktopTelemetryAdapter, MockTelemetryAdapter, type TelemetryFrame } from './core'

type Toast = { id: number; title: string; body: string }

function Onboarding({ onComplete, onDemo }: { onComplete: () => void; onDemo: () => void }) {
  const [step, setStep] = useState(0)
  const [checking, setChecking] = useState(false)
  const [found, setFound] = useState(false)
  const [detectedPath, setDetectedPath] = useState('')
  const [detectionMessage, setDetectionMessage] = useState('Search common Steam library locations')

  const detect = async () => {
    setChecking(true)
    try {
      if (!window.apexDesktop) {
        setFound(false)
        setDetectionMessage('Automatic detection is available in the desktop app')
        return
      }
      const environment = await window.apexDesktop.getEnvironment()
      const exists = Boolean(environment.defaultLmuPath)
        && await window.apexDesktop.pathExists(`${environment.defaultLmuPath}\\Support\\SharedMemoryInterface`)
      setFound(exists)
      setDetectedPath(exists ? environment.defaultLmuPath : '')
      setDetectionMessage(exists ? environment.defaultLmuPath : 'Not found in the default Steam library')
    } finally {
      setChecking(false)
    }
  }

  const chooseInstallation = async () => {
    const selected = await window.apexDesktop?.chooseDirectory('Choose the Le Mans Ultimate installation')
    if (!selected) return
    const exists = await window.apexDesktop!.pathExists(`${selected.replace(/[\\/]+$/, '')}\\Support\\SharedMemoryInterface`)
    setFound(exists)
    setDetectedPath(exists ? selected : '')
    setDetectionMessage(exists ? selected : 'That folder is not accessible')
  }

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-label="Welcome to Apex">
      <div className="onboarding-modal">
        <div className="onboarding-modal__top">
          <div className="brand brand--onboarding">
            <div className="brand__mark" aria-hidden="true"><svg viewBox="0 0 28 28"><path d="M4 20.5 12.5 5h5L24 20.5h-5.2l-1.4-3.4H9.7l-1.8 3.4H4Z" /><path className="brand__cut" d="m11.6 13.4 2.8-5.2 2 5.2h-4.8Z" /></svg></div>
            <div><strong>Apex</strong><span>for LMU</span></div>
          </div>
          <button type="button" className="icon-button" aria-label="Close onboarding" onClick={onComplete}><X size={18} /></button>
        </div>

        <div className="onboarding-progress" aria-label={`Onboarding step ${step + 1} of 3`}>
          {[0, 1, 2].map((item) => <span key={item} className={item <= step ? 'is-active' : ''} />)}
        </div>

        {step === 0 && <div className="onboarding-step onboarding-step--welcome">
          <div className="onboarding-illustration">
            <div className="onboarding-illustration__rings"><span /><span /><span /><Gauge size={35} /></div>
            <div className="onboarding-illustration__card onboarding-illustration__card--one"><small>Fuel to finish</small><strong>43.1 L</strong><Badge tone="positive">+1.7 L</Badge></div>
            <div className="onboarding-illustration__card onboarding-illustration__card--two"><small>Biggest gain</small><strong>Les Combes</strong><span>0.31 s available</span></div>
          </div>
          <Badge tone="accent"><Sparkles size={12} /> Open race engineering</Badge>
          <h1>See the race more clearly.</h1>
          <p>Apex turns Le Mans Ultimate telemetry into live strategy, focused coaching, trustworthy setup guidance and a HUD that stays out of your way.</p>
          <div className="onboarding-principles"><span><ShieldCheck size={15} /> Fully local</span><span><Database size={15} /> Your data</span><span><HardDrive size={15} /> Open source</span></div>
          <Button onClick={() => setStep(1)}>Set up Apex <ArrowRight size={15} /></Button>
          <button type="button" className="text-button" onClick={() => { onDemo(); onComplete() }}>Explore the live demo first</button>
        </div>}

        {step === 1 && <div className="onboarding-step onboarding-step--connection">
          <div className="onboarding-step__icon"><FolderSearch size={25} /></div>
          <div className="eyebrow">Step 2 of 3</div><h1>Connect Le Mans Ultimate</h1><p>Apex looks for the Steam installation and verifies the official data interfaces. It does not inject code into the game.</p>
          <div className={`detection-card ${found ? 'is-found' : ''}`}>
            <div className="detection-card__icon">{found ? <Check size={20} /> : <Radio size={20} />}</div>
            <div><strong>{found ? 'Le Mans Ultimate found' : 'Automatic detection'}</strong><span>{found ? detectedPath : detectionMessage}</span></div>
            {!found && <Button variant="secondary" size="sm" onClick={() => void detect()}>{checking ? 'Searching…' : 'Detect'}</Button>}
            {found && <Badge tone="positive">Interface found</Badge>}
          </div>
          {!found && detectionMessage !== 'Search common Steam library locations' && window.apexDesktop && <button type="button" className="text-button" onClick={() => void chooseInstallation()}>Choose the installation folder</button>}
          <div className="connection-facts"><div><i><Check size={12} /></i><span><strong>Live telemetry</strong>Official shared memory</span></div><div><i><Check size={12} /></i><span><strong>Recorded sessions</strong>Native DuckDB files</span></div><div><i><Check size={12} /></i><span><strong>Setup management</strong>Backups before every write</span></div></div>
          <div className="onboarding-step__actions"><Button variant="secondary" onClick={() => setStep(0)}>Back</Button><Button disabled={!found} onClick={() => setStep(2)}>Continue <ArrowRight size={15} /></Button></div>
        </div>}

        {step === 2 && <div className="onboarding-step onboarding-step--ready">
          <div className="ready-check"><Check size={34} /></div><Badge tone="positive">Ready</Badge><h1>That’s all Apex needs.</h1><p>Start LMU and drive. Your first lap will appear automatically, with sensible defaults already selected.</p>
          <div className="ready-summary"><div><span>Data source</span><strong>Official · 50 Hz</strong></div><div><span>Storage</span><strong>Local only</strong></div><div><span>Overlay layout</span><strong>Essential</strong></div></div>
          <Button onClick={onComplete}>Open command center <ArrowRight size={15} /></Button>
          <button type="button" className="text-button" onClick={() => { onDemo(); onComplete() }}>Open with demo telemetry</button>
        </div>}
      </div>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<ViewId>('home')
  const [demoRunning, setDemoRunning] = useState(false)
  const [tick, setTick] = useState(0)
  const [onboarding, setOnboarding] = useState(() => window.localStorage.getItem('apex:onboarded') !== 'true')
  const [toasts, setToasts] = useState<Toast[]>([])
  const demoAdapter = useRef(new MockTelemetryAdapter({ autoTick: true, stepMs: 80, seed: 963 }))
  const desktopAdapter = useRef(new DesktopTelemetryAdapter())
  const demoRunningRef = useRef(false)
  const viewRef = useRef<ViewId>('home')
  const [realConnected, setRealConnected] = useState(false)
  const [liveFrame, setLiveFrame] = useState<TelemetryFrame | null>(null)
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

  const toggleDemo = () => {
    setDemoRunning((current) => {
      addToast(current ? 'Demo session stopped' : 'Demo telemetry connected', current ? 'Apex is waiting for Le Mans Ultimate.' : 'Spa race data is now streaming locally at 50 Hz.')
      return !current
    })
  }

  const importTelemetry = async () => {
    const selected = await window.apexDesktop?.chooseFile({
      title: 'Import an LMU telemetry recording',
      filters: [{ name: 'LMU DuckDB telemetry', extensions: ['duckdb', 'db'] }],
    })
    if (selected) {
      try {
        const inspection = await window.apexDesktop!.inspectTelemetry(selected)
        const track = inspection.metadata.TrackName || 'LMU session'
        addToast('LMU recording inspected', `${track} · ${inspection.lapTimes.length} indexed laps · ${inspection.channels.length} channels. Session ingestion is not enabled yet.`)
      } catch (error) {
        addToast('Unable to inspect recording', error instanceof Error ? error.message : String(error))
      }
    }
    if (!window.apexDesktop) addToast('Desktop import is ready', 'File selection is available in the packaged Apex app.')
  }

  const importSetup = async () => {
    if (!window.apexDesktop) {
      addToast('Desktop setup installer', 'Setup installation is available in the packaged Apex app.')
      return
    }
    const sourcePath = await window.apexDesktop.chooseFile({ title: 'Choose an LMU setup', filters: [{ name: 'LMU setup', extensions: ['svm'] }] })
    if (!sourcePath) return
    const targetDirectory = await window.apexDesktop.chooseDirectory('Choose the matching track folder inside UserData/player/Settings')
    if (!targetDirectory) return
    try {
      const result = await window.apexDesktop.installSetup({ sourcePath, targetDirectory })
      addToast('Setup installed safely', result.backupPath ? 'The previous file was backed up first.' : result.destination.split(/[\\/]/).pop() ?? result.destination)
    } catch (error) {
      addToast('Setup was not installed', error instanceof Error ? error.message : String(error))
    }
  }

  const openOverlay = () => {
    if (!window.apexDesktop) { addToast('Desktop overlay window', 'The transparent overlay opens from the packaged Apex app.'); return }
    void window.apexDesktop.openOverlay()
      .then((result) => addToast(result.ok ? 'Overlay window opened' : 'Overlay did not open', result.ok ? 'It is always-on-top and click-through while you race.' : 'Check desktop diagnostics and try again.'))
      .catch((error) => addToast('Overlay did not open', error instanceof Error ? error.message : String(error)))
  }

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
    const adapter = desktopAdapter.current
    let cancelled = false
    let unsubscribeFrame = () => {}
    let unsubscribeStatus = () => {}
    void window.apexDesktop?.getEnvironment().then((environment) => {
      if (cancelled || environment.platform !== 'win32') return
      unsubscribeFrame = adapter.subscribe((frame) => {
        if (!demoRunningRef.current && (viewRef.current === 'home' || viewRef.current === 'live')) { setLiveFrame(frame); setTick(frame.sequence) }
      })
      unsubscribeStatus = adapter.subscribeStatus((status) => setRealConnected(status.state === 'connected' && status.framesReceived > 0))
      void adapter.connect()
    })
    return () => { cancelled = true; unsubscribeFrame(); unsubscribeStatus(); void adapter.disconnect() }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key.toLowerCase() === 'l') setView('live')
      if (event.key.toLowerCase() === 'a') setView('analyze')
      if (event.key.toLowerCase() === 's') setView('strategy')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const renderView = () => {
    const source = demoRunning ? 'demo' as const : realConnected ? 'live' as const : 'offline' as const
    switch (view) {
      case 'live': return <LiveView source={source} tick={tick} frame={liveFrame} onStartDemo={() => setDemoRunning(true)} />
      case 'analyze': return <AnalyzeView />
      case 'strategy': return <StrategyView />
      case 'setups': return <SetupsView onImport={importSetup} />
      case 'overlays': return <OverlaysView onOpenOverlay={openOverlay} />
      case 'settings': return <SettingsView />
      default: return <HomeView source={source} frame={liveFrame} onNavigate={setView} onImport={importTelemetry} />
    }
  }

  return (
    <>
      <Shell view={view} onViewChange={setView} connected={demoRunning || realConnected} demoRunning={demoRunning} onToggleDemo={toggleDemo}>
        {renderView()}
      </Shell>
      {onboarding && <Onboarding onComplete={completeOnboarding} onDemo={() => setDemoRunning(true)} />}
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => <div className="toast" key={toast.id}><div><Check size={15} /></div><span><strong>{toast.title}</strong><small>{toast.body}</small></span><button type="button" aria-label="Dismiss" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X size={14} /></button></div>)}
      </div>
    </>
  )
}
