import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleGauge,
  CloudSun,
  Flag,
  Fuel,
  Gauge,
  Info,
  Map,
  MoreHorizontal,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  Thermometer,
  Timer,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Button, Card, CardHeader, Metric, Progress, Segmented, TooltipHint } from '../components/ui'
import { demoSession, demoStandings } from '../data/demo'
import type { FlagState, PitState, SessionKind, SessionPhase, TelemetryFrame, TrackCondition, TyreState } from '../core'
import { defineMessages, useI18n, useMessages, type Language, type TranslationShape } from '../i18n'
import { CircuitTrackMap } from '../components/visuals/CircuitTrackMap'
import type { MeasuredTrackSnapshot } from '../engine'

type LiveSource = 'offline' | 'demo' | 'live'

const copy = defineMessages({
  common: { measured: 'Measured live data', track: 'Track', class: 'Class', overall: 'Overall', lap: 'Lap', laps: 'laps', perLap: 'per lap', sector: 'Sector', speed: 'Speed', speedUnit: 'km/h', rpmUnit: 'rpm', pressureKpa: 'kPa', pressurePsi: 'psi', literUnit: 'L', percentUnit: '%', position: 'P', frame: 'Frame', hyp: 'HYP', lmp2: 'LMP2', gt3: 'GT3', pit: 'PIT', tc: 'TC', gear: 'Gear', lastLap: 'Last lap', best: 'Best', throttle: 'THR', brake: 'BRK', throttleLong: 'Throttle', brakeLong: 'brake', driver: 'Driver', gap: 'Gap', state: 'State', trackState: 'Track', tyresBrakes: 'Tyres & brakes', you: 'YOU', frontLeft: 'FL', frontRight: 'FR', rearLeft: 'RL', rearRight: 'RR' },
  measured: { sessionDetected: 'LMU session detected', vehicleTelemetry: 'Vehicle telemetry', availableWhenDriving: 'Available when LMU activates the player car', sessionOnlyDetail: 'Apex already has the selected car, session, standings and environment. Fuel, controls, tyres and brakes appear as soon as LMU publishes the player telemetry block.', waiting: 'Waiting for car', resourcesEyebrow: 'Measured resources', resourcesTitle: 'Fuel & virtual energy', noForecast: 'No forecast', fuelInCar: 'Fuel in car', baselineUnavailable: 'Per-lap baseline unavailable', fuelRange: 'Fuel range', bridgeValue: 'Bridge value', virtualEnergy: 'Virtual energy', stateOfCharge: 'State of charge', measured: 'Measured', notExposed: 'Not exposed', forecastWithheld: 'Forecast withheld', forecastDetail: 'Apex needs a recorded consumption baseline before it can give a trustworthy finish recommendation.', standingsEyebrow: 'Official shared memory', standingsTitle: 'Measured standings', topTen: 'Top 10', standingsAria: 'Measured live standings', carEyebrow: 'Measured car state', rawValues: 'Raw values', bridgeEyebrow: 'Bridge state', bridgeTitle: 'What Apex knows', now: 'NOW', localIpc: 'local IPC', routeEyebrow: 'Official LMU position', routeTitle: 'Locally reconstructed driven line', routeEmpty: 'Waiting for measured world-position samples.', routeLearning: 'Learning route', routePartial: 'Partial route', routeComplete: 'Measured route', coverage: 'coverage', brakeZones: 'Measured braking zones', applied: 'applied', peak: 'peak', released: 'released', noZones: 'No stable braking zone is available on the selected lap yet.' },
  circuitAria: 'Live circuit positions',
  empty: { badge: 'Bridge active · waiting', title: 'Your pit wall wakes up with the car.', description: 'Start Le Mans Ultimate and enter a drivable session. Apex will detect the car, track, and conditions automatically.', demo: 'Explore with demo telemetry', troubleshoot: 'Why isn’t it connecting?', checklist: 'Connection checklist', keepOpen: 'Keep Apex open', startLmu: 'Start LMU', enterCar: 'Enter the car in a drivable session', sharedMemory: 'Official shared-memory adapter', noDll: 'No in-game DLL required', local: 'Data stays on this PC' },
  demo: { badge: 'Generated demo', race: 'Race', dry: 'Dry', leader: 'Leader', resume: 'Resume', freeze: 'Freeze', moreOptions: 'More live session options', stintLap: 'Stint lap', sixthGear: '6th gear', delta: 'Delta to best', predicted: 'Predicted', mapEyebrow: 'Track position', mapTitle: 'Traffic window', cleanAir: 'Clean air for 3.2 laps', noTraffic: 'No GT traffic within 7.8 seconds', lowRisk: 'Low traffic risk', strategyEyebrow: 'Live strategy', fuelTitle: 'Fuel & virtual energy', forecastHelp: 'Forecasts include observed variation and a 0.5-lap safety buffer.', fuelToFinish: 'Fuel to finish', inCar: 'in car', currentMargin: 'Current margin', fuelMargin: 'Fuel margin', fuelPerLap: 'Fuel / lap', energyPerLap: 'VE / lap', target: 'Target', range: 'Range', noSaving: 'No saving required', savingDetail: 'Stay below 3.58 L/lap to retain the finish buffer.', openStrategy: 'Open live strategy', field: 'Field', standings: 'Standings', standingsScope: 'Standings scope', liveStandings: 'Live standings', interval: 'Int', tyre: 'Tyre', carState: 'Car state', healthy: 'Healthy', brakeBias: 'Brake bias', regen: 'Regen', raceFeed: 'Race feed', events: 'Events', blueFlag: 'Blue flag ahead', blueFlagDetail: 'GT3 traffic at Blanchimont', limits: '#50 track limits warning', limitsDetail: 'Les Combes · lap 17', marginImproved: 'Finish margin improved', marginDetail: '+0.4 L after clean-air lap', pitEntry: '#8 entered pit lane', pitDetail: 'Changed to hard tyres' },
  runtime: {
    session: { practice: 'Practice', qualifying: 'Qualifying', race: 'Race', testDay: 'Test day' },
    condition: { dry: 'Dry', damp: 'Damp', wet: 'Wet', flooded: 'Flooded' },
    phase: { garage: 'Garage', formation: 'Formation lap', countdown: 'Countdown', green: 'Green', fullCourseYellow: 'Full-course yellow', safetyCar: 'Safety car', redFlag: 'Red flag', checkered: 'Checkered', finished: 'Finished' },
    flag: { none: 'No flag', green: 'Green flag', yellow: 'Yellow flag', doubleYellow: 'Double yellow', blue: 'Blue flag', white: 'White flag', black: 'Black flag', checkered: 'Checkered flag' },
    pit: { none: 'Track', requested: 'Pit requested', approaching: 'Approaching pits', inLane: 'Pit lane', stopped: 'Pit stop', exiting: 'Exiting pits' },
  },
}, {
  common: { measured: 'Gemessene Live-Daten', track: 'Strecke', class: 'Klasse', overall: 'Gesamt', lap: 'Runde', laps: 'Runden', perLap: 'pro Runde', sector: 'Sektor', speed: 'Geschwindigkeit', speedUnit: 'km/h', rpmUnit: 'U/min', pressureKpa: 'kPa', pressurePsi: 'psi', literUnit: 'l', percentUnit: '%', position: 'P', frame: 'Frame', hyp: 'HYP', lmp2: 'LMP2', gt3: 'GT3', pit: 'BOX', tc: 'TC', gear: 'Gang', lastLap: 'Letzte Runde', best: 'Bestzeit', throttle: 'GAS', brake: 'BRM', throttleLong: 'Gas', brakeLong: 'Bremse', driver: 'Fahrer', gap: 'Abstand', state: 'Status', trackState: 'Strecke', tyresBrakes: 'Reifen & Bremsen', you: 'DU', frontLeft: 'VL', frontRight: 'VR', rearLeft: 'HL', rearRight: 'HR' },
  measured: { sessionDetected: 'LMU-Session erkannt', vehicleTelemetry: 'Fahrzeugtelemetrie', availableWhenDriving: 'Verfügbar, sobald LMU das Spielerfahrzeug aktiviert', sessionOnlyDetail: 'Apex kennt bereits das gewählte Auto, die Session, Wertung und Umgebungsdaten. Kraftstoff, Eingaben, Reifen und Bremsen erscheinen, sobald LMU den Telemetrieblock des Spielerfahrzeugs veröffentlicht.', waiting: 'Warte auf Auto', resourcesEyebrow: 'Gemessene Ressourcen', resourcesTitle: 'Kraftstoff & virtuelle Energie', noForecast: 'Keine Prognose', fuelInCar: 'Kraftstoff im Auto', baselineUnavailable: 'Keine Verbrauchsbasis pro Runde', fuelRange: 'Kraftstoffreichweite', bridgeValue: 'Bridge-Wert', virtualEnergy: 'Virtuelle Energie', stateOfCharge: 'Ladezustand', measured: 'Gemessen', notExposed: 'Nicht verfügbar', forecastWithheld: 'Prognose zurückgehalten', forecastDetail: 'Apex benötigt eine aufgezeichnete Verbrauchsbasis, bevor es eine verlässliche Zielempfehlung geben kann.', standingsEyebrow: 'Offizieller Shared Memory', standingsTitle: 'Gemessene Wertung', topTen: 'Top 10', standingsAria: 'Gemessene Live-Wertung', carEyebrow: 'Gemessener Fahrzeugzustand', rawValues: 'Rohwerte', bridgeEyebrow: 'Bridge-Status', bridgeTitle: 'Was Apex weiß', now: 'JETZT', localIpc: 'lokale IPC', routeEyebrow: 'Offizielle LMU-Position', routeTitle: 'Lokal rekonstruierte Fahrlinie', routeEmpty: 'Warte auf gemessene Weltpositionsdaten.', routeLearning: 'Strecke wird gelernt', routePartial: 'Teilweise Strecke', routeComplete: 'Gemessene Strecke', coverage: 'Abdeckung', brakeZones: 'Gemessene Bremszonen', applied: 'betätigt', peak: 'Maximum', released: 'gelöst', noZones: 'Für die ausgewählte Runde ist noch keine stabile Bremszone verfügbar.' },
  circuitAria: 'Live-Positionen auf der Strecke',
  empty: { badge: 'Bridge aktiv · wartet', title: 'Dein Kommandostand erwacht mit dem Auto.', description: 'Starte Le Mans Ultimate und öffne eine fahrbare Sitzung. Apex erkennt Auto, Strecke und Bedingungen automatisch.', demo: 'Mit Demo-Telemetrie erkunden', troubleshoot: 'Warum wird keine Verbindung hergestellt?', checklist: 'Verbindungscheckliste', keepOpen: 'Apex geöffnet lassen', startLmu: 'LMU starten', enterCar: 'In einer fahrbaren Sitzung ins Auto steigen', sharedMemory: 'Offizieller Shared-Memory-Adapter', noDll: 'Keine In-Game-DLL erforderlich', local: 'Daten bleiben auf diesem PC' },
  demo: { badge: 'Generierte Demo', race: 'Rennen', dry: 'Trocken', leader: 'Führend', resume: 'Fortsetzen', freeze: 'Einfrieren', moreOptions: 'Weitere Optionen der Live-Sitzung', stintLap: 'Stint-Runde', sixthGear: '6. Gang', delta: 'Delta zur Bestzeit', predicted: 'Prognose', mapEyebrow: 'Streckenposition', mapTitle: 'Verkehrsfenster', cleanAir: 'Freie Strecke für 3,2 Runden', noTraffic: 'Kein GT-Verkehr innerhalb von 7,8 Sekunden', lowRisk: 'Niedriges Verkehrsrisiko', strategyEyebrow: 'Live-Strategie', fuelTitle: 'Kraftstoff & virtuelle Energie', forecastHelp: 'Prognosen berücksichtigen beobachtete Streuung und einen Sicherheitspuffer von 0,5 Runden.', fuelToFinish: 'Kraftstoff bis ins Ziel', inCar: 'im Auto', currentMargin: 'Aktuelle Reserve', fuelMargin: 'Kraftstoffreserve', fuelPerLap: 'Kraftstoff / Runde', energyPerLap: 'VE / Runde', target: 'Ziel', range: 'Reichweite', noSaving: 'Kein Sparen erforderlich', savingDetail: 'Bleibe unter 3,58 l/Runde, um den Zielpuffer zu erhalten.', openStrategy: 'Live-Strategie öffnen', field: 'Feld', standings: 'Wertung', standingsScope: 'Wertungsumfang', liveStandings: 'Live-Wertung', interval: 'Intervall', tyre: 'Reifen', carState: 'Fahrzeugzustand', healthy: 'Gesund', brakeBias: 'Bremsbalance', regen: 'Rekuperation', raceFeed: 'Rennmeldungen', events: 'Ereignisse', blueFlag: 'Blaue Flagge voraus', blueFlagDetail: 'GT3-Verkehr in Blanchimont', limits: '#50 Verwarnung wegen Streckenbegrenzung', limitsDetail: 'Les Combes · Runde 17', marginImproved: 'Zielreserve verbessert', marginDetail: '+0,4 l nach einer Runde auf freier Strecke', pitEntry: '#8 in der Boxengasse', pitDetail: 'Auf harte Reifen gewechselt' },
  runtime: {
    session: { practice: 'Training', qualifying: 'Qualifying', race: 'Rennen', testDay: 'Testtag' },
    condition: { dry: 'Trocken', damp: 'Feucht', wet: 'Nass', flooded: 'Überflutet' },
    phase: { garage: 'Garage', formation: 'Formationsrunde', countdown: 'Countdown', green: 'Grün', fullCourseYellow: 'Full-Course-Yellow', safetyCar: 'Safety-Car', redFlag: 'Rote Flagge', checkered: 'Zielflagge', finished: 'Beendet' },
    flag: { none: 'Keine Flagge', green: 'Grüne Flagge', yellow: 'Gelbe Flagge', doubleYellow: 'Doppelt Gelb', blue: 'Blaue Flagge', white: 'Weiße Flagge', black: 'Schwarze Flagge', checkered: 'Zielflagge' },
    pit: { none: 'Strecke', requested: 'Boxenstopp angefordert', approaching: 'Boxeneinfahrt naht', inLane: 'Boxengasse', stopped: 'Boxenstopp', exiting: 'Boxenausfahrt' },
  },
})

