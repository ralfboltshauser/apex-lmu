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
import type { TelemetryFrame, TyreState } from '../core'

type LiveSource = 'offline' | 'demo' | 'live'

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return '—'
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`
}

function MeasuredLiveView({ frame }: { frame: TelemetryFrame }) {
  const wheels: Array<[string, TyreState]> = [
    ['FL', frame.player.wheels.frontLeft], ['FR', frame.player.wheels.frontRight],
    ['RL', frame.player.wheels.rearLeft], ['RR', frame.player.wheels.rearRight],
  ]
  const standings = [
    { position: frame.player.overallPosition, driver: frame.player.driver.displayName, car: frame.player.car.model, gap: 'YOU', pit: frame.player.pitState },
    ...frame.opponents.map((opponent) => ({
      position: opponent.overallPosition,
      driver: opponent.driver.displayName,
      car: opponent.car.model,
      gap: opponent.gapToPlayerMs === 0 ? '—' : `${opponent.gapToPlayerMs > 0 ? '+' : '−'}${Math.abs(opponent.gapToPlayerMs / 1000).toFixed(1)}`,
      pit: opponent.pitState,
    })),
  ].sort((a, b) => a.position - b.position).slice(0, 10)

  return (
    <div className="view view--live">
      <div className="live-titlebar">
        <div className="live-titlebar__identity"><Badge tone="positive" dot>Measured live data</Badge><div><h1>{frame.session.track.name}</h1><p>{frame.player.car.model} · {frame.session.kind} · {frame.weather.trackCondition}</p></div></div>
        <div className="live-titlebar__status"><span><CloudSun size={15} /> Track {frame.weather.trackTemperatureC.toFixed(1)}°C</span><span><Timer size={15} /> {formatDuration(frame.sessionState.remainingMs)}</span></div>
      </div>

      <div className="live-instrument-strip">
        <div className="live-position-block"><span>Class</span><strong>P{frame.player.classPosition || '—'}</strong><small>Overall P{frame.player.overallPosition || '—'}</small></div>
        <div className="live-lap-block"><span>Lap</span><strong>{frame.player.currentLapNumber || '—'} <i>{frame.sessionState.totalLaps ? `/ ${frame.sessionState.totalLaps}` : ''}</i></strong><small>Sector {frame.player.sectorIndex}</small></div>
        <div className="live-speed-block"><span>Speed</span><strong>{Math.round(frame.player.motion.speedKph)}<i>km/h</i></strong><small>Gear {frame.player.powertrain.gear} · {Math.round(frame.player.powertrain.rpm).toLocaleString()} rpm</small></div>
        <PedalBars throttle={frame.player.inputs.throttle * 100} brake={frame.player.inputs.brake * 100} />
        <div className="live-delta-block"><span>Last lap</span><strong>{formatDuration(frame.player.lastLapTimeMs)}</strong><small>Best {formatDuration(frame.player.bestLapTimeMs)}</small></div>
      </div>

      <div className="live-layout">
        <Card className="fuel-card">
          <CardHeader eyebrow="Measured resources" title="Fuel & virtual energy" action={<Badge tone="neutral">No forecast</Badge>} />
          <div className="fuel-card__primary"><div><span>Fuel in car</span><strong>{frame.player.powertrain.fuelLiters.toFixed(1)} <i>L</i></strong><small>{frame.player.powertrain.fuelPerLapEstimateLiters === null ? 'Per-lap baseline unavailable' : `${frame.player.powertrain.fuelPerLapEstimateLiters.toFixed(2)} L/lap`}</small></div></div>
          <div className="fuel-card__stats">
            <Metric label="Fuel range" value={frame.player.powertrain.lapsOfFuelEstimate?.toFixed(1) ?? '—'} unit={frame.player.powertrain.lapsOfFuelEstimate === null ? undefined : 'laps'} detail="Bridge value" />
            <Metric label="Virtual energy" value={frame.player.hybrid?.virtualEnergyPercent.toFixed(1) ?? '—'} unit={frame.player.hybrid ? '%' : undefined} detail={frame.player.hybrid ? 'Measured' : 'Not exposed'} />
            <Metric label="State of charge" value={frame.player.hybrid?.stateOfChargePercent.toFixed(1) ?? '—'} unit={frame.player.hybrid ? '%' : undefined} detail={frame.player.hybrid ? 'Measured' : 'Not exposed'} />
          </div>
          <div className="strategy-recommendation"><Info size={17} /><div><strong>Forecast withheld</strong><span>Apex needs a recorded consumption baseline before it can give a trustworthy finish recommendation.</span></div></div>
        </Card>

        <Card className="standings-card">
          <CardHeader eyebrow="Official shared memory" title="Measured standings" action={<Badge tone="neutral">Top 10</Badge>} />
          <div className="standings-table" role="table" aria-label="Measured live standings">
            <div className="standings-table__head" role="row"><span>P</span><span>Driver</span><span>Gap</span><span>State</span><span /><span /></div>
            {standings.map((row) => <div className={`standings-table__row ${row.gap === 'YOU' ? 'is-player' : ''}`} role="row" key={`${row.position}-${row.driver}`}><span className="standings-pos">{row.position}</span><span className="standings-driver"><b>{row.driver}</b><span><strong>{row.car}</strong></span></span><span>{row.gap}</span><span>{row.pit === 'none' ? 'Track' : row.pit}</span><span /><span /></div>)}
          </div>
        </Card>

        <Card className="car-state-card">
          <CardHeader eyebrow="Measured car state" title="Tyres & brakes" action={<Badge tone="neutral">Raw values</Badge>} />
          <div className="car-state-grid">
            {wheels.map(([corner, tyre]) => <div className="tyre-card" key={corner}><div className="tyre-card__top"><strong>{corner}</strong><span>{Math.round(tyre.wearPercent)}%</span></div><div className="tyre-card__body"><div className="tyre-shape"><span style={{ height: `${Math.max(0, Math.min(100, tyre.wearPercent))}%` }} /></div><div><strong>{tyre.pressureKpa.toFixed(0)}</strong><small>kPa</small><em>{tyre.carcassTemperatureC.toFixed(0)}°C</em></div></div><div className="tyre-card__brake"><Thermometer size={12} /><span>{tyre.brakeTemperatureC.toFixed(0)}°</span></div></div>)}
          </div>
        </Card>

        <Card className="live-events-card">
          <CardHeader eyebrow="Bridge state" title="What Apex knows" />
          <div className="event-feed">
            <div><span className="event-feed__time">NOW</span><i className="event-feed__icon event-feed__icon--positive"><Radio size={13} /></i><p><strong>Frame {frame.sequence.toLocaleString()}</strong><small>{frame.sessionState.phase} · {frame.sessionState.flag} · local IPC</small></p></div>
            {frame.events.slice(-3).reverse().map((event) => <div key={event.id}><span className="event-feed__time">{formatDuration(event.sessionElapsedMs)}</span><i className="event-feed__icon"><Flag size={13} /></i><p><strong>{event.type}</strong><small>{event.message}</small></p></div>)}
          </div>
        </Card>
      </div>
    </div>
  )
}

function LiveCircuit({ phase }: { phase: number }) {
  const cars = useMemo(() => [
    { number: '6', x: 236 + Math.sin(phase) * 4, y: 144 + Math.cos(phase) * 3, player: true, cls: 'hyp' },
    { number: '50', x: 218 + Math.sin(phase * 0.8) * 3, y: 137, cls: 'hyp' },
    { number: '22', x: 265, y: 96 + Math.cos(phase) * 3, cls: 'lmp2' },
    { number: '92', x: 133, y: 72, cls: 'gt3' },
  ], [phase])

  return (
    <svg className="live-circuit" viewBox="0 0 390 275" aria-label="Live circuit positions">
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
  return (
    <div className="pedal-bars" aria-label={`Throttle ${Math.round(throttle)}%, brake ${Math.round(brake)}%`}>
      <div><span>THR</span><div><i className="pedal-bars__throttle" style={{ transform: `scaleY(${throttle / 100})` }} /></div><strong>{Math.round(throttle)}</strong></div>
      <div><span>BRK</span><div><i className="pedal-bars__brake" style={{ transform: `scaleY(${brake / 100})` }} /></div><strong>{Math.round(brake)}</strong></div>
    </div>
  )
}

export function LiveView({ source, tick, frame, onStartDemo }: { source: LiveSource; tick: number; frame?: TelemetryFrame | null; onStartDemo: () => void }) {
  const [tableMode, setTableMode] = useState<'overall' | 'class'>('overall')
  const [paused, setPaused] = useState(false)
  const phase = tick / 7
  const speed = source === 'demo' && !paused ? Math.round(frame?.player.motion.speedKph ?? 236 + Math.sin(phase) * 71) : 0
  const throttle = source === 'demo' && !paused ? (frame?.player.inputs.throttle ?? Math.max(0, 0.96 - Math.max(0, Math.sin(phase * 1.4)) * 1.02)) * 100 : 0
  const brake = source === 'demo' && !paused ? (frame?.player.inputs.brake ?? Math.max(0, Math.sin(phase * 1.4) * 0.96)) * 100 : 0
  const delta = 0.218 + Math.sin(phase * 0.22) * 0.064

  if (source === 'live' && frame) return <MeasuredLiveView frame={frame} />

  if (source === 'offline' || (source === 'live' && !frame)) {
    return (
      <div className="view live-empty-view">
        <div className="live-empty-view__visual"><Radio size={40} /><span /><span /><span /></div>
        <Badge tone="neutral" dot>LMU offline</Badge>
        <h1>Your pit wall wakes up with the car.</h1>
        <p>Start Le Mans Ultimate and enter any session. Apex will detect the car, track, and conditions automatically.</p>
        <Button icon={<Play size={16} />} onClick={onStartDemo}>Explore with demo telemetry</Button>
        <div className="live-empty-view__checks">
          <span><ShieldCheck size={15} /> Official shared-memory adapter</span>
          <span><ShieldCheck size={15} /> No in-game DLL required</span>
          <span><ShieldCheck size={15} /> Data stays on this PC</span>
        </div>
      </div>
    )
  }

  return (
    <div className="view view--live">
      <div className="live-titlebar">
        <div className="live-titlebar__identity">
          <Badge tone="accent" dot>Generated demo</Badge>
          <div><h1>{frame?.session.track.name || demoSession.track}</h1><p>{frame?.player.car.model || demoSession.car} · {demoSession.session} · {frame?.weather.trackCondition || 'Dry'}</p></div>
        </div>
        <div className="live-titlebar__status">
          <span><CloudSun size={15} /> Track {(frame?.weather.trackTemperatureC ?? demoSession.trackTemp).toFixed(1)}°C</span>
          <span><Timer size={15} /> {demoSession.sessionRemaining}</span>
          <Button variant="quiet" size="sm" icon={paused ? <Play size={14} /> : <Pause size={14} />} onClick={() => setPaused((value) => !value)}>{paused ? 'Resume' : 'Freeze'}</Button>
          <button className="icon-button" type="button" aria-label="More live session options"><MoreHorizontal size={18} /></button>
        </div>
      </div>

      <div className="live-instrument-strip">
        <div className="live-position-block"><span>Class</span><strong>P{frame?.player.classPosition ?? 3}</strong><small>Overall P{frame?.player.overallPosition ?? 3}</small></div>
        <div className="live-lap-block"><span>Lap</span><strong>{frame?.player.currentLapNumber ?? 18} <i>/ {frame?.sessionState.totalLaps ?? 37}</i></strong><small>Stint lap 7</small></div>
        <div className="live-speed-block"><span>Speed</span><strong>{speed}<i>km/h</i></strong><small>6th gear · 7,882 rpm</small></div>
        <PedalBars throttle={throttle} brake={brake} />
        <div className={`live-delta-block ${delta <= 0 ? 'is-gain' : 'is-loss'}`}><span>Delta to best</span><strong>{delta > 0 ? '+' : ''}{delta.toFixed(3)}</strong><small>Predicted 2:03.902</small></div>
      </div>

      <div className="live-layout">
        <Card className="live-map-card">
          <CardHeader
            eyebrow="Track position"
            title="Traffic window"
            action={<div className="map-legend"><span><i className="hyp" />HYP</span><span><i className="lmp2" />LMP2</span><span><i className="gt3" />GT3</span></div>}
          />
          <LiveCircuit phase={phase} />
          <div className="traffic-prediction">
            <div><Map size={15} /><span><strong>Clean air for 3.2 laps</strong>No GT traffic within 7.8 seconds</span></div>
            <Badge tone="positive">Low traffic risk</Badge>
          </div>
        </Card>

        <Card className="fuel-card">
          <CardHeader eyebrow="Live strategy" title="Fuel & virtual energy" action={<TooltipHint>Forecasts include observed variation and a 0.5-lap safety buffer.</TooltipHint>} />
          <div className="fuel-card__primary">
            <div><span>Fuel to finish</span><strong>43.1 <i>L</i></strong><small>44.8 L in car</small></div>
            <div className="fuel-margin"><ArrowUp size={17} /><span><strong>+1.7 L</strong>Current margin</span></div>
          </div>
          <div className="fuel-card__progress"><Progress value={79} tone="positive" label="Fuel margin" /><span className="fuel-card__target" style={{ left: '74%' }} /></div>
          <div className="fuel-card__stats">
            <Metric label="Fuel / lap" value="3.46" unit="L" detail="±0.07 · 8 laps" />
            <Metric label="VE / lap" value="4.61" unit="%" detail="Target 4.72%" />
            <Metric label="Range" value="12.9" unit="laps" detail="±0.3 lap" />
          </div>
          <div className="strategy-recommendation">
            <Zap size={17} />
            <div><strong>No saving required</strong><span>Stay below 3.58 L/lap to retain the finish buffer.</span></div>
          </div>
          <button className="inline-link" type="button">Open live strategy <ChevronRight size={14} /></button>
        </Card>

        <Card className="standings-card">
          <CardHeader
            eyebrow="Field"
            title="Standings"
            action={<Segmented value={tableMode} onChange={setTableMode} ariaLabel="Standings scope" options={[{ value: 'overall', label: 'Overall' }, { value: 'class', label: 'Class' }]} />}
          />
          <div className="standings-table" role="table" aria-label="Live standings">
            <div className="standings-table__head" role="row"><span>P</span><span>Driver</span><span>Gap</span><span>Int</span><span>Last</span><span>Tyre</span></div>
            {demoStandings.filter((row) => tableMode === 'overall' || row.class === 'HYP').map((row) => (
              <div className={`standings-table__row ${row.player ? 'is-player' : ''}`} role="row" key={`${row.class}-${row.car}`}>
                <span className="standings-pos">{row.pos}</span>
                <span className="standings-driver"><i className={`class-stripe class-stripe--${row.class.toLowerCase()}`} /><b>#{row.car}</b><span><strong>{row.driver}</strong><small>{row.vehicle}</small></span></span>
                <span>{row.gap}</span><span>{row.interval}</span><span className="mono">{row.last}</span>
                <span className={`tyre tyre--${row.tyre.toLowerCase()}`}>{row.pit ? 'PIT' : row.tyre}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="car-state-card">
          <CardHeader eyebrow="Car state" title="Tyres & brakes" action={<Badge tone="positive">Healthy</Badge>} />
          <div className="car-state-grid">
            {[
              { corner: 'FL', pressure: 24.9, temp: 91, wear: 88, brake: 422 },
              { corner: 'FR', pressure: 25.1, temp: 94, wear: 86, brake: 438 },
              { corner: 'RL', pressure: 23.1, temp: 86, wear: 91, brake: 361 },
              { corner: 'RR', pressure: 23.3, temp: 88, wear: 89, brake: 374 },
            ].map((tyre) => (
              <div className="tyre-card" key={tyre.corner}>
                <div className="tyre-card__top"><strong>{tyre.corner}</strong><span>{tyre.wear}%</span></div>
                <div className="tyre-card__body"><div className="tyre-shape"><span style={{ height: `${tyre.wear}%` }} /></div><div><strong>{tyre.pressure}</strong><small>psi</small><em>{tyre.temp}°C</em></div></div>
                <div className="tyre-card__brake"><Thermometer size={12} /><span>{tyre.brake}°</span></div>
              </div>
            ))}
          </div>
          <div className="car-state-footer">
            <span><CircleGauge size={14} /> Brake bias <strong>52.8%</strong></span>
            <span><Gauge size={14} /> TC <strong>4</strong></span>
            <span><Zap size={14} /> Regen <strong>3</strong></span>
          </div>
        </Card>

        <Card className="live-events-card">
          <CardHeader eyebrow="Race feed" title="Events" />
          <div className="event-feed">
            <div><span className="event-feed__time">18:42</span><i className="event-feed__icon event-feed__icon--blue"><Flag size={13} /></i><p><strong>Blue flag ahead</strong><small>GT3 traffic at Blanchimont</small></p></div>
            <div><span className="event-feed__time">17:55</span><i className="event-feed__icon event-feed__icon--warning"><AlertTriangle size={13} /></i><p><strong>#50 track limits warning</strong><small>Les Combes · lap 17</small></p></div>
            <div><span className="event-feed__time">16:31</span><i className="event-feed__icon event-feed__icon--positive"><Fuel size={13} /></i><p><strong>Finish margin improved</strong><small>+0.4 L after clean-air lap</small></p></div>
            <div><span className="event-feed__time">14:02</span><i className="event-feed__icon"><ArrowDown size={13} /></i><p><strong>#8 entered pit lane</strong><small>Changed to hard tyres</small></p></div>
          </div>
        </Card>
      </div>
    </div>
  )
}
