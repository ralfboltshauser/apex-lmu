import {
  ArrowRight,
  CheckCircle2,
  Gauge,
  Info,
  Route,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader } from '../../components/ui';
import { defineMessages, formatMessage, useI18n, useMessages, type Language } from '../../i18n';
import { formatDecimal, formatLapTime, formatPercent, formatSignedSeconds } from './format';
import './analysis-memory.css';

const copy = defineMessages({
  eyebrow: 'Driver debrief',
  title: 'Repeated differences in this session',
  description: 'A deterministic comparison against the fastest strict lap in this session. Every time value is observed, not predicted or recoverable gain.',
  local: 'Local deterministic analysis',
  loading: { title: 'Building the debrief', body: 'Checking complete, official, clean and replayable laps…' },
  unavailable: { title: 'Debrief withheld', body: 'The required lap payloads are unavailable or did not pass validation. The factual lap ledger remains available.' },
  error: { title: 'Debrief could not be loaded', body: 'No finding was produced. The measured lap evidence remains available.' },
  invalid: { title: 'Evidence did not validate', body: 'The deterministic engine rejected this input, so Apex is withholding the debrief.' },
  insufficient: {
    title: 'More strict laps are needed',
    body: 'A repeated pattern requires one same-session reference and at least three comparable non-reference laps.',
    noReference: 'No complete official clean lap with exact replay is available as a same-session reference.',
  },
  noPattern: {
    title: 'No repeated hotspot passed the gate',
    body: 'The accepted laps did not show the same measured gap and trace difference often enough. Apex does not lower the evidence threshold to manufacture advice.',
  },
  reference: 'Session reference',
  referenceLap: 'Lap {lap}',
  nextFocus: 'Next focus',
  additional: 'Other repeated zones',
  strengthEyebrow: 'Measured strength',
  variabilityEyebrow: 'Pace variability',
  evidenceEyebrow: 'Evidence accounting',
  showEvidence: 'Show evidence',
  zone: 'Zone {number}',
  rangeMetres: '{start}–{end} m',
  rangeKilometres: '{start}–{end} km',
  observedGap: 'Median observed gap',
  observedDifference: 'Median observed difference',
  observedNotGain: 'Observed against one measured reference; this is not recoverable or predicted time.',
  recurrence: '{agreement} of {count} compared laps were slower in this zone.',
  spread: 'MAD {mad} · observed range {minimum} to {maximum}',
  observationDetail: '{difference} {unit} median difference · {agreement} of the {count} laps were slower here and showed this direction',
  tryNext: 'Small test for the next run',
  compareFallback: 'Compare the selected lap and session reference through this range before changing an input.',
  associationShort: 'This is a repeated association, not a diagnosed cause. Inspect the evidence before changing an input.',
  strength: {
    'recurring-relative-gain': 'This zone was repeatedly faster relative to the reference.',
    'smallest-median-relative-loss': 'This zone stayed closest to the reference.',
  },
  variability: {
    'pace-stable': 'Stable accepted pace',
    'pace-moderate': 'Moderate accepted pace variation',
    'pace-variable': 'Variable accepted pace',
  },
  medianPace: 'Median',
  paceMad: 'MAD',
  paceRange: 'Range',
  acceptedLaps: '{count} accepted laps',
  accounting: {
    total: 'All session laps',
    eligible: 'Strict eligible',
    analyzed: 'Analyzed',
    excluded: 'Excluded',
    cap: '{count} eligible laps were not decoded because of the bounded cohort limit.',
  },
  methodTitle: 'Method, exclusions and permanent limits',
  method: {
    cohort: 'Only complete official clean laps with a valid exact-replay payload enter the technique cohort. The fastest accepted lap in this session is the reference.',
    association: 'A repeated trace difference is an association, not a cause. Line choice, corrections and unretained conditions can produce the same trace.',
    unavailableChannels: 'The current canonical payload excludes fuel, tyres, weather, traffic, setup, damage and racecraft context, so this debrief does not diagnose them.',
    mode: 'LMU_Data has no authoritative online/offline mode field. Apex uses the same measured-data path for both and does not infer the mode from the number of cars.',
  },
  exclusion: {
    'not-complete': 'Not complete',
    'not-official': 'No positive official time',
    'not-clean': 'Not clean',
    'not-reference-eligible': 'Not reference eligible',
    'not-replayable': 'Not exactly replayable',
    'payload-unavailable': 'Payload unavailable',
    'payload-evicted': 'Payload evicted from memory',
    'cohort-limit': 'Outside bounded cohort',
  },
  exclusionCount: '{label}: {count}',
  limitation: {
    'cohort-capped': 'The eligible cohort was capped at 16 decoded laps.',
    'fewer-than-three-comparisons': 'Fewer than three non-reference comparisons were available.',
    'no-recurring-hotspots': 'No zone passed the repeated-hotspot gate.',
    'selected-lap-not-supplied': 'No lap was preselected while building the stable session cohort.',
    'selected-lap-not-analyzed': 'The selected lap was not part of the strict analyzed cohort.',
    'selected-lap-is-reference': 'The selected lap is the same-session reference.',
  },
  observation: {
    'brake-onset-earlier': 'Brake onset was earlier',
    'brake-onset-later': 'Brake onset was later',
    'brake-release-earlier': 'Brake release was earlier',
    'brake-release-later': 'Brake release was later',
    'throttle-pickup-earlier': 'Throttle pickup was earlier',
    'throttle-pickup-later': 'Throttle pickup was later',
    'coast-distance-more': 'Coasting distance was longer',
    'coast-distance-less': 'Coasting distance was shorter',
    'minimum-speed-lower': 'Minimum speed was lower',
    'minimum-speed-higher': 'Minimum speed was higher',
    'exit-speed-lower': 'Exit speed was lower',
    'exit-speed-higher': 'Exit speed was higher',
  },
  experiment: {
    'brake-onset-later-small-step': 'Test braking a small step later, then compare the same range again.',
    'brake-release-earlier-small-step': 'Test releasing the brake a small step earlier, then compare the same range again.',
    'throttle-pickup-earlier-small-step': 'Test picking up throttle a small step earlier, then compare the same range again.',
    'coast-distance-shorter-small-step': 'Test shortening the coast phase slightly, then compare the same range again.',
    'minimum-speed-higher-small-step': 'Test carrying a small amount more minimum speed, then compare the same range again.',
    'exit-speed-higher-small-step': 'Test prioritizing a small increase in exit speed, then compare the same range again.',
  },
}, {
  eyebrow: 'Fahrer-Auswertung',
  title: 'Wiederkehrende Unterschiede in dieser Session',
  description: 'Ein deterministischer Vergleich mit der schnellsten streng geeigneten Runde dieser Session. Jede Zeitangabe ist beobachtet, nicht vorhergesagt oder rückholbar.',
  local: 'Lokale deterministische Analyse',
  loading: { title: 'Auswertung wird erstellt', body: 'Vollständige, offizielle, saubere und abspielbare Runden werden geprüft…' },
  unavailable: { title: 'Auswertung zurückgehalten', body: 'Die benötigten Rundendaten sind nicht verfügbar oder haben die Prüfung nicht bestanden. Das sachliche Rundenprotokoll bleibt verfügbar.' },
  error: { title: 'Auswertung konnte nicht geladen werden', body: 'Es wurde keine Erkenntnis erzeugt. Die gemessenen Rundenbelege bleiben verfügbar.' },
  invalid: { title: 'Belege haben die Prüfung nicht bestanden', body: 'Die deterministische Engine hat diese Eingabe abgelehnt, daher hält Apex die Auswertung zurück.' },
  insufficient: {
    title: 'Mehr streng geeignete Runden nötig',
    body: 'Ein wiederkehrendes Muster benötigt eine Referenz aus derselben Session und mindestens drei vergleichbare weitere Runden.',
    noReference: 'Keine vollständige, offizielle und saubere Runde mit exakter Wiedergabe ist als Referenz derselben Session verfügbar.',
  },
  noPattern: {
    title: 'Kein wiederkehrender Schwerpunkt erfüllt die Grenze',
    body: 'Die akzeptierten Runden zeigten dieselbe gemessene Lücke und Kurvendifferenz nicht oft genug. Apex senkt die Beleggrenze nicht, um einen Ratschlag zu erzeugen.',
  },
  reference: 'Session-Referenz',
  referenceLap: 'Runde {lap}',
  nextFocus: 'Nächster Schwerpunkt',
  additional: 'Weitere wiederkehrende Zonen',
  strengthEyebrow: 'Gemessene Stärke',
  variabilityEyebrow: 'Temposchwankung',
  evidenceEyebrow: 'Belegbilanz',
  showEvidence: 'Belege anzeigen',
  zone: 'Zone {number}',
  rangeMetres: '{start}–{end} m',
  rangeKilometres: '{start}–{end} km',
  observedGap: 'Median der beobachteten Lücke',
  observedDifference: 'Median des beobachteten Unterschieds',
  observedNotGain: 'Gegen eine gemessene Referenz beobachtet; dies ist keine rückholbare oder vorhergesagte Zeit.',
  recurrence: '{agreement} von {count} Vergleichsrunden waren in dieser Zone langsamer.',
  spread: 'MAD {mad} · beobachteter Bereich {minimum} bis {maximum}',
  observationDetail: '{difference} {unit} Unterschied im Median · {agreement} der {count} Runden waren hier langsamer und zeigten diese Richtung',
  tryNext: 'Kleiner Test für die nächste Fahrt',
  compareFallback: 'Vergleiche die ausgewählte Runde und die Session-Referenz in diesem Bereich, bevor du eine Eingabe änderst.',
  associationShort: 'Dies ist ein wiederkehrender Zusammenhang, keine festgestellte Ursache. Prüfe die Belege, bevor du eine Eingabe änderst.',
  strength: {
    'recurring-relative-gain': 'Diese Zone war relativ zur Referenz wiederholt schneller.',
    'smallest-median-relative-loss': 'Diese Zone blieb der Referenz am nächsten.',
  },
  variability: {
    'pace-stable': 'Stabiles akzeptiertes Tempo',
    'pace-moderate': 'Mittlere Schwankung des akzeptierten Tempos',
    'pace-variable': 'Schwankendes akzeptiertes Tempo',
  },
  medianPace: 'Median',
  paceMad: 'MAD',
  paceRange: 'Bereich',
  acceptedLaps: '{count} akzeptierte Runden',
  accounting: {
    total: 'Alle Session-Runden',
    eligible: 'Streng geeignet',
    analyzed: 'Analysiert',
    excluded: 'Ausgeschlossen',
    cap: '{count} geeignete Runden wurden wegen der begrenzten Kohorte nicht dekodiert.',
  },
  methodTitle: 'Methode, Ausschlüsse und dauerhafte Grenzen',
  method: {
    cohort: 'Nur vollständige, offizielle und saubere Runden mit gültigen Daten für die exakte Wiedergabe kommen in die Technikkohorte. Die schnellste akzeptierte Runde dieser Session ist die Referenz.',
    association: 'Eine wiederkehrende Kurvendifferenz ist ein Zusammenhang, keine Ursache. Fahrlinie, Korrekturen und nicht gespeicherte Bedingungen können dieselbe Kurve erzeugen.',
    unavailableChannels: 'Der aktuelle kanonische Datensatz enthält keinen Kraftstoff, keine Reifen, kein Wetter, keinen Verkehr sowie keinen Setup-, Schadens- oder Zweikampfkontext. Diese Auswertung diagnostiziert sie daher nicht.',
    mode: 'LMU_Data enthält kein maßgebliches Online-/Offline-Modusfeld. Apex nutzt für beide denselben Messdatenpfad und leitet den Modus nicht aus der Fahrzeugzahl ab.',
  },
  exclusion: {
    'not-complete': 'Nicht vollständig',
    'not-official': 'Keine positive offizielle Zeit',
    'not-clean': 'Nicht sauber',
    'not-reference-eligible': 'Nicht als Referenz geeignet',
    'not-replayable': 'Nicht exakt abspielbar',
    'payload-unavailable': 'Rundendaten nicht verfügbar',
    'payload-evicted': 'Rundendaten aus dem Speicher entfernt',
    'cohort-limit': 'Außerhalb der begrenzten Kohorte',
  },
  exclusionCount: '{label}: {count}',
  limitation: {
    'cohort-capped': 'Die geeignete Kohorte wurde auf 16 dekodierte Runden begrenzt.',
    'fewer-than-three-comparisons': 'Es waren weniger als drei Vergleichsrunden neben der Referenz verfügbar.',
    'no-recurring-hotspots': 'Keine Zone erfüllte die Grenze für wiederkehrende Schwerpunkte.',
    'selected-lap-not-supplied': 'Beim Aufbau der stabilen Session-Kohorte war keine Runde vorausgewählt.',
    'selected-lap-not-analyzed': 'Die ausgewählte Runde gehörte nicht zur streng analysierten Kohorte.',
    'selected-lap-is-reference': 'Die ausgewählte Runde ist die Referenz derselben Session.',
  },
  observation: {
    'brake-onset-earlier': 'Der Bremsbeginn war früher',
    'brake-onset-later': 'Der Bremsbeginn war später',
    'brake-release-earlier': 'Das Lösen der Bremse war früher',
    'brake-release-later': 'Das Lösen der Bremse war später',
    'throttle-pickup-earlier': 'Das Gasgeben war früher',
    'throttle-pickup-later': 'Das Gasgeben war später',
    'coast-distance-more': 'Die Rollstrecke war länger',
    'coast-distance-less': 'Die Rollstrecke war kürzer',
    'minimum-speed-lower': 'Die Mindestgeschwindigkeit war niedriger',
    'minimum-speed-higher': 'Die Mindestgeschwindigkeit war höher',
    'exit-speed-lower': 'Die Ausgangsgeschwindigkeit war niedriger',
    'exit-speed-higher': 'Die Ausgangsgeschwindigkeit war höher',
  },
  experiment: {
    'brake-onset-later-small-step': 'Teste einen geringfügig späteren Bremsbeginn und vergleiche danach denselben Bereich erneut.',
    'brake-release-earlier-small-step': 'Teste ein geringfügig früheres Lösen der Bremse und vergleiche danach denselben Bereich erneut.',
    'throttle-pickup-earlier-small-step': 'Teste ein geringfügig früheres Gasgeben und vergleiche danach denselben Bereich erneut.',
    'coast-distance-shorter-small-step': 'Teste eine etwas kürzere Rollphase und vergleiche danach denselben Bereich erneut.',
    'minimum-speed-higher-small-step': 'Teste eine geringfügig höhere Mindestgeschwindigkeit und vergleiche danach denselben Bereich erneut.',
    'exit-speed-higher-small-step': 'Teste eine geringfügig höhere Ausgangsgeschwindigkeit und vergleiche danach denselben Bereich erneut.',
  },
});

