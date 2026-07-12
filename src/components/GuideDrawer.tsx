import { useEffect, useRef } from 'react'
import { ArrowRight, BookOpen, Check, HelpCircle, X } from 'lucide-react'
import type { ViewId } from './Shell'
import { Badge, Button } from './ui'

export type ViewGuide = {
  label: string
  title: string
  summary: string
  outcome: string
  steps: Array<{ title: string; copy: string }>
  terms: Array<{ term: string; definition: string }>
}

export const viewGuides: Record<ViewId, ViewGuide> = {
  home: { label: 'Command center', title: 'Your next useful decision', summary: 'Start here to see connection health, recent work, and the single highest-value action Apex can support.', outcome: 'Leave with one clear next step—not another dashboard to monitor.', steps: [{ title: 'Connect or explore', copy: 'Start LMU for measured data, or run the clearly labelled demo.' }, { title: 'Review the headline', copy: 'Apex surfaces one opportunity before the supporting detail.' }, { title: 'Follow the evidence', copy: 'Open the race brief or analysis only when you need the reasoning.' }], terms: [{ term: 'Generated example', definition: 'A deterministic UX fixture, never presented as your driving.' }, { term: 'Readiness', definition: 'A summary of evidence coverage and known uncertainty, not a driver rating.' }] },
  live: { label: 'Live session', title: 'A pit wall that stays quiet until needed', summary: 'Live shows measured race state while you drive. It prioritizes timing, fuel, traffic, tyres, brakes, and actionable warnings.', outcome: 'Glance, decide, return your eyes to the track.', steps: [{ title: 'Start LMU', copy: 'Enter a drivable session; Apex connects automatically.' }, { title: 'Watch status first', copy: 'Offline, waiting, stale, and live are intentionally distinct.' }, { title: 'Use the demo safely', copy: 'The demo is generated and always labelled.' }], terms: [{ term: '50 Hz', definition: 'The bridge requests fifty local updates per second.' }, { term: 'Stale', definition: 'Data stopped changing; Apex clears old values rather than pretending they are live.' }] },
  analyze: { label: 'Analysis', title: 'Find time, then prove why', summary: 'Analysis aligns laps by distance and connects every coaching conclusion to the telemetry that produced it.', outcome: 'Choose one repeatable change instead of chasing every colored trace.', steps: [{ title: 'Choose comparable laps', copy: 'Start with similar car, fuel, tyre, weather, and track conditions.' }, { title: 'Find the largest segment', copy: 'The lap strip ranks where time changed.' }, { title: 'Inspect evidence', copy: 'Zoom into speed, throttle and brake before accepting advice.' }], terms: [{ term: 'Match quality', definition: 'How comparable the selected laps and conditions are.' }, { term: 'Optimal lap', definition: 'A stitched analytical estimate—not a lap you actually drove.' }, { term: 'Confidence', definition: 'Evidence strength after comparability and repeatability checks.' }] },
  strategy: { label: 'Strategy', title: 'Model the finish, not a fantasy', summary: 'Strategy calculates fuel and finish boundaries from explicit inputs, then separates analytical results from illustrative race detail.', outcome: 'Know the minimum stops, margin, and assumptions that could invalidate the plan.', steps: [{ title: 'Set race assumptions', copy: 'Duration and average lap time establish the finish boundary.' }, { title: 'Describe consumption', copy: 'Fuel, virtual energy, tank capacity, and pit loss drive the resource model.' }, { title: 'Stress-test uncertainty', copy: 'Compare balanced, safety-margin, and track-position postures.' }], terms: [{ term: 'Virtual energy (VE)', definition: 'LMU’s regulated energy allocation, expressed as a percentage per lap.' }, { term: 'Confidence', definition: 'How much the calculated inputs support the result—not the chance of winning.' }, { term: 'Illustrative', definition: 'Displayed for workflow design but not yet calculated from live race context.' }] },
  setups: { label: 'Setups', title: 'Change one thing with a way back', summary: 'The setup workshop explains trade-offs and protects the original before any user-initiated write.', outcome: 'Make a reversible change with an explicit expected effect.', steps: [{ title: 'Import your file', copy: 'Choose a real .svm and its matching track folder.' }, { title: 'Preview the trade-off', copy: 'Understand what improves and what may get worse.' }, { title: 'Install safely', copy: 'Apex validates, backs up, writes atomically, and rolls back on failure.' }], terms: [{ term: 'Generated setup', definition: 'A UX example only; no commercial or claimed-fast setup data is bundled.' }, { term: 'Confidence', definition: 'Strength of the evidence behind a recommendation.' }] },
  overlays: { label: 'Overlays', title: 'Build the minimum useful HUD', summary: 'Choose only information worth seeing while driving. Visibility and opacity are real; unsupported positioning controls are labelled.', outcome: 'A glanceable HUD that removes noise rather than adding it.', steps: [{ title: 'Start essential', copy: 'Relative, fuel, and delta answer the most frequent race questions.' }, { title: 'Add on demand', copy: 'Enable radar, inputs, flags, or tyres only when they earn screen space.' }, { title: 'Test at speed', copy: 'Open the click-through preview before relying on it in a session.' }], terms: [{ term: 'Click-through', definition: 'Mouse input passes through the always-on-top overlay to the game.' }, { term: 'Safe area', definition: 'The suggested region that avoids important game UI.' }] },
  settings: { label: 'Settings', title: 'Set up, verify, and recover', summary: 'Settings separates everyday connection controls from storage, updates, privacy, and deep diagnostics.', outcome: 'Confirm health quickly; reveal technical evidence only when something fails.', steps: [{ title: 'Connection', copy: 'Discover LMU and verify the local bridge.' }, { title: 'Data & storage', copy: 'See exactly where local files live and what leaves the PC.' }, { title: 'Diagnostics', copy: 'Run checks, expand failures, and export a reviewable support bundle.' }], terms: [{ term: 'Bridge', definition: 'A separate unprivileged local process that reads LMU shared memory.' }, { term: 'Support bundle', definition: 'Redacted system metadata and Apex logs; no telemetry frames or setup contents.' }] },
}

