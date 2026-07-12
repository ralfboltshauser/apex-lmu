import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Download,
  Filter,
  Flag,
  Gauge,
  GitCompareArrows,
  Info,
  MousePointer2,
  Play,
  Search,
  Share2,
  Sparkles,
  Target,
  TrendingDown,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Button, Card, CardHeader, Progress, Segmented, Select, TooltipHint } from '../components/ui'
import { demoInsights, demoSessions, lapTrace, referenceTrace } from '../data/demo'
import { defineMessages, formatMessage, useI18n, useMessages, type Language } from '../i18n'
import { CircuitTrackMap } from '../components/visuals/CircuitTrackMap'
import type { BrakeZone, MeasuredTrackSnapshot } from '../engine'

type Channel = 'speed' | 'throttle' | 'brake' | 'delta'

const CHANNELS: Array<{ id: Channel; color: string; min: number; max: number }> = [
  { id: 'speed', color: '#f4f5f0', min: 40, max: 340 },
  { id: 'throttle', color: '#b8f34a', min: 0, max: 100 },
  { id: 'brake', color: '#ff5d57', min: 0, max: 100 },
  { id: 'delta', color: '#63a8ff', min: -0.2, max: 0.8 },
]

const copy = defineMessages({
  channels: { speed: 'Speed', throttle: 'Throttle', brake: 'Brake', delta: 'Delta' },
  graph: { aria: 'Telemetry comparison showing', you: 'You', reference: 'Reference', location: 'Les Combes · 36.4%', youSpeed: '241 km/h', referenceSpeed: '246 km/h' },
  corners: { laSource: 'La Source', eauRouge: 'Eau Rouge', lesCombes: 'Les Combes', bruxelles: 'Bruxelles', blanchimont: 'Blanchimont', busStop: 'Bus Stop' },
  segments: { aria: 'Lap segment time loss', title: 'Time delta through the lap', gaining: 'Gaining', losing: 'Losing' },
  heading: { eyebrow: 'Analysis', title: 'Find the time. Understand why.', description: 'Every conclusion links back to the telemetry that produced it.', shareUnavailable: 'Share unavailable', exportUnavailable: 'Export unavailable' },
  provenance: { badge: 'Generated example session', description: 'This view demonstrates distance-aligned analysis and coaching. DuckDB inspection does not ingest a session into these charts yet.' },
  toolbar: { exampleSession: 'Example session', yourLap: 'Your lap', lap: 'Lap', generatedReference: 'Generated reference', generatedPersonalBest: 'Generated personal best', exampleTrace: 'Example trace', comparisonType: 'Comparison type', reference: 'Reference', personalBest: 'Personal best' },
  summary: { lapDifference: 'Lap difference', comparableConditions: 'Comparable conditions', biggestLoss: 'Biggest loss', exitExecution: 'Exit execution', yourAdvantage: 'Your advantage', minimumSpeed: 'Minimum speed', optimalLap: 'Optimal lap', optimalLapHelp: 'A stitched estimate using your best comparable segments. It is not a lap you actually drove.', available: 'available', matchQuality: 'match quality', qualityExplanation: 'Same car, BoP, fuel window and track temperature' },
  telemetry: { eyebrow: 'Evidence', title: 'Telemetry comparison', hint: 'Move across the graph to inspect any point · Click a segment above to zoom' },
  coach: { eyebrow: 'Apex coach', title: 'Three things worth changing', confidence: 'Confidence', confidenceHelp: 'Evidence strength after lap comparability and repeatability checks—not a certainty score.', tryNext: 'Try next', focusTelemetry: 'Focus telemetry on this corner' },
  breakdown: { eyebrow: 'Lap anatomy', title: 'Where the difference comes from', corners: 'corners', braking: 'Braking', midCorner: 'Mid-corner', exit: 'Exit', conclusionTitle: 'Brake release is the recurring pattern.', conclusionBody: 'Five of seven losing corners show an abrupt release before turn-in.' },
  session: { eyebrow: 'Session quality', cleanLaps: 'clean laps', consistency: 'Consistency', top: 'Top 12%', topSessions: 'of your sessions', averagePace: 'Average pace', lastCleanLaps: 'clean laps', trackLimits: 'Track limits', raidillon: 'Both at Raidillon exit', improvement: 'Improvement', acrossSession: 'Across the session' },
  units: { seconds: '{value} s' },
  measured: { badge: 'Measured local session', title: 'Measured braking by lap distance', description: 'World position, brake pressure, speed and timing come from LMU official shared memory. The line is a locally reconstructed driven route, not surveyed track limits.', route: 'Measured driven line', selectedLap: 'Selected lap', coverage: 'route coverage', evidence: 'Brake-zone evidence', applied: 'Brake applied', peak: 'Peak pressure', released: 'Released', duration: 'Duration', entry: 'Entry', minimum: 'minimum', exit: 'exit', noZones: 'No stable brake zones were detected on this lap.', trace: 'Distance-aligned speed and brake trace', speed: 'Speed', brake: 'Brake', metres: 'm', secondUnit: 's', speedUnit: 'km/h' },
  fixtures: {
    sessions: {
      'spa-race': 'Spa-Francorchamps · Race · Today, 20:41',
      'spa-practice': 'Spa-Francorchamps · Practice · Today, 19:12',
      'le-mans': 'Le Mans · Qualifying · Yesterday, 22:08',
      imola: 'Imola · Race · 09 Jul, 20:04',
    },
    insights: {
      't5-exit': {
        corner: 'T5 · Les Combes',
        title: 'Protect the exit, not the entry',
        body: 'You carry 4 km/h more at turn-in, but delay full throttle by 23 m. A slightly later apex should recover about 0.22 s down the following straight.',
        action: 'Brake 7 m earlier and release more gradually',
      },
      't11-brake': {
        corner: 'T11 · Bruxelles',
        title: 'The time is in brake release',
        body: 'Your braking point matches the reference within 2 m. The front unloads abruptly because pressure falls from 42% to 0% in 0.28 seconds.',
        action: 'Extend trail braking by roughly 0.35 s',
      },
      't17-good': {
        corner: 'T17 · Blanchimont',
        title: 'Keep this approach',
        body: 'You use 0.8 m more road on entry and maintain 3 km/h more minimum speed without adding steering correction.',
        action: 'Save as personal reference',
      },
    },
  },
}, {
  channels: { speed: 'Geschwindigkeit', throttle: 'Gas', brake: 'Bremse', delta: 'Delta' },
  graph: { aria: 'Telemetrievergleich mit', you: 'Du', reference: 'Referenz', location: 'Les Combes · 36,4 %', youSpeed: '241 km/h', referenceSpeed: '246 km/h' },
  corners: { laSource: 'La Source', eauRouge: 'Eau Rouge', lesCombes: 'Les Combes', bruxelles: 'Bruxelles', blanchimont: 'Blanchimont', busStop: 'Bus Stop' },
  segments: { aria: 'Zeitverlust je Rundenabschnitt', title: 'Zeitdelta über die Runde', gaining: 'Gewinn', losing: 'Verlust' },
  heading: { eyebrow: 'Analyse', title: 'Finde die Zeit. Verstehe, warum.', description: 'Jede Erkenntnis führt zurück zu den Telemetriedaten, auf denen sie basiert.', shareUnavailable: 'Teilen nicht verfügbar', exportUnavailable: 'Export nicht verfügbar' },
  provenance: { badge: 'Generierte Beispielsitzung', description: 'Diese Ansicht demonstriert distanzbasierte Analyse und Coaching. Die DuckDB-Prüfung überträgt eine Sitzung noch nicht in diese Diagramme.' },
  toolbar: { exampleSession: 'Beispielsitzung', yourLap: 'Deine Runde', lap: 'Runde', generatedReference: 'Generierte Referenz', generatedPersonalBest: 'Generierte persönliche Bestzeit', exampleTrace: 'Beispielkurve', comparisonType: 'Vergleichstyp', reference: 'Referenz', personalBest: 'Persönliche Bestzeit' },
  summary: { lapDifference: 'Rundendifferenz', comparableConditions: 'Vergleichbare Bedingungen', biggestLoss: 'Größter Verlust', exitExecution: 'Kurvenausgang', yourAdvantage: 'Dein Vorteil', minimumSpeed: 'Mindestgeschwindigkeit', optimalLap: 'Optimale Runde', optimalLapHelp: 'Eine zusammengesetzte Schätzung aus deinen besten vergleichbaren Abschnitten. Diese Runde bist du nicht tatsächlich gefahren.', available: 'verfügbar', matchQuality: 'Vergleichsqualität', qualityExplanation: 'Gleiches Auto, BoP, Kraftstofffenster und gleiche Streckentemperatur' },
  telemetry: { eyebrow: 'Belege', title: 'Telemetrievergleich', hint: 'Bewege den Zeiger über das Diagramm, um jeden Punkt zu prüfen · Klicke oben auf einen Abschnitt, um ihn zu vergrößern' },
  coach: { eyebrow: 'Apex Coach', title: 'Drei sinnvolle Änderungen', confidence: 'Konfidenz', confidenceHelp: 'Aussagekraft nach Prüfung von Vergleichbarkeit und Wiederholbarkeit – kein Gewissheitswert.', tryNext: 'Als Nächstes testen', focusTelemetry: 'Telemetrie auf diese Kurve fokussieren' },
  breakdown: { eyebrow: 'Rundenanatomie', title: 'Woher die Differenz kommt', corners: 'Kurven', braking: 'Bremsen', midCorner: 'Kurvenmitte', exit: 'Ausgang', conclusionTitle: 'Das Lösen der Bremse ist das wiederkehrende Muster.', conclusionBody: 'Fünf von sieben langsamen Kurven zeigen ein abruptes Lösen vor dem Einlenken.' },
  session: { eyebrow: 'Sitzungsqualität', cleanLaps: 'saubere Runden', consistency: 'Konstanz', top: 'Top 12 %', topSessions: 'deiner Sitzungen', averagePace: 'Durchschnittstempo', lastCleanLaps: 'saubere Runden zuletzt', trackLimits: 'Streckenbegrenzungen', raidillon: 'Beide am Ausgang von Raidillon', improvement: 'Verbesserung', acrossSession: 'Über die gesamte Sitzung' },
  units: { seconds: '{value} s' },
  measured: { badge: 'Gemessene lokale Sitzung', title: 'Gemessene Bremsvorgänge nach Rundendistanz', description: 'Weltposition, Bremsdruck, Geschwindigkeit und Zeit stammen aus dem offiziellen LMU Shared Memory. Die Linie ist eine lokal rekonstruierte Fahrlinie, keine vermessene Streckenbegrenzung.', route: 'Gemessene Fahrlinie', selectedLap: 'Ausgewählte Runde', coverage: 'Streckenabdeckung', evidence: 'Belege der Bremszonen', applied: 'Bremse betätigt', peak: 'Maximaldruck', released: 'Gelöst', duration: 'Dauer', entry: 'Eingang', minimum: 'Minimum', exit: 'Ausgang', noZones: 'Auf dieser Runde wurden keine stabilen Bremszonen erkannt.', trace: 'Distanzbasierte Geschwindigkeits- und Bremskurve', speed: 'Geschwindigkeit', brake: 'Bremse', metres: 'm', secondUnit: 's', speedUnit: 'km/h' },
  fixtures: {
    sessions: {
      'spa-race': 'Spa-Francorchamps · Rennen · Heute, 20:41',
      'spa-practice': 'Spa-Francorchamps · Training · Heute, 19:12',
      'le-mans': 'Le Mans · Qualifying · Gestern, 22:08',
      imola: 'Imola · Rennen · 09. Juli, 20:04',
    },
    insights: {
      't5-exit': {
        corner: 'T5 · Les Combes',
        title: 'Priorisiere den Ausgang, nicht den Eingang',
        body: 'Beim Einlenken bist du 4 km/h schneller, gibst aber erst 23 m später Vollgas. Ein etwas späterer Scheitelpunkt sollte auf der folgenden Geraden rund 0,22 s einbringen.',
        action: '7 m früher bremsen und die Bremse sanfter lösen',
      },
      't11-brake': {
        corner: 'T11 · Bruxelles',
        title: 'Die Zeit liegt im Lösen der Bremse',
        body: 'Dein Bremspunkt liegt höchstens 2 m von der Referenz entfernt. Die Vorderachse wird abrupt entlastet, weil der Bremsdruck in 0,28 Sekunden von 42 % auf 0 % fällt.',
        action: 'Das Trail-Braking um etwa 0,35 s verlängern',
      },
      't17-good': {
        corner: 'T17 · Blanchimont',
        title: 'Behalte diesen Ansatz bei',
        body: 'Du nutzt beim Eingang 0,8 m mehr Streckenbreite und hältst 3 km/h mehr Mindestgeschwindigkeit, ohne zusätzliche Lenkkorrektur.',
        action: 'Als persönliche Referenz speichern',
      },
    },
  },
})

