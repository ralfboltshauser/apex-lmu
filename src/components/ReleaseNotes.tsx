import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, Sparkles, TriangleAlert, X } from 'lucide-react'
import { defineMessages, useI18n, useMessages } from '../i18n'
import { releaseCatalog, type ReleaseNote } from '../release-notes'
import { Badge, Button, Card, CardHeader } from './ui'

const messages = defineMessages(
  {
    eyebrow: 'What’s new', title: 'Built locally. Explained clearly.', description: 'Every bundled release note is available offline and comes from the same reviewed source as the public release.',
    dialogAria: 'What’s new in Apex', close: 'Close what’s new', oneRelease: 'One new release', manyReleases: '{count} new releases', done: 'Done', viewAll: 'View complete history', saving: 'Saving…', saveFailed: 'Apex could not save that you read these notes. They will remain open so nothing is silently lost.', highlights: 'Highlights', limitations: 'Known limitations', released: 'Released {date}', historyEyebrow: 'Version history', historyTitle: 'What’s new in Apex', historyDescription: 'Complete bundled English and German release history. No network connection is required.', current: 'Current',
  },
  {
    eyebrow: 'Neuigkeiten', title: 'Lokal gebaut. Klar erklärt.', description: 'Jeder mitgelieferte Versionshinweis ist offline verfügbar und stammt aus derselben geprüften Quelle wie das öffentliche Release.',
    dialogAria: 'Neuigkeiten in Apex', close: 'Neuigkeiten schließen', oneRelease: 'Eine neue Version', manyReleases: '{count} neue Versionen', done: 'Fertig', viewAll: 'Vollständigen Verlauf anzeigen', saving: 'Wird gespeichert …', saveFailed: 'Apex konnte nicht speichern, dass du diese Hinweise gelesen hast. Sie bleiben geöffnet, damit nichts unbemerkt verloren geht.', highlights: 'Höhepunkte', limitations: 'Bekannte Einschränkungen', released: 'Veröffentlicht am {date}', historyEyebrow: 'Versionsverlauf', historyTitle: 'Neuigkeiten in Apex', historyDescription: 'Vollständiger mitgelieferter Versionsverlauf auf Englisch und Deutsch. Keine Netzwerkverbindung erforderlich.', current: 'Aktuell',
  },
)

function replace(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (token, key) => key in values ? String(values[key]) : token)
}

function ReleaseEntry({ release, current = false }: { release: ReleaseNote; current?: boolean }) {
  const { language } = useI18n()
  const m = useMessages(messages)
  const note = release[language]
  return <article className="release-note">
    <header><div><span>{replace(m.released, { date: release.releasedAt })}</span><h3>{note.title}</h3></div><Badge tone={current ? 'accent' : 'neutral'}>{current ? m.current : `v${release.version}`}</Badge></header>
    <p>{note.summary}</p>
    <section aria-label={m.highlights}><strong><Sparkles size={13} /> {m.highlights}</strong>{note.highlights.map((item) => <div key={item.id}><Check size={14} /><span><b>{item.title}</b><small>{item.body}</small></span></div>)}</section>
    {note.knownLimitations.length > 0 && <section className="release-note__limitations" aria-label={m.limitations}><strong><TriangleAlert size={13} /> {m.limitations}</strong>{note.knownLimitations.map((item) => <div key={item.id}><TriangleAlert size={14} /><span><b>{item.title}</b><small>{item.body}</small></span></div>)}</section>}
  </article>
}

export function WhatsNewDialog({ releases, onDone, onViewAll }: { releases: readonly ReleaseNote[]; onDone: () => Promise<void>; onViewAll: () => Promise<void> }) {
  const m = useMessages(messages)
  const modal = useRef<HTMLDivElement>(null)
  const doneRef = useRef(onDone)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  doneRef.current = onDone
  const finish = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setFailed(false)
    try { await action() } catch { setFailed(true); setBusy(false) }
  }
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = modal.current
    root?.querySelector<HTMLElement>('button')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); void finish(doneRef.current); return }
      if (event.key !== 'Tab' || !root) return
      const focusable = [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('keydown', keydown); previous?.focus() }
  }, [])
  return <div className="whats-new-backdrop" role="dialog" aria-modal="true" aria-labelledby="whats-new-title" aria-describedby="whats-new-description">
    <div className="whats-new-modal" ref={modal}>
      <header className="whats-new-modal__header"><div><div className="eyebrow">{m.eyebrow}</div><h2 id="whats-new-title">{m.title}</h2><p id="whats-new-description">{m.description}</p></div><button type="button" className="icon-button" aria-label={m.close} onClick={() => void finish(onDone)} disabled={busy}><X size={18} /></button></header>
      <Badge tone="accent">{releases.length === 1 ? m.oneRelease : replace(m.manyReleases, { count: releases.length })}</Badge>
      <div className="whats-new-modal__releases">{releases.map((release, index) => <ReleaseEntry key={release.version} release={release} current={index === 0} />)}</div>
      {failed && <p className="whats-new-modal__error" role="alert">{m.saveFailed}</p>}
      <footer><Button variant="secondary" icon={<BookOpen size={14} />} onClick={() => void finish(onViewAll)} disabled={busy}>{m.viewAll}</Button><Button onClick={() => void finish(onDone)} disabled={busy}>{busy ? m.saving : m.done}</Button></footer>
    </div>
  </div>
}

export function ReleaseHistory() {
  const m = useMessages(messages)
  const { language } = useI18n()
  return <Card className="release-history">
    <CardHeader eyebrow={m.historyEyebrow} title={m.historyTitle} description={m.historyDescription} action={<BookOpen size={19} />} />
    <div>{releaseCatalog.releases.map((release, index) => <details key={release.version} open={index === 0}><summary><span><b>{`v${release.version}`}</b><small>{release.releasedAt}</small></span><strong>{release[language].title}</strong></summary><ReleaseEntry release={release} current={index === 0} /></details>)}</div>
  </Card>
}