export type DriverReviewLoadState =
  | { readonly code: 'loading' }
  | { readonly code: 'unavailable' }
  | { readonly code: 'error' }
  | { readonly code: 'ready'; readonly review: ApexDriverReview };

export interface DriverReviewEvidenceTarget {
  readonly kind: 'hotspot' | 'strength';
  readonly id: string;
  readonly startDistanceM: number;
  readonly endDistanceM: number;
  readonly representativeLapId: string;
  readonly representativeLapNumber: number;
}

function finite(value: number) {
  return Number.isFinite(value);
}

function zoneNumber(id: string, fallback: number, language: Language) {
  const match = id.match(/(\d+)$/);
  const value = match ? Number(match[1]) : fallback;
  return new Intl.NumberFormat(language, { minimumIntegerDigits: 2, maximumFractionDigits: 0 }).format(value);
}

function zoneRange(language: Language, startDistanceM: number, endDistanceM: number, messages: { rangeKilometres: string; rangeMetres: string }) {
  if (startDistanceM >= 1000 && endDistanceM >= 1000) {
    return formatMessage(messages.rangeKilometres, {
      start: formatDecimal(language, startDistanceM / 1000, 2),
      end: formatDecimal(language, endDistanceM / 1000, 2),
    });
  }
  return formatMessage(messages.rangeMetres, {
    start: formatDecimal(language, startDistanceM, 0),
    end: formatDecimal(language, endDistanceM, 0),
  });
}