type SessionFixtureId = keyof typeof copy.en.fixtures.sessions
type InsightFixtureId = keyof typeof copy.en.fixtures.insights

function hasOwnKey<T extends object>(value: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function requireSessionFixtureId(id: string): SessionFixtureId {
  if (!hasOwnKey(copy.en.fixtures.sessions, id)) throw new Error(`Missing session localization for fixture ID: ${id}`)
  return id
}

function requireInsightFixtureId(id: string): InsightFixtureId {
  if (!hasOwnKey(copy.en.fixtures.insights, id)) throw new Error(`Missing insight localization for fixture ID: ${id}`)
  return id
}

function formatDecimal(language: Language, value: number, digits: number, signDisplay: 'auto' | 'always' = 'auto') {
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay,
  }).format(value)
}

function formatPercent(language: Language, value: number) {
  return new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(value / 100)
}

function pointsFor(values: typeof lapTrace, channel: Channel, width: number, height: number, min: number, max: number) {
  return values.map((point) => {
    const value = point[channel]
    return `${(point.x * width).toFixed(1)},${(height - ((value - min) / (max - min)) * height).toFixed(1)}`
  }).join(' ')
}

function TelemetryGraph({ channels, cursor }: { channels: Channel[]; cursor: number }) {
  const m = useMessages(copy)
  const width = 1000
  const rowHeight = 112
  const gap = 26
  return (
    <div className="telemetry-graph" role="img" aria-label={`${m.graph.aria} ${channels.map((channel) => m.channels[channel]).join(', ')}`}>
      <svg viewBox={`0 0 ${width} ${channels.length * (rowHeight + gap)}`} preserveAspectRatio="none">
        {channels.map((channel, channelIndex) => {
          const config = CHANNELS.find((item) => item.id === channel)!
          const y = channelIndex * (rowHeight + gap)
          return (
            <g key={channel} transform={`translate(0 ${y})`}>
              <line className="telemetry-graph__baseline" x1="0" x2={width} y1={rowHeight} y2={rowHeight} />
              <line className="telemetry-graph__grid" x1="0" x2={width} y1={rowHeight / 2} y2={rowHeight / 2} />
              <polyline className="telemetry-graph__reference" points={pointsFor(referenceTrace, channel, width, rowHeight, config.min, config.max)} />
              <polyline className="telemetry-graph__current" style={{ stroke: config.color }} points={pointsFor(lapTrace, channel, width, rowHeight, config.min, config.max)} />
              <text x="8" y="16">{m.channels[channel]}</text>
            </g>
          )
        })}
        <line className="telemetry-graph__cursor" x1={cursor * width} x2={cursor * width} y1="0" y2={channels.length * (rowHeight + gap) - gap} />
        <circle className="telemetry-graph__cursor-dot" cx={cursor * width} cy="38" r="4" />
      </svg>
      <div className="telemetry-tooltip" style={{ left: `${Math.min(91, Math.max(9, cursor * 100))}%` }}>
        <strong>{m.graph.location}</strong>
        <span><i className="current" /> {m.graph.you}&nbsp; {m.graph.youSpeed}</span>
        <span><i className="reference" /> {m.graph.reference}&nbsp; {m.graph.referenceSpeed}</span>
      </div>
    </div>
  )
}

