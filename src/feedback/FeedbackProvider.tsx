import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Crosshair, Image, ShieldCheck, X } from 'lucide-react'
import { Button } from '../components/ui'
import { useI18n, useMessages } from '../i18n'
import { feedbackMessages } from './messages'

const EMPTY_STATE: ApexFeedbackState = { status: 'ready', pending: 0, unread: 0, needsAnswer: 0, items: [] }

type FeedbackContextValue = {
  state: ApexFeedbackState
  selectedThreadId: string | null
  startSelection: () => void
  openThread: (feedbackId: string) => void
  selectThread: (feedbackId: string | null) => void
  refresh: () => Promise<void>
}

type Draft = {
  element: ApexFeedbackElementContext
  selectedArea?: ApexFeedbackImage | null
  fullWindow?: ApexFeedbackImage | null
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

function selectorFor(element: Element) {
  const explicit = element.getAttribute('data-feedback-id')
  if (explicit) return `[data-feedback-id="${CSS.escape(explicit)}"]`
  if (element.id) return `#${CSS.escape(element.id)}`
  const parts: string[] = []
  let current: Element | null = element
  while (current && current !== document.body && parts.length < 5) {
    const parent: Element | null = current.parentElement
    const siblings = parent ? [...parent.children].filter((candidate) => candidate.tagName === current!.tagName) : []
    parts.unshift(`${current.tagName.toLowerCase()}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ''}`)
    current = parent
  }
  return parts.join(' > ') || element.tagName.toLowerCase()
}

function elementContext(element: Element, selectedText = '', redactAll = false): ApexFeedbackElementContext {
  const rect = element.getBoundingClientRect()
  const redacted = redactAll || Boolean(element.closest('[data-feedback-redact]'))
  const name = element.getAttribute('aria-label') || element.getAttribute('title') || (element as HTMLElement).innerText?.trim().replace(/\s+/g, ' ').slice(0, 512)
  return {
    feedbackId: element.getAttribute('data-feedback-id') || undefined,
    selector: selectorFor(element),
    tagName: element.tagName.toLowerCase(),
    role: element.getAttribute('role') || undefined,
    accessibleName: redacted ? '[redacted]' : name || undefined,
    cssClasses: typeof element.className === 'string' ? element.className.slice(0, 2048) : undefined,
    selectedText: redacted ? undefined : selectedText.trim().slice(0, 4096) || undefined,
    nearbyText: redacted ? '[redacted]' : (element as HTMLElement).innerText?.trim().replace(/\s+/g, ' ').slice(0, 4096) || undefined,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  }
}

async function privacySafeCapture(rect: ApexFeedbackElementContext['rect'], redactWorkspace = false) {
  if (!window.apexDesktop?.captureFeedback) return { selectedArea: null, fullWindow: null }
  const hidden = [...document.querySelectorAll<HTMLElement>('[data-feedback-ui]')].map((element) => ({ element, visibility: element.style.visibility }))
  const privateElements = new Set([...document.querySelectorAll<HTMLElement>('[data-feedback-redact]')])
  if (redactWorkspace) document.querySelectorAll<HTMLElement>('.workspace__content').forEach((element) => privateElements.add(element))
  const masks = [...privateElements].map((element) => {
    const bounds = element.getBoundingClientRect()
    const mask = document.createElement('div')
    mask.dataset.feedbackUi = 'mask'
    Object.assign(mask.style, { position: 'fixed', zIndex: '2147483647', left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, background: '#08090a', borderRadius: getComputedStyle(element).borderRadius, pointerEvents: 'none' })
    document.body.append(mask)
    return mask
  })
  hidden.forEach(({ element }) => { element.style.visibility = 'hidden' })
  masks.forEach((mask) => { mask.style.visibility = 'visible' })
  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return await window.apexDesktop.captureFeedback({ rect })
  } finally {
    hidden.forEach(({ element, visibility }) => { element.style.visibility = visibility })
    masks.forEach((mask) => mask.remove())
  }
}

