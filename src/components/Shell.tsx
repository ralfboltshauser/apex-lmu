import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  ChevronRight,
  CircleDot,
  Gauge,
  Layers3,
  LifeBuoy,
  HelpCircle,
  Radio,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { Badge, Button } from './ui'
import { DiscoveryPrompt, GuideDrawer, viewGuides } from './GuideDrawer'

export type ViewId = 'home' | 'live' | 'analyze' | 'strategy' | 'setups' | 'overlays' | 'settings'

const primaryNavigation: Array<{ id: ViewId; label: string; icon: typeof Gauge; shortcut?: string }> = [
  { id: 'home', label: 'Command center', icon: Gauge },
  { id: 'live', label: 'Live session', icon: Radio, shortcut: 'L' },
  { id: 'analyze', label: 'Analyze', icon: BarChart3, shortcut: 'A' },
  { id: 'strategy', label: 'Strategy', icon: Activity, shortcut: 'S' },
  { id: 'setups', label: 'Setups', icon: SlidersHorizontal },
  { id: 'overlays', label: 'Overlays', icon: Layers3 },
]

export function Shell({
  view,
  onViewChange,
  connected,
  demoRunning,
  onToggleDemo,
  children,
}: {
  view: ViewId
  onViewChange: (view: ViewId) => void
  connected: boolean
  demoRunning: boolean
  onToggleDemo: () => void
  children: ReactNode
}) {
  const current = primaryNavigation.find((item) => item.id === view)
  const [guideOpen, setGuideOpen] = useState(false)
  const [showDiscovery, setShowDiscovery] = useState(false)
  const guide = viewGuides[view]
  useEffect(() => { setGuideOpen(false); setShowDiscovery(window.localStorage.getItem(`apex:discovered:${view}`) !== 'true') }, [view])
  const dismissDiscovery = () => { window.localStorage.setItem(`apex:discovered:${view}`, 'true'); setShowDiscovery(false) }
  const openGuide = () => { dismissDiscovery(); setGuideOpen(true) }
  const openSettings = (section: 'connection' | 'data' | 'about' | 'diagnostics') => {
    window.localStorage.setItem('apex:settings-section', section)
    onViewChange('settings')
    window.queueMicrotask(() => window.dispatchEvent(new CustomEvent('apex:settings-section', { detail: section })))
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="Apex home">
          <div className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" role="img">
              <path d="M4 20.5 12.5 5h5L24 20.5h-5.2l-1.4-3.4H9.7l-1.8 3.4H4Z" />
              <path className="brand__cut" d="m11.6 13.4 2.8-5.2 2 5.2h-4.8Z" />
            </svg>
          </div>
          <div>
            <strong>Apex</strong>
            <span>for LMU</span>
          </div>
          <Badge tone="neutral">alpha</Badge>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation">
          <div className="nav-section-label">Race engineering</div>
          {primaryNavigation.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${view === item.id ? 'is-active' : ''}`}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => onViewChange(item.id)}
              >
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
                {item.id === 'live' && connected && <span className="nav-item__live" aria-label="Live" />}
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </button>
            )
          })}

          <div className="nav-section-label nav-section-label--secondary">System</div>
          <button type="button" className="nav-item" onClick={() => openSettings('connection')}>
            <Settings size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>Settings</span>
          </button>
          <button type="button" className="nav-item" onClick={() => openSettings('about')}>
            <BookOpen size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>About & privacy</span>
          </button>
        </nav>

        <div className="sidebar__footer">
          <div className="privacy-note">
            <div className="privacy-note__icon"><Boxes size={15} /></div>
            <div>
              <strong>Local by design</strong>
              <span>Your telemetry never leaves this PC.</span>
            </div>
          </div>
          <button type="button" className="sidebar-support" onClick={() => openSettings('diagnostics')}>
            <LifeBuoy size={15} />
            <span>Diagnostics</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Apex</span>
            <ChevronRight size={13} />
            <strong>{current?.label ?? 'Settings'}</strong>
          </div>
          <div className="topbar__actions">
            <Button variant="secondary" size="sm" icon={<HelpCircle size={15} />} onClick={openGuide}>Learn this view</Button>
            <div className={`connection-pill ${connected ? 'is-live' : ''}`}>
              <span className="connection-pill__pulse" />
              <div>
                <strong>{connected ? (demoRunning ? 'Demo connected' : 'LMU connected') : 'LMU offline'}</strong>
                <span>{connected ? '50 Hz · local' : 'Waiting for session'}</span>
              </div>
            </div>
            <Button
              variant={demoRunning ? 'secondary' : 'primary'}
              size="sm"
              icon={demoRunning ? <CircleDot size={15} /> : <Sparkles size={15} />}
              onClick={onToggleDemo}
            >
              {demoRunning ? 'Stop demo' : 'Run live demo'}
            </Button>
          </div>
        </header>
        <main className="workspace__content">{children}</main>
        <DiscoveryPrompt guide={guide} open={showDiscovery} onOpen={openGuide} onDismiss={dismissDiscovery} />
      </div>
      <GuideDrawer guide={guide} open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}
