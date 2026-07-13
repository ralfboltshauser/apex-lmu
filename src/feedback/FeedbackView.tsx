import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Image, MessageSquarePlus, RefreshCw, RotateCcw, Send } from 'lucide-react'
import { Badge, Button, Card, Segmented } from '../components/ui'
import { formatMessage, useI18n, useMessages } from '../i18n'
import { feedbackMessages } from './messages'
import { useFeedback } from './FeedbackProvider'

type Filter = 'all' | 'open' | 'answered' | 'resolved'

const CLOSED_STATUSES = new Set<ApexFeedbackStatus>(['resolved', 'dismissed', 'duplicate'])

function statusTone(status: ApexFeedbackStatus): 'neutral' | 'positive' | 'warning' | 'critical' | 'accent' {
  if (status === 'resolved') return 'positive'
  if (status === 'needs_user_answer') return 'warning'
  if (status === 'dismissed' || status === 'duplicate') return 'neutral'
  if (status === 'investigating' || status === 'in_progress') return 'accent'
  return 'neutral'
}

function matchesFilter(item: ApexFeedbackItem, filter: Filter) {
  if (filter === 'all') return true
  if (filter === 'answered') return item.status === 'needs_user_answer'
  if (filter === 'resolved') return CLOSED_STATUSES.has(item.status)
  return !CLOSED_STATUSES.has(item.status)
}