export function FeedbackProvider({ children, view, source, onOpenView }: { children: ReactNode; view: string; source: 'live' | 'demo' | 'offline'; onOpenView: () => void }) {
  const { language } = useI18n()
  const messages = useMessages(feedbackMessages)
  const [state, setState] = useState<ApexFeedbackState>(EMPTY_STATE)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [hovered, setHovered] = useState<Element | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const request = window.apexDesktop?.syncFeedback?.()
    if (request) setState(await request)
  }, [])

  const openThread = useCallback((feedbackId: string) => {
    setSelectedThreadId(feedbackId)
    onOpenView()
    void window.apexDesktop?.markFeedbackRead?.(feedbackId)?.then(setState)
  }, [onOpenView])

  const startSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const ancestor = selection.getRangeAt(0).commonAncestorContainer
      const element = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor as Element : ancestor.parentElement
      if (element && !element.closest('[data-feedback-ui]')) {
        const context = elementContext(element, selection.toString(), source === 'live')
        setCapturing(true)
        void privacySafeCapture(context.rect, source === 'live').then((images) => setDraft({ element: context, ...images })).finally(() => setCapturing(false))
        return
      }
    }
    setDraft(null)
    setError('')
    setSelecting(true)
  }, [source])

  useEffect(() => {
    const stopChanged = window.apexDesktop?.onFeedbackChanged?.(setState)
    const stopShortcut = window.apexDesktop?.onFeedbackShortcut?.(startSelection)
    const handleOpen = (feedbackId: string) => { openThread(feedbackId); void window.apexDesktop?.consumeFeedbackThread() }
    const stopOpen = window.apexDesktop?.onOpenFeedbackThread?.(handleOpen)
    void window.apexDesktop?.getFeedbackState?.()?.then(setState)
    void window.apexDesktop?.consumeFeedbackThread?.()?.then((feedbackId) => { if (feedbackId) openThread(feedbackId) })
    return () => { stopChanged?.(); stopShortcut?.(); stopOpen?.() }
  }, [openThread, startSelection])

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selecting) { setSelecting(false); setHovered(null); return }
      if (!window.apexDesktop && event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); startSelection() }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [selecting, startSelection])

  useEffect(() => {
    if (!selecting) return
    const move = (event: PointerEvent) => {
      const candidate = (event.target as Element | null)?.closest('*') ?? null
      setHovered(candidate?.closest('[data-feedback-ui]') ? null : candidate)
    }
    const choose = (event: MouseEvent) => {
      const element = event.target as Element | null
      if (!element || element.closest('[data-feedback-ui]')) return
      event.preventDefault()
      event.stopPropagation()
      const context = elementContext(element, window.getSelection()?.toString() || '', source === 'live')
      setSelecting(false)
      setHovered(null)
      setCapturing(true)
      void privacySafeCapture(context.rect, source === 'live').then((images) => setDraft({ element: context, ...images })).finally(() => setCapturing(false))
    }
    document.addEventListener('pointermove', move, true)
    document.addEventListener('click', choose, true)
    return () => { document.removeEventListener('pointermove', move, true); document.removeEventListener('click', choose, true) }
  }, [selecting, source])

  const submit = async () => {
    if (!draft || !comment.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const item = await window.apexDesktop?.submitFeedback({
        comment: comment.trim(),
        context: { view, language, source, viewport: { width: window.innerWidth, height: window.innerHeight }, element: draft.element },
        selectedArea: draft.selectedArea,
        fullWindow: draft.fullWindow,
      })
      const next = await window.apexDesktop?.getFeedbackState()
      if (next) setState(next)
      setDraft(null)
      setComment('')
      if (item) openThread(item.id)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally { setSubmitting(false) }
  }

  const hoveredRect = hovered?.getBoundingClientRect()
  const value = useMemo<FeedbackContextValue>(() => ({ state, selectedThreadId, startSelection, openThread, selectThread: setSelectedThreadId, refresh }), [state, selectedThreadId, startSelection, openThread, refresh])

  return <FeedbackContext.Provider value={value}>
    {children}
    {selecting && <div className="feedback-selector-ui" data-feedback-ui="selector">
      <div className="feedback-selector-tip"><Crosshair size={16} /><strong>{messages.selector.active}</strong><span>{messages.selector.cancel}</span></div>
      {hoveredRect && <div className="feedback-selector-outline" style={{ left: hoveredRect.left, top: hoveredRect.top, width: hoveredRect.width, height: hoveredRect.height }} />}
    </div>}
    {capturing && <div className="feedback-capturing" data-feedback-ui="capture"><Image size={17} /><span>{messages.selector.capturing}</span></div>}
    {draft && <div className="feedback-composer-backdrop" data-feedback-ui="composer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null) }}>
      <section className="feedback-composer" role="dialog" aria-modal="true" aria-labelledby="feedback-composer-title">
        <header><div><span className="eyebrow">{messages.composer.eyebrow}</span><h2 id="feedback-composer-title">{messages.composer.title}</h2><p>{messages.composer.description}</p></div><button className="icon-button" type="button" aria-label={messages.composer.cancel} onClick={() => setDraft(null)}><X size={18} /></button></header>
        <div className="feedback-target-summary"><Crosshair size={15} /><div><strong>{messages.composer.selected}</strong><code>{draft.element.feedbackId || draft.element.selector}</code>{draft.element.selectedText && <span><b>{messages.composer.selectedText}:</b> {draft.element.selectedText}</span>}</div></div>
        <label className="feedback-composer-field"><span>{messages.composer.label}</span><textarea autoFocus rows={6} maxLength={10_000} value={comment} placeholder={messages.composer.placeholder} onChange={(event) => setComment(event.target.value)} /></label>
        <div className="feedback-attachment-note"><Image size={16} /><div><strong>{messages.composer.screenshots}</strong><span>{messages.composer.screenshotDetail}</span></div></div>
        <div className="feedback-privacy-note"><ShieldCheck size={16} /><p>{messages.composer.privacy}</p></div>
        {error && <p className="feedback-error" role="alert">{messages.composer.failure}: {error}</p>}
        <footer><Button variant="secondary" onClick={() => setDraft(null)}>{messages.composer.cancel}</Button><Button disabled={!comment.trim() || submitting} icon={<Check size={15} />} onClick={() => void submit()}>{submitting ? messages.composer.sending : messages.composer.send}</Button></footer>
      </section>
    </div>}
  </FeedbackContext.Provider>
}

export function useFeedback() {
  const value = useContext(FeedbackContext)
  if (!value) throw new Error('useFeedback must be used inside FeedbackProvider')
  return value
}
