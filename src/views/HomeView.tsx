import {
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  CloudSun,
  Download,
  Flag,
  Fuel,
  Gauge,
  Route,
  Sparkles,
  TimerReset,
  Trophy,
  Upload,
  Zap,
} from 'lucide-react'
import { demoInsights, demoSession, demoSessions } from '../data/demo'
import { Badge, Button, Card, CardHeader, Metric, Progress } from '../components/ui'
import type { ViewId } from '../components/Shell'
import type { TelemetryFrame } from '../core'
import { defineMessages, useI18n, useMessages, type Language } from '../i18n'

const copy = defineMessages({
  circuitMap: 'circuit map', you: 'YOU', speedUnit: 'km/h', literUnit: 'L', percentUnit: '%', secondsUnit: 's',
  heading: { eyebrow: 'Command center', liveTitle: 'Telemetry is connected.', demoTitle: 'Generated race demo.', readyTitle: 'Apex is ready.', liveDescription: 'Open the measured live view for values received from LMU.', demoDescription: 'Explore the full product with deterministic example data.', readyDescription: 'Inspect recordings, plan a race, or start the generated live demo.', inspect: 'Inspect recording', analysis: 'Open analysis demo' },
  measured: { badge: 'Measured live data', lap: 'Lap', classPosition: 'in class', open: 'Open measured view' },
  demo: { badge: 'Generated demo', race: 'Race', lap: 'Lap', perLap: 'per lap', stintLap: 'Stint lap', open: 'Open live session', classPosition: 'Class position', leader: 'to leader', lastLap: 'Last lap', fuel: 'Fuel remaining', laps: 'laps', finishMargin: 'Finish margin', plan: 'Plan A · no save', energy: 'Virtual energy', pitWindow: 'Pit window in 5–7 laps', rejoin: 'Rejoin estimate: P6, clean air' },
  waiting: { badge: 'Waiting for Le Mans Ultimate', title: 'Start driving. Apex handles the rest.', description: 'Live values appear automatically through the local bridge. Continuous recording is not enabled in this alpha.', openLmu: 'Open LMU', anySession: 'Any session works', takeTrack: 'Take the track', connects: 'Apex connects at 50 Hz', review: 'Review', inspect: 'Inspect local recordings' },
  provenance: { badge: 'Generated examples', description: 'The coaching, readiness, sessions, event, and forecast cards below demonstrate the intended UX; they are not claims about your driving.' },
  opportunity: { eyebrow: 'Biggest opportunity', title: 'One change for your next stint', confidence: 'confidence · comparable conditions', evidence: 'See evidence' },
  readiness: { eyebrow: 'Race readiness', title: 'Spa · 60 minutes', pace: 'Pace', ready: 'Ready', paceLabel: 'Pace readiness 91%', paceDetail: 'Within 0.7% of reference over 5 laps', strategy: 'Strategy', check: 'Check', strategyLabel: 'Strategy readiness 72%', strategyDetail: 'Wet crossover has not been simulated', consistency: 'Consistency', strong: 'Strong', consistencyLabel: 'Consistency readiness 88%', consistencyDetail: '±0.31 s over the last clean stint', open: 'Open race brief' },
  sessions: { eyebrow: 'Recent work', title: 'Sessions', viewAll: 'View all', laps: 'laps' },
  conditions: { eyebrow: 'Next event', title: 'Saturday · Spa 2.4h', start: 'Start', plus45: '+45m', plus90: '+90m', dry: 'Dry', cloudy: 'Cloudy', rain: 'Rain 35%', drivers: '18 drivers registered · Split estimate 2,140' },
  quick: { aria: 'Quick actions', inspectTitle: 'Inspect LMU recording', inspectDetail: 'Read-only DuckDB schema and lap index', setupTitle: 'Manage a setup', setupDetail: 'Safely install a local .svm file', strategyTitle: 'Plan a race', strategyDetail: 'Fuel, VE, tyres and pit windows' },
  fixtures: {
    insight: { corner: 'T5 · Les Combes', title: 'Protect the exit, not the entry', body: 'You carry 4 km/h more at turn-in, but delay full throttle by 23 m. A slightly later apex should recover about 0.22 s down the following straight.', action: 'Brake 7 m earlier and release more gradually' },
    sessions: {
      spaRace: { date: 'Today, 20:41', type: 'Race' },
      spaPractice: { date: 'Today, 19:12', type: 'Practice' },
      leMans: { date: 'Yesterday, 22:08', type: 'Qualifying' },
    },
  },
}, {
  circuitMap: 'Streckenkarte', you: 'DU', speedUnit: 'km/h', literUnit: 'l', percentUnit: '%', secondsUnit: 's',
  heading: { eyebrow: 'Kommandozentrale', liveTitle: 'Telemetrie ist verbunden.', demoTitle: 'Generierte Renndemo.', readyTitle: 'Apex ist bereit.', liveDescription: 'Öffne die gemessene Live-Ansicht für Werte aus LMU.', demoDescription: 'Erkunde das vollständige Produkt mit deterministischen Beispieldaten.', readyDescription: 'Prüfe Aufzeichnungen, plane ein Rennen oder starte die generierte Live-Demo.', inspect: 'Aufzeichnung prüfen', analysis: 'Analysedemo öffnen' },
  measured: { badge: 'Gemessene Live-Daten', lap: 'Runde', classPosition: 'in der Klasse', open: 'Messwerte öffnen' },
  demo: { badge: 'Generierte Demo', race: 'Rennen', lap: 'Runde', perLap: 'pro Runde', stintLap: 'Stint-Runde', open: 'Live-Sitzung öffnen', classPosition: 'Klassenposition', leader: 'zum Führenden', lastLap: 'Letzte Runde', fuel: 'Verbleibender Kraftstoff', laps: 'Runden', finishMargin: 'Zielreserve', plan: 'Plan A · kein Sparen', energy: 'Virtuelle Energie', pitWindow: 'Boxenfenster in 5–7 Runden', rejoin: 'Rückkehrprognose: P6, freie Strecke' },
  waiting: { badge: 'Warte auf Le Mans Ultimate', title: 'Fahr los. Apex übernimmt den Rest.', description: 'Live-Werte erscheinen automatisch über die lokale Bridge. Kontinuierliche Aufzeichnung ist in dieser Alpha nicht aktiviert.', openLmu: 'LMU öffnen', anySession: 'Jede Sitzung funktioniert', takeTrack: 'Auf die Strecke', connects: 'Apex verbindet mit 50 Hz', review: 'Auswerten', inspect: 'Lokale Aufzeichnungen prüfen' },
  provenance: { badge: 'Generierte Beispiele', description: 'Die folgenden Karten für Coaching, Bereitschaft, Sitzungen, Event und Prognose demonstrieren die geplante UX; sie treffen keine Aussagen über deine Fahrweise.' },
  opportunity: { eyebrow: 'Größte Chance', title: 'Eine Änderung für deinen nächsten Stint', confidence: 'Konfidenz · vergleichbare Bedingungen', evidence: 'Belege ansehen' },
  readiness: { eyebrow: 'Rennbereitschaft', title: 'Spa · 60 Minuten', pace: 'Tempo', ready: 'Bereit', paceLabel: 'Tempo-Bereitschaft 91 %', paceDetail: 'Über 5 Runden innerhalb von 0,7 % der Referenz', strategy: 'Strategie', check: 'Prüfen', strategyLabel: 'Strategie-Bereitschaft 72 %', strategyDetail: 'Nass-Crossover wurde noch nicht simuliert', consistency: 'Konstanz', strong: 'Stark', consistencyLabel: 'Konstanz-Bereitschaft 88 %', consistencyDetail: '±0,31 s im letzten sauberen Stint', open: 'Rennbriefing öffnen' },
  sessions: { eyebrow: 'Letzte Arbeit', title: 'Sitzungen', viewAll: 'Alle anzeigen', laps: 'Runden' },
  conditions: { eyebrow: 'Nächstes Event', title: 'Samstag · Spa 2,4 h', start: 'Start', plus45: '+45 Min.', plus90: '+90 Min.', dry: 'Trocken', cloudy: 'Bewölkt', rain: 'Regen 35 %', drivers: '18 Fahrer gemeldet · Geschätzter Split 2.140' },
  quick: { aria: 'Schnellaktionen', inspectTitle: 'LMU-Aufzeichnung prüfen', inspectDetail: 'Schreibgeschütztes DuckDB-Schema und Rundenindex', setupTitle: 'Setup verwalten', setupDetail: 'Lokale .svm-Datei sicher installieren', strategyTitle: 'Rennen planen', strategyDetail: 'Kraftstoff, VE, Reifen und Boxenfenster' },
  fixtures: {
    insight: { corner: 'T5 · Les Combes', title: 'Schütze den Ausgang, nicht den Eingang', body: 'Du bist beim Einlenken 4 km/h schneller, gibst aber erst 23 m später Vollgas. Ein etwas späterer Scheitelpunkt sollte auf der folgenden Geraden etwa 0,22 s bringen.', action: '7 m früher bremsen und die Bremse gleichmäßiger lösen' },
    sessions: {
      spaRace: { date: 'Heute, 20:41', type: 'Rennen' },
      spaPractice: { date: 'Heute, 19:12', type: 'Training' },
      leMans: { date: 'Gestern, 22:08', type: 'Qualifying' },
    },
  },
})