function SegmentRibbon({ selected, onSelect }: { selected: number; onSelect: (index: number) => void }) {
  const m = useMessages(copy)
  const { language } = useI18n()
  const segments = [
    ['T1', -0.06], ['Eau Rouge', 0.02], ['Kemmel', 0.04], ['T5–7', 0.31], ['T8–9', 0.08], ['T10–11', 0.18], ['T12–13', -0.03], ['T14–15', 0.07], ['Blanchimont', -0.09], ['Bus Stop', 0.12],
  ] as const
  return (
    <div className="segment-ribbon" aria-label={m.segments.aria}>
      {segments.map(([label, loss], index) => (
        <button key={label} type="button" aria-pressed={selected === index} className={`${loss < 0 ? 'is-gain' : loss > 0.15 ? 'is-high-loss' : 'is-loss'} ${selected === index ? 'is-selected' : ''}`} onClick={() => onSelect(index)}>
          <span>{label}</span><strong>{formatDecimal(language, loss, 2, 'always')}</strong>
        </button>
      ))}
    </div>
  )
}

function measuredTracePoints(snapshot: MeasuredTrackSnapshot, channel: 'speed' | 'brake') {
  const width = 1000
  const height = 130
  const maximumSpeed = Math.max(1, ...snapshot.selectedLap.map((sample) => sample.speedKph))
  return snapshot.selectedLap.map((sample) => {
    const x = sample.distanceM / Math.max(1, snapshot.trackLengthM) * width
    const value = channel === 'speed' ? sample.speedKph / maximumSpeed : sample.brake
    return `${x.toFixed(1)},${(height - value * height).toFixed(1)}`
  }).join(' ')
}

