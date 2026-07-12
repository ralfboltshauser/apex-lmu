import {
  AlignCenter,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
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
  const [enabled, setEnabled] = useState<WidgetId[]>(['relative', 'fuel', 'delta', 'radar'])
  const [selected, setSelected] = useState<WidgetId>('relative')
  const [previewMode, setPreviewMode] = useState<'editor' | 'clean'>('editor')
  const [opacity, setOpacity] = useState(92)
  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem('apex:overlay-layout') ?? 'null') as { enabled?: WidgetId[]; selected?: WidgetId; opacity?: number } | null
      if (!stored) return
      if (Array.isArray(stored.enabled)) setEnabled(stored.enabled.filter((id) => widgets.some((widget) => widget.id === id)))
      if (stored.selected && widgets.some((widget) => widget.id === stored.selected)) setSelected(stored.selected)
      if (typeof stored.opacity === 'number') setOpacity(Math.max(35, Math.min(100, stored.opacity)))
      setSaved(true)
    } catch {
      window.localStorage.removeItem('apex:overlay-layout')
    }
  }, [])
  const toggle = (id: WidgetId) => { setEnabled((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); setSaved(false) }
  const reset = () => { setEnabled(['relative', 'fuel', 'delta', 'radar']); setSelected('relative'); setOpacity(92); setSaved(false) }
  const save = () => {
    window.localStorage.setItem('apex:overlay-layout', JSON.stringify({ enabled, selected, opacity }))
    setSaved(true)
  }
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
        <button type="button" disabled><Monitor size={15} /><span>{m.toolbar.displayUnavailable}</span></button>
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
              return <button key={widget.id} type="button" className={`${selected === widget.id ? 'is-selected' : ''}`} onClick={() => setSelected(widget.id)}>
                <span className="widget-list__icon"><Icon size={16} /></span><span><strong>{widget.name}</strong><small>{widget.description}</small></span>
                <i role="switch" aria-checked={isEnabled} tabIndex={0} className={`switch ${isEnabled ? 'is-on' : ''}`} onClick={(event) => { event.stopPropagation(); toggle(widget.id) }}><b /></i>
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
          <div className="inspector-section"><strong>{m.inspector.position}</strong><div className="inspector-grid"><label><span>X</span><input value="24" readOnly /><em>{m.inspector.pixels}</em></label><label><span>Y</span><input value="394" readOnly /><em>{m.inspector.pixels}</em></label><label><span>W</span><input value="268" readOnly /><em>{m.inspector.pixels}</em></label><label><span>H</span><input value="112" readOnly /><em>{m.inspector.pixels}</em></label></div></div>
          <div className="inspector-section"><strong>{m.inspector.appearance}</strong><label className="range-control"><span>{m.inspector.opacity} <b>{opacity}{m.inspector.percent}</b></span><input type="range" min="35" max="100" value={opacity} onChange={(event) => { setOpacity(Number(event.target.value)); setSaved(false) }} /></label><label className="field-label"><span>{m.inspector.theme}</span><button type="button" disabled>{m.inspector.graphiteOnly}</button></label><label className="field-label"><span>{m.inspector.scale}</span><button type="button" disabled>{m.inspector.scaleOnly}</button></label></div>
          <div className="inspector-section"><strong>{m.inspector.behavior}</strong><label className="toggle-row"><span><b>{m.inspector.hidePits}</b><small>{m.inspector.hidePitsHint}</small></span><i className="switch is-on"><b /></i></label><label className="toggle-row"><span><b>{m.inspector.classFilter}</b><small>{m.inspector.classFilterHint}</small></span><i className="switch is-on"><b /></i></label></div>
          <div className="inspector-actions"><Button variant="secondary" size="sm" icon={<Copy size={13} />} disabled>{m.inspector.duplicateUnavailable}</Button><Button variant="quiet" size="sm" icon={<Settings2 size={13} />} disabled>{m.inspector.advancedUnavailable}</Button></div>
        </Card>
      </div>

      <div className="overlay-footer"><div><span className={`status-dot ${window.apexDesktop ? 'status-dot--positive' : ''}`} /><span><strong>{window.apexDesktop ? m.footer.available : m.footer.required}</strong>{m.footer.description}</span></div><Button variant="secondary" icon={<Eye size={15} />} onClick={onOpenOverlay} disabled={!window.apexDesktop}>{m.footer.open}</Button></div>
    </div>
  )
}