function AttachmentPreview({ feedbackId, attachment, label }: { feedbackId: string; attachment: ApexFeedbackAttachment; label: string }) {
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setSource('')
    setFailed(false)
    void window.apexDesktop?.getFeedbackAttachment(feedbackId, attachment.id)
      .then((result) => { if (!cancelled) setSource(result.dataUrl) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [attachment.id, feedbackId])
  return <figure className="feedback-attachment">
    {source ? <img src={source} alt={label} /> : <div className={failed ? 'is-failed' : ''}><Image size={18} /><span>{failed ? '—' : '…'}</span></div>}
    <figcaption>{label} · {attachment.width}×{attachment.height}</figcaption>
  </figure>
}

export function FeedbackView() {
  const m = useMessages(feedbackMessages)
  const { language } = useI18n()
  const { state, selectedThreadId, startSelection, selectThread, refresh } = useFeedback()
  const [filter, setFilter] = useState<Filter>('all')
  const [thread, setThread] = useState<ApexFeedbackItem | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [reply, setReply] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const items = useMemo(() => state.items.filter((item) => matchesFilter(item, filter)), [filter, state.items])
  const selectedSummary = state.items.find((item) => item.id === selectedThreadId) ?? null

  useEffect(() => {
    if (selectedThreadId && state.items.some((item) => item.id === selectedThreadId)) return
    selectThread(items[0]?.id ?? null)
  }, [items, selectThread, selectedThreadId, state.items])

  useEffect(() => {
    if (!selectedThreadId) { setThread(null); return }
    let cancelled = false
    setLoadingThread(true)
    setError('')
    void window.apexDesktop?.getFeedback(selectedThreadId)
      .then((item) => { if (!cancelled) setThread(item) })
      .catch((failure) => { if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure)) })
      .finally(() => { if (!cancelled) setLoadingThread(false) })
    return () => { cancelled = true }
  }, [selectedSummary?.revision, selectedThreadId])

  const synchronize = async () => {
    setSyncing(true)
    setError('')
    try { await refresh() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setSyncing(false) }
  }

  const sendReply = async () => {
    if (!thread || !reply.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const next = await window.apexDesktop?.replyFeedback(thread.id, reply.trim(), thread.revision)
      if (next) setThread(next)
      setReply('')
      await refresh()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setSubmitting(false) }
  }

  const reopen = async () => {
    if (!thread || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const next = await window.apexDesktop?.reopenFeedback(thread.id, thread.revision)
      if (next) setThread(next)
      await refresh()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setSubmitting(false) }
  }

  const activeThread = thread?.id === selectedThreadId ? thread : selectedSummary
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

  return <div className="view feedback-view">
    <div className="page-heading page-heading--compact"><div><div className="eyebrow">{m.inbox.eyebrow}</div><h1>{m.inbox.title}</h1><p>{m.inbox.summary}</p></div><div className="page-heading__actions"><Button variant="secondary" icon={<RefreshCw size={15} />} disabled={syncing} onClick={() => void synchronize()}>{syncing ? m.inbox.syncing : m.inbox.refresh}</Button><Button icon={<MessageSquarePlus size={15} />} onClick={startSelection}>{m.inbox.newFeedback}</Button></div></div>
    <div className="feedback-status-strip">
      <Badge tone={state.pending ? 'warning' : 'positive'}>{formatMessage(m.inbox.queued, { count: state.pending })}</Badge>
      {state.needsAnswer > 0 && <Badge tone="warning">{formatMessage(m.inbox.needsAnswer, { count: state.needsAnswer })}</Badge>}
      <span>{m.composer.privacy}</span>
    </div>
    {state.status === 'error' && <div className="feedback-sync-warning"><AlertTriangle size={15} /><span>{m.composer.queuedDetail}</span></div>}
    {error && <p className="feedback-error" role="alert">{error}</p>}
    <Segmented value={filter} onChange={setFilter} ariaLabel={m.inbox.title} options={[{ value: 'all', label: m.inbox.all }, { value: 'open', label: m.inbox.open }, { value: 'answered', label: m.inbox.answered }, { value: 'resolved', label: m.inbox.resolved }]} />
    <div className="feedback-inbox-layout" data-feedback-redact="private-feedback-conversations">
      <Card className="feedback-thread-list">
        {items.length === 0 ? <div className="feedback-empty"><MessageSquarePlus size={24} /><strong>{state.items.length ? m.inbox.emptyFilteredTitle : m.inbox.emptyTitle}</strong><span>{state.items.length ? m.inbox.emptyFilteredBody : m.inbox.emptyBody}</span></div> : items.map((item) => <button key={item.id} type="button" className={item.id === selectedThreadId ? 'is-active' : ''} aria-pressed={item.id === selectedThreadId} onClick={() => selectThread(item.id)}><span className="feedback-thread-list__meta"><Badge tone={statusTone(item.status)}>{m.inbox.status[item.status]}</Badge><time dateTime={item.updatedAt}>{date(item.updatedAt)}</time></span><strong>{item.firstMessage}</strong><span className="feedback-thread-list__detail"><code>{item.syncState === 'queued' ? m.inbox.localReference : item.reference}</code><small>{formatMessage(m.inbox.messageCount, { count: item.messages?.length ?? 1 })}</small></span></button>)}
      </Card>
      <Card className="feedback-thread-detail">
        {!activeThread ? <div className="feedback-empty"><strong>{m.inbox.chooseTitle}</strong><span>{m.inbox.chooseBody}</span></div> : <>
          <header className="feedback-thread-detail__header"><div><div><Badge tone={statusTone(activeThread.status)}>{m.inbox.status[activeThread.status]}</Badge><code>{activeThread.syncState === 'queued' ? m.inbox.localReference : activeThread.reference}</code></div><h2>{activeThread.firstMessage}</h2><p>{formatMessage(m.inbox.view, { view: activeThread.view ?? activeThread.context?.view ?? '—' })} · {formatMessage(m.inbox.updated, { date: date(activeThread.updatedAt) })}</p></div></header>
          {loadingThread && <p className="feedback-thread-loading">{m.inbox.syncing}</p>}
          <ol className="feedback-conversation">{(activeThread.messages ?? []).map((message) => <li key={message.id} className={`is-${message.actor}`}><div><strong>{message.actor === 'human' ? m.inbox.you : message.actor === 'agent' ? m.inbox.apexTeam : m.inbox.system}</strong>{message.kind === 'question' && <Badge tone="warning">{m.inbox.question}</Badge>}<time dateTime={message.createdAt}>{date(message.createdAt)}</time></div><p>{message.body}</p></li>)}</ol>
          {activeThread.attachments && activeThread.attachments.length > 0 && <div className="feedback-attachments">{activeThread.attachments.map((attachment, index) => <AttachmentPreview key={attachment.id} feedbackId={activeThread.id} attachment={attachment} label={formatMessage(m.inbox.screenshot, { number: index + 1 })} />)}</div>}
          {activeThread.resolutionSummary && <div className="feedback-resolution"><strong>{m.inbox.resolution}</strong><p>{activeThread.resolutionSummary}</p></div>}
          {CLOSED_STATUSES.has(activeThread.status) ? <div className="feedback-reopen"><Button variant="secondary" icon={<RotateCcw size={15} />} disabled={submitting || activeThread.id.startsWith('local:')} onClick={() => void reopen()}>{m.inbox.reopen}</Button></div> : <label className="feedback-reply"><span>{m.inbox.replyLabel}</span><textarea rows={4} maxLength={10_000} value={reply} placeholder={m.inbox.replyPlaceholder} disabled={activeThread.id.startsWith('local:')} onChange={(event) => setReply(event.target.value)} /><Button icon={<Send size={15} />} disabled={!reply.trim() || submitting || activeThread.id.startsWith('local:')} onClick={() => void sendReply()}>{m.inbox.sendReply}</Button></label>}
        </>}
      </Card>
    </div>
  </div>
}