function ZoneTitle({ id, fallback, startDistanceM, endDistanceM }: { id: string; fallback: number; startDistanceM: number; endDistanceM: number }) {
  const m = useMessages(copy);
  const { language } = useI18n();
  return <>{formatMessage(m.zone, { number: zoneNumber(id, fallback, language) })} · {zoneRange(language, startDistanceM, endDistanceM, m)}</>;
}

function StateMessage({ title, body }: { title: string; body: string }) {
  return <div className="driver-review__state" role="status"><Info size={18} /><div><strong>{title}</strong><p>{body}</p></div></div>;
}

function ReviewAccounting({ review }: { review: ApexDriverReview }) {
  const m = useMessages(copy);
  const { language } = useI18n();
  const accounting = review.cohort.accounting;
  const exclusions = Object.entries(accounting.exclusions) as Array<[ApexDriverReviewEvidenceExclusionCode, number]>;
  return <>
    <div className="driver-review__section-title"><ShieldCheck size={14} /><span><small>{m.evidenceEyebrow}</small><strong>{formatMessage(m.acceptedLaps, { count: review.cohort.analyzedLapCount.toLocaleString(language) })}</strong></span></div>
    <div className="driver-review__accounting">
      <span><small>{m.accounting.total}</small><strong>{accounting.totalLapCount.toLocaleString(language)}</strong></span>
      <span><small>{m.accounting.eligible}</small><strong>{accounting.strictEligibleTotal.toLocaleString(language)}</strong></span>
      <span><small>{m.accounting.analyzed}</small><strong>{accounting.sampledLapCount.toLocaleString(language)}</strong></span>
      <span><small>{m.accounting.excluded}</small><strong>{accounting.strictExcludedTotal.toLocaleString(language)}</strong></span>
    </div>
    {accounting.notDecodedDueToLimit > 0 && <p className="driver-review__cap">{formatMessage(m.accounting.cap, { count: accounting.notDecodedDueToLimit.toLocaleString(language) })}</p>}
    {exclusions.length > 0 && <div className="driver-review__exclusions">{exclusions.filter(([, count]) => count > 0).map(([code, count]) => <Badge key={code} tone="neutral">{formatMessage(m.exclusionCount, { label: m.exclusion[code], count: count.toLocaleString(language) })}</Badge>)}</div>}
  </>;
}

