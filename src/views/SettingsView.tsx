import {
  Check,
  BookOpen,
  ChevronRight,
  Database,
  FileCode2,
  Clipboard,
  Download,
  ExternalLink,
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
  executable: boolean
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
  const [report, setReport] = useState<ApexDiagnosticReport | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [activeSection, setActiveSection] = useState<'connection' | 'data' | 'about' | 'diagnostics'>(() => {
    const stored = window.localStorage.getItem('apex:settings-section')
    return stored === 'data' || stored === 'about' || stored === 'diagnostics' ? stored : 'connection'
  })
  const [discovery, setDiscovery] = useState<ApexLmuDiscovery | null>(null)
  const [updateState, setUpdateState] = useState<ApexUpdateState | null>(null)

  const inspectPath = async (installationPath: string) => {
    if (!window.apexDesktop || !installationPath) {
      setDiagnostics({ installation: false, executable: false, sharedMemoryInterface: false, telemetryFolder: false, setupFolder: false })
      return
    }
    const root = installationPath.replace(/[\\/]+$/, '')
    const [inspection, telemetryFolder, setupFolder] = await Promise.all([
      window.apexDesktop.inspectLmuPath(root),
      window.apexDesktop.pathExists(`${root}\\UserData\\Telemetry`),
      window.apexDesktop.pathExists(`${root}\\UserData\\player\\Settings`),
    ])
    setDiagnostics({ installation: inspection.status === 'found', executable: Boolean(inspection.executable), sharedMemoryInterface: Boolean(inspection.sharedMemoryPath), telemetryFolder, setupFolder })
  }

  useEffect(() => {
    void window.apexDesktop?.getEnvironment().then((data) => {
      setEnvironment(data)
      if (data.defaultLmuPath) {
        setLmuPath(data.defaultLmuPath)
        void inspectPath(data.defaultLmuPath)
      }
    })
    void window.apexDesktop?.getDiagnostics().then(setReport)
  }, [])

  useEffect(() => {
    const navigate = (event: Event) => {
      const section = (event as CustomEvent<string>).detail
      if (section === 'connection' || section === 'data' || section === 'about' || section === 'diagnostics') goTo(section)
    }
    window.addEventListener('apex:settings-section', navigate)
    return () => window.removeEventListener('apex:settings-section', navigate)
  }, [])

  useEffect(() => {
    if (!window.apexDesktop) return
    void window.apexDesktop.getUpdateState().then(setUpdateState)
    return window.apexDesktop.onUpdateState(setUpdateState)
  }, [])

  const autoDetectLmu = async () => {
    if (!window.apexDesktop) return
    setDiagnosing(true)
    try {
      const result = await window.apexDesktop.discoverLmu()
      setDiscovery(result)
      if (result.found) { setLmuPath(result.found.candidate); await inspectPath(result.found.candidate) }
    } finally { setDiagnosing(false) }
  }

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
      if (window.apexDesktop) setReport(await window.apexDesktop.runDiagnostics())
    } finally {
      setDiagnosing(false)
    }
  }

  const exportBundle = async () => {
    const result = await window.apexDesktop?.exportSupportBundle()
    if (result?.ok) setShowLogs(true)
  }

  const goTo = (section: 'connection' | 'data' | 'about' | 'diagnostics') => {
    setActiveSection(section)
    window.localStorage.setItem('apex:settings-section', section)
    window.scrollTo({ top: 0 })
    document.querySelector('.workspace__content')?.scrollTo({ top: 0 })
  }

  const ready = Boolean(environment?.platform === 'win32' && environment.bridgeAvailable && diagnostics?.installation)
  const checked = diagnostics !== null
  const sharedMemoryReady = environment && diagnostics ? environment.bridgeAvailable && diagnostics.installation : null
  const healthTitle = ready ? 'LMU integration is ready' : checked ? 'LMU needs attention' : 'Check this PC before racing'
  const healthCopy = ready
    ? 'Apex can start its local bridge when a driving session appears.'
    : window.apexDesktop
      ? 'Run diagnostics or choose the LMU installation folder. Nothing is changed by this check.'
      : 'Live integration diagnostics are available in the packaged Windows desktop app.'

  return (
    <div className="view view--settings">
      <div className="page-heading page-heading--compact">
        <div><div className="eyebrow">Settings</div><h1>A transparent, local system.</h1><p>Connection, storage, privacy and troubleshooting—one focused section at a time.</p></div>
        <Button variant="secondary" icon={<HeartPulse size={15} />} onClick={() => goTo('diagnostics')}>
          Troubleshoot
        </Button>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button type="button" className={activeSection === 'connection' ? 'is-active' : ''} onClick={() => goTo('connection')}><Gauge size={16} /> Connection <ChevronRight size={14} /></button>
          <button type="button" className={activeSection === 'data' ? 'is-active' : ''} onClick={() => goTo('data')}><Database size={16} /> Data & storage <ChevronRight size={14} /></button>
          <button type="button" className={activeSection === 'about' ? 'is-active' : ''} onClick={() => goTo('about')}><Info size={16} /> About <ChevronRight size={14} /></button>
          <button type="button" className={activeSection === 'diagnostics' ? 'is-active' : ''} onClick={() => goTo('diagnostics')}><HeartPulse size={16} /> Diagnostics <ChevronRight size={14} /></button>
        </nav>

        <div className="settings-content">
          {activeSection === 'about' && <>
          <Card className="update-card">
            <CardHeader eyebrow="Application updates" title={`Apex ${updateState?.currentVersion || environment?.version || ''}`} action={<Badge tone={updateState?.status === 'available' || updateState?.status === 'downloaded' ? 'accent' : updateState?.status === 'error' ? 'warning' : 'neutral'}>{updateState?.status?.replaceAll('-', ' ') || 'Loading'}</Badge>} />
            <div className="update-card__body"><div><strong>{updateState?.message || 'Reading update status…'}</strong><span>Windows installer updates come directly from the public GitHub release. Apex asks before downloading and again before restarting.</span></div><div className="update-card__actions">
              {(!updateState || ['idle', 'up-to-date', 'error'].includes(updateState.status)) && <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => void window.apexDesktop?.checkForUpdates()} disabled={!window.apexDesktop || updateState?.status === 'checking'}>Check now</Button>}
              {updateState?.status === 'available' && <Button size="sm" icon={<Download size={14} />} onClick={() => void window.apexDesktop?.downloadUpdate()}>Download {updateState.availableVersion}</Button>}
              {updateState?.status === 'downloaded' && <Button size="sm" onClick={() => void window.apexDesktop?.installUpdate()}>Restart and install</Button>}
              <Button variant="secondary" size="sm" icon={<ExternalLink size={13} />} onClick={() => void window.apexDesktop?.openReleases()}>Releases</Button>
            </div></div>
            {updateState?.progress && <div className="update-progress"><span style={{ width: `${Math.max(0, Math.min(100, updateState.progress.percent))}%` }} /><small>{Math.floor(updateState.progress.percent)}%</small></div>}
            {updateState?.releaseNotes && <details className="update-notes"><summary>What changed in {updateState.availableVersion}</summary><pre>{updateState.releaseNotes}</pre></details>}
            {updateState?.error && <details className="update-notes update-notes--error"><summary>Update error details</summary><pre>{updateState.error.code ? `${updateState.error.code}: ` : ''}{updateState.error.message}\n{updateState.error.stack}</pre><p>The portable ZIP cannot replace itself. Download the latest installer from Releases; it installs per-user without administrator rights and keeps Apex data.</p></details>}
          </Card>
          </>}

          {activeSection === 'connection' && <>
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
            <div className="path-field"><div><FolderOpen size={16} /><span><small>Installation folder</small><strong>{lmuPath || 'No folder selected'}</strong></span></div><Button variant="secondary" size="sm" onClick={() => void autoDetectLmu()} disabled={!window.apexDesktop || diagnosing}>Auto-detect</Button><Button variant="secondary" size="sm" onClick={() => void chooseLmu()} disabled={!window.apexDesktop}>Browse</Button></div>
            <div className="integration-checks">
              <div><StatusIcon value={sharedMemoryReady} /><span><strong>LMU executable or Steam manifest</strong><small>Steam app 2399420 · secondary libraries supported</small></span><StatusBadge value={sharedMemoryReady} available="Confirmed" /></div>
              <div><StatusIcon value={diagnostics?.sharedMemoryInterface ?? null} /><span><strong>Shared-memory support folder</strong><small>Useful layout signal; absence does not mean LMU is missing</small></span><StatusBadge value={diagnostics?.sharedMemoryInterface ?? null} available="Present" /></div>
              <div><StatusIcon value={diagnostics?.telemetryFolder ?? null} /><span><strong>Native DuckDB recordings</strong><small>Read-only inspection from UserData\Telemetry</small></span><StatusBadge value={diagnostics?.telemetryFolder ?? null} available="Folder found" /></div>
              <div><StatusIcon value={diagnostics?.setupFolder ?? null} /><span><strong>Setup directory</strong><small>Backups before every user-initiated write</small></span><StatusBadge value={diagnostics?.setupFolder ?? null} available="Folder found" /></div>
            </div>
            {discovery && <details className="discovery-details"><summary>Show automatic discovery log ({discovery.attempts.length} candidate paths)</summary><div>{discovery.attempts.map((attempt, index) => <section key={`${attempt.candidate}-${index}`}><strong>{attempt.candidate}</strong><span>{attempt.source} · {attempt.status}</span>{attempt.checks.map((check) => <small key={check.label} className={check.ok ? 'is-ok' : check.optional ? 'is-optional' : 'is-fail'}>{check.ok ? '✓' : check.optional ? '○' : '×'} {check.label}: {check.expected}</small>)}</section>)}<pre>{discovery.trace.join('\n')}</pre></div></details>}
          </Card>
          </>}

          {activeSection === 'diagnostics' &&
          <Card id="settings-diagnostics" className="diagnostics-card">
            <CardHeader eyebrow="Troubleshooting" title="Evidence, fixes and full error logs" action={<Badge tone={report?.checks.some((check) => check.status === 'fail') ? 'warning' : 'positive'}>{report ? `${report.checks.filter((check) => check.status === 'pass').length}/${report.checks.length} passed` : 'Not checked'}</Badge>} />
            <p className="diagnostics-intro">Checks are read-only. The bridge self-test does not need LMU and proves that the bundled executable and local protocol can start. A live connection still requires Windows, LMU running, and a drivable session.</p>
            <div className="diagnostic-actions">
              <Button icon={<RefreshCw size={14} />} onClick={() => void runDiagnostics()} disabled={!window.apexDesktop || diagnosing}>{diagnosing ? 'Running checks…' : 'Run all checks'}</Button>
              <Button variant="secondary" icon={<Download size={14} />} onClick={() => void exportBundle()} disabled={!window.apexDesktop}>Export support bundle</Button>
              <Button variant="secondary" icon={<FolderOpen size={14} />} onClick={() => void window.apexDesktop?.openLogsFolder()} disabled={!window.apexDesktop}>Open logs folder</Button>
            </div>
            {report && <div className="diagnostic-results">{report.checks.map((check) => <details key={check.id} className={`diagnostic-result is-${check.status}`} open={check.status !== 'pass'}>
              <summary><StatusIcon value={check.status === 'pass'} /><span><strong>{check.title}</strong><small>{check.summary}</small></span><Badge tone={check.status === 'pass' ? 'positive' : check.status === 'blocked' ? 'neutral' : 'warning'}>{check.status}</Badge></summary>
              {(check.fixes.length > 0 || check.details) && <div className="diagnostic-result__body">{check.fixes.length > 0 && <ol>{check.fixes.map((fix) => <li key={fix}>{fix}</li>)}</ol>}{check.details && <pre>{check.details}</pre>}</div>}
            </details>)}</div>}
            <div className="log-disclosure"><button type="button" className="text-button" onClick={() => setShowLogs((value) => !value)}>{showLogs ? 'Hide full logs' : 'Show full logs'}</button><span>Logs exclude telemetry frames and setup contents.</span></div>
            {showLogs && <div className="log-viewer"><div><strong>apex.log.jsonl</strong><Button variant="secondary" size="sm" icon={<Clipboard size={13} />} onClick={() => void navigator.clipboard.writeText(report?.logs || 'No logs recorded.')}>Copy</Button></div><pre>{report?.logs || 'No diagnostic events have been recorded yet.'}</pre></div>}
            <div className="support-privacy"><ShieldCheck size={15} /><span><strong>Safe to review before sending</strong>The JSON bundle contains app/system metadata, check results and Apex logs. Home paths and common secrets are redacted. It contains no telemetry frames, setup files, passwords, or account data.</span></div>
          </Card>
          }

          {activeSection === 'connection' &&
          <Card>
            <CardHeader eyebrow="Acquisition" title="Known live-data profile" action={<Badge tone="neutral">50 Hz</Badge>} />
            <div className="setting-row setting-row--stacked"><div><strong>Official shared memory</strong><span>The bridge requests a fixed 50 Hz update loop. Unsupported or absent fields remain unknown instead of being estimated.</span></div></div>
            <div className="sample-estimate"><HardDrive size={15} /><span>Continuous live-session recording</span><strong>Not enabled in alpha</strong></div>
          </Card>
          }

          {activeSection === 'data' && <>
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
          </>}

          {activeSection === 'about' &&
          <Card>
            <CardHeader eyebrow="Learning & setup" title="Revisit guidance whenever you need it" description="Onboarding and contextual tips are local preferences. Resetting them does not touch telemetry, setups, or logs." />
            <div className="diagnostic-actions"><Button variant="secondary" icon={<BookOpen size={14} />} onClick={() => { window.localStorage.removeItem('apex:onboarded'); window.location.reload() }}>Restart onboarding</Button><Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => { for (const key of Object.keys(window.localStorage)) if (key.startsWith('apex:discovered:')) window.localStorage.removeItem(key); window.localStorage.removeItem('apex:settings-section'); window.location.reload() }}>Reset view introductions</Button></div>
          </Card>}

          {activeSection === 'about' &&
          <Card className="about-card" id="settings-about">
            <div className="about-card__mark">A</div><div><strong>Apex {environment?.version ?? 'browser preview'}</strong><span>GPL-3.0-or-later · Unofficial community software</span></div><Badge tone="accent">Free software</Badge>
          </Card>
          }
        </div>
      </div>
    </div>
  )
}