function formatNumber(value: number, language: Language, fractionDigits = 0) {
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

type LiveMessages = TranslationShape<typeof copy.en>

function pitStateLabel(pitState: PitState, messages: LiveMessages) {
  const labels = messages.runtime.pit
  return {
    none: labels.none,
    requested: labels.requested,
    approaching: labels.approaching,
    'in-lane': labels.inLane,
    stopped: labels.stopped,
    exiting: labels.exiting,
  }[pitState]
}

function sessionKindLabel(kind: SessionKind, messages: LiveMessages) {
  return kind === 'test-day' ? messages.runtime.session.testDay : messages.runtime.session[kind]
}

function conditionLabel(condition: TrackCondition, messages: LiveMessages) {
  return messages.runtime.condition[condition]
}

function phaseLabel(phase: SessionPhase, messages: LiveMessages) {
  if (phase === 'full-course-yellow') return messages.runtime.phase.fullCourseYellow
  if (phase === 'safety-car') return messages.runtime.phase.safetyCar
  if (phase === 'red-flag') return messages.runtime.phase.redFlag
  return messages.runtime.phase[phase]
}

function flagLabel(flag: FlagState, messages: LiveMessages) {
  return flag === 'double-yellow' ? messages.runtime.flag.doubleYellow : messages.runtime.flag[flag]
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return '—'
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`
}

function MeasuredLiveView({ frame, measuredTrack }: { frame: TelemetryFrame; measuredTrack: MeasuredTrackSnapshot | null }) {
  const m = useMessages(copy)
  const { language } = useI18n()
  const sessionOnly = frame.sourceState === 'session-only'
  const wheels: Array<[string, TyreState]> = [
    [m.common.frontLeft, frame.player.wheels.frontLeft], [m.common.frontRight, frame.player.wheels.frontRight],
    [m.common.rearLeft, frame.player.wheels.rearLeft], [m.common.rearRight, frame.player.wheels.rearRight],
  ]
  const standings = [
    { position: frame.player.overallPosition, driver: frame.player.driver.displayName, car: frame.player.car.model, gap: '', pit: frame.player.pitState, player: true },
    ...frame.opponents.map((opponent) => ({
      position: opponent.overallPosition,
      driver: opponent.driver.displayName,
      car: opponent.car.model,
      gap: opponent.gapToPlayerMs === 0 ? '—' : `${opponent.gapToPlayerMs > 0 ? '+' : '−'}${formatNumber(Math.abs(opponent.gapToPlayerMs / 1000), language, 1)}`,
      pit: opponent.pitState,
      player: false,
    })),
  ].sort((a, b) => a.position - b.position).slice(0, 10)
  const routeState = measuredTrack?.state === 'complete' ? m.measured.routeComplete : measuredTrack?.state === 'partial' ? m.measured.routePartial : m.measured.routeLearning
  const routePoints = measuredTrack?.route.map((point) => ({ x: point.x, y: point.z, distanceM: point.distanceM })) ?? []
  const mapCars = [
    ...(frame.player.worldPositionM ? [{ id: frame.player.car.id, number: frame.player.car.carNumber, distanceM: frame.player.distanceM, position: { x: frame.player.worldPositionM.x, y: frame.player.worldPositionM.z }, label: frame.player.driver.displayName, selected: true }] : []),
    ...frame.opponents.filter((opponent) => opponent.worldPositionM).map((opponent) => ({ id: opponent.car.id, number: opponent.car.carNumber, distanceM: opponent.distanceM, position: { x: opponent.worldPositionM!.x, y: opponent.worldPositionM!.z }, label: opponent.driver.displayName, className: opponent.car.vehicleClass })),
  ]
  const brakeSegments = measuredTrack?.brakeZones.map((zone) => ({ from: zone.startDistanceM / measuredTrack.trackLengthM, to: zone.releaseDistanceM / measuredTrack.trackLengthM, color: '#ff5d57', label: `${Math.round(zone.startDistanceM)}–${Math.round(zone.releaseDistanceM)} m` })) ?? []

  return (
    <div className="view view--live">
      <div className="live-titlebar">
        <div className="live-titlebar__identity"><Badge tone="positive" dot>{sessionOnly ? m.measured.sessionDetected : m.common.measured}</Badge><div><h1>{frame.session.track.name}</h1><p>{frame.player.car.model} · {sessionKindLabel(frame.session.kind, m)} · {conditionLabel(frame.weather.trackCondition, m)}</p></div></div>
        <div className="live-titlebar__status"><span><CloudSun size={15} /> {m.common.track} {formatNumber(frame.weather.trackTemperatureC, language, 1)}°C</span><span><Timer size={15} /> {formatDuration(frame.sessionState.remainingMs)}</span></div>
      </div>

      <div className="live-instrument-strip">
        <div className="live-position-block"><span>{m.common.class}</span><strong>{m.common.position}{frame.player.classPosition ? formatNumber(frame.player.classPosition, language) : '—'}</strong><small>{m.common.overall} {m.common.position}{frame.player.overallPosition ? formatNumber(frame.player.overallPosition, language) : '—'}</small></div>
        <div className="live-lap-block"><span>{m.common.lap}</span><strong>{frame.player.currentLapNumber ? formatNumber(frame.player.currentLapNumber, language) : '—'} <i>{frame.sessionState.totalLaps ? `/ ${formatNumber(frame.sessionState.totalLaps, language)}` : ''}</i></strong><small>{m.common.sector} {formatNumber(frame.player.sectorIndex, language)}</small></div>
        {sessionOnly ? <div className="live-speed-block"><span>{m.measured.vehicleTelemetry}</span><strong>—</strong><small>{m.measured.availableWhenDriving}</small></div> : <><div className="live-speed-block"><span>{m.common.speed}</span><strong>{formatNumber(frame.player.motion.speedKph, language)}<i>{m.common.speedUnit}</i></strong><small>{m.common.gear} {formatNumber(frame.player.powertrain.gear, language)} · {formatNumber(frame.player.powertrain.rpm, language)} {m.common.rpmUnit}</small></div><PedalBars throttle={frame.player.inputs.throttle * 100} brake={frame.player.inputs.brake * 100} /></>}
        <div className="live-delta-block"><span>{m.common.lastLap}</span><strong>{formatDuration(frame.player.lastLapTimeMs)}</strong><small>{m.common.best} {formatDuration(frame.player.bestLapTimeMs)}</small></div>
      </div>

      <div className="live-layout">
        <Card className="live-map-card live-measured-map-card">
          <CardHeader eyebrow={m.measured.routeEyebrow} title={m.measured.routeTitle} action={<Badge tone={measuredTrack?.state === 'complete' ? 'positive' : 'warning'}>{routeState}{measuredTrack ? ` · ${formatNumber(measuredTrack.coverage * 100, language)}${m.common.percentUnit} ${m.measured.coverage}` : ''}</Badge>} />
          <CircuitTrackMap points={routePoints} cars={mapCars} segments={brakeSegments} trackLengthM={measuredTrack?.trackLengthM} closed={measuredTrack?.state === 'complete'} circuitName={frame.session.track.name} layoutName={frame.session.track.layout} currentLap={frame.player.currentLapNumber} ariaLabel={m.circuitAria} emptyMessage={m.measured.routeEmpty} className="circuit-map--embedded" />
          <div className="measured-brake-zones"><strong>{m.measured.brakeZones}</strong>{measuredTrack?.brakeZones.length ? <ol>{measuredTrack.brakeZones.map((zone) => <li key={zone.id}><b>{formatNumber(zone.startDistanceM, language)} m {m.measured.applied}</b><span>{formatNumber(zone.peakPressure * 100, language)}{m.common.percentUnit} {m.measured.peak} · {formatNumber(zone.releaseDistanceM, language)} m {m.measured.released}</span></li>)}</ol> : <p>{m.measured.noZones}</p>}</div>
        </Card>
        <Card className="fuel-card">
          <CardHeader eyebrow={m.measured.resourcesEyebrow} title={m.measured.resourcesTitle} action={<Badge tone="neutral">{m.measured.noForecast}</Badge>} />
          <div className="fuel-card__primary"><div><span>{m.measured.fuelInCar}</span><strong>{sessionOnly ? '—' : formatNumber(frame.player.powertrain.fuelLiters, language, 1)} {!sessionOnly && <i>{m.common.literUnit}</i>}</strong><small>{sessionOnly ? m.measured.availableWhenDriving : frame.player.powertrain.fuelPerLapEstimateLiters === null ? m.measured.baselineUnavailable : `${formatNumber(frame.player.powertrain.fuelPerLapEstimateLiters, language, 2)} ${m.common.literUnit} ${m.common.perLap}`}</small></div></div>
          <div className="fuel-card__stats">
            <Metric label={m.measured.fuelRange} value={sessionOnly || frame.player.powertrain.lapsOfFuelEstimate === null ? '—' : formatNumber(frame.player.powertrain.lapsOfFuelEstimate, language, 1)} unit={!sessionOnly && frame.player.powertrain.lapsOfFuelEstimate !== null ? m.common.laps : undefined} detail={sessionOnly ? m.measured.waiting : m.measured.bridgeValue} />
            <Metric label={m.measured.virtualEnergy} value={!sessionOnly && frame.player.hybrid?.virtualEnergyPercent !== undefined ? formatNumber(frame.player.hybrid.virtualEnergyPercent, language, 1) : '—'} unit={!sessionOnly && frame.player.hybrid?.virtualEnergyPercent !== undefined ? m.common.percentUnit : undefined} detail={sessionOnly ? m.measured.waiting : frame.player.hybrid?.virtualEnergyPercent !== undefined ? m.measured.measured : m.measured.notExposed} />
            <Metric label={m.measured.stateOfCharge} value={!sessionOnly && frame.player.hybrid ? formatNumber(frame.player.hybrid.stateOfChargePercent, language, 1) : '—'} unit={!sessionOnly && frame.player.hybrid ? m.common.percentUnit : undefined} detail={sessionOnly ? m.measured.waiting : frame.player.hybrid ? m.measured.measured : m.measured.notExposed} />
          </div>
          <div className="strategy-recommendation"><Info size={17} /><div><strong>{m.measured.forecastWithheld}</strong><span>{m.measured.forecastDetail}</span></div></div>
        </Card>

        <Card className="standings-card">
          <CardHeader eyebrow={m.measured.standingsEyebrow} title={m.measured.standingsTitle} action={<Badge tone="neutral">{m.measured.topTen}</Badge>} />
          <div className="standings-table" role="table" aria-label={m.measured.standingsAria}>
            <div className="standings-table__head" role="row"><span>{m.common.position}</span><span>{m.common.driver}</span><span>{m.common.gap}</span><span>{m.common.state}</span><span /><span /></div>
            {standings.map((row) => <div className={`standings-table__row ${row.player ? 'is-player' : ''}`} role="row" key={`${row.position}-${row.driver}`}><span className="standings-pos">{formatNumber(row.position, language)}</span><span className="standings-driver"><b>{row.driver}</b><span><strong>{row.car}</strong></span></span><span>{row.player ? m.common.you : row.gap}</span><span>{pitStateLabel(row.pit, m)}</span><span /><span /></div>)}
          </div>
        </Card>

        <Card className="car-state-card">
          <CardHeader eyebrow={m.measured.carEyebrow} title={m.common.tyresBrakes} action={<Badge tone="neutral">{sessionOnly ? m.measured.waiting : m.measured.rawValues}</Badge>} />
          {sessionOnly ? <div className="strategy-recommendation"><Info size={17} /><div><strong>{m.measured.vehicleTelemetry}</strong><span>{m.measured.sessionOnlyDetail}</span></div></div> : <div className="car-state-grid">
            {wheels.map(([corner, tyre]) => <div className="tyre-card" key={corner}><div className="tyre-card__top"><strong>{corner}</strong><span>{formatNumber(tyre.wearPercent, language)}{m.common.percentUnit}</span></div><div className="tyre-card__body"><div className="tyre-shape"><span style={{ height: `${Math.max(0, Math.min(100, tyre.wearPercent))}%` }} /></div><div><strong>{formatNumber(tyre.pressureKpa, language)}</strong><small>{m.common.pressureKpa}</small><em>{formatNumber(tyre.carcassTemperatureC, language)}°C</em></div></div><div className="tyre-card__brake"><Thermometer size={12} /><span>{formatNumber(tyre.brakeTemperatureC, language)}°</span></div></div>)}
          </div>}
        </Card>

        <Card className="live-events-card">
          <CardHeader eyebrow={m.measured.bridgeEyebrow} title={m.measured.bridgeTitle} />
          <div className="event-feed">
            <div><span className="event-feed__time">{m.measured.now}</span><i className="event-feed__icon event-feed__icon--positive"><Radio size={13} /></i><p><strong>{m.common.frame} {formatNumber(frame.sequence, language)}</strong><small>{phaseLabel(frame.sessionState.phase, m)} · {flagLabel(frame.sessionState.flag, m)} · {m.measured.localIpc}</small></p></div>
            {frame.events.slice(-3).reverse().map((event) => <div key={event.id}><span className="event-feed__time">{formatDuration(event.sessionElapsedMs)}</span><i className="event-feed__icon"><Flag size={13} /></i><p><strong>{event.type}</strong><small>{event.message}</small></p></div>)}
          </div>
        </Card>
      </div>
    </div>
  )
}

function LiveCircuit({ phase }: { phase: number }) {
  const m = useMessages(copy)
  const cars = useMemo(() => [
    { number: '6', x: 236 + Math.sin(phase) * 4, y: 144 + Math.cos(phase) * 3, player: true, cls: 'hyp' },
    { number: '50', x: 218 + Math.sin(phase * 0.8) * 3, y: 137, cls: 'hyp' },
    { number: '22', x: 265, y: 96 + Math.cos(phase) * 3, cls: 'lmp2' },
    { number: '92', x: 133, y: 72, cls: 'gt3' },
  ], [phase])

  return (
    <svg className="live-circuit" viewBox="0 0 390 275" aria-label={m.circuitAria}>
      <path className="live-circuit__track" d="M173 241c-38-8-77-26-85-56-5-17 7-34 22-44 21-13 29-32 20-49-8-17-28-19-43-8-21 17-38 9-41-9-4-19 14-34 34-31 38 7 65-3 91-22 26-19 63-11 71 15 6 19-7 40-1 58 5 15 24 21 42 13 20-9 40-3 45 13 8 22-14 38-34 33-22-5-38 5-42 24-4 23 12 38 33 40 23 2 39 19 31 34-11 21-49 12-75 0-26-13-48-3-53 16-5 16 10 33 30 36 21 4 39 17 32 33-8 19-42 18-66 9Z" />
      <path className="live-circuit__sector live-circuit__sector--one" d="M173 241c-38-8-77-26-85-56-5-17 7-34 22-44 21-13 29-32 20-49-8-17-28-19-43-8" />
      <path className="live-circuit__sector live-circuit__sector--two" d="M87 84c-21 17-38 9-41-9-4-19 14-34 34-31 38 7 65-3 91-22 26-19 63-11 71 15" />
      <path className="live-circuit__sector live-circuit__sector--three" d="M242 37c6 19-7 40-1 58 5 15 24 21 42 13 20-9 40-3 45 13" />
      <g className="live-circuit__labels">
        <text x="41" y="39">S1</text><text x="244" y="28">S2</text><text x="334" y="124">S3</text>
      </g>
      {cars.map((car) => (
        <g key={car.number} className={`map-car map-car--${car.cls} ${car.player ? 'is-player' : ''}`} transform={`translate(${car.x} ${car.y})`}>
          <circle r={car.player ? 10 : 7} />
          <text textAnchor="middle" dy="3">{car.number}</text>
        </g>
      ))}
    </svg>
  )
}

function PedalBars({ throttle, brake }: { throttle: number; brake: number }) {
  const m = useMessages(copy)
  const { language } = useI18n()
  return (
    <div className="pedal-bars" aria-label={`${m.common.throttleLong} ${formatNumber(throttle, language)}${m.common.percentUnit}, ${m.common.brakeLong} ${formatNumber(brake, language)}${m.common.percentUnit}`}>
      <div><span>{m.common.throttle}</span><div><i className="pedal-bars__throttle" style={{ transform: `scaleY(${throttle / 100})` }} /></div><strong>{formatNumber(throttle, language)}</strong></div>
      <div><span>{m.common.brake}</span><div><i className="pedal-bars__brake" style={{ transform: `scaleY(${brake / 100})` }} /></div><strong>{formatNumber(brake, language)}</strong></div>
    </div>
  )
}

export function LiveView({ source, tick, frame, measuredTrack = null, connectionMessage, onStartDemo, onTroubleshoot }: { source: LiveSource; tick: number; frame?: TelemetryFrame | null; measuredTrack?: MeasuredTrackSnapshot | null; connectionMessage?: string; onStartDemo: () => void; onTroubleshoot: () => void }) {
  const m = useMessages(copy)
  const { language } = useI18n()
  const [tableMode, setTableMode] = useState<'overall' | 'class'>('overall')
  const [paused, setPaused] = useState(false)
  const phase = tick / 7
  const speed = source === 'demo' && !paused ? Math.round(frame?.player.motion.speedKph ?? 236 + Math.sin(phase) * 71) : 0
  const throttle = source === 'demo' && !paused ? (frame?.player.inputs.throttle ?? Math.max(0, 0.96 - Math.max(0, Math.sin(phase * 1.4)) * 1.02)) * 100 : 0
  const brake = source === 'demo' && !paused ? (frame?.player.inputs.brake ?? Math.max(0, Math.sin(phase * 1.4) * 0.96)) * 100 : 0
  const delta = 0.218 + Math.sin(phase * 0.22) * 0.064

  if (source === 'live' && frame) return <MeasuredLiveView frame={frame} measuredTrack={measuredTrack} />

  if (source === 'offline' || (source === 'live' && !frame)) {
    return (
      <div className="view live-empty-view">
        <div className="live-empty-view__visual"><Radio size={40} /><span /><span /><span /></div>
        <Badge tone="neutral" dot>{m.empty.badge}</Badge>
        <h1>{m.empty.title}</h1>
        <p>{connectionMessage || m.empty.description}</p>
        <div className="live-empty-view__actions"><Button icon={<Play size={16} />} onClick={onStartDemo}>{m.empty.demo}</Button><Button variant="secondary" icon={<AlertTriangle size={15} />} onClick={onTroubleshoot}>{m.empty.troubleshoot}</Button></div>
        <div className="live-waiting-steps"><strong>{m.empty.checklist}</strong><span><i>{formatNumber(1, language)}</i> {m.empty.keepOpen}</span><span><i>{formatNumber(2, language)}</i> {m.empty.startLmu}</span><span><i>{formatNumber(3, language)}</i> {m.empty.enterCar}</span></div>
        <div className="live-empty-view__checks">
          <span><ShieldCheck size={15} /> {m.empty.sharedMemory}</span>
          <span><ShieldCheck size={15} /> {m.empty.noDll}</span>
          <span><ShieldCheck size={15} /> {m.empty.local}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="view view--live">
      <div className="live-titlebar">
        <div className="live-titlebar__identity">
          <Badge tone="accent" dot>{m.demo.badge}</Badge>
          <div><h1>{frame?.session.track.name || demoSession.track}</h1><p>{frame?.player.car.model || demoSession.car} · {m.demo.race} · {frame ? conditionLabel(frame.weather.trackCondition, m) : m.demo.dry}</p></div>
        </div>
        <div className="live-titlebar__status">
          <span><CloudSun size={15} /> {m.common.track} {formatNumber(frame?.weather.trackTemperatureC ?? demoSession.trackTemp, language, 1)}°C</span>
          <span><Timer size={15} /> {demoSession.sessionRemaining}</span>
          <Button variant="quiet" size="sm" icon={paused ? <Play size={14} /> : <Pause size={14} />} onClick={() => setPaused((value) => !value)}>{paused ? m.demo.resume : m.demo.freeze}</Button>
          <button className="icon-button" type="button" aria-label={m.demo.moreOptions}><MoreHorizontal size={18} /></button>
        </div>
      </div>

      <div className="live-instrument-strip">
        <div className="live-position-block"><span>{m.common.class}</span><strong>{m.common.position}{formatNumber(frame?.player.classPosition ?? 3, language)}</strong><small>{m.common.overall} {m.common.position}{formatNumber(frame?.player.overallPosition ?? 3, language)}</small></div>
        <div className="live-lap-block"><span>{m.common.lap}</span><strong>{formatNumber(frame?.player.currentLapNumber ?? 18, language)} <i>/ {formatNumber(frame?.sessionState.totalLaps ?? 37, language)}</i></strong><small>{m.demo.stintLap} {formatNumber(7, language)}</small></div>
        <div className="live-speed-block"><span>{m.common.speed}</span><strong>{formatNumber(speed, language)}<i>{m.common.speedUnit}</i></strong><small>{m.demo.sixthGear} · {formatNumber(7882, language)} {m.common.rpmUnit}</small></div>
        <PedalBars throttle={throttle} brake={brake} />
        <div className={`live-delta-block ${delta <= 0 ? 'is-gain' : 'is-loss'}`}><span>{m.demo.delta}</span><strong>{delta > 0 ? '+' : ''}{formatNumber(delta, language, 3)}</strong><small>{m.demo.predicted} 2:03.902</small></div>
      </div>

      <div className="live-layout">
        <Card className="live-map-card">
          <CardHeader
            eyebrow={m.demo.mapEyebrow}
            title={m.demo.mapTitle}
            action={<div className="map-legend"><span><i className="hyp" />{m.common.hyp}</span><span><i className="lmp2" />{m.common.lmp2}</span><span><i className="gt3" />{m.common.gt3}</span></div>}
          />
          <LiveCircuit phase={phase} />
          <div className="traffic-prediction">
            <div><Map size={15} /><span><strong>{m.demo.cleanAir}</strong>{m.demo.noTraffic}</span></div>
            <Badge tone="positive">{m.demo.lowRisk}</Badge>
          </div>
        </Card>

        <Card className="fuel-card">
          <CardHeader eyebrow={m.demo.strategyEyebrow} title={m.demo.fuelTitle} action={<TooltipHint>{m.demo.forecastHelp}</TooltipHint>} />
          <div className="fuel-card__primary">
            <div><span>{m.demo.fuelToFinish}</span><strong>{formatNumber(43.1, language, 1)} <i>{m.common.literUnit}</i></strong><small>{formatNumber(44.8, language, 1)} {m.common.literUnit} {m.demo.inCar}</small></div>
            <div className="fuel-margin"><ArrowUp size={17} /><span><strong>+{formatNumber(1.7, language, 1)} {m.common.literUnit}</strong>{m.demo.currentMargin}</span></div>
          </div>
          <div className="fuel-card__progress"><Progress value={79} tone="positive" label={m.demo.fuelMargin} /><span className="fuel-card__target" style={{ left: '74%' }} /></div>
          <div className="fuel-card__stats">
            <Metric label={m.demo.fuelPerLap} value={formatNumber(3.46, language, 2)} unit={m.common.literUnit} detail={`±${formatNumber(0.07, language, 2)} · ${formatNumber(8, language)} ${m.common.laps}`} />
            <Metric label={m.demo.energyPerLap} value={formatNumber(4.61, language, 2)} unit={m.common.percentUnit} detail={`${m.demo.target} ${formatNumber(4.72, language, 2)}${m.common.percentUnit}`} />
            <Metric label={m.demo.range} value={formatNumber(12.9, language, 1)} unit={m.common.laps} detail={`±${formatNumber(0.3, language, 1)} ${m.common.lap.toLowerCase()}`} />
          </div>
          <div className="strategy-recommendation">
            <Zap size={17} />
            <div><strong>{m.demo.noSaving}</strong><span>{m.demo.savingDetail}</span></div>
          </div>
          <button className="inline-link" type="button">{m.demo.openStrategy} <ChevronRight size={14} /></button>
        </Card>

        <Card className="standings-card">
          <CardHeader
            eyebrow={m.demo.field}
            title={m.demo.standings}
            action={<Segmented value={tableMode} onChange={setTableMode} ariaLabel={m.demo.standingsScope} options={[{ value: 'overall', label: m.common.overall }, { value: 'class', label: m.common.class }]} />}
          />
          <div className="standings-table" role="table" aria-label={m.demo.liveStandings}>
            <div className="standings-table__head" role="row"><span>{m.common.position}</span><span>{m.common.driver}</span><span>{m.common.gap}</span><span>{m.demo.interval}</span><span>{m.common.lastLap}</span><span>{m.demo.tyre}</span></div>
            {demoStandings.filter((row) => tableMode === 'overall' || row.class === 'HYP').map((row) => (
              <div className={`standings-table__row ${row.player ? 'is-player' : ''}`} role="row" key={`${row.class}-${row.car}`}>
                <span className="standings-pos">{formatNumber(row.pos, language)}</span>
                <span className="standings-driver"><i className={`class-stripe class-stripe--${row.class.toLowerCase()}`} /><b>#{row.car}</b><span><strong>{row.driver}</strong><small>{row.vehicle}</small></span></span>
                <span>{row.pos === 1 ? m.demo.leader : row.gap}</span><span>{row.interval}</span><span className="mono">{row.last}</span>
                <span className={`tyre tyre--${row.tyre.toLowerCase()}`}>{row.pit ? m.common.pit : row.tyre}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="car-state-card">
          <CardHeader eyebrow={m.demo.carState} title={m.common.tyresBrakes} action={<Badge tone="positive">{m.demo.healthy}</Badge>} />
          <div className="car-state-grid">
            {[
              { corner: m.common.frontLeft, pressure: 24.9, temp: 91, wear: 88, brake: 422 },
              { corner: m.common.frontRight, pressure: 25.1, temp: 94, wear: 86, brake: 438 },
              { corner: m.common.rearLeft, pressure: 23.1, temp: 86, wear: 91, brake: 361 },
              { corner: m.common.rearRight, pressure: 23.3, temp: 88, wear: 89, brake: 374 },
            ].map((tyre) => (
              <div className="tyre-card" key={tyre.corner}>
                <div className="tyre-card__top"><strong>{tyre.corner}</strong><span>{formatNumber(tyre.wear, language)}{m.common.percentUnit}</span></div>
                <div className="tyre-card__body"><div className="tyre-shape"><span style={{ height: `${tyre.wear}%` }} /></div><div><strong>{formatNumber(tyre.pressure, language, 1)}</strong><small>{m.common.pressurePsi}</small><em>{formatNumber(tyre.temp, language)}°C</em></div></div>
                <div className="tyre-card__brake"><Thermometer size={12} /><span>{formatNumber(tyre.brake, language)}°</span></div>
              </div>
            ))}
          </div>
          <div className="car-state-footer">
            <span><CircleGauge size={14} /> {m.demo.brakeBias} <strong>{formatNumber(52.8, language, 1)}{m.common.percentUnit}</strong></span>
            <span><Gauge size={14} /> {m.common.tc} <strong>{formatNumber(4, language)}</strong></span>
            <span><Zap size={14} /> {m.demo.regen} <strong>{formatNumber(3, language)}</strong></span>
          </div>
        </Card>

        <Card className="live-events-card">
          <CardHeader eyebrow={m.demo.raceFeed} title={m.demo.events} />
          <div className="event-feed">
            <div><span className="event-feed__time">18:42</span><i className="event-feed__icon event-feed__icon--blue"><Flag size={13} /></i><p><strong>{m.demo.blueFlag}</strong><small>{m.demo.blueFlagDetail}</small></p></div>
            <div><span className="event-feed__time">17:55</span><i className="event-feed__icon event-feed__icon--warning"><AlertTriangle size={13} /></i><p><strong>{m.demo.limits}</strong><small>{m.demo.limitsDetail}</small></p></div>
            <div><span className="event-feed__time">16:31</span><i className="event-feed__icon event-feed__icon--positive"><Fuel size={13} /></i><p><strong>{m.demo.marginImproved}</strong><small>{m.demo.marginDetail}</small></p></div>
            <div><span className="event-feed__time">14:02</span><i className="event-feed__icon"><ArrowDown size={13} /></i><p><strong>{m.demo.pitEntry}</strong><small>{m.demo.pitDetail}</small></p></div>
          </div>
        </Card>
      </div>
    </div>
  )
}