function Variability({ variability }: { variability: ApexDriverReviewVariability }) {
  const m = useMessages(copy);
  const { language } = useI18n();
  return <section className="driver-review__support-card driver-review__variability">
    <div className="driver-review__section-title"><Gauge size={14} /><span><small>{m.variabilityEyebrow}</small><strong>{m.variability[variability.code]}</strong></span></div>
    <div className="driver-review__mini-metrics">
      <span><small>{m.medianPace}</small><strong>{formatLapTime(language, variability.medianLapTimeMs) ?? '—'}</strong></span>
      <span><small>{m.paceMad}</small><strong>{finite(variability.madLapTimeMs) ? `±${formatSignedSeconds(language, variability.madLapTimeMs)?.replace('+', '')}` : '—'}</strong></span>
      <span><small>{m.paceRange}</small><strong>{formatLapTime(language, variability.minimumLapTimeMs) ?? '—'}–{formatLapTime(language, variability.maximumLapTimeMs) ?? '—'}</strong></span>
    </div>
  </section>;
}

function Hotspot({ hotspot, index, primary, onShowEvidence }: { hotspot: ApexDriverReviewHotspot; index: number; primary: boolean; onShowEvidence: (target: DriverReviewEvidenceTarget) => void }) {
  const m = useMessages(copy);
  const { language } = useI18n();
  const experiment = hotspot.experiments[0];
  const action = () => onShowEvidence({
    kind: 'hotspot', id: hotspot.id, startDistanceM: hotspot.startDistanceM, endDistanceM: hotspot.endDistanceM,
    representativeLapId: hotspot.representativeLapId, representativeLapNumber: hotspot.representativeLapNumber,
  });
  return <article className={`driver-review__hotspot ${primary ? 'is-primary' : ''}`}>
    <div className="driver-review__hotspot-heading">
      <span><small>{primary ? m.nextFocus : formatMessage(m.zone, { number: zoneNumber(hotspot.id, index + 1, language) })}</small><h3><ZoneTitle id={hotspot.id} fallback={index + 1} startDistanceM={hotspot.startDistanceM} endDistanceM={hotspot.endDistanceM} /></h3></span>
      <strong>{formatSignedSeconds(language, hotspot.medianLossMs) ?? '—'}</strong>
    </div>
    <div className="driver-review__hotspot-evidence">
      <p><b>{m.observedGap}</b><span>{formatMessage(m.recurrence, { agreement: formatPercent(language, hotspot.directionalAgreement * 100), count: hotspot.comparedLapCount.toLocaleString(language) })}</span><small>{formatMessage(m.spread, {
        mad: formatSignedSeconds(language, hotspot.madLossMs)?.replace('+', '') ?? '—',
        minimum: formatSignedSeconds(language, hotspot.minimumLossMs) ?? '—',
        maximum: formatSignedSeconds(language, hotspot.maximumLossMs) ?? '—',
      })}</small></p>
      {hotspot.observations.length > 0 && <ul>{hotspot.observations.map((observation) => <li key={observation.code}><CheckCircle2 size={12} /><span><strong>{m.observation[observation.code]}</strong><small>{formatMessage(m.observationDetail, {
        difference: formatDecimal(language, Math.abs(observation.medianDelta), observation.unit === 'm' ? 0 : 1),
        unit: observation.unit === 'm' ? 'm' : 'km/h',
        agreement: formatPercent(language, observation.directionalAgreement * 100),
        count: observation.comparedLapCount.toLocaleString(language),
      })}</small></span></li>)}</ul>}
    </div>
    {primary && <div className="driver-review__experiment"><Target size={16} /><span><small>{m.tryNext}</small><strong>{experiment ? m.experiment[experiment] : m.compareFallback}</strong><p>{m.associationShort}</p></span></div>}
    <p className="driver-review__observed-limit">{m.observedNotGain}</p>
    <Button variant={primary ? 'primary' : 'secondary'} size="sm" icon={<ArrowRight size={13} />} onClick={action}>{m.showEvidence}</Button>
  </article>;
}

