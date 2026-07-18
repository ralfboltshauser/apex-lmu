import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CircuitTrackMap } from '../../components/visuals/CircuitTrackMap';
import { Badge, Button, Card, CardHeader, Segmented, Select } from '../../components/ui';
import {
  buildMeasuredTrackSnapshot,
  deltaAtDistance,
  normalizedPlayhead,
  playbackMaximum,
  sampleLapAt,
  type BrakeZone,
  type MeasuredTrackSnapshot,
  type PlaybackMode,
} from '../../engine';
import { defineMessages, formatMessage, useI18n, useMessages, type Language } from '../../i18n';
import { formatDecimal, formatLapTime, formatPercent } from './format';
import { lapPlaybackAvailable } from './lap-availability';
import { useLapQualityMessages } from './lap-quality-messages';
import {
  RecordingImportControl,
  type RecordingImportController,
} from './RecordingImportControl';
import { SessionDebrief } from './SessionDebrief';
import {
  DriverReview,
  type DriverReviewEvidenceTarget,
  type DriverReviewLoadState,
} from './DriverReview';

const copy = defineMessages({
  heading: { eyebrow: 'Analysis' },
  toolbar: { lap: 'Lap', laps: 'laps' },
  channels: { throttle: 'Throttle', brake: 'Brake' },
  telemetry: { eyebrow: 'Evidence' },
  tabs: { label: 'Analysis view', debrief: 'Driver debrief', evidence: 'Lap evidence' },
  reviewEvidence: {
    eyebrow: 'Selected review evidence',
    title: 'Lap {subject} against session reference lap {reference}',
    zone: 'Zone {number}',
    range: '{zone} · {start}–{end} m',
    loading: 'Loading the representative lap and same-session reference…',
    ready: 'The map and traces highlight the exact reported distance range.',
    subjectMissing: 'The representative lap payload is unavailable, so this finding cannot be replayed.',
    referenceMissing: 'The same-session reference payload is unavailable. Apex will not substitute a personal best from another session.',
  },
  measured: {
    badge: 'Measured local session',
    title: 'Driver debrief and lap evidence',
    description: 'Review repeated same-session differences, then inspect the exact recorded position and controls. The displayed track width is illustrative, not a surveyed boundary.',
    route: 'Locally learned centre path',
    routeLearning: 'Centre path learning in progress',
    selectedLap: 'Selected lap',
    coverage: 'route coverage',
    evidence: 'Brake-zone evidence',
    applied: 'Brake applied',
    peak: 'Peak pressure',
    released: 'Released',
    duration: 'Duration',
    entry: 'Entry',
    minimum: 'minimum',
    exit: 'exit',
    noZones: 'No stable brake zones were detected on this lap.',
    trace: 'Synchronized speed, throttle and brake traces',
    speed: 'Speed',
    brake: 'Brake',
    metres: 'm',
    secondUnit: 's',
    speedUnit: 'km/h',
    sessionSelector: 'Measured session',
    lapSelector: 'Measured lap',
    current: 'Current partial lap',
    complete: 'Completed lap',
    incomplete: 'Incomplete lap',
    loading: 'Loading measured lap…',
    samplesUnavailable: 'Detailed samples for this lap are no longer retained in memory.',
    replayUnavailable: 'This lap remains in the evidence ledger, but its samples are not complete enough for exact replay.',
    noMeasuredLaps: 'No measured lap samples are available yet.',
    quality: 'Lap quality',
    play: 'Play lap',
    pause: 'Pause replay',
    restart: 'Return to lap start',
    timeline: 'Replay position',
    timeMode: 'Time',
    distanceMode: 'Distance',
    playbackMode: 'Replay axis',
    playbackSpeed: 'Playback speed',
    personalBest: 'Personal best',
    sessionReference: 'Session reference',
    noReference: 'No eligible personal best yet',
    deltaToPb: 'Delta to PB',
    deltaToSessionReference: 'Delta to session reference',
    exactPosition: 'Exact recorded position',
    learningPath: 'The centre path is still learning; the selected driven line remains exact.',
  },
}, {
  heading: { eyebrow: 'Analyse' },
  toolbar: { lap: 'Runde', laps: 'Runden' },
  channels: { throttle: 'Gas', brake: 'Bremse' },
  telemetry: { eyebrow: 'Belege' },
  tabs: { label: 'Analyseansicht', debrief: 'Fahrer-Auswertung', evidence: 'Rundenbelege' },
  reviewEvidence: {
    eyebrow: 'Ausgewählte Belege der Auswertung',
    title: 'Runde {subject} gegen Session-Referenzrunde {reference}',
    zone: 'Zone {number}',
    range: '{zone} · {start}–{end} m',
    loading: 'Repräsentative Runde und Referenz derselben Session werden geladen…',
    ready: 'Karte und Kurven markieren den exakt gemeldeten Distanzbereich.',
    subjectMissing: 'Die Daten der repräsentativen Runde sind nicht verfügbar, daher kann diese Erkenntnis nicht wiedergegeben werden.',
    referenceMissing: 'Die Daten der Session-Referenz sind nicht verfügbar. Apex ersetzt sie nicht durch eine persönliche Bestzeit aus einer anderen Session.',
  },
  measured: {
    badge: 'Gemessene lokale Sitzung',
    title: 'Fahrer-Auswertung und Rundenbelege',
    description: 'Prüfe wiederkehrende Unterschiede derselben Session und danach die exakt aufgezeichnete Position und Eingaben. Die dargestellte Streckenbreite ist illustrativ, keine vermessene Begrenzung.',
    route: 'Lokal gelernte Mittellinie',
    routeLearning: 'Mittellinie wird noch gelernt',
    selectedLap: 'Ausgewählte Runde',
    coverage: 'Streckenabdeckung',
    evidence: 'Belege der Bremszonen',
    applied: 'Bremse betätigt',
    peak: 'Maximaldruck',
    released: 'Gelöst',
    duration: 'Dauer',
    entry: 'Eingang',
    minimum: 'Minimum',
    exit: 'Ausgang',
    noZones: 'Auf dieser Runde wurden keine stabilen Bremszonen erkannt.',
    trace: 'Synchronisierte Geschwindigkeits-, Gas- und Bremskurven',
    speed: 'Geschwindigkeit',
    brake: 'Bremse',
    metres: 'm',
    secondUnit: 's',
    speedUnit: 'km/h',
    sessionSelector: 'Gemessene Sitzung',
    lapSelector: 'Gemessene Runde',
    current: 'Aktuelle Teilrunde',
    complete: 'Abgeschlossene Runde',
    incomplete: 'Unvollständige Runde',
    loading: 'Gemessene Runde wird geladen…',
    samplesUnavailable: 'Die Detaildaten dieser Runde werden nicht mehr im Arbeitsspeicher vorgehalten.',
    replayUnavailable: 'Diese Runde bleibt im Belegprotokoll, aber ihre Messpunkte sind für eine exakte Wiedergabe nicht vollständig genug.',
    noMeasuredLaps: 'Noch keine gemessenen Rundendaten verfügbar.',
    quality: 'Rundenqualität',
    play: 'Runde abspielen',
    pause: 'Wiedergabe pausieren',
    restart: 'Zum Rundenstart',
    timeline: 'Wiedergabeposition',
    timeMode: 'Zeit',
    distanceMode: 'Distanz',
    playbackMode: 'Wiedergabeachse',
    playbackSpeed: 'Wiedergabegeschwindigkeit',
    personalBest: 'Persönliche Bestzeit',
    sessionReference: 'Session-Referenz',
    noReference: 'Noch keine gültige persönliche Bestzeit',
    deltaToPb: 'Delta zur PB',
    deltaToSessionReference: 'Delta zur Session-Referenz',
    exactPosition: 'Exakt aufgezeichnete Position',
    learningPath: 'Die Mittellinie wird noch gelernt; die ausgewählte Fahrlinie bleibt exakt.',
  },
});