function zoneLabel(zone: BrakeZone, language: Language, metres: string) {
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(zone.startDistanceM)}–${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(zone.releaseDistanceM)} ${metres}`
}

function MeasuredAnalysisView({ snapshot }: { snapshot: MeasuredTrackSnapshot }) {
  const m = useMessages(copy)
  const { language } = useI18n()
  const [selectedId, setSelectedId] = useState<string | null>(snapshot.brakeZones[0]?.id ?? null)
  const selected = snapshot.brakeZones.find((zone) => zone.id === selectedId) ?? snapshot.brakeZones[0]
  const points = snapshot.route.map((point) => ({ x: point.x, y: point.z, distanceM: point.distanceM }))
  const segments = snapshot.brakeZones.map((zone) => ({
    from: zone.startDistanceM / snapshot.trackLengthM,
    to: zone.releaseDistanceM / snapshot.trackLengthM,
    color: zone.id === selected?.id ? '#ffb45d' : '#ff5d57',
    label: zoneLabel(zone, language, m.measured.metres),
  }))
  const cursor = selected ? selected.peakDistanceM / snapshot.trackLengthM * 100 : 0

  return <div className="view view--analyze measured-analysis">
    <div className="page-heading page-heading--compact"><div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.measured.title}</h1><p>{m.measured.description}</p></div></div>
    <div className="data-provenance-banner"><Badge tone="positive">{m.measured.badge}</Badge><span>{snapshot.trackName} · {m.measured.selectedLap} {snapshot.selectedLapNumber ?? '—'} · {formatPercent(language, snapshot.coverage * 100)} {m.measured.coverage}</span></div>
    <div className="measured-analysis__grid">
      <CircuitTrackMap points={points} segments={segments} trackLengthM={snapshot.trackLengthM} closed={snapshot.state === 'complete'} circuitName={snapshot.trackName} layoutName={snapshot.layoutName} currentLap={snapshot.selectedLapNumber ?? undefined} activeSegment={selected ? segments.find((_, index) => snapshot.brakeZones[index].id === selected.id) : undefined} ariaLabel={m.measured.route} />
      <Card className="measured-zone-card"><CardHeader eyebrow={m.measured.evidence} title={m.measured.route} action={<Badge tone="neutral">{snapshot.brakeZones.length}</Badge>} />
        {snapshot.brakeZones.length === 0 ? <p className="measured-zone-empty">{m.measured.noZones}</p> : <ol className="measured-zone-list">{snapshot.brakeZones.map((zone, index) => <li key={zone.id}><button type="button" aria-pressed={zone.id === selected?.id} onClick={() => setSelectedId(zone.id)}><i>{String(index + 1).padStart(2, '0')}</i><span><strong>{zoneLabel(zone, language, m.measured.metres)}</strong><small>{m.measured.applied} {formatDecimal(language, zone.startDistanceM, 0)} {m.measured.metres} · {m.measured.peak} {formatPercent(language, zone.peakPressure * 100)} · {m.measured.released} {formatDecimal(language, zone.releaseDistanceM, 0)} {m.measured.metres}</small><em>{m.measured.entry} {formatDecimal(language, zone.entrySpeedKph, 0)} · {m.measured.minimum} {formatDecimal(language, zone.minimumSpeedKph, 0)} · {m.measured.exit} {formatDecimal(language, zone.exitSpeedKph, 0)} {m.measured.speedUnit}</em></span><b>{formatDecimal(language, zone.durationSeconds, 2)} {m.measured.secondUnit}</b></button></li>)}</ol>}
      </Card>
    </div>
    <Card className="measured-trace-card"><CardHeader eyebrow={m.telemetry.eyebrow} title={m.measured.trace} action={<div className="measured-trace-legend"><span><i className="speed" />{m.measured.speed}</span><span><i className="brake" />{m.measured.brake}</span></div>} />
      <div className="measured-trace" role="img" aria-label={m.measured.trace}><svg viewBox="0 0 1000 150" preserveAspectRatio="none"><line x1="0" x2="1000" y1="130" y2="130" /><polyline className="speed" points={measuredTracePoints(snapshot, 'speed')} /><polyline className="brake" points={measuredTracePoints(snapshot, 'brake')} />{selected && <line className="cursor" x1={cursor * 10} x2={cursor * 10} y1="0" y2="135" />}</svg><div className="measured-trace-axis"><span>0 {m.measured.metres}</span><span>{formatDecimal(language, snapshot.trackLengthM / 2, 0)} {m.measured.metres}</span><span>{formatDecimal(language, snapshot.trackLengthM, 0)} {m.measured.metres}</span></div></div>
    </Card>
  </div>
}

export function AnalyzeView({ measuredTrack = null }: { measuredTrack?: MeasuredTrackSnapshot | null }) {
  return measuredTrack && measuredTrack.route.length > 1 && measuredTrack.selectedLap.length > 1
    ? <MeasuredAnalysisView snapshot={measuredTrack} />
    : <DemoAnalysisView />
}

function DemoAnalysisView() {
  const m = useMessages(copy)
  const { language } = useI18n()
  const [comparisonMode, setComparisonMode] = useState<'reference' | 'personal'>('reference')
  const [selectedSession, setSelectedSession] = useState('spa-race')
  const [channels, setChannels] = useState<Channel[]>(['speed', 'throttle', 'brake'])
  const [selectedSegment, setSelectedSegment] = useState(3)
  const [cursor, setCursor] = useState(0.364)
  const [selectedInsight, setSelectedInsight] = useState(demoInsights[0].id)
  const selectedInsightData = demoInsights.find((insight) => insight.id === selectedInsight)!
  const selectedInsightCopy = m.fixtures.insights[requireInsightFixtureId(selectedInsightData.id)]

  const toggleChannel = (channel: Channel) => {
    setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel])
  }

  const sessionOptions = useMemo(() => demoSessions.map((session) => ({
    value: session.id,
    label: m.fixtures.sessions[requireSessionFixtureId(session.id)],
  })), [m.fixtures.sessions])

  return (
    <div className="view view--analyze">
      <div className="page-heading page-heading--compact">
        <div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.heading.title}</h1><p>{m.heading.description}</p></div>
        <div className="page-heading__actions"><Button variant="secondary" icon={<Share2 size={16} />} disabled>{m.heading.shareUnavailable}</Button><Button variant="secondary" icon={<Download size={16} />} disabled>{m.heading.exportUnavailable}</Button></div>
      </div>

      <div className="data-provenance-banner"><Badge tone="accent">{m.provenance.badge}</Badge><span>{m.provenance.description}</span></div>

      <div className="analysis-toolbar">
        <Select value={selectedSession} onChange={setSelectedSession} options={sessionOptions} ariaLabel={m.toolbar.exampleSession} />
        <div className="analysis-toolbar__separator" />
        <div className="lap-select"><span className="lap-select__swatch lap-select__swatch--current" /><div><small>{m.toolbar.yourLap}</small><strong>{m.toolbar.lap} 14 · 2:03.684</strong></div></div>
        <ArrowLeftRight size={15} className="analysis-toolbar__swap" />
        <div className="lap-select"><span className="lap-select__swatch lap-select__swatch--reference" /><div><small>{comparisonMode === 'reference' ? m.toolbar.generatedReference : m.toolbar.generatedPersonalBest}</small><strong>{m.toolbar.exampleTrace} · 2:02.971</strong></div></div>
        <div className="analysis-toolbar__spacer" />
        <Segmented value={comparisonMode} onChange={setComparisonMode} ariaLabel={m.toolbar.comparisonType} options={[{ value: 'reference', label: m.toolbar.reference }, { value: 'personal', label: m.toolbar.personalBest }]} />
      </div>

      <div className="analysis-summary-strip">
        <div><span>{m.summary.lapDifference}</span><strong className="negative">{formatMessage(m.units.seconds, { value: formatDecimal(language, 0.713, 3, 'always') })}</strong><small>{m.summary.comparableConditions}</small></div>
        <div><span>{m.summary.biggestLoss}</span><strong>T5–7 · {formatDecimal(language, 0.31, 2, 'always')}</strong><small>{m.summary.exitExecution}</small></div>
        <div><span>{m.summary.yourAdvantage}</span><strong className="positive">T17 · {formatDecimal(language, -0.09, 2)}</strong><small>{m.summary.minimumSpeed}</small></div>
        <div><span>{m.summary.optimalLap} <TooltipHint>{m.summary.optimalLapHelp}</TooltipHint></span><strong>2:03.192</strong><small>{formatMessage(m.units.seconds, { value: formatDecimal(language, 0.492, 3) })} {m.summary.available}</small></div>
        <div className="analysis-quality"><Badge tone="positive"><Check size={12} /> {formatPercent(language, 94)} {m.summary.matchQuality}</Badge><TooltipQuality /></div>
      </div>

      <Card className="segment-card">
        <div className="segment-card__header"><span>{m.segments.title}</span><div><i className="is-gain" /> {m.segments.gaining} <i className="is-loss" /> {m.segments.losing}</div></div>
        <SegmentRibbon selected={selectedSegment} onSelect={setSelectedSegment} />
      </Card>

      <div className="analysis-layout">
        <Card className="telemetry-card">
          <CardHeader
            eyebrow={m.telemetry.eyebrow}
            title={m.telemetry.title}
            action={<div className="channel-toggles">{CHANNELS.map((channel) => <button key={channel.id} type="button" aria-pressed={channels.includes(channel.id)} className={channels.includes(channel.id) ? 'is-active' : ''} onClick={() => toggleChannel(channel.id)}><i style={{ background: channel.color }} />{m.channels[channel.id]}</button>)}</div>}
          />
          <div
            className="telemetry-card__interaction"
            onPointerMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect()
              setCursor(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)))
            }}
          >
            <TelemetryGraph channels={channels.length ? channels : ['speed']} cursor={cursor} />
          </div>
          <div className="telemetry-card__axis"><span>{m.corners.laSource}</span><span>{m.corners.eauRouge}</span><span>{m.corners.lesCombes}</span><span>{m.corners.bruxelles}</span><span>{m.corners.blanchimont}</span><span>{m.corners.busStop}</span></div>
          <div className="telemetry-card__hint"><MousePointer2 size={13} /> {m.telemetry.hint}</div>
        </Card>

        <Card className="coach-panel">
          <CardHeader eyebrow={m.coach.eyebrow} title={m.coach.title} action={<Sparkles size={18} />} />
          <div className="insight-list">
            {demoInsights.map((insight, index) => {
              const insightCopy = m.fixtures.insights[requireInsightFixtureId(insight.id)]
              return (
                <button key={insight.id} type="button" aria-pressed={selectedInsight === insight.id} className={`${selectedInsight === insight.id ? 'is-active' : ''} insight-list__item--${insight.severity}`} onClick={() => setSelectedInsight(insight.id)}>
                  <span className="insight-list__number">0{index + 1}</span>
                  <span className="insight-list__copy"><small>{insightCopy.corner}</small><strong>{insightCopy.title}</strong><em>{formatMessage(m.units.seconds, { value: formatDecimal(language, insight.loss, 2, 'always') })}</em></span>
                  <ChevronRight size={15} />
                </button>
              )
            })}
          </div>
          <div className="coach-detail">
            <div className="coach-detail__confidence"><span>{m.coach.confidence} <TooltipHint>{m.coach.confidenceHelp}</TooltipHint></span><strong>{formatPercent(language, selectedInsightData.confidence)}</strong><Progress value={selectedInsightData.confidence} tone={selectedInsightData.severity === 'positive' ? 'positive' : 'accent'} /></div>
            <h3>{selectedInsightCopy.title}</h3>
            <p>{selectedInsightCopy.body}</p>
            <div className="coach-detail__action"><Target size={16} /><span><small>{m.coach.tryNext}</small><strong>{selectedInsightCopy.action}</strong></span></div>
            <button type="button" className="inline-link" onClick={() => setSelectedSegment(Math.max(0, demoInsights.findIndex((insight) => insight.id === selectedInsight)))}>{m.coach.focusTelemetry} <ArrowRight size={14} /></button>
          </div>
        </Card>

        <Card className="lap-breakdown-card">
          <CardHeader eyebrow={m.breakdown.eyebrow} title={m.breakdown.title} action={<Badge tone="neutral">18 {m.breakdown.corners}</Badge>} />
          <div className="lap-breakdown">
            <div className="lap-breakdown__bar"><span style={{ width: '44%' }} className="braking" /><span style={{ width: '31%' }} className="corner" /><span style={{ width: '25%' }} className="exit" /></div>
            <div className="lap-breakdown__legend">
              <div><i className="braking" /><span><strong>{m.breakdown.braking}</strong><small>{formatMessage(m.units.seconds, { value: formatDecimal(language, 0.31, 2, 'always') })} · {formatPercent(language, 44)}</small></span></div>
              <div><i className="corner" /><span><strong>{m.breakdown.midCorner}</strong><small>{formatMessage(m.units.seconds, { value: formatDecimal(language, 0.22, 2, 'always') })} · {formatPercent(language, 31)}</small></span></div>
              <div><i className="exit" /><span><strong>{m.breakdown.exit}</strong><small>{formatMessage(m.units.seconds, { value: formatDecimal(language, 0.18, 2, 'always') })} · {formatPercent(language, 25)}</small></span></div>
            </div>
          </div>
          <div className="lap-breakdown__conclusion"><TrendingDown size={16} /><p><strong>{m.breakdown.conclusionTitle}</strong><span>{m.breakdown.conclusionBody}</span></p></div>
        </Card>

        <Card className="session-stats-card">
          <CardHeader eyebrow={m.session.eyebrow} title={`18 ${m.session.cleanLaps}`} />
          <div className="session-stats-grid">
            <div><Clock3 size={15} /><span>{m.session.consistency}</span><strong>±{formatMessage(m.units.seconds, { value: formatDecimal(language, 0.31, 2) })}</strong><small>{m.session.top} {m.session.topSessions}</small></div>
            <div><Gauge size={15} /><span>{m.session.averagePace}</span><strong>2:04.118</strong><small>8 {m.session.lastCleanLaps}</small></div>
            <div><CircleDot size={15} /><span>{m.session.trackLimits}</span><strong>2</strong><small>{m.session.raidillon}</small></div>
            <div><Zap size={15} /><span>{m.session.improvement}</span><strong className="positive">{formatMessage(m.units.seconds, { value: formatDecimal(language, -0.714, 3) })}</strong><small>{m.session.acrossSession}</small></div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function TooltipQuality() {
  const m = useMessages(copy)
  return <span className="quality-explanation"><Info size={13} /> {m.summary.qualityExplanation}</span>
}