function Strength({ strength, onShowEvidence }: { strength: ApexDriverReviewStrength; onShowEvidence: (target: DriverReviewEvidenceTarget) => void }) {
  const m = useMessages(copy);
  const { language } = useI18n();
  return <section className="driver-review__support-card driver-review__strength">
    <div className="driver-review__section-title"><Route size={14} /><span><small>{m.strengthEyebrow}</small><strong><ZoneTitle id={strength.segmentId} fallback={1} startDistanceM={strength.startDistanceM} endDistanceM={strength.endDistanceM} /></strong></span></div>
    <p>{m.strength[strength.code]}</p>
    <div className="driver-review__strength-value"><small>{m.observedDifference}</small><strong className={strength.code === 'recurring-relative-gain' ? 'is-gain' : undefined}>{formatSignedSeconds(language, strength.medianLossMs) ?? '—'}</strong></div>
    <Button variant="secondary" size="sm" icon={<ArrowRight size={13} />} onClick={() => onShowEvidence({
      kind: 'strength', id: strength.segmentId, startDistanceM: strength.startDistanceM, endDistanceM: strength.endDistanceM,
      representativeLapId: strength.representativeLapId, representativeLapNumber: strength.representativeLapNumber,
    })}>{m.showEvidence}</Button>
  </section>;
}

