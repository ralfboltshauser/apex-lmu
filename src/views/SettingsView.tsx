import {
  Check,
  BookOpen,
  ChevronRight,
  Database,
  FileCode2,
  Clipboard,
  Circle,
  Download,
  ExternalLink,
  FolderOpen,
  Gauge,
  HardDrive,
  HeartPulse,
  Info,
  LockKeyhole,
  Mail,
  Languages,
  Monitor,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, CardHeader, Segmented } from '../components/ui'
import { ReleaseHistory } from '../components/ReleaseNotes'
import { useI18n, useMessages } from '../i18n'
import { formatMessage, settingsMessages } from '../i18n/view-resources'

const LMU_PATH_KEY = 'apex:lmu-installation-path'

function recordingSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function recordingTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

type DiagnosticResult = {
  installation: boolean
  executable: boolean
  sharedMemoryInterface: boolean
  telemetryFolder: boolean
  setupFolder: boolean
}

function StatusBadge({ value, available }: { value: boolean | null; available?: string }) {
  const m = useMessages(settingsMessages)
  if (value === null) return <Badge tone="neutral">{m.status.notChecked}</Badge>
  return value ? <Badge tone="positive">{available ?? m.status.available}</Badge> : <Badge tone="warning">{m.status.unavailable}</Badge>
}

function StatusIcon({ value }: { value: boolean | null }) {
  return <i className={value === null ? 'is-neutral' : value ? '' : 'is-warning'}>{value === null ? <Info size={13} /> : value ? <Check size={13} /> : <X size={13} />}</i>
}