export function GuideDrawer({ guide, open, onClose }: { guide: ViewGuide; open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [open])
  return <div className="guide-layer" data-open={open ? 'true' : 'false'} aria-hidden={!open}><button className="guide-scrim" type="button" aria-label="Close guide" onClick={onClose} tabIndex={open ? 0 : -1} /><aside ref={drawerRef} className="guide-drawer" role="dialog" aria-modal={open ? 'true' : undefined} aria-labelledby="guide-title" inert={!open ? true : undefined}>
    <div className="guide-drawer__header"><div><Badge tone="accent"><BookOpen size={12} /> {guide.label} guide</Badge><h2 id="guide-title">{guide.title}</h2><p>{guide.summary}</p></div><button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Close guide"><X size={18} /></button></div>
    <div className="guide-outcome"><Check size={17} /><span><small>What success looks like</small><strong>{guide.outcome}</strong></span></div>
    <div className="guide-section"><div className="eyebrow">Recommended flow</div>{guide.steps.map((step, index) => <div className="guide-step" key={step.title}><i>{index + 1}</i><span><strong>{step.title}</strong><small>{step.copy}</small></span></div>)}</div>
    <div className="guide-section"><div className="eyebrow">Terms in this view</div><dl>{guide.terms.map((item) => <div key={item.term}><dt>{item.term}</dt><dd>{item.definition}</dd></div>)}</dl></div>
    <Button onClick={onClose}>Got it <ArrowRight size={14} /></Button>
  </aside></div>
}

export function DiscoveryPrompt({ guide, open, onOpen, onDismiss }: { guide: ViewGuide; open: boolean; onOpen: () => void; onDismiss: () => void }) {
  return <aside className="discovery-prompt" data-open={open ? 'true' : 'false'} aria-hidden={!open} inert={!open ? true : undefined} aria-label={`Introduction to ${guide.label}`}><div><HelpCircle size={16} /><span><small>New to {guide.label}?</small><strong>{guide.summary}</strong></span></div><div><button type="button" className="text-button" onClick={onDismiss}>Dismiss</button><Button size="sm" variant="secondary" onClick={onOpen}>Show me around</Button></div></aside>
}
