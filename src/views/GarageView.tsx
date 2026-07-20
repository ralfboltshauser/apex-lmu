import { useEffect, useState } from 'react'
import { CarFront, ChevronDown, Database, MapPin, Route, ShieldCheck, TriangleAlert, Warehouse } from 'lucide-react'
import { Badge, Button, Card } from '../components/ui'
import { formatMessage, useI18n, useMessages } from '../i18n'
import { garageMessages } from '../i18n/garageMessages'

function distance(mm: number, language: string) {
  return new Intl.NumberFormat(language, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(mm / 1_000_000)
}

function date(value: string | null, language: string) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isFinite(parsed.valueOf()) ? new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(parsed) : '—'
}

export function GarageView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const m = useMessages(garageMessages)
  const { language } = useI18n()
  const [stats, setStats] = useState<ApexGarageStats | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!window.apexDesktop?.getGarageStats) return
    void window.apexDesktop.getGarageStats()
      .then((next) => {
        if (cancelled) return
        setStats(next)
        setExpanded((current) => current ?? next.models[0]?.id ?? null)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(true)
        void window.apexDesktop?.reportError({ message: error instanceof Error ? error.message : String(error), context: 'garage-stats' })
      })
    return () => { cancelled = true }
  }, [])

  const state = loadError ? 'error' : stats?.status
  const stateCopy = state === 'future-schema'
    ? [m.state.futureTitle, m.state.futureCopy]
    : state === 'error'
      ? [m.state.errorTitle, m.state.errorCopy]
      : state === 'closed'
        ? [m.state.closedTitle, m.state.closedCopy]
        : !window.apexDesktop?.getGarageStats
          ? [m.state.desktopTitle, m.state.desktopCopy]
          : null

  return (
    <div className="view view--garage" data-feedback-redact="measured-lifetime-stats">
      <div className="page-heading">
        <div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.heading.title}</h1><p>{m.heading.description}</p></div>
        {stats && <Badge tone={stats.status === 'ready' ? 'positive' : 'warning'}><Database size={12} /> {formatMessage(m.footer.catalog, { version: stats.catalogVersion })}</Badge>}
      </div>

      {!stats && !stateCopy && window.apexDesktop?.getGarageStats && <Card className="garage-state"><Warehouse size={28} /><div><h2>{m.state.loading}</h2></div></Card>}
      {stateCopy && <Card className="garage-state garage-state--warning"><TriangleAlert size={28} /><div><h2>{stateCopy[0]}</h2><p>{stateCopy[1]}</p>{stats?.message && <small>{stats.message}</small>}<Button variant="secondary" size="sm" onClick={onOpenSettings}>{m.footer.settings}</Button></div></Card>}

      {stats?.status === 'ready' && <>
        <section className="garage-summary" aria-label={m.heading.title}>
          <div className="garage-summary__primary"><small>{m.summary.total}</small><strong>{distance(stats.totalDistanceMm, language)} <span>{m.units.kilometers}</span></strong></div>
          <div><small>{m.summary.since}</small><strong>{date(stats.trackedSince, language)}</strong></div>
          <div><small>{m.summary.drives}</small><strong>{new Intl.NumberFormat(language).format(stats.totalDrives)}</strong></div>
          <div><small>{m.summary.models}</small><strong>{new Intl.NumberFormat(language).format(stats.models.length + stats.omittedModels)}</strong></div>
        </section>

        {stats.models.length === 0 ? <Card className="garage-state"><Warehouse size={28} /><div><h2>{m.state.emptyTitle}</h2><p>{m.state.emptyCopy}</p></div></Card> : <div className="garage-models">
          {stats.models.map((model) => {
            const open = expanded === model.id
            return <article className={`garage-model ${open ? 'is-open' : ''}`} key={model.id}>
              <button type="button" className="garage-model__toggle" aria-expanded={open} aria-controls={`garage-model-${model.id}`} onClick={() => setExpanded(open ? null : model.id)}>
                <span className="garage-model__icon"><CarFront size={21} /></span>
                <span className="garage-model__identity"><span><Badge tone={model.recognized ? 'neutral' : 'warning'}>{model.recognized ? m.model.recognized : m.model.unrecognized}</Badge>{model.variantCount > 1 && <small>{formatMessage(m.model.variants, { count: model.variantCount })}</small>}</span><strong>{model.name}</strong><small>{model.className} · {formatMessage(m.model.drives, { count: model.drives })} · {formatMessage(m.model.tracks, { count: model.trackCount })}</small></span>
                <span className="garage-model__distance"><strong>{distance(model.distanceMm, language)} <small>{m.units.kilometers}</small></strong><span>{formatMessage(m.model.lastDriven, { date: date(model.lastDrivenAt, language) })}</span></span>
                <ChevronDown size={18} aria-label={formatMessage(open ? m.model.hideTracks : m.model.showTracks, { model: model.name })} />
              </button>
              {open && <div className="garage-model__details" id={`garage-model-${model.id}`}>
                <div className="garage-track-head"><span>{m.model.track}</span><span>{m.model.activity}</span><span>{m.model.distance}</span></div>
                {model.tracks.map((track) => <div className="garage-track" key={track.name}><span><MapPin size={14} /><strong>{track.name}</strong></span><small>{formatMessage(m.model.drives, { count: track.drives })} · {formatMessage(m.model.lastDriven, { date: date(track.lastDrivenAt, language) })}</small><b>{distance(track.distanceMm, language)} {m.units.kilometers}</b></div>)}
                {model.unattributedDistanceMm !== 0 && <div className="garage-adjustment"><Route size={15} /><span><strong>{m.model.unattributed}: {distance(model.unattributedDistanceMm, language)} {m.units.kilometers}</strong><small>{m.model.unattributedCopy}</small></span></div>}
                {model.omittedTracks > 0 && <p className="garage-limit">{formatMessage(m.limits.tracks, { count: model.omittedTracks })}</p>}
              </div>}
            </article>
          })}
        </div>}
        {stats.omittedModels > 0 && <p className="garage-limit">{formatMessage(m.limits.models, { count: stats.omittedModels })}</p>}
      </>}

      <footer className="garage-footer"><ShieldCheck size={18} /><span><strong>{m.footer.title}</strong><small>{m.footer.copy}</small></span><Button variant="secondary" size="sm" onClick={onOpenSettings}>{m.footer.settings}</Button></footer>
    </div>
  )
}
