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

type WidgetId = 'relative' | 'fuel' | 'delta' | 'radar' | 'inputs' | 'flags' | 'tyres'

const widgets: Array<{ id: WidgetId; name: string; description: string; icon: typeof Gauge }> = [
  { id: 'relative', name: 'Relative', description: 'Nearby cars, class and gaps', icon: Users },
  { id: 'fuel', name: 'Fuel & VE', description: 'Finish margin and target use', icon: Fuel },
  { id: 'delta', name: 'Delta', description: 'Live delta and prediction', icon: Timer },
  { id: 'radar', name: 'Radar', description: 'Close-car spatial awareness', icon: Radar },
  { id: 'inputs', name: 'Inputs', description: 'Throttle, brake and steering', icon: Gauge },
  { id: 'flags', name: 'Flags', description: 'High-visibility race control', icon: Flag },
  { id: 'tyres', name: 'Tyres', description: 'Pressure, temperature and wear', icon: Crosshair },
]

export function OverlaysView({ onOpenOverlay }: { onOpenOverlay?: () => void }) {
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
        <div><div className="eyebrow">Overlay studio</div><h1>Only the information you need.</h1><p>Build a glanceable race HUD for your display, session and car.</p></div>
        <div className="page-heading__actions"><Button variant="secondary" icon={<RotateCcw size={15} />} onClick={reset}>Reset preview</Button><Button icon={saved ? <Check size={15} /> : <Save size={15} />} onClick={save}>{saved ? 'Saved locally' : 'Save widget choices'}</Button></div>
      </div>

      <div className="data-provenance-banner"><Badge tone="accent">Preview editor</Badge><span>Widget visibility and opacity are editable and saved locally. Drag positioning, display targeting, grid snapping, and live widget bindings are not implemented yet.</span></div>

      <div className="overlay-toolbar">
        <div className="overlay-layout-select"><Layers3 size={15} /><span><small>Layout</small><strong>Hypercar · Race</strong></span><ChevronDown size={14} /></div>
        <div className="overlay-toolbar__separator" />
        <button type="button" disabled><Monitor size={15} /><span>Display targeting unavailable</span></button>
        <button type="button" disabled><Grid3X3 size={15} /><span>Grid unavailable</span></button>
        <button type="button" disabled><AlignCenter size={15} /><span>Snap unavailable</span></button>
        <div className="overlay-toolbar__spacer" />
        <Segmented value={previewMode} onChange={setPreviewMode} ariaLabel="Preview mode" options={[{ value: 'editor', label: 'Edit' }, { value: 'clean', label: 'Preview' }]} />
      </div>

      <div className={`overlay-studio ${previewMode === 'clean' ? 'is-clean' : ''}`}>
        <Card className="widget-library">
          <CardHeader eyebrow="Library" title="Widgets" action={<Badge tone="neutral">{enabled.length} active</Badge>} />
          <div className="widget-search"><Search size={14} /><input placeholder="Find a widget" aria-label="Find a widget" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
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
          <button type="button" className="add-community-widget" disabled><Plus size={14} /> Community widgets unavailable</button>
        </Card>

        <div className="overlay-canvas" aria-label="Overlay layout canvas">
          <div className="overlay-canvas__game">
            <div className="sim-sky" /><div className="sim-track"><span className="sim-track__left" /><span className="sim-track__right" /><i className="sim-track__car" /></div>
            <div className="sim-cockpit"><span /><i /></div>
          </div>
          <div className="safe-area"><span>Safe area</span></div>

          {enabled.includes('relative') && <div className={`preview-widget preview-relative ${selected === 'relative' ? 'is-selected' : ''}`} style={{ opacity: opacity / 100 }} onClick={() => setSelected('relative')}>
            <div className="preview-widget__handle"><Move size={11} /> RELATIVE <Lock size={10} /></div>
            <div><span>2</span><b>#50</b><strong>M. Molina</strong><em>+2.3</em></div><div className="is-player"><span>3</span><b>#6</b><strong>YOU</strong><em>—</em></div><div><span>4</span><b>#8</b><strong>B. Hartley</strong><em>+4.8</em></div>
          </div>}
          {enabled.includes('fuel') && <div className={`preview-widget preview-fuel ${selected === 'fuel' ? 'is-selected' : ''}`} style={{ opacity: opacity / 100 }} onClick={() => setSelected('fuel')}>
            <div className="preview-widget__handle"><Move size={11} /> FUEL & VE</div><div className="preview-fuel__main"><span><small>TO FINISH</small><strong>43.1 L</strong></span><Badge tone="positive">+1.7 L</Badge></div><Progress value={76} tone="positive" /><div className="preview-fuel__stats"><span>3.46 <small>L/LAP</small></span><span>4.61 <small>VE/LAP</small></span><span>12.9 <small>LAPS</small></span></div>
          </div>}
          {enabled.includes('delta') && <div className={`preview-widget preview-delta ${selected === 'delta' ? 'is-selected' : ''}`} style={{ opacity: opacity / 100 }} onClick={() => setSelected('delta')}>
            <div className="preview-widget__handle"><Move size={11} /> DELTA</div><strong>+0.218</strong><div><span style={{ width: '61%' }} /></div><small>2:03.902 predicted</small>
          </div>}
          {enabled.includes('radar') && <div className={`preview-widget preview-radar ${selected === 'radar' ? 'is-selected' : ''}`} style={{ opacity: opacity / 100 }} onClick={() => setSelected('radar')}>
            <div className="preview-widget__handle"><Move size={11} /> RADAR</div><div className="radar-field"><span className="radar-player" /><span className="radar-car radar-car--one" /><span className="radar-car radar-car--two" /><i /><i /></div>
          </div>}
          {enabled.includes('flags') && <div className={`preview-widget preview-flag ${selected === 'flags' ? 'is-selected' : ''}`} onClick={() => setSelected('flags')}><Flag size={16} /><strong>BLUE FLAG</strong></div>}
          {previewMode === 'editor' && <div className="overlay-canvas__hint"><MousePointer2 size={13} /> Select a widget to edit visibility and opacity · positioning arrives after persistence</div>}
        </div>

        <Card className="widget-inspector">
          <CardHeader eyebrow="Inspector" title={widgets.find((widget) => widget.id === selected)?.name ?? 'Widget'} action={<button className="icon-button" type="button" aria-label="Hide widget" onClick={() => toggle(selected)}><Trash2 size={15} /></button>} />
          <div className="inspector-section"><strong>Position</strong><div className="inspector-grid"><label><span>X</span><input value="24" readOnly /><em>px</em></label><label><span>Y</span><input value="394" readOnly /><em>px</em></label><label><span>W</span><input value="268" readOnly /><em>px</em></label><label><span>H</span><input value="112" readOnly /><em>px</em></label></div></div>
          <div className="inspector-section"><strong>Appearance</strong><label className="range-control"><span>Opacity <b>{opacity}%</b></span><input type="range" min="35" max="100" value={opacity} onChange={(event) => { setOpacity(Number(event.target.value)); setSaved(false) }} /></label><label className="field-label"><span>Theme</span><button type="button" disabled>Graphite only</button></label><label className="field-label"><span>Scale</span><button type="button" disabled>100% only</button></label></div>
          <div className="inspector-section"><strong>Behavior</strong><label className="toggle-row"><span><b>Hide in pits</b><small>Reduce clutter while stationary</small></span><i className="switch is-on"><b /></i></label><label className="toggle-row"><span><b>Auto class filter</b><small>Prioritize your racing class</small></span><i className="switch is-on"><b /></i></label></div>
          <div className="inspector-actions"><Button variant="secondary" size="sm" icon={<Copy size={13} />} disabled>Duplicate unavailable</Button><Button variant="quiet" size="sm" icon={<Settings2 size={13} />} disabled>Advanced unavailable</Button></div>
        </Card>
      </div>

      <div className="overlay-footer"><div><span className={`status-dot ${window.apexDesktop ? 'status-dot--positive' : ''}`} /><span><strong>{window.apexDesktop ? 'Desktop overlay available' : 'Desktop app required'}</strong>Transparent, click-through, local window</span></div><Button variant="secondary" icon={<Eye size={15} />} onClick={onOpenOverlay} disabled={!window.apexDesktop}>Open preview window</Button></div>
    </div>
  )
}
