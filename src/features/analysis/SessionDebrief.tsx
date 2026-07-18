import { CheckCircle2, Clock3, Gauge, Route, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { Badge, Card, CardHeader } from '../../components/ui';
import { defineMessages, formatMessage, useI18n, useMessages } from '../../i18n';
import { formatLapTime, formatSignedSeconds } from './format';
import { useLapQualityMessages } from './lap-quality-messages';
import { buildSessionDebrief } from './session-debrief';
import './analysis-memory.css';

const copy = defineMessages({
  eyebrow: 'Session debrief',
  title: 'Official pace and lap quality',
  description: 'Pace uses official LMU times from complete clean or limited laps. PB and trace references keep the stricter clean-lap gate.',
  source: { live: 'Live local session', 'recording-replay': 'Transient replay', 'imported-recording': 'Imported raw recording' },
  best: 'Best eligible official lap',
  median: 'Median pace',
  consistency: 'Pace variation',
  consistencyDetail: 'Median absolute deviation',
  laterPace: 'Later-half pace',
  faster: '{delta} faster',
  slower: '{delta} slower',
  unchanged: 'No measured change',
  noPace: 'No eligible official pace yet',
  noVariation: 'Needs at least two eligible laps',
  noTrend: 'Needs at least four eligible laps',
  paceLaps: '{count} pace-eligible laps',
  clean: '{count} clean',
  limited: '{count} limited',
  ineligible: '{count} ineligible',
  untimed: '{count} without official time',
  referenceReady: '{count} clean trace references available',
  referenceMissing: 'Official pace is available, but no lap passes the stricter PB/trace reference gate.',
  referenceUnavailable: 'No official pace or clean trace reference is available yet.',
  coverage: 'Median captured route {value}',
  ledger: 'Lap ledger',
  ledgerDescription: 'Select a lap to inspect its measured route, controls, braking, and reference evidence.',
  columns: { lap: 'Lap', time: 'Official time', delta: 'To session best', quality: 'Quality', coverage: 'Captured route', evidence: 'Evidence' },
  selected: 'Selected',
  pbReady: 'PB/trace ready',
  paceOnly: 'Official pace only',
  notPace: 'Excluded from pace',
  unavailable: 'Unavailable',
  provenance: 'Imported by Apex {version} · {processing}',
}, {
  eyebrow: 'Session-Auswertung',
  title: 'Offizielles Tempo und Rundenqualität',
  description: 'Das Tempo nutzt offizielle LMU-Zeiten vollständiger sauberer oder eingeschränkter Runden. Für PB- und Kurvenreferenzen gilt weiterhin die strengere Grenze sauberer Runden.',
  source: { live: 'Lokale Live-Session', 'recording-replay': 'Temporäre Wiedergabe', 'imported-recording': 'Importierte Rohaufzeichnung' },
  best: 'Beste geeignete offizielle Runde',
  median: 'Median-Tempo',
  consistency: 'Temposchwankung',
  consistencyDetail: 'Median der absoluten Abweichung',
  laterPace: 'Tempo der späteren Hälfte',
  faster: '{delta} schneller',
  slower: '{delta} langsamer',
  unchanged: 'Keine gemessene Änderung',
  noPace: 'Noch kein geeignetes offizielles Tempo',
  noVariation: 'Benötigt mindestens zwei geeignete Runden',
  noTrend: 'Benötigt mindestens vier geeignete Runden',
  paceLaps: '{count} für das Tempo geeignete Runden',
  clean: '{count} sauber',
  limited: '{count} eingeschränkt',
  ineligible: '{count} ungeeignet',
  untimed: '{count} ohne offizielle Zeit',
  referenceReady: '{count} saubere Kurvenreferenzen verfügbar',
  referenceMissing: 'Offizielles Tempo ist verfügbar, aber keine Runde erfüllt die strengere Grenze für PB-/Kurvenreferenzen.',
  referenceUnavailable: 'Noch kein offizielles Tempo und keine saubere Kurvenreferenz verfügbar.',
  coverage: 'Median der erfassten Strecke {value}',
  ledger: 'Rundenprotokoll',
  ledgerDescription: 'Wähle eine Runde, um gemessene Linie, Eingaben, Bremsen und Referenzbelege zu prüfen.',
  columns: { lap: 'Runde', time: 'Offizielle Zeit', delta: 'Zur Session-Bestzeit', quality: 'Qualität', coverage: 'Erfasste Strecke', evidence: 'Belege' },
  selected: 'Ausgewählt',
  pbReady: 'PB/Kurve bereit',
  paceOnly: 'Nur offizielles Tempo',
  notPace: 'Vom Tempo ausgeschlossen',
  unavailable: 'Nicht verfügbar',
  provenance: 'Importiert mit Apex {version} · {processing}',
});

function percent(language: string, value: number | null) {
  return value === null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

export function SessionDebrief({ session, selectedLapId, onSelectLap }: { session: ApexAnalysisSessionSummary; selectedLapId?: string | null; onSelectLap?: (lapId: string) => void }) {
  const m = useMessages(copy);
  const quality = useLapQualityMessages();
  const { language } = useI18n();
  const debrief = useMemo(() => buildSessionDebrief(session), [session]);
  const pace = debrief.pace;
  const half = debrief.halfComparison;
  const trend = half?.deltaMs ?? null;
  const trendLabel = trend === null
    ? m.noTrend
    : Math.abs(trend) < 0.5
      ? m.unchanged
      : formatMessage(trend < 0 ? m.faster : m.slower, { delta: formatSignedSeconds(language, Math.abs(trend))?.replace('+', '') ?? '—' });
  const provenance = session.importProvenance
    ? formatMessage(m.provenance, { version: session.importProvenance.appVersion, processing: session.importProvenance.processingVersion })
    : null;

  return <Card className="session-debrief" data-feedback-redact="measured-session-summary">
    <CardHeader eyebrow={m.eyebrow} title={m.title} description={m.description} action={<Badge tone={session.source === 'imported-recording' ? 'accent' : session.source === 'live' ? 'positive' : 'neutral'}>{m.source[session.source]}</Badge>} />
    {provenance && <p className="session-debrief__provenance">{provenance}</p>}
    <div className="session-debrief__metrics">
      <div><Clock3 size={15} /><span>{m.best}</span><strong>{pace ? formatLapTime(language, pace.bestLapTimeMs) : '—'}</strong><small>{pace ? formatMessage(m.paceLaps, { count: pace.paceEligibleLapCount.toLocaleString(language) }) : m.noPace}</small></div>
      <div><Gauge size={15} /><span>{m.median}</span><strong>{pace ? formatLapTime(language, pace.medianLapTimeMs) : '—'}</strong><small>{pace ? formatMessage(m.coverage, { value: percent(language, debrief.coverage?.median ?? null) }) : m.noPace}</small></div>
      <div><Route size={15} /><span>{m.consistency}</span><strong>{pace?.medianAbsoluteDeviationMs !== null && pace?.medianAbsoluteDeviationMs !== undefined ? `±${formatSignedSeconds(language, pace.medianAbsoluteDeviationMs)?.replace('+', '')}` : '—'}</strong><small>{pace?.medianAbsoluteDeviationMs !== null && pace?.medianAbsoluteDeviationMs !== undefined ? m.consistencyDetail : m.noVariation}</small></div>
      <div>{trend !== null && trend < 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}<span>{m.laterPace}</span><strong className={trend !== null && trend < 0 ? 'positive' : trend !== null && trend > 0 ? 'negative' : ''}>{trend === null ? '—' : formatSignedSeconds(language, trend)}</strong><small>{trendLabel}</small></div>
    </div>
    <div className="session-debrief__quality">
      <Badge tone="positive">{formatMessage(m.clean, { count: debrief.counts.clean.toLocaleString(language) })}</Badge>
      <Badge tone="warning">{formatMessage(m.limited, { count: debrief.counts.limited.toLocaleString(language) })}</Badge>
      <Badge tone="neutral">{formatMessage(m.ineligible, { count: debrief.counts.ineligible.toLocaleString(language) })}</Badge>
      {debrief.counts.untimed > 0 && <span>{formatMessage(m.untimed, { count: debrief.counts.untimed.toLocaleString(language) })}</span>}
      <span className={debrief.counts.referenceEligible > 0 ? 'is-ready' : 'is-limited'}>{debrief.counts.referenceEligible > 0 ? <CheckCircle2 size={13} /> : <Route size={13} />}{debrief.counts.referenceEligible > 0 ? formatMessage(m.referenceReady, { count: debrief.counts.referenceEligible.toLocaleString(language) }) : pace ? m.referenceMissing : m.referenceUnavailable}</span>
    </div>
    <div className="session-debrief__ledger-heading"><div><strong>{m.ledger}</strong><span>{m.ledgerDescription}</span></div><Badge tone="neutral">{debrief.laps.length.toLocaleString(language)}</Badge></div>
    <div className="session-debrief__ledger" role="table" aria-label={m.ledger}>
      <div className="session-debrief__ledger-header" role="row"><span role="columnheader">{m.columns.lap}</span><span role="columnheader">{m.columns.time}</span><span role="columnheader">{m.columns.delta}</span><span role="columnheader">{m.columns.quality}</span><span role="columnheader">{m.columns.coverage}</span><span role="columnheader">{m.columns.evidence}</span></div>
      {debrief.laps.map((lap) => {
        const reasons = lap.reasons.map((reason) => quality.reasons[reason as keyof typeof quality.reasons]).filter(Boolean).join('; ');
        const selected = lap.id === selectedLapId;
        const evidence = lap.referenceEligible ? m.pbReady : lap.paceComparison.paceEligible ? m.paceOnly : m.notPace;
        return <button key={lap.id} type="button" role="row" className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => onSelectLap?.(lap.id)}>
          <span role="cell"><b>{lap.number ?? '—'}</b>{selected && <small>{m.selected}</small>}</span>
          <span role="cell"><strong>{formatLapTime(language, lap.officialLapTimeMs) ?? '—'}</strong></span>
          <span role="cell" className={lap.paceComparison.paceEligible && lap.paceComparison.deltaToBestMs === 0 ? 'positive' : ''}>{lap.paceComparison.paceEligible ? formatSignedSeconds(language, lap.paceComparison.deltaToBestMs) : '—'}</span>
          <span role="cell"><Badge tone={lap.quality === 'clean' ? 'positive' : lap.quality === 'limited' ? 'warning' : 'neutral'}>{quality.quality[lap.quality]}</Badge></span>
          <span role="cell">{percent(language, lap.coverage)}</span>
          <span role="cell"><strong>{evidence}</strong><small>{reasons || m.unavailable}</small></span>
        </button>;
      })}
    </div>
  </Card>;
}
