import {
  Check,
  ChevronRight,
  Database,
  FileCode2,
  FolderOpen,
  Gauge,
  HardDrive,
  HeartPulse,
  Info,
  LockKeyhole,
  Monitor,
  RefreshCw,
  ShieldCheck,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, CardHeader } from '../components/ui'

type DiagnosticResult = {
  installation: boolean
  sharedMemoryInterface: boolean
  telemetryFolder: boolean
  setupFolder: boolean
}

function StatusBadge({ value, available = 'Available' }: { value: boolean | null; available?: string }) {
  if (value === null) return <Badge tone="neutral">Not checked</Badge>
  return value ? <Badge tone="positive">{available}</Badge> : <Badge tone="warning">Unavailable</Badge>
}

function StatusIcon({ value }: { value: boolean | null }) {
  return <i className={value === null ? 'is-neutral' : value ? '' : 'is-warning'}>{value === null ? <Info size={13} /> : value ? <Check size={13} /> : <X size={13} />}</i>
}

export function SettingsView() {
  const [environment, setEnvironment] = useState<ApexEnvironment | null>(null)
  const [lmuPath, setLmuPath] = useState('')
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [activeSection, setActiveSection] = useState<'connection' | 'data' | 'about'>('connection')

  const inspectPath = async (installationPath: string) => {
    if (!window.apexDesktop || !installationPath) {
      setDiagnostics({ installation: false, sharedMemoryInterface: false, telemetryFolder: false, setupFolder: false })
      return
    }
    const root = installationPath.replace(/[\\/]+$/, '')
    const [installation, sharedMemoryInterface, telemetryFolder, setupFolder] = await Promise.all([
      window.apexDesktop.pathExists(root),
      window.apexDesktop.pathExists(`${root}\\Support\\SharedMemoryInterface`),
      window.apexDesktop.pathExists(`${root}\\UserData\\Telemetry`),
      window.apexDesktop.pathExists(`${root}\\UserData\\player\\Settings`),
    ])
    setDiagnostics({ installation, sharedMemoryInterface, telemetryFolder, setupFolder })
  }

  useEffect(() => {
    void window.apexDesktop?.getEnvironment().then((data) => {
      setEnvironment(data)
      if (data.defaultLmuPath) {
        setLmuPath(data.defaultLmuPath)
        void inspectPath(data.defaultLmuPath)
      }
    })
  }, [])

  const chooseLmu = async () => {
    const selected = await window.apexDesktop?.chooseDirectory('Choose the Le Mans Ultimate installation')
    if (!selected) return
    setLmuPath(selected)
    await inspectPath(selected)
  }

  const runDiagnostics = async () => {
    setDiagnosing(true)
    try {
      await inspectPath(lmuPath)
    } finally {
      setDiagnosing(false)
    }
  }

  const goTo = (section: 'connection' | 'data' | 'about') => {
    setActiveSection(section)
    document.getElementById(`settings-${section}`)?.scrollIntoView({ block: 'start' })
  }

  const ready = Boolean(environment?.platform === 'win32' && environment.bridgeAvailable && diagnostics?.installation && diagnostics.sharedMemoryInterface)
  const checked = diagnostics !== null
  const sharedMemoryReady = environment && diagnostics ? environment.bridgeAvailable && diagnostics.sharedMemoryInterface : null
  const healthTitle = ready ? 'LMU integration is ready' : checked ? 'LMU needs attention' : 'Check this PC before racing'
  const healthCopy = ready
    ? 'Apex can start its local bridge when a driving session appears.'
    : window.apexDesktop
      ? 'Run diagnostics or choose the LMU installation folder. Nothing is changed by this check.'
      : 'Live integration diagnostics are available in the packaged Windows desktop app.'

  return (
    <div className="view view--settings">
      <div className="page-heading page-heading--compact">
        <div><div className="eyebrow">Settings</div><h1>A transparent, local system.</h1><p>Connection health, storage, privacy and performance in one place.</p></div>
        <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => void runDiagnostics()} disabled={diagnosing}>
          {diagnosing ? 'Checking…' : 'Run diagnostics'}
        </Button>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button type="button" className={activeSection === 'connection' ? 'is-active' : ''} onClick={() => goTo('connection')}><Gauge size={16} /> Connection <ChevronRight size={14} /></button>
          <button type="button" className={activeSection === 'data' ? 'is-active' : ''} onClick={() => goTo('data')}><Database size={16} /> Data & storage <ChevronRight size={14} /></button>
          <button type="button" className={activeSection === 'about' ? 'is-active' : ''} onClick={() => goTo('about')}><Info size={16} /> About <ChevronRight size={14} /></button>
        </nav>

        <div className="settings-content">
          <Card className="health-card" id="settings-connection">
            <div className={`health-card__icon ${ready ? 'is-ready' : ''}`}>{ready ? <HeartPulse size={22} /> : <Info size={22} />}</div>
            <div>
              <Badge tone={ready ? 'positive' : checked ? 'warning' : 'neutral'} dot>{ready ? 'Ready' : checked ? 'Action needed' : 'Unchecked'}</Badge>
              <h2>{healthTitle}</h2><p>{healthCopy}</p>
            </div>
            <div className="health-card__stats">
              <span><strong>{environment?.platform === 'win32' ? 'Windows' : environment?.platform ?? 'Browser'}</strong>Platform</span>
              <span><strong>{environment?.bridgeAvailable ? 'Included' : '—'}</strong>Bridge</span>
              <span><strong>{diagnostics?.installation ? 'Found' : '—'}</strong>Game</span>
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="Game connection" title="Le Mans Ultimate" action={<StatusBadge value={diagnostics?.installation ?? null} available="Found" />} />
            <div className="path-field"><div><FolderOpen size={16} /><span><small>Installation folder</small><strong>{lmuPath || 'No folder selected'}</strong></span></div><Button variant="secondary" size="sm" onClick={() => void chooseLmu()} disabled={!window.apexDesktop}>Change</Button></div>
            <div className="integration-checks">
              <div><StatusIcon value={sharedMemoryReady} /><span><strong>Official shared-memory path</strong><small>Bundled bridge + game interface directory</small></span><StatusBadge value={sharedMemoryReady} available="Found" /></div>
              <div><StatusIcon value={diagnostics?.telemetryFolder ?? null} /><span><strong>Native DuckDB recordings</strong><small>Read-only inspection from UserData\Telemetry</small></span><StatusBadge value={diagnostics?.telemetryFolder ?? null} available="Folder found" /></div>
              <div><StatusIcon value={diagnostics?.setupFolder ?? null} /><span><strong>Setup directory</strong><small>Backups before every user-initiated write</small></span><StatusBadge value={diagnostics?.setupFolder ?? null} available="Folder found" /></div>
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="Acquisition" title="Known live-data profile" action={<Badge tone="neutral">50 Hz</Badge>} />
            <div className="setting-row setting-row--stacked"><div><strong>Official shared memory</strong><span>The bridge requests a fixed 50 Hz update loop. Unsupported or absent fields remain unknown instead of being estimated.</span></div></div>
            <div className="sample-estimate"><HardDrive size={15} /><span>Continuous live-session recording</span><strong>Not enabled in alpha</strong></div>
          </Card>

          <Card className="privacy-card">
            <CardHeader eyebrow="Privacy" title="Nothing leaves this computer" action={<LockKeyhole size={20} />} />
            <div className="privacy-architecture">
              <div><Monitor size={18} /><span><strong>Le Mans Ultimate</strong><small>Local process</small></span></div><ChevronRight size={14} /><div><FileCode2 size={18} /><span><strong>Apex bridge</strong><small>Local process + IPC</small></span></div><ChevronRight size={14} /><div><Database size={18} /><span><strong>Your files</strong><small>Local storage</small></span></div>
            </div>
            <div className="privacy-facts"><span><ShieldCheck size={14} /> No account required</span><span><WifiOff size={14} /> Works fully offline</span><span><LockKeyhole size={14} /> No analytics or tracking</span></div>
          </Card>

          <Card id="settings-data">
            <CardHeader eyebrow="Local storage" title="Apex data folder" action={<Badge tone="neutral">Local only</Badge>} />
            <div className="path-field"><div><Database size={16} /><span><small>Electron user-data directory</small><strong>{environment?.userDataPath ?? 'Available in the desktop app'}</strong></span></div><Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={() => void window.apexDesktop?.openDataFolder()} disabled={!window.apexDesktop}>Open folder</Button></div>
          </Card>

          <Card className="about-card" id="settings-about">
            <div className="about-card__mark">A</div><div><strong>Apex {environment?.version ?? '0.1.0-alpha'}</strong><span>GPL-3.0-or-later · Unofficial community software</span></div><Badge tone="accent">Free software</Badge>
          </Card>
        </div>
      </div>
    </div>
  )
}
