import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  ChevronRight,
  CircleDot,
  Fuel,
  Gauge,
  Layers3,
  LifeBuoy,
  HelpCircle,
  MessageSquarePlus,
  MessagesSquare,
  Radio,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { Badge, Button } from './ui'
import { DiscoveryPrompt, GuideDrawer, useViewGuides } from './GuideDrawer'
import { appMessages } from '../i18n/appMessages'
import { useMessages } from '../i18n'
import { LanguageToggle } from '../i18n/LanguageToggle'
import { feedbackMessages } from '../feedback/messages'
import { useFeedback } from '../feedback/FeedbackProvider'

export type ViewId = 'home' | 'live' | 'fuel' | 'analyze' | 'strategy' | 'setups' | 'overlays' | 'feedback' | 'settings'

const primaryNavigation: Array<{ id: Exclude<ViewId, 'settings' | 'feedback'>; icon: typeof Gauge; shortcut?: string }> = [
  { id: 'home', icon: Gauge },
  { id: 'live', icon: Radio, shortcut: 'L' },
  { id: 'fuel', icon: Fuel, shortcut: 'F' },
  { id: 'analyze', icon: BarChart3, shortcut: 'A' },
  { id: 'strategy', icon: Activity, shortcut: 'S' },
  { id: 'setups', icon: SlidersHorizontal },
  { id: 'overlays', icon: Layers3 },
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
  const messages = useMessages(appMessages)
  const feedbackCopy = useMessages(feedbackMessages)
  const feedback = useFeedback()
  const m = messages.shell
  const guides = useViewGuides()
  const [guideOpen, setGuideOpen] = useState(false)
  const [showDiscovery, setShowDiscovery] = useState(false)
  const guide = guides[view]
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
        <div className="brand" aria-label={m.brandHome}>
          <div className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" role="img">
              <path d="M4 20.5 12.5 5h5L24 20.5h-5.2l-1.4-3.4H9.7l-1.8 3.4H4Z" />
              <path className="brand__cut" d="m11.6 13.4 2.8-5.2 2 5.2h-4.8Z" />
            </svg>
          </div>
          <div>
            <strong>{messages.common.productName}</strong>
            <span>{m.brandSuffix}</span>
          </div>
          <Badge tone="neutral">{m.alpha}</Badge>
        </div>

        <nav className="sidebar__nav" aria-label={m.mainNavigation}>
          <div className="nav-section-label">{m.raceEngineering}</div>
          {primaryNavigation.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${view === item.id ? 'is-active' : ''}`}
                aria-label={m.navigation[item.id]}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => onViewChange(item.id)}
              >
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                <span>{m.navigation[item.id]}</span>
                {item.id === 'live' && connected && <span className="nav-item__live" aria-label={m.live} />}
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </button>
            )
          })}

          <div className="nav-section-label nav-section-label--secondary">{m.system}</div>
          <button type="button" className={`nav-item ${view === 'feedback' ? 'is-active' : ''}`} aria-label={feedbackCopy.navigation} aria-current={view === 'feedback' ? 'page' : undefined} onClick={() => onViewChange('feedback')}>
            <MessagesSquare size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>{feedbackCopy.navigation}</span>
            {(feedback.state.unread > 0 || feedback.state.needsAnswer > 0) && <span className="nav-item__count">{Math.max(feedback.state.unread, feedback.state.needsAnswer)}</span>}
          </button>
          <button type="button" className="nav-item" aria-label={m.navigation.settings} onClick={() => openSettings('connection')}>
            <Settings size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>{m.navigation.settings}</span>
          </button>
          <button type="button" className="nav-item" aria-label={m.aboutPrivacy} onClick={() => openSettings('about')}>
            <BookOpen size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>{m.aboutPrivacy}</span>
          </button>
        </nav>

        <div className="sidebar__footer">
          <div className="privacy-note">
            <div className="privacy-note__icon"><Boxes size={15} /></div>
            <div>
              <strong>{m.localByDesign}</strong>
              <span>{m.localPromise}</span>
            </div>
          </div>
          <button type="button" className="sidebar-support" aria-label={m.diagnostics} onClick={() => openSettings('diagnostics')}>
            <LifeBuoy size={15} />
            <span>{m.diagnostics}</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{messages.common.productName}</span>
            <ChevronRight size={13} />
            <strong>{m.navigation[view]}</strong>
          </div>
          <div className="topbar__actions">
            <LanguageToggle />
            <Button variant="secondary" size="sm" icon={<MessageSquarePlus size={15} />} title={feedbackCopy.shortcut} onClick={feedback.startSelection}>{feedbackCopy.giveFeedback}</Button>
            <Button variant="secondary" size="sm" icon={<HelpCircle size={15} />} aria-label={m.learnView} onClick={openGuide}>{m.learnView}</Button>
            <div className={`connection-pill ${connected ? 'is-live' : ''}`} role="status" aria-label={connected ? (demoRunning ? m.demoConnected : m.lmuConnected) : m.lmuOffline}>
              <span className="connection-pill__pulse" />
              <div>
                <strong>{connected ? (demoRunning ? m.demoConnected : m.lmuConnected) : m.lmuOffline}</strong>
                <span>{connected ? m.localRate : m.waitingForSession}</span>
              </div>
            </div>
            <Button
              variant={demoRunning ? 'secondary' : 'primary'}
              size="sm"
              icon={demoRunning ? <CircleDot size={15} /> : <Sparkles size={15} />}
              aria-label={demoRunning ? m.stopDemo : m.runDemo}
              onClick={onToggleDemo}
            >
              {demoRunning ? m.stopDemo : m.runDemo}
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
