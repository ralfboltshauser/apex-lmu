import {
  AlignCenter,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Crosshair,
  Eye,
  Flag,
  Fuel,
  Gauge,
  Grid3X3,
  Layers3,
  Lock,
  Map,
  Maximize2,
  Monitor,
  MousePointer2,
  Move,
  Plus,
  Radar,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Timer,
  Trash2,
  Users,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, CardHeader, Progress, Segmented } from '../components/ui'
import { useMessages } from '../i18n'
import { formatMessage, overlaysMessages } from '../i18n/view-resources'

type WidgetId = 'relative' | 'fuel' | 'delta' | 'radar' | 'inputs' | 'flags' | 'tyres'
type SupportedWidgetId = ApexOverlayWidgetId

const widgetDefinitions: Array<{ id: WidgetId; icon: typeof Gauge }> = [
  { id: 'relative', icon: Users },
  { id: 'fuel', icon: Fuel },
  { id: 'delta', icon: Timer },
  { id: 'radar', icon: Radar },
  { id: 'inputs', icon: Gauge },
  { id: 'flags', icon: Flag },
  { id: 'tyres', icon: Crosshair },
]

export function OverlaysView({ onOpenOverlay }: { onOpenOverlay?: () => void }) {
  const m = useMessages(overlaysMessages)
  const widgets = widgetDefinitions.map((widget) => ({ ...widget, ...m.widgets[widget.id] }))
  const [enabled, setEnabled] = useState<WidgetId[]>(['relative', 'fuel', 'delta', 'inputs'])
  const [selected, setSelected] = useState<WidgetId>('relative')
  const [previewMode, setPreviewMode] = useState<'editor' | 'clean'>('editor')
  const [opacity, setOpacity] = useState(92)
  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState(false)
  const [displays, setDisplays] = useState<ApexDisplay[]>([])
  const [displayId, setDisplayId] = useState('')
  const [overlayState, setOverlayState] = useState<ApexOverlayState>({ status: 'closed', displayId: null, message: '', fallbackFrom: null })
  const [configError, setConfigError] = useState('')
  useEffect(() => {
    if (!window.apexDesktop) return
    void Promise.all([window.apexDesktop.getDisplays(), window.apexDesktop.getOverlayConfig(), window.apexDesktop.getOverlayState()]).then(([availableDisplays, config, state]) => {
      setDisplays(availableDisplays)
      setDisplayId(config.displayId ?? '')
      setEnabled(config.widgets.filter((widget) => widget.enabled).map((widget) => widget.id))
      setOpacity(Math.round(config.opacity * 100))
      setOverlayState(state)
      setSaved(true)
    }).catch((error) => setConfigError(error instanceof Error ? error.message : String(error)))
    const stopDisplays = window.apexDesktop.onDisplaysChanged(setDisplays)
    const stopState = window.apexDesktop.onOverlayState(setOverlayState)
    const stopConfig = window.apexDesktop.onOverlayConfig((config) => {
      setDisplayId(config.displayId ?? '')
      setEnabled(config.widgets.filter((widget) => widget.enabled).map((widget) => widget.id))
      setOpacity(Math.round(config.opacity * 100))
      setSaved(true)
    })
    return () => { stopDisplays(); stopState(); stopConfig() }
  }, [])
  const isSupported = (id: WidgetId): id is SupportedWidgetId => ['relative', 'fuel', 'delta', 'inputs'].includes(id)
  const persist = async (patch: Parameters<NonNullable<typeof window.apexDesktop>['setOverlayConfig']>[0]) => {
    if (!window.apexDesktop) return
    setSaved(false); setConfigError('')
    try { await window.apexDesktop.setOverlayConfig(patch); setSaved(true) }
    catch (error) { setConfigError(error instanceof Error ? error.message : String(error)) }
  }
  const toggle = (id: WidgetId) => {
    if (!isSupported(id)) return
    const next = enabled.includes(id) ? enabled.filter((item) => item !== id) : [...enabled, id]
    setEnabled(next)
    void persist({ widgets: (['relative', 'fuel', 'delta', 'inputs'] as SupportedWidgetId[]).map((widgetId) => ({ id: widgetId, enabled: next.includes(widgetId), bounds: defaultBounds(widgetId) })) })
  }
  const reset = () => {
    const next: SupportedWidgetId[] = ['relative', 'fuel', 'delta', 'inputs']
    setEnabled(next); setSelected('relative'); setOpacity(92)
    void persist({ opacity: 0.92, widgets: next.map((id) => ({ id, enabled: true, bounds: defaultBounds(id) })) })
  }
  const save = () => void persist({ opacity: opacity / 100 })
  const visibleWidgets = widgets.filter((widget) => `${widget.name} ${widget.description}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="view view--overlays">
      <div className="page-heading page-heading--compact">
        <div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.heading.title}</h1><p>{m.heading.description}</p></div>
        <div className="page-heading__actions"><Button variant="secondary" icon={<RotateCcw size={15} />} onClick={reset}>{m.heading.reset}</Button><Button icon={saved ? <Check size={15} /> : <Save size={15} />} onClick={save}>{saved ? m.heading.saved : m.heading.save}</Button></div>
      </div>

      <div className="data-provenance-banner"><Badge tone="accent">{m.provenance.badge}</Badge><span>{m.provenance.copy}</span></div>

      <div className="overlay-toolbar">
        <div className="overlay-layout-select"><Layers3 size={15} /><span><small>{m.toolbar.layout}</small><strong>{m.toolbar.layoutName}</strong></span><ChevronDown size={14} /></div>
        <div className="overlay-toolbar__separator" />
        <label className="overlay-display-select"><Monitor size={15} /><span className="sr-only">{m.toolbar.display}</span><select value={displayId} onChange={(event) => { setDisplayId(event.target.value); void persist({ displayId: event.target.value }) }} disabled={!displays.length}>{displays.length ? displays.map((display) => <option key={display.id} value={display.id}>{display.label} · {display.bounds.width}×{display.bounds.height} · {Math.round(display.scaleFactor * 100)}%{display.primary ? ` · ${m.toolbar.primary}` : ''}</option>) : <option>{m.toolbar.noDisplays}</option>}</select></label>
        <button type="button" disabled><Grid3X3 size={15} /><span>{m.toolbar.gridUnavailable}</span></button>
        <button type="button" disabled><AlignCenter size={15} /><span>{m.toolbar.snapUnavailable}</span></button>
        <div className="overlay-toolbar__spacer" />
        <Segmented value={previewMode} onChange={setPreviewMode} ariaLabel={m.toolbar.previewAria} options={[{ value: 'editor', label: m.toolbar.edit }, { value: 'clean', label: m.toolbar.preview }]} />
      </div>

      <div className={`overlay-studio ${previewMode === 'clean' ? 'is-clean' : ''}`}>
        <Card className="widget-library">
          <CardHeader eyebrow={m.library.eyebrow} title={m.library.title} action={<Badge tone="neutral">{formatMessage(m.library.active, { count: enabled.length })}</Badge>} />
          <div className="widget-search"><Search size={14} /><input placeholder={m.library.find} aria-label={m.library.findAria} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="widget-list">
            {visibleWidgets.map((widget) => {
              const Icon = widget.icon
              const isEnabled = enabled.includes(widget.id)
              const supported = isSupported(widget.id)
              return <button key={widget.id} type="button" className={`${selected === widget.id ? 'is-selected' : ''}`} onClick={() => setSelected(widget.id)}>
                <span className="widget-list__icon"><Icon size={16} /></span><span><strong>{widget.name}</strong><small>{supported ? widget.description : m.library.unavailable}</small></span>
                <i role="switch" aria-checked={isEnabled} aria-disabled={!supported} tabIndex={supported ? 0 : -1} className={`switch ${isEnabled ? 'is-on' : ''}`} onClick={(event) => { event.stopPropagation(); toggle(widget.id) }} onKeyDown={(event) => { if (supported && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); toggle(widget.id) } }}><b /></i>
              </button>
            })}
          </div>
          <button type="button" className="add-community-widget" disabled><Plus size={14} /> {m.library.communityUnavailable}</button>
        </Card>

        <div className="overlay-canvas" aria-label={m.canvas.aria}>
          <div className="overlay-canvas__game">
            <div className="sim-sky" /><div className="sim-track"><span className="sim-track__left" /><span className="sim-track__right" /><i className="sim-track__car" /></div>
            <div className="sim-cockpit"><span /><i /></div>
          </div>
          <div className="safe-area"><span>{m.canvas.safeArea}</span></div>

          {enabled.includes('relative') && <div className={`preview-widget preview-relative ${selected === 'relative' ? 'is-selected' : ''}`} style={{ opacity: opacity / 100 }} onClick={() => setSelected('relative')}>
            <div className="preview-widget__handle"><Move size={11} /> {m.canvas.relative} <Lock size={10} /></div>
            <div><span>2</span><b>#50</b><strong>{m.canvas.driverAhead}</strong><em>+2.3</em></div><div className="is-player"><span>3</span><b>#6</b><strong>{m.canvas.you}</strong><em>—</em></div><div><span>4</span><b>#8</b><strong>{m.canvas.driverBehind}</strong><em>+4.8</em></div>
          </div>}
          {enabled.includes('fuel') && <div className={`preview-widget preview-fuel ${selected === 'fuel' ? 'is-selected' : ''}`} style={{ opacity: opacity / 100 }} onClick={() => setSelected('fuel')}>
            <div className="preview-widget__handle"><Move size={11} /> {m.canvas.fuel}</div><div className="preview-fuel__main"><span><small>{m.canvas.toFinish}</small><strong>43.1 {m.canvas.liters}</strong></span><Badge tone="positive">+1.7 {m.canvas.liters}</Badge></div><Progress value={76} tone="positive" /><div className="preview-fuel__stats"><span>3.46 <small>{m.canvas.litresPerLap}</small></span><span>4.61 <small>{m.canvas.vePerLap}</small></span><span>12.9 <small>{m.canvas.laps}</small></span></div>
          </div>}
          {enabled.includes('delta') && <div className={`preview-widget preview-delta ${selected === 'delta' ? 'is-selected' : ''}`} style={{ opacity: opacity / 100 }} onClick={() => setSelected('delta')}>
            <div className="preview-widget__handle"><Move size={11} /> {m.canvas.delta}</div><strong>+0.218</strong><div><span style={{ width: '61%' }} /></div><small>{formatMessage(m.canvas.predicted, { time: '2:03.902' })}</small>
          </div>}
          {enabled.includes('radar') && <div className={`preview-widget preview-radar ${selected === 'radar' ? 'is-selected' : ''}`} style={{ opacity: opacity / 100 }} onClick={() => setSelected('radar')}>
            <div className="preview-widget__handle"><Move size={11} /> {m.canvas.radar}</div><div className="radar-field"><span className="radar-player" /><span className="radar-car radar-car--one" /><span className="radar-car radar-car--two" /><i /><i /></div>
          </div>}
          {enabled.includes('flags') && <div className={`preview-widget preview-flag ${selected === 'flags' ? 'is-selected' : ''}`} onClick={() => setSelected('flags')}><Flag size={16} /><strong>{m.canvas.blueFlag}</strong></div>}
          {previewMode === 'editor' && <div className="overlay-canvas__hint"><MousePointer2 size={13} /> {m.canvas.hint}</div>}
        </div>

        <Card className="widget-inspector">
          <CardHeader eyebrow={m.inspector.eyebrow} title={widgets.find((widget) => widget.id === selected)?.name ?? m.inspector.fallbackTitle} action={<button className="icon-button" type="button" aria-label={m.inspector.hideAria} onClick={() => toggle(selected)}><Trash2 size={15} /></button>} />
          <div className="inspector-section"><strong>{m.inspector.position}</strong><p className="overlay-unavailable-copy">{m.inspector.positionUnavailable}</p></div>
          <div className="inspector-section"><strong>{m.inspector.appearance}</strong><label className="range-control"><span>{m.inspector.opacity} <b>{opacity}{m.inspector.percent}</b></span><input type="range" min="35" max="100" value={opacity} onChange={(event) => { const value = Number(event.target.value); setOpacity(value); void persist({ opacity: value / 100 }) }} /></label><label className="field-label"><span>{m.inspector.theme}</span><button type="button" disabled>{m.inspector.graphiteOnly}</button></label><label className="field-label"><span>{m.inspector.scale}</span><button type="button" disabled>{m.inspector.scaleOnly}</button></label></div>
          <div className="inspector-section"><strong>{m.inspector.behavior}</strong><p className="overlay-unavailable-copy">{m.inspector.behaviorUnavailable}</p></div>
          <div className="inspector-actions"><Button variant="secondary" size="sm" icon={<Copy size={13} />} disabled>{m.inspector.duplicateUnavailable}</Button><Button variant="quiet" size="sm" icon={<Settings2 size={13} />} disabled>{m.inspector.advancedUnavailable}</Button></div>
        </Card>
      </div>

      <div className="overlay-guidance"><Monitor size={16} /><span><strong>{m.guidance.title}</strong>{m.guidance.copy}</span></div>
      {configError && <div className="data-provenance-banner is-error"><Badge tone="critical">{m.footer.error}</Badge><span>{configError}</span></div>}
      <div className="overlay-footer"><div><span className={`status-dot ${overlayState.status === 'ready' ? 'status-dot--positive' : ''}`} /><span><strong>{window.apexDesktop ? m.footer.state[overlayState.status] : m.footer.required}</strong>{overlayState.message || m.footer.description}</span></div><div className="overlay-footer__actions">{overlayState.status === 'ready' && <Button variant="quiet" onClick={() => void window.apexDesktop?.closeOverlay()}>{m.footer.close}</Button>}<Button variant="secondary" icon={<Eye size={15} />} onClick={onOpenOverlay} disabled={!window.apexDesktop || !displays.length || overlayState.status === 'opening'}>{overlayState.status === 'opening' ? m.footer.opening : m.footer.open}</Button></div></div>
    </div>
  )
}

function defaultBounds(id: SupportedWidgetId) {
  if (id === 'relative') return { x: 0.014, y: 0.025, width: 0.168, height: 0.23 }
  if (id === 'delta') return { x: 0.436, y: 0.025, width: 0.128, height: 0.105 }
  if (id === 'inputs') return { x: 0.826, y: 0.855, width: 0.16, height: 0.12 }
  return { x: 0.826, y: 0.025, width: 0.16, height: 0.13 }
}
