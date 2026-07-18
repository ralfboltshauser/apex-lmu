import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { defineMessages, useI18n, useMessages, type Language } from '../../i18n';
import { formatDecimal, formatLapTime, formatPercent } from './format';
import { lapPlaybackAvailable } from './lap-availability';
import { useLapQualityMessages } from './lap-quality-messages';
import {
  RecordingImportControl,
  type RecordingImportController,
} from './RecordingImportControl';
import { SessionDebrief } from './SessionDebrief';

const copy = defineMessages({
  heading: { eyebrow: 'Analysis' },
  toolbar: { lap: 'Lap', laps: 'laps' },
  channels: { throttle: 'Throttle', brake: 'Brake' },
  telemetry: { eyebrow: 'Evidence' },
  measured: {
    badge: 'Measured local session',
    title: 'Lap replay and comparison',
    description: 'Replay the exact recorded car position and controls over a locally learned centre path. The displayed track width is illustrative, not a surveyed boundary.',
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
    trace: 'Synchronized speed and brake trace',
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
    noReference: 'No eligible personal best yet',
    deltaToPb: 'Delta to PB',
    exactPosition: 'Exact recorded position',
    learningPath: 'The centre path is still learning; the selected driven line remains exact.',
  },
}, {
  heading: { eyebrow: 'Analyse' },
  toolbar: { lap: 'Runde', laps: 'Runden' },
  channels: { throttle: 'Gas', brake: 'Bremse' },
  telemetry: { eyebrow: 'Belege' },
  measured: {
    badge: 'Gemessene lokale Sitzung',
    title: 'Rundenwiedergabe und Vergleich',
    description: 'Spiele die exakt aufgezeichnete Fahrzeugposition und Eingaben auf einer lokal gelernten Mittellinie ab. Die dargestellte Streckenbreite ist illustrativ, keine vermessene Begrenzung.',
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
    trace: 'Synchronisierte Geschwindigkeits- und Bremskurve',
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
    noReference: 'Noch keine gültige persönliche Bestzeit',
    deltaToPb: 'Delta zur PB',
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
  channel: 'speed' | 'brake',
  mode: PlaybackMode,
  maximum: number,
  maximumSpeed: number,
) {
  const width = 1000;
  const height = 130;
  return samples.map((sample) => {
    const axis = mode === 'time' ? sample.lapElapsedSeconds : sample.distanceIndexM ?? sample.distanceM;
    const x = axis / Math.max(1, maximum) * width;
    const value = channel === 'speed' ? sample.speedKph / maximumSpeed : sample.brake;
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
}

function MeasuredLapView({
  snapshot,
  controls = null,
  overview = null,
  lap = null,
  reference = null,
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
      id: 'personal-best',
      points: referenceSamples.map((sample) => ({
        x: sample.x,
        y: sample.z,
        distanceM: sample.distanceIndexM ?? sample.distanceM,
      })),
      color: '#b8f34a',
      className: 'is-reference',
    }] : []),
  ], [lap?.id, reference?.lap.id, referenceSamples, subjectSamples]);
  const segments = useMemo(() => snapshot.brakeZones.map((zone) => ({
    from: zone.startDistanceM / snapshot.trackLengthM,
    to: zone.releaseDistanceM / snapshot.trackLengthM,
    color: zone.id === selected?.id ? '#ffb45d' : '#ff5d57',
    label: zoneLabel(zone, language, m.measured.metres),
  })), [language, m.measured.metres, selected?.id, snapshot.brakeZones, snapshot.trackLengthM]);
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
      id: 'personal-best',
      number: 'PB',
      distanceM: referenceCurrent.distanceIndexM ?? referenceCurrent.distanceM,
      position: { x: referenceCurrent.x, y: referenceCurrent.z },
      color: '#b8f34a',
      label: m.measured.personalBest,
    }] : []),
  ] : [];
  const playheadLabel = mode === 'time'
    ? `${formatDecimal(language, playhead, 3)} ${m.measured.secondUnit}`
    : `${formatDecimal(language, playhead, 0)} ${m.measured.metres}`;
  const routeTitle = snapshot.state === 'complete' ? m.measured.route : m.measured.routeLearning;

  return <div className="view view--analyze measured-analysis" data-feedback-redact="measured-lap-telemetry">
    <div className="page-heading page-heading--compact"><div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.measured.title}</h1><p>{m.measured.description}</p></div></div>
    {controls}
    <div className="data-provenance-banner"><Badge tone="positive">{m.measured.badge}</Badge><span>{snapshot.trackName} · {m.measured.selectedLap} {snapshot.selectedLapNumber ?? '—'} · {formatPercent(language, snapshot.coverage * 100)} {m.measured.coverage}{lap ? ` · ${m.measured.quality}: ${lapQuality.quality[lap.quality]}` : ''}{lap?.reasons.length ? ` · ${lap.reasons.map((reason) => lapQuality.reasons[reason]).join('; ')}` : ''}</span></div>
    {overview}
    <Card className="lap-playback-controls">
      <div className="lap-playback-controls__buttons"><Button size="sm" icon={playing ? <Pause size={14} /> : <Play size={14} />} onClick={() => setPlaying((value) => !value)} disabled={maximum <= 0}>{playing ? m.measured.pause : m.measured.play}</Button><Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={() => { setPlaying(false); setPlayhead(0); }}>{m.measured.restart}</Button></div>
      <input type="range" min="0" max={maximum || 1} step={mode === 'time' ? 0.001 : 0.1} value={Math.min(playhead, maximum || 1)} aria-label={m.measured.timeline} onChange={(event) => { setPlaying(false); setPlayhead(Number(event.target.value)); }} />
      <strong data-testid="playback-value">{playheadLabel}</strong>
      <Segmented value={mode} onChange={changeMode} ariaLabel={m.measured.playbackMode} options={[{ value: 'time', label: m.measured.timeMode }, { value: 'distance', label: m.measured.distanceMode }]} />
      <Select value={String(rate)} onChange={(value) => setRate(Number(value))} ariaLabel={m.measured.playbackSpeed} options={[{ value: '0.5', label: '0.5×' }, { value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }]} />
    </Card>
    <div className="lap-playback-readout"><span><small>{m.measured.speed}</small><strong>{formatDecimal(language, current?.speedKph ?? 0, 0)} {m.measured.speedUnit}</strong></span><span><small>{m.channels.throttle}</small><strong>{formatPercent(language, (current?.throttle ?? 0) * 100)}</strong></span><span><small>{m.channels.brake}</small><strong>{formatPercent(language, (current?.brake ?? 0) * 100)}</strong></span><span><small>{m.measured.deltaToPb}</small><strong className={currentDelta !== null && currentDelta <= 0 ? 'positive' : 'negative'}>{currentDelta === null ? '—' : `${formatDecimal(language, currentDelta, 3, 'always')} ${m.measured.secondUnit}`}</strong></span></div>
    <div className="measured-analysis__grid">
      <CircuitTrackMap points={points} traces={traces} cars={cars} segments={segments} trackLengthM={snapshot.trackLengthM} closed={snapshot.state === 'complete'} circuitName={snapshot.trackName} layoutName={snapshot.layoutName} currentLap={snapshot.selectedLapNumber ?? undefined} activeSegment={selected ? segments.find((_segment, index) => snapshot.brakeZones[index].id === selected.id) : undefined} ariaLabel={routeTitle} />
      <Card className="measured-zone-card"><CardHeader eyebrow={m.measured.evidence} title={routeTitle} action={<Badge tone="neutral">{snapshot.brakeZones.length}</Badge>} />
        {snapshot.state !== 'complete' && <p className="measured-zone-empty">{m.measured.learningPath}</p>}
        {snapshot.brakeZones.length === 0 ? <p className="measured-zone-empty">{m.measured.noZones}</p> : <ol className="measured-zone-list">{snapshot.brakeZones.map((zone, index) => <li key={zone.id}><button type="button" aria-pressed={zone.id === selected?.id} onClick={() => seekBrakeZone(zone)}><i>{String(index + 1).padStart(2, '0')}</i><span><strong>{zoneLabel(zone, language, m.measured.metres)}</strong><small>{m.measured.applied} {formatDecimal(language, zone.startDistanceM, 0)} {m.measured.metres} · {m.measured.peak} {formatPercent(language, zone.peakPressure * 100)} · {m.measured.released} {formatDecimal(language, zone.releaseDistanceM, 0)} {m.measured.metres}</small><em>{m.measured.entry} {formatDecimal(language, zone.entrySpeedKph, 0)} · {m.measured.minimum} {formatDecimal(language, zone.minimumSpeedKph, 0)} · {m.measured.exit} {formatDecimal(language, zone.exitSpeedKph, 0)} {m.measured.speedUnit}</em></span><b>{formatDecimal(language, zone.durationSeconds, 2)} {m.measured.secondUnit}</b></button></li>)}</ol>}
      </Card>
    </div>
    <Card className="measured-trace-card"><CardHeader eyebrow={m.telemetry.eyebrow} title={m.measured.trace} action={<div className="measured-trace-legend"><span><i className="speed" />{m.measured.speed}</span><span><i className="brake" />{m.measured.brake}</span></div>} />
      <div className="measured-trace" role="img" aria-label={m.measured.trace}><svg viewBox="0 0 1000 150" preserveAspectRatio="none"><line x1="0" x2="1000" y1="130" y2="130" />{referenceSamples.length > 0 && <polyline className="reference-speed" points={measuredTracePoints(referenceSamples, 'speed', mode, maximum, maximumSpeed)} />}<polyline className="speed" points={measuredTracePoints(subjectSamples, 'speed', mode, maximum, maximumSpeed)} /><polyline className="brake" points={measuredTracePoints(subjectSamples, 'brake', mode, maximum, maximumSpeed)} /><line className="cursor" data-testid="telemetry-cursor" x1={cursorProgress * 1000} x2={cursorProgress * 1000} y1="0" y2="135" /></svg><div className="measured-trace-axis"><span>0 {mode === 'time' ? m.measured.secondUnit : m.measured.metres}</span><span>{formatDecimal(language, maximum / 2, mode === 'time' ? 1 : 0)} {mode === 'time' ? m.measured.secondUnit : m.measured.metres}</span><span>{formatDecimal(language, maximum, mode === 'time' ? 1 : 0)} {mode === 'time' ? m.measured.secondUnit : m.measured.metres}</span></div></div>
    </Card>
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
  const selectedLap = selectedSession?.laps.find((lap) => lap.id === lapId)
    ?? defaultAnalysisLap(selectedSession);
  const [payload, setPayload] = useState<ApexAnalysisLapPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const appliedPreferredSessionId = useRef<string | null>(null);

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
  }, [preferredSessionId, sessionId, sessions]);

  useEffect(() => {
    if (!selectedLap || lapId === selectedLap.id) return;
    setLapId(selectedLap.id);
  }, [selectedLap, lapId]);

  useEffect(() => {
    if (!selectedSession || !selectedLap || !lapPlaybackAvailable(selectedLap) || !window.apexDesktop) {
      setPayload(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void window.apexDesktop.getAnalysisLap(selectedSession.id, selectedLap.id)
      .then((next) => { if (!cancelled) setPayload(next); })
      .catch((error) => void window.apexDesktop?.reportError({
        message: error instanceof Error ? error.message : String(error),
        context: 'analysis-lap-load',
      }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedSession?.id, selectedLap?.id, selectedLap?.sampleCount, selectedLap?.samplesAvailable, selectedLap?.replayable]);

  const snapshot = useMemo(() => {
    if (!selectedSession || !selectedLap || !lapPlaybackAvailable(selectedLap) || payload?.lap.id !== selectedLap.id || !payload.samples?.length) {
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
  };
  const selectLap = (nextId: string) => {
    setLapId(nextId);
    setPayload(null);
  };
  const controls = <div className="analysis-toolbar measured-analysis-toolbar">
    <Select value={selectedSession?.id ?? ''} onChange={selectSession} options={sessionOptions} ariaLabel={m.measured.sessionSelector} />
    <div className="analysis-toolbar__separator" />
    <Select value={selectedLap?.id ?? ''} onChange={selectLap} options={lapOptions} ariaLabel={m.measured.lapSelector} />
    <div className="analysis-toolbar__spacer" />
    {selectedLap && <Badge tone={selectedLap.quality === 'clean' ? 'positive' : selectedLap.quality === 'limited' ? 'warning' : 'neutral'}>{lapQuality.quality[selectedLap.quality]}</Badge>}
  </div>;
  const overview = <>{importControl}{selectedSession && <SessionDebrief session={selectedSession} selectedLapId={selectedLap?.id} onSelectLap={selectLap} />}</>;

  if (snapshot) {
    return <MeasuredLapView
      key={selectedLap?.id}
      snapshot={snapshot}
      controls={controls}
      overview={overview}
      lap={selectedLap}
      reference={payload?.personalBest}
    />;
  }
  const emptyMessage = loading
    ? m.measured.loading
    : selectedLap && !selectedLap.samplesAvailable
      ? m.measured.samplesUnavailable
      : selectedLap && selectedLap.replayable === false
        ? m.measured.replayUnavailable
        : m.measured.noMeasuredLaps;
  return <div className="view view--analyze measured-analysis" data-feedback-redact="measured-lap-metadata"><div className="page-heading page-heading--compact"><div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.measured.title}</h1><p>{m.measured.description}</p></div></div>{controls}{overview}<Card><p className="measured-zone-empty">{emptyMessage}</p></Card></div>;
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