function MethodAndLimits({ review }: { review: ApexDriverReview }) {
  const m = useMessages(copy);
  return <details className="driver-review__method">
    <summary>{m.methodTitle}</summary>
    <div>
      <p>{m.method.cohort}</p>
      <p>{m.method.association}</p>
      <p>{m.method.unavailableChannels}</p>
      <p>{m.method.mode}</p>
      {review.limitations.length > 0 && <ul>{review.limitations.map((code) => <li key={code}>{m.limitation[code]}</li>)}</ul>}
    </div>
  </details>;
}

export function DriverReview({ state, onShowEvidence }: { state: DriverReviewLoadState; onShowEvidence: (target: DriverReviewEvidenceTarget) => void }) {
  const m = useMessages(copy);
  const { language } = useI18n();
  if (state.code === 'loading') return <Card className="driver-review"><CardHeader eyebrow={m.eyebrow} title={m.title} description={m.description} action={<Badge tone="neutral">{m.local}</Badge>} /><StateMessage title={m.loading.title} body={m.loading.body} /></Card>;
  if (state.code === 'unavailable') return <Card className="driver-review"><CardHeader eyebrow={m.eyebrow} title={m.title} description={m.description} action={<Badge tone="warning">{m.local}</Badge>} /><StateMessage title={m.unavailable.title} body={m.unavailable.body} /></Card>;
  if (state.code === 'error') return <Card className="driver-review"><CardHeader eyebrow={m.eyebrow} title={m.title} description={m.description} action={<Badge tone="warning">{m.local}</Badge>} /><StateMessage title={m.error.title} body={m.error.body} /></Card>;

  const review = state.review;
  const reference = review.reference;
  const invalid = review.status.code === 'invalid-input';
  const insufficient = review.status.code === 'insufficient-evidence';
  const noPattern = review.status.code === 'ready' && review.hotspots.length === 0;
  return <Card className="driver-review" data-feedback-redact="deterministic-driver-review">
    <CardHeader eyebrow={m.eyebrow} title={m.title} description={m.description} action={reference
      ? <div className="driver-review__reference"><small>{m.reference}</small><strong>{formatMessage(m.referenceLap, { lap: reference.lapNumber })} · {formatLapTime(language, reference.lapTimeMs) ?? '—'}</strong></div>
      : <Badge tone="neutral">{m.local}</Badge>} />
    {invalid && <StateMessage title={m.invalid.title} body={m.invalid.body} />}
    {insufficient && <StateMessage title={m.insufficient.title} body={reference ? m.insufficient.body : m.insufficient.noReference} />}
    {noPattern && <StateMessage title={m.noPattern.title} body={m.noPattern.body} />}
    {!invalid && !insufficient && review.hotspots[0] && <Hotspot hotspot={review.hotspots[0]} index={0} primary onShowEvidence={onShowEvidence} />}
    {!invalid && !insufficient && review.hotspots.length > 1 && <section className="driver-review__additional"><h3>{m.additional}</h3><div>{review.hotspots.slice(1, 3).map((hotspot, index) => <Hotspot key={hotspot.id} hotspot={hotspot} index={index + 1} primary={false} onShowEvidence={onShowEvidence} />)}</div></section>}
    {!invalid && <div className="driver-review__support-grid">{review.strength && <Strength strength={review.strength} onShowEvidence={onShowEvidence} />}{review.variability && <Variability variability={review.variability} />}</div>}
    <ReviewAccounting review={review} />
    <MethodAndLimits review={review} />
  </Card>;
}