export interface MeasuredAnalysisViewProps {
  readonly measuredTrack?: MeasuredTrackSnapshot | null;
  readonly analysisSessions?: readonly ApexAnalysisSessionSummary[];
  readonly recordingImport: RecordingImportController;
}

function measuredTracePoints(
  samples: readonly ApexAnalysisSample[],
  channel: 'speed' | 'brake' | 'throttle',
  mode: PlaybackMode,
  maximum: number,
  maximumSpeed: number,
) {
  const width = 1000;
  const height = 130;
  return samples.map((sample) => {
    const axis = mode === 'time' ? sample.lapElapsedSeconds : sample.distanceIndexM ?? sample.distanceM;
    const x = axis / Math.max(1, maximum) * width;
    const value = channel === 'speed'
      ? sample.speedKph / maximumSpeed
      : channel === 'throttle' ? sample.throttle : sample.brake;
    return `${x.toFixed(1)},${(height - value * height).toFixed(1)}`;
  }).join(' ');
}

function zoneLabel(zone: BrakeZone, language: Language, metres: string) {
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(zone.startDistanceM)}–${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(zone.releaseDistanceM)} ${metres}`;
}

interface MeasuredLapViewProps {
  readonly snapshot: MeasuredTrackSnapshot;
  readonly controls?: ReactNode;
  readonly overview?: ReactNode;
  readonly lap?: ApexAnalysisLapSummary | null;
  readonly reference?: ApexAnalysisLapPayload['personalBest'];
  readonly embedded?: boolean;
  readonly focusRange?: { readonly id: string; readonly startDistanceM: number; readonly endDistanceM: number; readonly label: string } | null;
  readonly referenceKind?: 'personal-best' | 'session-reference';
}

function MeasuredLapView({
  snapshot,
  controls = null,
  overview = null,
  lap = null,
  reference = null,
  embedded = false,
  focusRange = null,
  referenceKind = 'personal-best',
}: MeasuredLapViewProps) {
  const m = useMessages(copy);
  const lapQuality = useLapQualityMessages();
  const { language } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(snapshot.brakeZones[0]?.id ?? null);
  const [mode, setMode] = useState<PlaybackMode>('distance');
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const animationFrame = useRef<number | null>(null);
  const previousFrame = useRef<number | null>(null);
  const subjectSamples = useMemo<ApexAnalysisSample[]>(() => snapshot.selectedLap.map((sample) => ({
    throttle: 0,
    steering: 0,
    lapElapsedSeconds: sample.elapsedSeconds,
    ...sample,
  })), [snapshot.selectedLap]);
  const referenceSamples = reference?.samples ?? [];
  const maximum = playbackMaximum(subjectSamples, mode, lap?.lapTimeMs);
  const lapDuration = Math.max(0.001, playbackMaximum(subjectSamples, 'time', lap?.lapTimeMs));
  const cursorProgress = normalizedPlayhead(subjectSamples, mode, playhead, lap?.lapTimeMs);
  const current = sampleLapAt(subjectSamples, mode, playhead);
  const referenceValue = current
    ? mode === 'time' ? playhead : current.distanceIndexM ?? current.distanceM
    : 0;
  const referenceCurrent = sampleLapAt(referenceSamples, mode, referenceValue);
  const currentDelta = current && referenceSamples.length
    ? deltaAtDistance(subjectSamples, referenceSamples, current.distanceIndexM ?? current.distanceM)
    : null;
  const selected = snapshot.brakeZones.find((zone) => zone.id === selectedId) ?? snapshot.brakeZones[0];
  const points = useMemo(() => snapshot.route.map((point) => ({
    x: point.x,
    y: point.z,
    distanceM: point.distanceM,
  })), [snapshot.route]);
  const traces = useMemo(() => [
    {
      id: 'selected-lap',
      points: subjectSamples.map((sample) => ({
        x: sample.x,
        y: sample.z,
        distanceM: sample.distanceIndexM ?? sample.distanceM,
      })),
      color: '#f5f7fb',
    },
    ...(referenceSamples.length && reference?.lap.id !== lap?.id ? [{
      id: referenceKind === 'session-reference' ? 'session-reference' : 'personal-best',
      points: referenceSamples.map((sample) => ({
        x: sample.x,
        y: sample.z,
        distanceM: sample.distanceIndexM ?? sample.distanceM,
      })),
      color: '#b8f34a',
      className: 'is-reference',
    }] : []),
  ], [lap?.id, reference?.lap.id, referenceKind, referenceSamples, subjectSamples]);
  const segments = useMemo(() => snapshot.brakeZones.map((zone) => ({
    from: zone.startDistanceM / snapshot.trackLengthM,
    to: zone.releaseDistanceM / snapshot.trackLengthM,
    color: zone.id === selected?.id ? '#ffb45d' : '#ff5d57',
    label: zoneLabel(zone, language, m.measured.metres),
  })), [language, m.measured.metres, selected?.id, snapshot.brakeZones, snapshot.trackLengthM]);
  const focusedSegment = useMemo(() => focusRange ? {
    from: focusRange.startDistanceM / snapshot.trackLengthM,
    to: focusRange.endDistanceM / snapshot.trackLengthM,
    color: '#b8f34a',
    label: focusRange.label,
  } : null, [focusRange, snapshot.trackLengthM]);
  const mapSegments = focusedSegment ? [...segments, focusedSegment] : segments;
  const maximumSpeed = Math.max(
    1,
    ...subjectSamples.map((sample) => sample.speedKph),
    ...referenceSamples.map((sample) => sample.speedKph),
  );

  useEffect(() => {
    if (!playing) {
      previousFrame.current = null;
      return;
    }
    const tick = (timestamp: number) => {
      const previous = previousFrame.current ?? timestamp;
      previousFrame.current = timestamp;
      const elapsed = Math.min(0.1, Math.max(0, (timestamp - previous) / 1000));
      setPlayhead((value) => {
        const increment = mode === 'time' ? elapsed * rate : maximum * elapsed * rate / lapDuration;
        const next = value + increment;
        if (next >= maximum) {
          setPlaying(false);
          return maximum;
        }
        return next;
      });
      animationFrame.current = requestAnimationFrame(tick);
    };
    animationFrame.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
      previousFrame.current = null;
    };
  }, [lapDuration, maximum, mode, playing, rate]);

  useEffect(() => {
    if (!focusRange) return;
    setPlaying(false);
    setMode('distance');
    setPlayhead(Math.max(0, Math.min(playbackMaximum(subjectSamples, 'distance', lap?.lapTimeMs), focusRange.startDistanceM)));
  }, [focusRange?.id, focusRange?.startDistanceM, focusRange?.endDistanceM, lap?.lapTimeMs, subjectSamples]);

  const seekBrakeZone = (zone: BrakeZone) => {
    setSelectedId(zone.id);
    setMode('distance');
    setPlayhead(zone.peakDistanceM);
    setPlaying(false);
  };
  const changeMode = (nextMode: PlaybackMode) => {
    const progress = normalizedPlayhead(subjectSamples, mode, playhead, lap?.lapTimeMs);
    setPlaying(false);
    setMode(nextMode);
    setPlayhead(progress * playbackMaximum(subjectSamples, nextMode, lap?.lapTimeMs));
  };
  const cars = current ? [
    {
      id: 'selected-lap',
      number: snapshot.selectedLapNumber ?? '•',
      distanceM: current.distanceIndexM ?? current.distanceM,
      position: { x: current.x, y: current.z },
      selected: true,
      label: m.measured.exactPosition,
    },
    ...(referenceCurrent && reference?.lap.id !== lap?.id ? [{
      id: referenceKind === 'session-reference' ? 'session-reference' : 'personal-best',
      number: referenceKind === 'session-reference' ? 'REF' : 'PB',
      distanceM: referenceCurrent.distanceIndexM ?? referenceCurrent.distanceM,
      position: { x: referenceCurrent.x, y: referenceCurrent.z },
      color: '#b8f34a',
      label: referenceKind === 'session-reference' ? m.measured.sessionReference : m.measured.personalBest,
    }] : []),
  ] : [];
  const playheadLabel = mode === 'time'
    ? `${formatDecimal(language, playhead, 3)} ${m.measured.secondUnit}`
    : `${formatDecimal(language, playhead, 0)} ${m.measured.metres}`;
  const routeTitle = snapshot.state === 'complete' ? m.measured.route : m.measured.routeLearning;
  const referenceLabel = referenceKind === 'session-reference' ? m.measured.sessionReference : m.measured.personalBest;
  const traceFocusStart = focusRange && mode === 'distance' ? Math.max(0, Math.min(1000, focusRange.startDistanceM / Math.max(1, maximum) * 1000)) : null;
  const traceFocusEnd = focusRange && mode === 'distance' ? Math.max(0, Math.min(1000, focusRange.endDistanceM / Math.max(1, maximum) * 1000)) : null;

  const evidence = <>
    <div className="data-provenance-banner"><Badge tone="positive">{m.measured.badge}</Badge><span>{snapshot.trackName} · {m.measured.selectedLap} {snapshot.selectedLapNumber ?? '—'} · {formatPercent(language, snapshot.coverage * 100)} {m.measured.coverage}{lap ? ` · ${m.measured.quality}: ${lapQuality.quality[lap.quality]}` : ''}{lap?.reasons.length ? ` · ${lap.reasons.map((reason) => lapQuality.reasons[reason]).join('; ')}` : ''}</span></div>
    {overview}
    <Card className="lap-playback-controls">
      <div className="lap-playback-controls__buttons"><Button size="sm" icon={playing ? <Pause size={14} /> : <Play size={14} />} onClick={() => setPlaying((value) => !value)} disabled={maximum <= 0}>{playing ? m.measured.pause : m.measured.play}</Button><Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={() => { setPlaying(false); setPlayhead(0); }}>{m.measured.restart}</Button></div>
      <input type="range" min="0" max={maximum || 1} step={mode === 'time' ? 0.001 : 0.1} value={Math.min(playhead, maximum || 1)} aria-label={m.measured.timeline} onChange={(event) => { setPlaying(false); setPlayhead(Number(event.target.value)); }} />
      <strong data-testid="playback-value">{playheadLabel}</strong>
      <Segmented value={mode} onChange={changeMode} ariaLabel={m.measured.playbackMode} options={[{ value: 'time', label: m.measured.timeMode }, { value: 'distance', label: m.measured.distanceMode }]} />
      <Select value={String(rate)} onChange={(value) => setRate(Number(value))} ariaLabel={m.measured.playbackSpeed} options={[{ value: '0.5', label: '0.5×' }, { value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }]} />
    </Card>
    <div className="lap-playback-readout"><span><small>{m.measured.speed}</small><strong>{formatDecimal(language, current?.speedKph ?? 0, 0)} {m.measured.speedUnit}</strong></span><span><small>{m.channels.throttle}</small><strong>{formatPercent(language, (current?.throttle ?? 0) * 100)}</strong></span><span><small>{m.channels.brake}</small><strong>{formatPercent(language, (current?.brake ?? 0) * 100)}</strong></span><span><small>{referenceKind === 'session-reference' ? m.measured.deltaToSessionReference : m.measured.deltaToPb}</small><strong className={currentDelta === null ? undefined : currentDelta <= 0 ? 'positive' : 'negative'}>{currentDelta === null ? '—' : `${formatDecimal(language, currentDelta, 3, 'always')} ${m.measured.secondUnit}`}</strong></span></div>
    <div className="measured-analysis__grid">
      <CircuitTrackMap points={points} traces={traces} cars={cars} segments={mapSegments} trackLengthM={snapshot.trackLengthM} closed={snapshot.state === 'complete'} circuitName={snapshot.trackName} layoutName={snapshot.layoutName} currentLap={snapshot.selectedLapNumber ?? undefined} activeSegment={focusedSegment ?? (selected ? segments.find((_segment, index) => snapshot.brakeZones[index].id === selected.id) : undefined)} ariaLabel={routeTitle} />
      <Card className="measured-zone-card"><CardHeader eyebrow={m.measured.evidence} title={routeTitle} action={<Badge tone="neutral">{snapshot.brakeZones.length}</Badge>} />
        {snapshot.state !== 'complete' && <p className="measured-zone-empty">{m.measured.learningPath}</p>}
        {snapshot.brakeZones.length === 0 ? <p className="measured-zone-empty">{m.measured.noZones}</p> : <ol className="measured-zone-list">{snapshot.brakeZones.map((zone, index) => <li key={zone.id}><button type="button" aria-pressed={zone.id === selected?.id} onClick={() => seekBrakeZone(zone)}><i>{String(index + 1).padStart(2, '0')}</i><span><strong>{zoneLabel(zone, language, m.measured.metres)}</strong><small>{m.measured.applied} {formatDecimal(language, zone.startDistanceM, 0)} {m.measured.metres} · {m.measured.peak} {formatPercent(language, zone.peakPressure * 100)} · {m.measured.released} {formatDecimal(language, zone.releaseDistanceM, 0)} {m.measured.metres}</small><em>{m.measured.entry} {formatDecimal(language, zone.entrySpeedKph, 0)} · {m.measured.minimum} {formatDecimal(language, zone.minimumSpeedKph, 0)} · {m.measured.exit} {formatDecimal(language, zone.exitSpeedKph, 0)} {m.measured.speedUnit}</em></span><b>{formatDecimal(language, zone.durationSeconds, 2)} {m.measured.secondUnit}</b></button></li>)}</ol>}
      </Card>
    </div>
    <Card className="measured-trace-card"><CardHeader eyebrow={m.telemetry.eyebrow} title={m.measured.trace} action={<div className="measured-trace-legend"><span><i className="speed" />{m.measured.speed}</span><span><i className="throttle" />{m.channels.throttle}</span><span><i className="brake" />{m.measured.brake}</span>{referenceSamples.length > 0 && <span><i className="reference" />{referenceLabel}</span>}</div>} />
      <div className="measured-trace" role="img" aria-label={m.measured.trace}><svg viewBox="0 0 1000 150" preserveAspectRatio="none"><line x1="0" x2="1000" y1="130" y2="130" />{traceFocusStart !== null && traceFocusEnd !== null && <rect className="driver-review-trace-range" data-testid="driver-review-trace-range" data-range-start={focusRange?.startDistanceM} data-range-end={focusRange?.endDistanceM} x={traceFocusStart} y="0" width={Math.max(1, traceFocusEnd - traceFocusStart)} height="135" />}{referenceSamples.length > 0 && <><polyline className="reference-speed" points={measuredTracePoints(referenceSamples, 'speed', mode, maximum, maximumSpeed)} /><polyline className="reference-throttle" points={measuredTracePoints(referenceSamples, 'throttle', mode, maximum, maximumSpeed)} /><polyline className="reference-brake" points={measuredTracePoints(referenceSamples, 'brake', mode, maximum, maximumSpeed)} /></>}<polyline className="speed" points={measuredTracePoints(subjectSamples, 'speed', mode, maximum, maximumSpeed)} /><polyline className="throttle" points={measuredTracePoints(subjectSamples, 'throttle', mode, maximum, maximumSpeed)} /><polyline className="brake" points={measuredTracePoints(subjectSamples, 'brake', mode, maximum, maximumSpeed)} /><line className="cursor" data-testid="telemetry-cursor" x1={cursorProgress * 1000} x2={cursorProgress * 1000} y1="0" y2="135" /></svg><div className="measured-trace-axis"><span>0 {mode === 'time' ? m.measured.secondUnit : m.measured.metres}</span><span>{formatDecimal(language, maximum / 2, mode === 'time' ? 1 : 0)} {mode === 'time' ? m.measured.secondUnit : m.measured.metres}</span><span>{formatDecimal(language, maximum, mode === 'time' ? 1 : 0)} {mode === 'time' ? m.measured.secondUnit : m.measured.metres}</span></div></div>
    </Card>
  </>;
  if (embedded) return evidence;
  return <div className="view view--analyze measured-analysis" data-feedback-redact="measured-lap-telemetry">
    <div className="page-heading page-heading--compact"><div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.measured.title}</h1><p>{m.measured.description}</p></div></div>
    {controls}
    {evidence}
  </div>;
}

function defaultAnalysisSession(sessions: readonly ApexAnalysisSessionSummary[]) {
  return sessions.find((session) => session.laps.some((lap) => lap.state === 'complete' && lapPlaybackAvailable(lap)))
    ?? sessions[0]
    ?? null;
}

function defaultAnalysisLap(session: ApexAnalysisSessionSummary | null) {
  if (!session) return null;
  const reversed = [...session.laps].reverse();
  return reversed.find((lap) => lap.state === 'complete' && lap.quality === 'clean' && lapPlaybackAvailable(lap))
    ?? reversed.find((lap) => lap.state === 'complete' && lap.quality === 'limited' && lapPlaybackAvailable(lap))
    ?? reversed.find((lap) => lap.id === session.currentLapId && lapPlaybackAvailable(lap))
    ?? reversed.find(lapPlaybackAvailable)
    ?? reversed[0]
    ?? null;
}

type MeasuredAnalysisTab = 'debrief' | 'evidence';

interface ReviewEvidenceFocus extends DriverReviewEvidenceTarget {
  readonly referenceLapId: string;
  readonly referenceLapNumber: number;
}

type ReviewReferenceState =
  | { readonly code: 'idle' | 'loading' | 'unavailable' }
  | { readonly code: 'ready'; readonly reference: NonNullable<ApexAnalysisLapPayload['personalBest']> };

function MeasuredAnalysisTabs({ active, onChange }: { active: MeasuredAnalysisTab; onChange: (tab: MeasuredAnalysisTab) => void }) {
  const m = useMessages(copy);
  const tabs: Array<{ id: MeasuredAnalysisTab; label: string }> = [
    { id: 'debrief', label: m.tabs.debrief },
    { id: 'evidence', label: m.tabs.evidence },
  ];
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    buttonRefs.current[next]?.focus();
  };
  return <div className="measured-analysis-tabs" role="tablist" aria-label={m.tabs.label}>{tabs.map((tab, index) => <button
    key={tab.id}
    ref={(node) => { buttonRefs.current[index] = node; }}
    id={`measured-analysis-tab-${tab.id}`}
    type="button"
    role="tab"
    aria-selected={active === tab.id}
    aria-controls={`measured-analysis-panel-${tab.id}`}
    tabIndex={active === tab.id ? 0 : -1}
    onClick={() => onChange(tab.id)}
    onKeyDown={(event) => selectByKeyboard(event, index)}
  >{tab.label}</button>)}</div>;
}

interface MeasuredSessionViewProps {
  readonly sessions: readonly ApexAnalysisSessionSummary[];
  readonly importControl: ReactNode;
  readonly preferredSessionId?: string | null;
}

function MeasuredSessionView({
  sessions,
  importControl,
  preferredSessionId = null,
}: MeasuredSessionViewProps) {
  const m = useMessages(copy);
  const lapQuality = useLapQualityMessages();
  const { language } = useI18n();
  const initialSession = sessions.find((session) => session.id === preferredSessionId)
    ?? defaultAnalysisSession(sessions);
  const [sessionId, setSessionId] = useState(initialSession?.id ?? '');
  const selectedSession = sessions.find((session) => session.id === sessionId) ?? initialSession;
  const initialLap = defaultAnalysisLap(selectedSession);
  const [lapId, setLapId] = useState(initialLap?.id ?? '');
  const [activeTab, setActiveTab] = useState<MeasuredAnalysisTab>('debrief');
  const [reviewState, setReviewState] = useState<DriverReviewLoadState>({ code: 'loading' });
  const [evidenceFocus, setEvidenceFocus] = useState<ReviewEvidenceFocus | null>(null);
  const [reviewReference, setReviewReference] = useState<ReviewReferenceState>({ code: 'idle' });
  const selectedLap = selectedSession?.laps.find((lap) => lap.id === lapId)
    ?? defaultAnalysisLap(selectedSession);
  const [payload, setPayload] = useState<ApexAnalysisLapPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const appliedPreferredSessionId = useRef<string | null>(null);
  const evidenceHeading = useRef<HTMLHeadingElement | null>(null);
  const shouldFocusEvidenceHeading = useRef(false);
  const reviewFingerprint = selectedSession?.laps.map((lap) => lap.state === 'complete' ? [
    lap.id, lap.state, lap.timingSource, lap.lapTimeMs, lap.quality,
    lap.referenceEligible, lap.replayable, lap.samplesAvailable, lap.payloadHash,
  ].join(':') : [lap.id, lap.state].join(':')).join('|') ?? '';

  useEffect(() => {
    if (!selectedSession || sessionId === selectedSession.id) return;
    setSessionId(selectedSession.id);
  }, [selectedSession, sessionId]);

  useEffect(() => {
    if (!preferredSessionId) {
      appliedPreferredSessionId.current = null;
      return;
    }
    if (appliedPreferredSessionId.current === preferredSessionId) return;
    const preferred = sessions.find((session) => session.id === preferredSessionId);
    if (!preferred) return;
    appliedPreferredSessionId.current = preferredSessionId;
    if (preferredSessionId === sessionId) return;
    setSessionId(preferred.id);
    setLapId(defaultAnalysisLap(preferred)?.id ?? '');
    setPayload(null);
    setActiveTab('debrief');
    setEvidenceFocus(null);
    setReviewReference({ code: 'idle' });
  }, [preferredSessionId, sessionId, sessions]);

  useEffect(() => {
    if (!selectedLap || lapId === selectedLap.id) return;
    setLapId(selectedLap.id);
  }, [selectedLap, lapId]);

  useEffect(() => {
    // Driver debrief is the default tab and needs only the bounded structured
    // review. Decode full normalized lap traces lazily when evidence is
    // actually opened, avoiding duplicate main-process work on first load.
    if (activeTab !== 'evidence') {
      setLoading(false);
      return;
    }
    if (!selectedSession || !selectedLap || !lapPlaybackAvailable(selectedLap) || !window.apexDesktop) {
      setPayload(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setPayload(null);
    setLoading(true);
    void window.apexDesktop.getAnalysisLap(selectedSession.id, selectedLap.id)
      .then((next) => { if (!cancelled) setPayload(next); })
      .catch((error) => void window.apexDesktop?.reportError({
        message: error instanceof Error ? error.message : String(error),
        context: 'analysis-lap-load',
      }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, selectedSession?.id, selectedLap?.id, selectedLap?.sampleCount, selectedLap?.samplesAvailable, selectedLap?.replayable, reviewFingerprint]);

  useEffect(() => {
    const getDriverReview = window.apexDesktop?.getDriverReview;
    if (!selectedSession || typeof getDriverReview !== 'function') {
      setReviewState({ code: 'unavailable' });
      return;
    }
    let cancelled = false;
    // A completed lap can change the strict cohort, reference, representative
    // lap, and reported range. Never leave a prior review's evidence labelled
    // as current while the replacement review is being built.
    if (evidenceHeading.current?.contains(document.activeElement)) {
      document.getElementById('measured-analysis-tab-evidence')?.focus();
    }
    shouldFocusEvidenceHeading.current = false;
    setEvidenceFocus(null);
    setReviewReference({ code: 'idle' });
    setReviewState({ code: 'loading' });
    // Intentionally omit selectedLapId: the session cohort and fingerprint stay
    // stable while the user browses laps in the evidence tab.
    void getDriverReview(selectedSession.id)
      .then((review) => {
        if (!cancelled) setReviewState(review ? { code: 'ready', review } : { code: 'unavailable' });
      })
      .catch((error) => {
        if (!cancelled) setReviewState({ code: 'error' });
        void window.apexDesktop?.reportError?.({
          message: error instanceof Error ? error.message : String(error),
          context: 'driver-review-load',
        });
      });
    return () => { cancelled = true; };
  }, [selectedSession?.id, reviewFingerprint]);

  useEffect(() => {
    if (!selectedSession || !evidenceFocus) {
      setReviewReference({ code: 'idle' });
      return;
    }
    const getAnalysisLap = window.apexDesktop?.getAnalysisLap;
    if (typeof getAnalysisLap !== 'function') {
      setReviewReference({ code: 'unavailable' });
      return;
    }
    let cancelled = false;
    setReviewReference({ code: 'loading' });
    void getAnalysisLap(selectedSession.id, evidenceFocus.referenceLapId)
      .then((referencePayload) => {
        if (cancelled) return;
        if (!referencePayload
          || referencePayload.session.id !== selectedSession.id
          || referencePayload.lap.id !== evidenceFocus.referenceLapId
          || !referencePayload.samples?.length) {
          setReviewReference({ code: 'unavailable' });
          return;
        }
        setReviewReference({
          code: 'ready',
          reference: {
            session: referencePayload.session,
            lap: referencePayload.lap,
            samples: referencePayload.samples,
          },
        });
      })
      .catch((error) => {
        if (!cancelled) setReviewReference({ code: 'unavailable' });
        void window.apexDesktop?.reportError?.({
          message: error instanceof Error ? error.message : String(error),
          context: 'driver-review-reference-load',
        });
      });
    return () => { cancelled = true; };
  }, [selectedSession?.id, evidenceFocus?.referenceLapId]);

  useEffect(() => {
    if (!shouldFocusEvidenceHeading.current || activeTab !== 'evidence' || !evidenceFocus) return;
    shouldFocusEvidenceHeading.current = false;
    const frame = requestAnimationFrame(() => evidenceHeading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [activeTab, evidenceFocus]);

  const snapshot = useMemo(() => {
    if (!selectedSession || !selectedLap || !lapPlaybackAvailable(selectedLap)
      || payload?.session.id !== selectedSession.id || payload.lap.id !== selectedLap.id || !payload.samples?.length) {
      return null;
    }
    return buildMeasuredTrackSnapshot({
      id: selectedSession.id,
      trackName: selectedSession.track.name,
      layoutName: selectedSession.track.layout,
      trackLengthM: selectedSession.track.lengthM,
      laps: selectedSession.laps.map((lap) => ({
        id: lap.id,
        number: lap.number,
        state: lap.state,
        quality: lap.quality,
        samples: lap.id === selectedLap.id ? payload.samples! : [],
      })),
      trackModel: payload.trackModel,
    }, selectedLap.id);
  }, [payload, selectedLap, selectedSession]);

  const sessionDateTime = new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' });
  const sessionOptions = sessions.map((session) => {
    const startedAt = new Date(session.startedAt);
    const capturedAt = Number.isFinite(startedAt.getTime()) ? sessionDateTime.format(startedAt) : '—';
    return {
      value: session.id,
      label: `${session.track.name} · ${session.car.name} · ${capturedAt} · ${session.laps.length.toLocaleString(language)} ${m.toolbar.laps}`,
    };
  });
  const lapOptions = selectedSession?.laps.map((lap) => {
    const state = lap.state === 'current'
      ? m.measured.current
      : lap.state === 'complete' ? m.measured.complete : m.measured.incomplete;
    const time = formatLapTime(language, lap.lapTimeMs);
    return {
      value: lap.id,
      label: `${m.toolbar.lap} ${formatDecimal(language, lap.number, 0)} · ${time ?? state} · ${lapQuality.quality[lap.quality]}`,
    };
  }) ?? [];
  const selectSession = (nextId: string) => {
    const next = sessions.find((session) => session.id === nextId) ?? null;
    setSessionId(nextId);
    setLapId(defaultAnalysisLap(next)?.id ?? '');
    setPayload(null);
    setActiveTab('debrief');
    setEvidenceFocus(null);
    setReviewReference({ code: 'idle' });
  };
  const selectLap = (nextId: string) => {
    setLapId(nextId);
    setPayload(null);
    setEvidenceFocus(null);
    setReviewReference({ code: 'idle' });
  };
  const showReviewEvidence = (target: DriverReviewEvidenceTarget) => {
    if (reviewState.code !== 'ready' || !reviewState.review.reference) return;
    shouldFocusEvidenceHeading.current = true;
    setEvidenceFocus({
      ...target,
      referenceLapId: reviewState.review.reference.lapId,
      referenceLapNumber: reviewState.review.reference.lapNumber,
    });
    setLapId(target.representativeLapId);
    setPayload(null);
    setReviewReference({ code: 'loading' });
    setActiveTab('evidence');
  };
  const controls = <div className="analysis-toolbar measured-analysis-toolbar">
    <Select value={selectedSession?.id ?? ''} onChange={selectSession} options={sessionOptions} ariaLabel={m.measured.sessionSelector} />
    <div className="analysis-toolbar__separator" />
    <Select value={selectedLap?.id ?? ''} onChange={selectLap} options={lapOptions} ariaLabel={m.measured.lapSelector} />
    <div className="analysis-toolbar__spacer" />
    {selectedLap && <Badge tone={selectedLap.quality === 'clean' ? 'positive' : selectedLap.quality === 'limited' ? 'warning' : 'neutral'}>{lapQuality.quality[selectedLap.quality]}</Badge>}
  </div>;
  const emptyMessage = loading
    ? m.measured.loading
    : selectedLap && !selectedLap.samplesAvailable
      ? m.measured.samplesUnavailable
      : selectedLap && selectedLap.replayable === false
        ? m.measured.replayUnavailable
        : m.measured.noMeasuredLaps;
  const focusZoneNumber = evidenceFocus?.id.match(/(\d+)$/)?.[1]
    ? Number(evidenceFocus.id.match(/(\d+)$/)?.[1])
    : 1;
  const focusLabel = evidenceFocus ? formatMessage(m.reviewEvidence.range, {
    zone: formatMessage(m.reviewEvidence.zone, { number: new Intl.NumberFormat(language, { minimumIntegerDigits: 2 }).format(focusZoneNumber) }),
    start: formatDecimal(language, evidenceFocus.startDistanceM, 0),
    end: formatDecimal(language, evidenceFocus.endDistanceM, 0),
  }) : '';
  const focusedSubjectReady = Boolean(snapshot && evidenceFocus && selectedLap?.id === evidenceFocus.representativeLapId);
  const focusStatus = !evidenceFocus
    ? null
    : loading || reviewReference.code === 'loading'
      ? m.reviewEvidence.loading
      : !focusedSubjectReady
        ? m.reviewEvidence.subjectMissing
        : reviewReference.code !== 'ready'
          ? m.reviewEvidence.referenceMissing
          : m.reviewEvidence.ready;
  const focusedReference = evidenceFocus && reviewReference.code === 'ready' ? reviewReference.reference : null;
  const focusedRange = evidenceFocus && focusedSubjectReady ? {
    id: `${evidenceFocus.kind}-${evidenceFocus.id}`,
    startDistanceM: evidenceFocus.startDistanceM,
    endDistanceM: evidenceFocus.endDistanceM,
    label: focusLabel,
  } : null;

  return <div className="view view--analyze measured-analysis" data-feedback-redact="measured-lap-metadata">
    <div className="page-heading page-heading--compact"><div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.measured.title}</h1><p>{m.measured.description}</p></div></div>
    {controls}
    <MeasuredAnalysisTabs active={activeTab} onChange={setActiveTab} />
    <section id="measured-analysis-panel-debrief" role="tabpanel" aria-labelledby="measured-analysis-tab-debrief" className="measured-analysis-panel" hidden={activeTab !== 'debrief'}>
      {importControl}
      <DriverReview state={reviewState} onShowEvidence={showReviewEvidence} />
      {selectedSession && <SessionDebrief session={selectedSession} selectedLapId={selectedLap?.id} onSelectLap={selectLap} />}
      {selectedLap && (!selectedLap.samplesAvailable || selectedLap.replayable === false) && <Card className="driver-review__selected-lap-limit"><p className="measured-zone-empty">{emptyMessage}</p></Card>}
    </section>
    <section id="measured-analysis-panel-evidence" role="tabpanel" aria-labelledby="measured-analysis-tab-evidence" className="measured-analysis-panel" data-feedback-redact="measured-lap-telemetry" hidden={activeTab !== 'evidence'}>
      {evidenceFocus && <Card className="driver-review-evidence-heading">
        <div><div className="eyebrow">{m.reviewEvidence.eyebrow}</div><h2 ref={evidenceHeading} tabIndex={-1}>{formatMessage(m.reviewEvidence.title, { subject: evidenceFocus.representativeLapNumber, reference: evidenceFocus.referenceLapNumber })}</h2><p>{focusLabel}</p></div>
        <div className="driver-review-evidence-status" role="status" aria-live="polite" aria-atomic="true"><Badge tone={focusedSubjectReady && reviewReference.code === 'ready' ? 'positive' : loading || reviewReference.code === 'loading' ? 'neutral' : 'warning'}>{focusStatus}</Badge></div>
      </Card>}
      {snapshot && (!evidenceFocus || focusedSubjectReady) ? <MeasuredLapView
        key={`${selectedLap?.id}-${evidenceFocus?.id ?? 'free'}`}
        snapshot={snapshot}
        embedded
        lap={selectedLap}
        reference={evidenceFocus ? focusedReference : payload?.personalBest}
        referenceKind={evidenceFocus ? 'session-reference' : 'personal-best'}
        focusRange={focusedRange}
      /> : <Card><p className="measured-zone-empty">{emptyMessage}</p></Card>}
    </section>
  </div>;
}

/** Owns the measured lap and durable private-history branches of Analysis. */
export function MeasuredAnalysisView({
  measuredTrack = null,
  analysisSessions = [],
  recordingImport,
}: MeasuredAnalysisViewProps) {
  const importControl = <RecordingImportControl controller={recordingImport} />;
  const preferredSessionId = recordingImport.state.status === 'complete'
    ? recordingImport.state.sessionIds[0] ?? null
    : null;

  if (analysisSessions.length > 0) {
    return <MeasuredSessionView
      sessions={analysisSessions}
      importControl={importControl}
      preferredSessionId={preferredSessionId}
    />;
  }
  return measuredTrack ? <MeasuredLapView snapshot={measuredTrack} overview={importControl} /> : null;
}