function formatNumber(value: number, language: Language, fractionDigits = 0) {
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

function TrackOutline({ progress = 0.48, trackName = 'Spa-Francorchamps', position = 3 }: { progress?: number; trackName?: string; position?: number }) {
  const m = useMessages(copy)
  const { language } = useI18n()
  const isLeMans = trackName.toLowerCase().includes('sarthe') || trackName.toLowerCase().includes('le mans')
  const circuitPath = isLeMans
    ? 'M91 214c-25-8-38-31-24-49 13-17 38-24 43-43 5-19-17-29-28-15-12 15-32 11-35-5-4-20 21-31 39-19 23 15 43 9 63-8 19-17 40-24 64-21l101 10c24 3 33 20 19 37l-12 15c-7 9-4 17 8 21l22 7c19 6 20 25 2 33l-59 25c-10 4-11 15-2 20l28 16c20 12 11 32-12 29l-77-11c-16-2-28 3-39 14l-18 19c-17 18-43 13-50-9-5-16-27-10-41-5Z'
    : 'M171 222c-35-7-69-24-77-51-4-15 6-30 20-39 18-12 25-29 18-44-7-15-26-17-39-7-19 15-34 8-37-8-3-17 13-30 30-27 34 6 57-3 80-20 23-17 56-10 63 13 5 17-6 35-1 51 4 13 21 19 37 12 18-8 35-3 40 11 7 19-13 34-31 30-19-4-34 4-37 21-4 20 10 33 29 35 20 2 34 16 27 29-10 19-43 11-66 0-23-11-42-2-47 14-4 14 9 29 27 32 18 4 34 15 28 29-7 17-37 16-58 8Z'
  const car = isLeMans ? { x: 257, y: 178 } : { x: 237, y: 164 }
  return (
    <svg className="spa-outline" viewBox="0 0 390 250" aria-label={`${trackName} ${m.circuitMap}`}>
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur" /></filter>
      </defs>
      <path
        className="spa-outline__shadow"
        d={circuitPath}
      />
      <path
        className="spa-outline__line"
        pathLength="1"
        style={{ strokeDasharray: `${progress} ${1 - progress}` }}
        d={circuitPath}
      />
      <circle className="spa-outline__car" cx={car.x} cy={car.y} r="5" />
      <circle className="spa-outline__car-glow" cx={car.x} cy={car.y} r="9" filter="url(#glow)" />
      <text x={car.x + 13} y={car.y + 1}>{m.you} · P{formatNumber(position, language)}</text>
    </svg>
  )
}

export function HomeView({
  source,
  frame,
  onNavigate,
  onImport,
}: {
  source: 'offline' | 'demo' | 'live'
  frame?: TelemetryFrame | null
  onNavigate: (view: ViewId) => void
  onImport: () => void
}) {
  const m = useMessages(copy)
  const { language } = useI18n()
  const leadInsight = { ...demoInsights[0], ...m.fixtures.insight }
  const localizedSessions = {
    'spa-race': m.fixtures.sessions.spaRace,
    'spa-practice': m.fixtures.sessions.spaPractice,
    'le-mans': m.fixtures.sessions.leMans,
  } as const
  const demoRunning = source === 'demo'
  const measuredLive = source === 'live' && frame

  return (
    <div className="view view--home">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{m.heading.eyebrow}</div>
          <h1>{measuredLive ? m.heading.liveTitle : demoRunning ? m.heading.demoTitle : m.heading.readyTitle}</h1>
          <p>{measuredLive ? m.heading.liveDescription : demoRunning ? m.heading.demoDescription : m.heading.readyDescription}</p>
        </div>
        <div className="page-heading__actions">
          <Button variant="secondary" icon={<Upload size={16} />} onClick={onImport}>{m.heading.inspect}</Button>
          <Button icon={<BarChart3 size={16} />} onClick={() => onNavigate('analyze')}>{m.heading.analysis}</Button>
        </div>
      </div>

      {measuredLive ? (
        <Card className="connect-hero">
          <div className="connect-hero__signal" aria-hidden="true"><span /><span /><span /><RadioIcon /></div>
          <div className="connect-hero__copy"><Badge tone="positive" dot>{m.measured.badge}</Badge><h2>{frame.session.track.name}</h2><p>{frame.player.car.model} · {m.measured.lap} {formatNumber(frame.player.currentLapNumber, language)} · P{formatNumber(frame.player.classPosition, language)} {m.measured.classPosition} · {formatNumber(frame.player.motion.speedKph, language)} {m.speedUnit}</p></div>
          <Button icon={<ArrowRight size={16} />} onClick={() => onNavigate('live')}>{m.measured.open}</Button>
        </Card>
      ) : demoRunning ? (
        <Card className="live-hero">
          <div className="live-hero__main">
            <div className="live-hero__context">
              <div>
                <Badge tone="accent" dot>{m.demo.badge} · {m.demo.lap} {formatNumber(demoSession.currentLap, language)}</Badge>
                <h2>{frame?.session.track.name || demoSession.track}</h2>
                <p>{frame?.player.car.model || demoSession.car} · {m.demo.race} · {m.demo.stintLap} {formatNumber(demoSession.stintLap, language)}</p>
              </div>
              <Button variant="quiet" size="sm" icon={<ArrowRight size={15} />} onClick={() => onNavigate('live')}>{m.demo.open}</Button>
            </div>
            <div className="live-hero__visual">
              <TrackOutline trackName={frame?.session.track.name || demoSession.track} position={frame?.player.classPosition ?? 3} />
              <div className="live-hero__position">
                <span>{m.demo.classPosition}</span>
                <strong>P{formatNumber(frame?.player.classPosition ?? demoSession.classPosition, language)}</strong>
                <small>+{formatNumber(6.1, language, 1)} {m.demo.leader}</small>
              </div>
            </div>
          </div>
          <div className="live-hero__rail">
            <Metric label={m.demo.lastLap} value={demoSession.lastLap} detail={<span className="negative">+{formatNumber(0.534, language, 3)}</span>} />
            <Metric label={m.demo.fuel} value={formatNumber(frame?.player.powertrain.fuelLiters ?? demoSession.fuel, language, 1)} unit={m.literUnit} detail={`${formatNumber(demoSession.lapsRemaining, language, 1)} ${m.demo.laps}`} />
            <Metric label={m.demo.finishMargin} value={`+${formatNumber(1.7, language, 1)}`} unit={m.literUnit} tone="positive" detail={m.demo.plan} />
            <Metric label={m.demo.energy} value={formatNumber(demoSession.virtualEnergy, language, 1)} unit={m.percentUnit} detail={`${formatNumber(4.61, language, 2)}${m.percentUnit} ${m.demo.perLap}`} />
            <div className="live-hero__callout">
              <Zap size={16} />
              <div>
                <strong>{m.demo.pitWindow}</strong>
                <span>{m.demo.rejoin}</span>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="connect-hero">
          <div className="connect-hero__signal" aria-hidden="true">
            <span /><span /><span />
            <Gauge size={30} />
          </div>
          <div className="connect-hero__copy">
            <Badge tone="neutral" dot>{m.waiting.badge}</Badge>
            <h2>{m.waiting.title}</h2>
            <p>{m.waiting.description}</p>
          </div>
          <div className="connect-hero__steps">
            <div><span>1</span><p><strong>{m.waiting.openLmu}</strong>{m.waiting.anySession}</p></div>
            <ArrowRight size={16} />
            <div><span>2</span><p><strong>{m.waiting.takeTrack}</strong>{m.waiting.connects}</p></div>
            <ArrowRight size={16} />
            <div><span>3</span><p><strong>{m.waiting.review}</strong>{m.waiting.inspect}</p></div>
          </div>
        </Card>
      )}

      <div className="data-provenance-banner"><Badge tone="accent">{m.provenance.badge}</Badge><span>{m.provenance.description}</span></div>

      <div className="dashboard-grid dashboard-grid--home">
        <Card className="focus-card">
          <CardHeader
            eyebrow={m.opportunity.eyebrow}
            title={m.opportunity.title}
            action={<Badge tone="critical">{formatNumber(0.31, language, 2)} {m.secondsUnit}</Badge>}
          />
          <div className="focus-card__corner">
            <div className="corner-number">{formatNumber(5, language).padStart(2, '0')}</div>
            <div>
              <span>{leadInsight.corner}</span>
              <h3>{leadInsight.title}</h3>
            </div>
          </div>
          <p className="focus-card__body">{leadInsight.body}</p>
          <div className="focus-card__recommendation">
            <Sparkles size={16} />
            <span>{leadInsight.action}</span>
          </div>
          <div className="focus-card__footer">
            <span>{formatNumber(leadInsight.confidence, language)}{m.percentUnit} {m.opportunity.confidence}</span>
            <button type="button" onClick={() => onNavigate('analyze')}>{m.opportunity.evidence} <ArrowRight size={14} /></button>
          </div>
        </Card>

        <Card className="readiness-card">
          <CardHeader eyebrow={m.readiness.eyebrow} title={m.readiness.title} action={<span className="readiness-score">{formatNumber(86, language)}</span>} />
          <div className="readiness-list">
            <div>
              <div className="readiness-list__header"><span><Route size={15} /> {m.readiness.pace}</span><strong>{m.readiness.ready}</strong></div>
              <Progress value={91} tone="positive" label={m.readiness.paceLabel} />
              <small>{m.readiness.paceDetail}</small>
            </div>
            <div>
              <div className="readiness-list__header"><span><Fuel size={15} /> {m.readiness.strategy}</span><strong>{m.readiness.check}</strong></div>
              <Progress value={72} tone="warning" label={m.readiness.strategyLabel} />
              <small>{m.readiness.strategyDetail}</small>
            </div>
            <div>
              <div className="readiness-list__header"><TimerReset size={15} /><span>{m.readiness.consistency}</span><strong>{m.readiness.strong}</strong></div>
              <Progress value={88} tone="blue" label={m.readiness.consistencyLabel} />
              <small>{m.readiness.consistencyDetail}</small>
            </div>
          </div>
          <Button variant="secondary" onClick={() => onNavigate('strategy')}>{m.readiness.open}</Button>
        </Card>

        <Card className="sessions-card">
          <CardHeader
            eyebrow={m.sessions.eyebrow}
            title={m.sessions.title}
            action={<button className="text-button" type="button" onClick={() => onNavigate('analyze')}>{m.sessions.viewAll} <ArrowRight size={13} /></button>}
          />
          <div className="session-list">
            {demoSessions.slice(0, 3).map((session) => {
              const fixture = localizedSessions[session.id as keyof typeof localizedSessions]
              return (
              <button type="button" key={session.id} className="session-row" onClick={() => onNavigate('analyze')}>
                <div className="session-row__icon"><Flag size={15} /></div>
                <div className="session-row__name">
                  <strong>{session.track}</strong>
                  <span>{session.car} · {fixture?.type ?? session.type}</span>
                </div>
                <div className="session-row__laps"><span>{formatNumber(session.laps, language)} {m.sessions.laps}</span><small>{fixture?.date ?? session.date}</small></div>
                <div className="session-row__time"><strong>{session.best}</strong><span><ArrowDownRight size={12} /> {formatNumber(Math.abs(session.gain), language, 3)} {m.secondsUnit}</span></div>
                <ArrowRight size={14} className="session-row__arrow" />
              </button>
              )
            })}
          </div>
        </Card>

        <Card className="conditions-card">
          <CardHeader eyebrow={m.conditions.eyebrow} title={m.conditions.title} action={<CloudSun size={20} />} />
          <div className="conditions-card__forecast">
            <div><span>{m.conditions.start}</span><CloudSun size={18} /><strong>{m.conditions.dry}</strong><small>{formatNumber(19, language)}°C</small></div>
            <div><span>{m.conditions.plus45}</span><CloudSun size={18} /><strong>{m.conditions.cloudy}</strong><small>{formatNumber(17, language)}°C</small></div>
            <div className="is-risk"><span>{m.conditions.plus90}</span><CloudSun size={18} /><strong>{m.conditions.rain}</strong><small>{formatNumber(15, language)}°C</small></div>
          </div>
          <div className="conditions-card__footer">
            <Trophy size={15} />
            <span>{m.conditions.drivers}</span>
          </div>
        </Card>
      </div>

      <div className="quick-actions" aria-label={m.quick.aria}>
        <button type="button" onClick={onImport}><Download size={17} /><span><strong>{m.quick.inspectTitle}</strong><small>{m.quick.inspectDetail}</small></span><ArrowRight size={15} /></button>
        <button type="button" onClick={() => onNavigate('setups')}><SlidersIcon /><span><strong>{m.quick.setupTitle}</strong><small>{m.quick.setupDetail}</small></span><ArrowRight size={15} /></button>
        <button type="button" onClick={() => onNavigate('strategy')}><Fuel size={17} /><span><strong>{m.quick.strategyTitle}</strong><small>{m.quick.strategyDetail}</small></span><ArrowRight size={15} /></button>
      </div>
    </div>
  )
}

function RadioIcon() {
  return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0" /><circle cx="12" cy="12" r="1.5" /></svg>
}

function SlidersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" />
      <circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="13" cy="18" r="2" />
    </svg>
  )
}