export function SettingsView() {
  const m = useMessages(settingsMessages)
  const { language, setLanguage } = useI18n()
  const [environment, setEnvironment] = useState<ApexEnvironment | null>(null)
  const [lmuPath, setLmuPath] = useState(() => window.localStorage.getItem(LMU_PATH_KEY) || '')
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [report, setReport] = useState<ApexDiagnosticReport | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [sharing, setSharing] = useState<'copy' | 'email' | 'save' | null>(null)
  const [supportFeedback, setSupportFeedback] = useState('')
  const [activeSection, setActiveSection] = useState<'connection' | 'data' | 'about' | 'diagnostics'>(() => {
    const stored = window.localStorage.getItem('apex:settings-section')
    return stored === 'data' || stored === 'about' || stored === 'diagnostics' ? stored : 'connection'
  })
  const [discovery, setDiscovery] = useState<ApexLmuDiscovery | null>(null)
  const [updateState, setUpdateState] = useState<ApexUpdateState | null>(null)
  const [recording, setRecording] = useState<ApexRecordingState>({ status: 'idle', path: null, frames: 0, bytes: 0, durationSeconds: 0, message: '' })
  const [lifetime, setLifetime] = useState<ApexLifetimeStats | null>(null)
  const [lifetimeHealth, setLifetimeHealth] = useState<ApexLifetimeStatsHealth | null>(null)
  const [lifetimeBackup, setLifetimeBackup] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [lifetimeBackupMessage, setLifetimeBackupMessage] = useState('')
  const [overlayDisplays, setOverlayDisplays] = useState<ApexDisplay[] | null>(null)
  const [overlayRuntime, setOverlayRuntime] = useState<ApexOverlayState | null>(null)

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
      const savedPath = window.localStorage.getItem(LMU_PATH_KEY)
      if (savedPath) { setLmuPath(savedPath); void inspectPath(savedPath); return }
      void window.apexDesktop?.discoverLmu().then((result) => {
        setDiscovery(result)
        if (result.found) { window.localStorage.setItem(LMU_PATH_KEY, result.found.candidate); setLmuPath(result.found.candidate); void inspectPath(result.found.candidate) }
        else if (data.defaultLmuPath) { setLmuPath(data.defaultLmuPath); void inspectPath(data.defaultLmuPath) }
      })
    })
    void window.apexDesktop?.getDiagnostics().then(setReport)
    void window.apexDesktop?.getLifetimeStats().then(setLifetime)
    void window.apexDesktop?.getLifetimeStatsHealth().then(setLifetimeHealth)
  }, [])

  const backupLifetime = async () => {
    if (!window.apexDesktop) return
    setLifetimeBackup('working'); setLifetimeBackupMessage('')
    try {
      const result = await window.apexDesktop.backupLifetimeStats()
      if (result.ok && result.backup) { setLifetimeBackup('done'); setLifetimeBackupMessage(formatMessage(m.data.lifetime.backupCreated, { file: result.backup.file })); setLifetimeHealth(await window.apexDesktop.getLifetimeStatsHealth()) }
      else { setLifetimeBackup('error'); setLifetimeBackupMessage(formatMessage(m.data.lifetime.backupFailed, { error: result.reason || m.data.lifetime.unknown })) }
    } catch (error) {
      setLifetimeBackup('error')
      setLifetimeBackupMessage(formatMessage(m.data.lifetime.backupFailed, { error: error instanceof Error ? error.message : m.data.lifetime.unknown }))
    }
  }

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

  useEffect(() => {
    if (!window.apexDesktop) return
    void window.apexDesktop.getRecordingState().then(setRecording)
    return window.apexDesktop.onRecordingState(setRecording)
  }, [])

  useEffect(() => {
    if (!window.apexDesktop) return
    void window.apexDesktop.getDisplays().then(setOverlayDisplays).catch(() => setOverlayDisplays([]))
    void window.apexDesktop.getOverlayState().then(setOverlayRuntime)
    const stopDisplays = window.apexDesktop.onDisplaysChanged(setOverlayDisplays)
    const stopState = window.apexDesktop.onOverlayState(setOverlayRuntime)
    return () => { stopDisplays(); stopState() }
  }, [])

  const autoDetectLmu = async () => {
    if (!window.apexDesktop) return
    setDiagnosing(true)
    try {
      const result = await window.apexDesktop.discoverLmu()
      setDiscovery(result)
      if (result.found) { window.localStorage.setItem(LMU_PATH_KEY, result.found.candidate); setLmuPath(result.found.candidate); await inspectPath(result.found.candidate) }
    } finally { setDiagnosing(false) }
  }

  const chooseLmu = async () => {
    const selected = await window.apexDesktop?.chooseDirectory(m.chooseInstallation)
    if (!selected) return
    setLmuPath(selected)
    await inspectPath(selected)
    const inspection = await window.apexDesktop?.inspectLmuPath(selected)
    if (inspection?.status === 'found') window.localStorage.setItem(LMU_PATH_KEY, inspection.candidate)
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
    if (!window.apexDesktop) return
    setSharing('save')
    setSupportFeedback('')
    try {
      const result = await window.apexDesktop.exportSupportBundle()
      if (result.ok) setSupportFeedback(m.diagnostics.savedFeedback)
    } catch (error) {
      setSupportFeedback(formatMessage(m.diagnostics.saveFailed, { error: error instanceof Error ? error.message : String(error) }))
    } finally { setSharing(null) }
  }

  const copySupport = async () => {
    if (!window.apexDesktop) return
    setSharing('copy')
    setSupportFeedback('')
    try {
      await window.apexDesktop.copySupportBundle()
      setSupportFeedback(m.diagnostics.copiedFeedback)
    } catch (error) {
      setSupportFeedback(formatMessage(m.diagnostics.copyFailed, { error: error instanceof Error ? error.message : String(error) }))
    } finally { setSharing(null) }
  }

  const emailSupport = async () => {
    if (!window.apexDesktop) return
    setSharing('email')
    setSupportFeedback('')
    try {
      const result = await window.apexDesktop.emailSupportBundle()
      setSupportFeedback(result.includedInBody
        ? m.diagnostics.emailIncluded
        : m.diagnostics.emailCopied)
    } catch (error) {
      setSupportFeedback(formatMessage(m.diagnostics.emailFailed, { error: error instanceof Error ? error.message : String(error) }))
    } finally { setSharing(null) }
  }

  const goTo = (section: 'connection' | 'data' | 'about' | 'diagnostics') => {
    setActiveSection(section)
    window.localStorage.setItem('apex:settings-section', section)
    window.scrollTo({ top: 0 })
    document.querySelector('.workspace__content')?.scrollTo({ top: 0 })
  }

  const startRecording = async () => {
    try {
      const result = await window.apexDesktop?.startRecording()
      if (result && !result.ok && !result.canceled) setRecording((current) => ({ ...current, status: 'error', message: result.reason || m.data.recorder.failed }))
    } catch (error) { setRecording((current) => ({ ...current, status: 'error', message: error instanceof Error ? error.message : m.data.recorder.failed })) }
  }

  const startReplay = async () => {
    try {
      const result = await window.apexDesktop?.startReplay()
      if (result && !result.ok && !result.canceled) setRecording((current) => ({ ...current, status: 'error', message: result.reason || m.data.recorder.failed }))
      if (result?.ok) window.dispatchEvent(new Event('apex:open-replay'))
    } catch (error) { setRecording((current) => ({ ...current, status: 'error', message: error instanceof Error ? error.message : m.data.recorder.failed })) }
  }

  const ready = Boolean(environment?.platform === 'win32' && environment.bridgeAvailable && diagnostics?.installation)
  const checked = diagnostics !== null
  const sharedMemoryReady = environment && diagnostics ? environment.bridgeAvailable && diagnostics.installation : null
  const healthTitle = ready ? m.health.readyTitle : checked ? m.health.attentionTitle : m.health.uncheckedTitle
  const healthCopy = ready
    ? m.health.readyCopy
    : window.apexDesktop
      ? m.health.attentionCopy
      : m.health.browserCopy

  return (
    <div className="view view--settings">
      <div className="page-heading page-heading--compact">
        <div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.heading.title}</h1><p>{m.heading.description}</p></div>
        <Button variant="secondary" icon={<HeartPulse size={15} />} onClick={() => goTo('diagnostics')}>
          {m.heading.troubleshoot}
        </Button>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label={m.nav.aria}>
          <button type="button" className={activeSection === 'connection' ? 'is-active' : ''} onClick={() => goTo('connection')}><Gauge size={16} /> {m.nav.connection} <ChevronRight size={14} /></button>
          <button type="button" className={activeSection === 'data' ? 'is-active' : ''} onClick={() => goTo('data')}><Database size={16} /> {m.nav.data} <ChevronRight size={14} /></button>
          <button type="button" className={activeSection === 'about' ? 'is-active' : ''} onClick={() => goTo('about')}><Info size={16} /> {m.nav.about} <ChevronRight size={14} /></button>
          <button type="button" className={activeSection === 'diagnostics' ? 'is-active' : ''} onClick={() => goTo('diagnostics')}><HeartPulse size={16} /> {m.nav.diagnostics} <ChevronRight size={14} /></button>
        </nav>

        <div className="settings-content">
          {activeSection === 'about' && <>
          <Card className="update-card">
            <CardHeader eyebrow={m.updates.eyebrow} title={`Apex ${updateState?.currentVersion || environment?.version || ''}`} action={<Badge tone={updateState?.status === 'available' || updateState?.status === 'downloaded' ? 'accent' : updateState?.status === 'error' ? 'warning' : 'neutral'}>{updateState ? ({ development: m.updates.status.development, unsupported: m.updates.status.unsupported, idle: m.updates.status.idle, checking: m.updates.status.checking, available: m.updates.status.available, 'up-to-date': m.updates.status.upToDate, downloading: m.updates.status.downloading, downloaded: m.updates.status.downloaded, error: m.updates.status.error } as const)[updateState.status] : m.updates.loading}</Badge>} />
            <div className="update-card__body"><div><strong>{updateState?.message || m.updates.reading}</strong><span>{m.updates.description}</span></div><div className="update-card__actions">
              {(!updateState || ['idle', 'up-to-date', 'error'].includes(updateState.status)) && <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => void window.apexDesktop?.checkForUpdates()} disabled={!window.apexDesktop || updateState?.status === 'checking'}>{m.updates.checkNow}</Button>}
              {updateState?.status === 'available' && <Button size="sm" icon={<Download size={14} />} onClick={() => void window.apexDesktop?.downloadUpdate()}>{formatMessage(m.updates.download, { version: updateState.availableVersion ?? '' })}</Button>}
              {updateState?.status === 'downloaded' && <Button size="sm" onClick={() => void window.apexDesktop?.installUpdate()}>{m.updates.restartInstall}</Button>}
              <Button variant="secondary" size="sm" icon={<ExternalLink size={13} />} onClick={() => void window.apexDesktop?.openReleases()}>{m.updates.releases}</Button>
            </div></div>
            {updateState?.progress && <div className="update-progress"><span style={{ width: `${Math.max(0, Math.min(100, updateState.progress.percent))}%` }} /><small>{Math.floor(updateState.progress.percent)}{m.units.percent}</small></div>}
            {updateState?.releaseNotes && <details className="update-notes"><summary>{formatMessage(m.updates.changed, { version: updateState.availableVersion ?? '' })}</summary><pre>{updateState.releaseNotes}</pre></details>}
            {updateState?.error && <details className="update-notes update-notes--error" data-feedback-redact="diagnostic-details"><summary>{m.updates.errorDetails}</summary><pre>{updateState.error.code ? `${updateState.error.code}: ` : ''}{updateState.error.message}\n{updateState.error.stack}</pre><p>{m.updates.portableCopy}</p></details>}
          </Card>
          </>}

          {activeSection === 'connection' && <>
          <Card className="health-card" id="settings-connection">
            <div className={`health-card__icon ${ready ? 'is-ready' : ''}`}>{ready ? <HeartPulse size={22} /> : <Info size={22} />}</div>
            <div>
              <Badge tone={ready ? 'positive' : checked ? 'warning' : 'neutral'} dot>{ready ? m.status.ready : checked ? m.status.actionNeeded : m.status.unchecked}</Badge>
              <h2>{healthTitle}</h2><p>{healthCopy}</p>
            </div>
            <div className="health-card__stats">
              <span><strong>{environment?.platform === 'win32' ? m.health.windows : environment?.platform ?? m.health.browser}</strong>{m.health.platform}</span>
              <span><strong>{environment?.bridgeAvailable ? m.status.included : '—'}</strong>{m.health.bridge}</span>
              <span><strong>{diagnostics?.installation ? m.status.found : '—'}</strong>{m.health.game}</span>
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow={m.connection.gameEyebrow} title={m.connection.gameTitle} action={<StatusBadge value={diagnostics?.installation ?? null} available={m.status.found} />} />
            <div className="path-field" data-feedback-redact="local-path"><div><FolderOpen size={16} /><span><small>{m.connection.installationFolder}</small><strong>{lmuPath || m.connection.noneSelected}</strong></span></div><Button variant="secondary" size="sm" onClick={() => void autoDetectLmu()} disabled={!window.apexDesktop || diagnosing}>{m.connection.autoDetect}</Button><Button variant="secondary" size="sm" onClick={() => void chooseLmu()} disabled={!window.apexDesktop}>{m.connection.browse}</Button></div>
            <div className="integration-checks">
              <div><StatusIcon value={sharedMemoryReady} /><span><strong>{m.connection.executable}</strong><small>{m.connection.executableHint}</small></span><StatusBadge value={sharedMemoryReady} available={m.status.confirmed} /></div>
              <div><StatusIcon value={diagnostics?.sharedMemoryInterface ?? null} /><span><strong>{m.connection.sharedMemory}</strong><small>{m.connection.sharedMemoryHint}</small></span><StatusBadge value={diagnostics?.sharedMemoryInterface ?? null} available={m.status.present} /></div>
              <div><StatusIcon value={diagnostics?.telemetryFolder ?? null} /><span><strong>{m.connection.telemetry}</strong><small>{m.connection.telemetryHint}</small></span><StatusBadge value={diagnostics?.telemetryFolder ?? null} available={m.status.folderFound} /></div>
              <div><StatusIcon value={diagnostics?.setupFolder ?? null} /><span><strong>{m.connection.setupDirectory}</strong><small>{m.connection.setupHint}</small></span><StatusBadge value={diagnostics?.setupFolder ?? null} available={m.status.folderFound} /></div>
            </div>
            {discovery && <details className="discovery-details" data-feedback-redact="local-path"><summary>{formatMessage(m.connection.discovery, { count: discovery.attempts.length })}</summary><div>{discovery.attempts.map((attempt, index) => <section key={`${attempt.candidate}-${index}`}><strong>{attempt.candidate}</strong><span>{attempt.source} · {attempt.status}</span>{attempt.checks.map((check) => <small key={check.label} className={check.ok ? 'is-ok' : check.optional ? 'is-optional' : 'is-fail'}>{check.ok ? '✓' : check.optional ? '○' : '×'} {check.label}: {check.expected}</small>)}</section>)}<pre>{discovery.trace.join('\n')}</pre></div></details>}
          </Card>
          <Card>
            <CardHeader eyebrow={m.overlay.eyebrow} title={m.overlay.title} action={<Badge tone={overlayDisplays?.length ? 'positive' : overlayDisplays ? 'warning' : 'neutral'}>{overlayDisplays ? formatMessage(m.overlay.displayCount, { count: overlayDisplays.length }) : m.status.notChecked}</Badge>} />
            <p className="diagnostics-intro">{m.overlay.copy}</p>
            <div className="integration-checks">
              <div><StatusIcon value={overlayDisplays ? overlayDisplays.length > 0 : null} /><span><strong>{m.overlay.displays}</strong><small>{m.overlay.displaysHint}</small></span><StatusBadge value={overlayDisplays ? overlayDisplays.length > 0 : null} available={overlayDisplays ? formatMessage(m.overlay.displayCount, { count: overlayDisplays.length }) : undefined} /></div>
              <div><StatusIcon value={overlayRuntime ? overlayRuntime.status !== 'error' : null} /><span><strong>{m.overlay.window}</strong><small>{overlayRuntime?.displayId ? formatMessage(m.overlay.target, { display: overlayDisplays?.find((display) => display.id === overlayRuntime.displayId)?.label || overlayRuntime.displayId }) : m.overlay.windowHint}</small></span><Badge tone={overlayRuntime?.status === 'ready' ? 'positive' : overlayRuntime?.status === 'error' ? 'warning' : 'neutral'}>{overlayRuntime ? m.overlay.state[overlayRuntime.status] : m.status.notChecked}</Badge></div>
            </div>
            <div className="support-privacy"><Info size={15} /><span><strong>{m.overlay.fullscreen}</strong></span></div>
          </Card>
          </>}

          {activeSection === 'diagnostics' &&
          <Card id="settings-diagnostics" className="diagnostics-card">
            <CardHeader eyebrow={m.diagnostics.eyebrow} title={m.diagnostics.title} action={<Badge tone={report?.checks.some((check) => check.status === 'fail') ? 'warning' : 'positive'}>{report ? formatMessage(m.diagnostics.passed, { passed: report.checks.filter((check) => check.status === 'pass').length, total: report.checks.length }) : m.diagnostics.notChecked}</Badge>} />
            <p className="diagnostics-intro">{m.diagnostics.intro}</p>
            <div className="diagnostic-actions">
              <Button icon={<RefreshCw size={14} />} onClick={() => void runDiagnostics()} disabled={!window.apexDesktop || diagnosing}>{diagnosing ? m.diagnostics.running : m.diagnostics.run}</Button>
              <Button variant="secondary" icon={<Mail size={14} />} onClick={() => void emailSupport()} disabled={!window.apexDesktop || sharing !== null}>{sharing === 'email' ? m.diagnostics.openingEmail : m.diagnostics.emailLogs}</Button>
              <Button variant="secondary" icon={<Clipboard size={14} />} onClick={() => void copySupport()} disabled={!window.apexDesktop || sharing !== null}>{sharing === 'copy' ? m.diagnostics.copying : m.diagnostics.copyLogs}</Button>
              <Button variant="secondary" icon={<Download size={14} />} onClick={() => void exportBundle()} disabled={!window.apexDesktop || sharing !== null}>{sharing === 'save' ? m.diagnostics.saving : m.diagnostics.saveFile}</Button>
              <Button variant="secondary" icon={<FolderOpen size={14} />} onClick={() => void window.apexDesktop?.openLogsFolder()} disabled={!window.apexDesktop}>{m.diagnostics.openLogs}</Button>
            </div>
            {supportFeedback && <p className="diagnostics-intro" role="status" aria-live="polite">{supportFeedback}</p>}
            {report && <div className="diagnostic-results">{report.checks.map((check) => <details key={check.id} className={`diagnostic-result is-${check.status}`} open={check.status !== 'pass'}>
              <summary><StatusIcon value={check.status === 'pass'} /><span><strong>{check.title}</strong><small>{check.summary}</small></span><Badge tone={check.status === 'pass' ? 'positive' : check.status === 'blocked' ? 'neutral' : 'warning'}>{check.status === 'pass' ? m.diagnostics.statusPass : check.status === 'blocked' ? m.diagnostics.statusBlocked : m.diagnostics.statusFail}</Badge></summary>
              {(check.fixes.length > 0 || check.details) && <div className="diagnostic-result__body">{check.fixes.length > 0 && <ol>{check.fixes.map((fix) => <li key={fix}>{fix}</li>)}</ol>}{check.details && <pre>{check.details}</pre>}</div>}
            </details>)}</div>}
            <div className="log-disclosure"><button type="button" className="text-button" onClick={() => setShowLogs((value) => !value)}>{showLogs ? m.diagnostics.hideLogs : m.diagnostics.showLogs}</button><span>{m.diagnostics.logsExcluded}</span></div>
            {showLogs && <div className="log-viewer"><div><strong>{m.diagnostics.logName}</strong><Button variant="secondary" size="sm" icon={<Clipboard size={13} />} onClick={() => void copySupport()}>{m.diagnostics.copyLogs}</Button></div><pre>{report?.logs || m.diagnostics.noEvents}</pre></div>}
            <div className="support-privacy"><ShieldCheck size={15} /><span><strong>{m.diagnostics.safe}</strong>{m.diagnostics.safeCopy}</span></div>
          </Card>
          }

          {activeSection === 'connection' &&
          <Card>
            <CardHeader eyebrow={m.connection.acquisition} title={m.connection.profile} action={<Badge tone="neutral">{m.connection.sampleRate}</Badge>} />
            <div className="setting-row setting-row--stacked"><div><strong>{m.connection.officialMemory}</strong><span>{m.connection.officialMemoryHint}</span></div></div>
            <div className="sample-estimate"><HardDrive size={15} /><span>{m.connection.recording}</span><strong>{m.connection.alphaDisabled}</strong></div>
          </Card>
          }

          {activeSection === 'data' && <>
          <Card className="privacy-card">
            <CardHeader eyebrow={m.data.privacy} title={m.data.privateTitle} action={<LockKeyhole size={20} />} />
            <div className="privacy-architecture">
              <div><Monitor size={18} /><span><strong>{m.data.lmu}</strong><small>{m.data.localProcess}</small></span></div><ChevronRight size={14} /><div><FileCode2 size={18} /><span><strong>{m.data.bridge}</strong><small>{m.data.localIpc}</small></span></div><ChevronRight size={14} /><div><Database size={18} /><span><strong>{m.data.yourFiles}</strong><small>{m.data.localStorage}</small></span></div>
            </div>
            <div className="privacy-facts"><span><ShieldCheck size={14} /> {m.data.noAccount}</span><span><WifiOff size={14} /> {m.data.offline}</span><span><LockKeyhole size={14} /> {m.data.noTracking}</span></div>
          </Card>

          <Card className="recording-card">
            <CardHeader eyebrow={m.data.recorder.eyebrow} title={m.data.recorder.title} description={m.data.recorder.description} action={<Badge tone={recording.status === 'recording' ? 'accent' : recording.status === 'error' ? 'warning' : recording.status === 'replaying' ? 'positive' : 'neutral'} dot={recording.status === 'recording'}>{m.data.recorder.status[recording.status]}</Badge>} />
            <div className="recording-stats"><span><small>{m.data.recorder.elapsed}</small><strong>{recordingTime(recording.durationSeconds)}</strong></span><span><small>{m.data.recorder.snapshots}</small><strong>{recording.frames.toLocaleString(language)}</strong></span><span><small>{m.data.recorder.size}</small><strong>{recordingSize(recording.bytes)}</strong></span></div>
            <div className="diagnostic-actions recording-actions">
              {!['recording', 'starting', 'stopping', 'replaying'].includes(recording.status) && <Button icon={<Circle size={13} fill="currentColor" />} onClick={() => void startRecording()} disabled={!window.apexDesktop}>{m.data.recorder.record}</Button>}
              {['recording', 'starting', 'stopping'].includes(recording.status) && <Button variant="secondary" icon={<Square size={13} fill="currentColor" />} onClick={() => void window.apexDesktop?.stopRecording()} disabled={recording.status === 'stopping'}>{recording.status === 'stopping' ? m.data.recorder.finishing : m.data.recorder.stop}</Button>}
              {recording.status !== 'replaying' && <Button variant="secondary" icon={<Play size={14} />} onClick={() => void startReplay()} disabled={!window.apexDesktop || ['recording', 'starting', 'stopping'].includes(recording.status)}>{m.data.recorder.replay}</Button>}
              {recording.status === 'replaying' && <Button variant="secondary" icon={<Square size={13} />} onClick={() => void window.apexDesktop?.stopReplay()}>{m.data.recorder.stopReplay}</Button>}
            </div>
            <div className="recording-detail" data-feedback-redact="local-path"><strong>{recording.message || m.data.recorder.ready}</strong>{recording.path && <span title={recording.path}>{recording.path}</span>}</div>
            <div className="support-privacy"><ShieldCheck size={15} /><span><strong>{m.data.recorder.privateTitle}</strong>{m.data.recorder.privateCopy}</span></div>
          </Card>

          <Card className="lifetime-card" data-feedback-redact="measured-lifetime-stats">
            <CardHeader eyebrow={m.data.lifetime.eyebrow} title={m.data.lifetime.title} description={m.data.lifetime.description} action={<Badge tone={lifetimeHealth?.status === 'ready' ? 'positive' : lifetimeHealth?.status === 'future-schema' || lifetimeHealth?.status === 'error' ? 'warning' : 'neutral'}>{lifetimeHealth ? m.data.lifetime.health[lifetimeHealth.status === 'future-schema' ? 'futureSchema' : lifetimeHealth.status === 'read-only' ? 'readOnly' : lifetimeHealth.status] : m.status.notChecked}</Badge>} />
            <div className="lifetime-summary"><div><small>{m.data.lifetime.total}</small><strong>{new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format((lifetime?.totalDistanceMm || 0) / 1_000_000)} {m.data.lifetime.kilometers}</strong></div><div><small>{m.data.lifetime.trackedSince}</small><strong>{lifetime?.trackedSince ? new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(lifetime.trackedSince)) : '—'}</strong></div></div>
            {lifetime?.vehicles.length ? <div className="lifetime-vehicles">{lifetime.vehicles.map((vehicle) => <div key={vehicle.id}><span><strong>{vehicle.name}</strong><small>{vehicle.className} · {formatMessage(m.data.lifetime.sessions, { count: vehicle.sessions })} · {formatMessage(m.data.lifetime.lastDriven, { date: new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(vehicle.lastSeenAt)) })}</small></span><b>{new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(vehicle.distanceMm / 1_000_000)} {m.data.lifetime.kilometers}</b></div>)}</div> : <p className="diagnostics-intro">{lifetime?.status === 'error' ? lifetime.message : m.data.lifetime.noDistance}</p>}
            {lifetimeHealth?.status === 'future-schema' && <p className="diagnostics-intro">{m.data.lifetime.futureSchema}</p>}
            {lifetimeHealth?.status === 'error' && <p className="diagnostics-intro">{m.data.lifetime.recovery}{lifetimeHealth.message ? ` ${lifetimeHealth.message}` : ''}</p>}
            <dl className="lifetime-ledger-details">
              <div data-feedback-redact="local-path"><dt>{m.data.lifetime.database}</dt><dd title={lifetimeHealth?.path}>{lifetimeHealth?.path || '—'}</dd></div>
              <div><dt>{m.data.lifetime.lastBackup}</dt><dd>{lifetimeHealth?.lastBackup ? <><span>{lifetimeHealth.lastBackup.file}</span><code title={lifetimeHealth.lastBackup.sha256}>{lifetimeHealth.lastBackup.sha256.slice(0, 12)}…</code></> : m.data.lifetime.noBackup}</dd></div>
            </dl>
            <div className="support-privacy"><ShieldCheck size={15} /><span>{m.data.lifetime.coverage}</span></div>
            <div className="diagnostic-actions"><Button variant="secondary" icon={<HardDrive size={14} />} onClick={() => void backupLifetime()} disabled={!window.apexDesktop || lifetimeBackup === 'working' || !lifetimeHealth?.path || lifetimeHealth.status === 'closed' || lifetimeHealth.status === 'read-only'}>{lifetimeBackup === 'working' ? m.data.lifetime.backingUp : m.data.lifetime.backup}</Button></div>
            {lifetimeBackupMessage && <p className="diagnostics-intro" role="status">{lifetimeBackupMessage}</p>}
          </Card>

          <Card id="settings-data">
            <CardHeader eyebrow={m.data.folderEyebrow} title={m.data.folderTitle} action={<Badge tone="neutral">{m.data.localOnly}</Badge>} />
            <div className="path-field" data-feedback-redact="local-path"><div><Database size={16} /><span><small>{m.data.userData}</small><strong>{environment?.userDataPath ?? m.data.desktopOnly}</strong></span></div><Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={() => void window.apexDesktop?.openDataFolder()} disabled={!window.apexDesktop}>{m.data.openFolder}</Button></div>
          </Card>
          </>}

          {activeSection === 'about' &&
          <Card>
            <CardHeader eyebrow={m.about.languageEyebrow} title={m.about.languageTitle} description={m.about.languageDescription} action={<Languages size={19} />} />
            <Segmented value={language} onChange={setLanguage} ariaLabel={m.about.languageAria} options={[{ value: 'en', label: m.about.english }, { value: 'de', label: m.about.german }]} />
          </Card>}

          {activeSection === 'about' && <ReleaseHistory />}

          {activeSection === 'about' &&
          <Card>
            <CardHeader eyebrow={m.about.learning} title={m.about.guidance} description={m.about.guidanceCopy} />
            <div className="diagnostic-actions"><Button variant="secondary" icon={<BookOpen size={14} />} onClick={() => { window.localStorage.removeItem('apex:onboarded'); window.location.reload() }}>{m.about.restart}</Button><Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => { for (const key of Object.keys(window.localStorage)) if (key.startsWith('apex:discovered:')) window.localStorage.removeItem(key); window.localStorage.removeItem('apex:settings-section'); window.location.reload() }}>{m.about.resetIntroductions}</Button></div>
          </Card>}

          {activeSection === 'about' &&
          <Card className="about-card" id="settings-about">
            <div className="about-card__mark">A</div><div><strong>{m.about.productName} {environment?.version ?? m.about.browserPreview}</strong><span>{m.about.license}</span></div><Badge tone="accent">{m.about.free}</Badge>
          </Card>
          }
        </div>
      </div>
    </div>
  )
}
