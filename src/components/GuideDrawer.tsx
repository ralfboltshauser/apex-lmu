import { useEffect, useRef } from 'react'
import { ArrowRight, BookOpen, Check, HelpCircle, X } from 'lucide-react'
import type { ViewId } from './Shell'
import { Badge, Button } from './ui'
import { appMessages, englishViewGuides } from '../i18n/appMessages'
import { formatMessage, useMessages } from '../i18n'

export type ViewGuide = {
  label: string
  title: string
  summary: string
  outcome: string
  steps: ReadonlyArray<{ title: string; copy: string }>
  terms: ReadonlyArray<{ term: string; definition: string }>
}

export const viewGuides: Record<ViewId, ViewGuide> = englishViewGuides

export function useViewGuides(): Record<ViewId, ViewGuide> {
  return useMessages(appMessages).guides.views
}

export function GuideDrawer({ guide, open, onClose }: { guide: ViewGuide; open: boolean; onClose: () => void }) {
  const m = useMessages(appMessages).guides
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
  return <div className="guide-layer" data-open={open ? 'true' : 'false'} aria-hidden={!open}><button className="guide-scrim" type="button" aria-label={m.close} onClick={onClose} tabIndex={open ? 0 : -1} /><aside ref={drawerRef} className="guide-drawer" role="dialog" aria-modal={open ? 'true' : undefined} aria-labelledby="guide-title" inert={!open ? true : undefined}>
    <div className="guide-drawer__header"><div><Badge tone="accent"><BookOpen size={12} /> {guide.label} {m.guideSuffix}</Badge><h2 id="guide-title">{guide.title}</h2><p>{guide.summary}</p></div><button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label={m.close}><X size={18} /></button></div>
    <div className="guide-outcome"><Check size={17} /><span><small>{m.success}</small><strong>{guide.outcome}</strong></span></div>
    <div className="guide-section"><div className="eyebrow">{m.flow}</div>{guide.steps.map((step, index) => <div className="guide-step" key={step.title}><i>{index + 1}</i><span><strong>{step.title}</strong><small>{step.copy}</small></span></div>)}</div>
    <div className="guide-section"><div className="eyebrow">{m.terms}</div><dl>{guide.terms.map((item) => <div key={item.term}><dt>{item.term}</dt><dd>{item.definition}</dd></div>)}</dl></div>
    <Button onClick={onClose}>{m.understood} <ArrowRight size={14} /></Button>
  </aside></div>
}

export function DiscoveryPrompt({ guide, open, onOpen, onDismiss }: { guide: ViewGuide; open: boolean; onOpen: () => void; onDismiss: () => void }) {
  const m = useMessages(appMessages).guides
  return <aside className="discovery-prompt" data-open={open ? 'true' : 'false'} aria-hidden={!open} inert={!open ? true : undefined} aria-label={formatMessage(m.introduction, { label: guide.label })}><div><HelpCircle size={16} /><span><small>{formatMessage(m.newTo, { label: guide.label })}</small><strong>{guide.summary}</strong></span></div><div><button type="button" className="text-button" onClick={onDismiss}>{m.dismiss}</button><Button size="sm" variant="secondary" onClick={onOpen}>{m.showAround}</Button></div></aside>
}
