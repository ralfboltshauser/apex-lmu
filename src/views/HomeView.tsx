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

function TrackOutline({ progress = 0.48, trackName = 'Spa-Francorchamps', position = 3 }: { progress?: number; trackName?: string; position?: number }) {
  const isLeMans = trackName.toLowerCase().includes('sarthe') || trackName.toLowerCase().includes('le mans')
  const circuitPath = isLeMans
    ? 'M91 214c-25-8-38-31-24-49 13-17 38-24 43-43 5-19-17-29-28-15-12 15-32 11-35-5-4-20 21-31 39-19 23 15 43 9 63-8 19-17 40-24 64-21l101 10c24 3 33 20 19 37l-12 15c-7 9-4 17 8 21l22 7c19 6 20 25 2 33l-59 25c-10 4-11 15-2 20l28 16c20 12 11 32-12 29l-77-11c-16-2-28 3-39 14l-18 19c-17 18-43 13-50-9-5-16-27-10-41-5Z'
    : 'M171 222c-35-7-69-24-77-51-4-15 6-30 20-39 18-12 25-29 18-44-7-15-26-17-39-7-19 15-34 8-37-8-3-17 13-30 30-27 34 6 57-3 80-20 23-17 56-10 63 13 5 17-6 35-1 51 4 13 21 19 37 12 18-8 35-3 40 11 7 19-13 34-31 30-19-4-34 4-37 21-4 20 10 33 29 35 20 2 34 16 27 29-10 19-43 11-66 0-23-11-42-2-47 14-4 14 9 29 27 32 18 4 34 15 28 29-7 17-37 16-58 8Z'
  const car = isLeMans ? { x: 257, y: 178 } : { x: 237, y: 164 }
  return (
    <svg className="spa-outline" viewBox="0 0 390 250" aria-label={`${trackName} circuit map`}>
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
      <text x={car.x + 13} y={car.y + 1}>YOU · P{position}</text>
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
  const leadInsight = demoInsights[0]
  const demoRunning = source === 'demo'
  const measuredLive = source === 'live' && frame

  return (
    <div className="view view--home">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Command center</div>
          <h1>{measuredLive ? 'Telemetry is connected.' : demoRunning ? 'Generated race demo.' : 'Apex is ready.'}</h1>
          <p>{measuredLive ? 'Open the measured live view for values received from LMU.' : demoRunning ? 'Explore the full product with deterministic example data.' : 'Inspect recordings, plan a race, or start the generated live demo.'}</p>
        </div>
        <div className="page-heading__actions">
          <Button variant="secondary" icon={<Upload size={16} />} onClick={onImport}>Inspect recording</Button>
          <Button icon={<BarChart3 size={16} />} onClick={() => onNavigate('analyze')}>Open analysis demo</Button>
        </div>
      </div>

      {measuredLive ? (
        <Card className="connect-hero">
          <div className="connect-hero__signal" aria-hidden="true"><span /><span /><span /><RadioIcon /></div>
          <div className="connect-hero__copy"><Badge tone="positive" dot>Measured live data</Badge><h2>{frame.session.track.name}</h2><p>{frame.player.car.model} · Lap {frame.player.currentLapNumber} · P{frame.player.classPosition} in class · {Math.round(frame.player.motion.speedKph)} km/h</p></div>
          <Button icon={<ArrowRight size={16} />} onClick={() => onNavigate('live')}>Open measured view</Button>
        </Card>
      ) : demoRunning ? (
        <Card className="live-hero">
          <div className="live-hero__main">
            <div className="live-hero__context">
              <div>
                <Badge tone="accent" dot>Generated demo · Lap {demoSession.currentLap}</Badge>
                <h2>{frame?.session.track.name || demoSession.track}</h2>
                <p>{frame?.player.car.model || demoSession.car} · {demoSession.session} · Stint lap {demoSession.stintLap}</p>
              </div>
              <Button variant="quiet" size="sm" icon={<ArrowRight size={15} />} onClick={() => onNavigate('live')}>Open live session</Button>
            </div>
            <div className="live-hero__visual">
              <TrackOutline trackName={frame?.session.track.name || demoSession.track} position={frame?.player.classPosition ?? 3} />
              <div className="live-hero__position">
                <span>Class position</span>
                <strong>P{frame?.player.classPosition ?? demoSession.classPosition}</strong>
                <small>+6.1 to leader</small>
              </div>
            </div>
          </div>
          <div className="live-hero__rail">
            <Metric label="Last lap" value={demoSession.lastLap} detail={<span className="negative">+0.534</span>} />
            <Metric label="Fuel remaining" value={(frame?.player.powertrain.fuelLiters ?? demoSession.fuel).toFixed(1)} unit="L" detail={`${demoSession.lapsRemaining.toFixed(1)} laps`} />
            <Metric label="Finish margin" value="+1.7" unit="L" tone="positive" detail="Plan A · no save" />
            <Metric label="Virtual energy" value={demoSession.virtualEnergy.toFixed(1)} unit="%" detail="4.61% / lap" />
            <div className="live-hero__callout">
              <Zap size={16} />
              <div>
                <strong>Pit window in 5–7 laps</strong>
                <span>Rejoin estimate: P6, clean air</span>
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
            <Badge tone="neutral" dot>Waiting for Le Mans Ultimate</Badge>
            <h2>Start driving. Apex handles the rest.</h2>
            <p>Live values appear automatically through the local bridge. Continuous recording is not enabled in this alpha.</p>
          </div>
          <div className="connect-hero__steps">
            <div><span>1</span><p><strong>Open LMU</strong>Any session works</p></div>
            <ArrowRight size={16} />
            <div><span>2</span><p><strong>Take the track</strong>Apex connects at 50 Hz</p></div>
            <ArrowRight size={16} />
            <div><span>3</span><p><strong>Review</strong>Inspect local recordings</p></div>
          </div>
        </Card>
      )}

      <div className="data-provenance-banner"><Badge tone="accent">Generated examples</Badge><span>The coaching, readiness, sessions, event, and forecast cards below demonstrate the intended UX; they are not claims about your driving.</span></div>

      <div className="dashboard-grid dashboard-grid--home">
        <Card className="focus-card">
          <CardHeader
            eyebrow="Biggest opportunity"
            title="One change for your next stint"
            action={<Badge tone="critical">0.31 s</Badge>}
          />
          <div className="focus-card__corner">
            <div className="corner-number">05</div>
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
            <span>{leadInsight.confidence}% confidence · comparable conditions</span>
            <button type="button" onClick={() => onNavigate('analyze')}>See evidence <ArrowRight size={14} /></button>
          </div>
        </Card>

        <Card className="readiness-card">
          <CardHeader eyebrow="Race readiness" title="Spa · 60 minutes" action={<span className="readiness-score">86</span>} />
          <div className="readiness-list">
            <div>
              <div className="readiness-list__header"><span><Route size={15} /> Pace</span><strong>Ready</strong></div>
              <Progress value={91} tone="positive" label="Pace readiness 91%" />
              <small>Within 0.7% of reference over 5 laps</small>
            </div>
            <div>
              <div className="readiness-list__header"><span><Fuel size={15} /> Strategy</span><strong>Check</strong></div>
              <Progress value={72} tone="warning" label="Strategy readiness 72%" />
              <small>Wet crossover has not been simulated</small>
            </div>
            <div>
              <div className="readiness-list__header"><TimerReset size={15} /><span>Consistency</span><strong>Strong</strong></div>
              <Progress value={88} tone="blue" label="Consistency readiness 88%" />
              <small>±0.31 s over the last clean stint</small>
            </div>
          </div>
          <Button variant="secondary" onClick={() => onNavigate('strategy')}>Open race brief</Button>
        </Card>

        <Card className="sessions-card">
          <CardHeader
            eyebrow="Recent work"
            title="Sessions"
            action={<button className="text-button" type="button" onClick={() => onNavigate('analyze')}>View all <ArrowRight size={13} /></button>}
          />
          <div className="session-list">
            {demoSessions.slice(0, 3).map((session) => (
              <button type="button" key={session.id} className="session-row" onClick={() => onNavigate('analyze')}>
                <div className="session-row__icon"><Flag size={15} /></div>
                <div className="session-row__name">
                  <strong>{session.track}</strong>
                  <span>{session.car} · {session.type}</span>
                </div>
                <div className="session-row__laps"><span>{session.laps} laps</span><small>{session.date}</small></div>
                <div className="session-row__time"><strong>{session.best}</strong><span><ArrowDownRight size={12} /> {Math.abs(session.gain).toFixed(3)} s</span></div>
                <ArrowRight size={14} className="session-row__arrow" />
              </button>
            ))}
          </div>
        </Card>

        <Card className="conditions-card">
          <CardHeader eyebrow="Next event" title="Saturday · Spa 2.4h" action={<CloudSun size={20} />} />
          <div className="conditions-card__forecast">
            <div><span>Start</span><CloudSun size={18} /><strong>Dry</strong><small>19°C</small></div>
            <div><span>+45m</span><CloudSun size={18} /><strong>Cloudy</strong><small>17°C</small></div>
            <div className="is-risk"><span>+90m</span><CloudSun size={18} /><strong>Rain 35%</strong><small>15°C</small></div>
          </div>
          <div className="conditions-card__footer">
            <Trophy size={15} />
            <span>18 drivers registered · Split estimate 2,140</span>
          </div>
        </Card>
      </div>

      <div className="quick-actions" aria-label="Quick actions">
        <button type="button" onClick={onImport}><Download size={17} /><span><strong>Inspect LMU recording</strong><small>Read-only DuckDB schema and lap index</small></span><ArrowRight size={15} /></button>
        <button type="button" onClick={() => onNavigate('setups')}><SlidersIcon /><span><strong>Manage a setup</strong><small>Safely install a local .svm file</small></span><ArrowRight size={15} /></button>
        <button type="button" onClick={() => onNavigate('strategy')}><Fuel size={17} /><span><strong>Plan a race</strong><small>Fuel, VE, tyres and pit windows</small></span><ArrowRight size={15} /></button>
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
