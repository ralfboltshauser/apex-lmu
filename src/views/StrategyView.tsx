import {
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  Check,
  ChevronDown,
  Clock3,
  CloudRain,
  CloudSun,
  Droplets,
  Flag,
  Fuel,
  Gauge,
  Info,
  Milestone,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  Wind,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Button, Card, CardHeader, Progress, Segmented, TooltipHint } from '../components/ui'
import { projectRaceResources } from '../engine'

type Scenario = 'balanced' | 'safe' | 'attack'

const scenarios = {
  balanced: { label: 'Balanced', stops: 2, total: '2:03:41', margin: 2.1, risk: 'Low', first: 21, second: 42, save: 0, color: 'accent' },
  safe: { label: 'Safety margin', stops: 2, total: '2:03:58', margin: 5.4, risk: 'Very low', first: 20, second: 40, save: 0, color: 'blue' },
  attack: { label: 'Track position', stops: 3, total: '2:03:26', margin: 1.3, risk: 'Medium', first: 16, second: 32, save: 0, color: 'warning' },
} as const

function NumberInput({ label, value, unit, onChange, min = 0, step = 1 }: { label: string; value: number; unit: string; onChange: (value: number) => void; min?: number; step?: number }) {
  return (
    <label className="number-input">
      <span>{label}</span>
      <div><input type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><em>{unit}</em></div>
    </label>
  )
}

function StrategyTimeline({ selected }: { selected: Scenario }) {
  const strategy = scenarios[selected]
  return (
    <div className="strategy-timeline">
      <div className="strategy-timeline__track">
        <span className="stint stint--one" style={{ width: `${strategy.first / 60 * 100}%` }} />
        <span className="stop" style={{ left: `${strategy.first / 60 * 100}%` }}><i /><b>Pit 1</b></span>
        <span className="stint stint--two" style={{ left: `${strategy.first / 60 * 100}%`, width: `${(strategy.second - strategy.first) / 60 * 100}%` }} />
        <span className="stop" style={{ left: `${strategy.second / 60 * 100}%` }}><i /><b>Pit 2</b></span>
        <span className="stint stint--three" style={{ left: `${strategy.second / 60 * 100}%`, width: `${(60 - strategy.second) / 60 * 100}%` }} />
        {strategy.stops === 3 && <span className="stop stop--third" style={{ left: '80%' }}><i /><b>Pit 3</b></span>}
      </div>
      <div className="strategy-timeline__axis"><span>Start</span><span>30m</span><span>60m</span><span>90m</span><span>Finish</span></div>
      <div className="strategy-timeline__stints">
        <div><i className="stint-one" /><span><strong>Stint 1 · Medium</strong><small>{strategy.first} laps · 72.4 L · Driver A</small></span></div>
        <div><i className="stint-two" /><span><strong>Stint 2 · Medium</strong><small>{strategy.second - strategy.first} laps · 70.1 L · Driver B</small></span></div>
        <div><i className="stint-three" /><span><strong>Stint 3 · Medium</strong><small>{60 - strategy.second} laps · 66.8 L · Driver A</small></span></div>
      </div>
    </div>
  )
}

export function StrategyView() {
  const [selectedScenario, setSelectedScenario] = useState<Scenario>('balanced')
  const [duration, setDuration] = useState(120)
  const [fuelPerLap, setFuelPerLap] = useState(3.46)
  const [energyPerLap, setEnergyPerLap] = useState(4.61)
  const [lapTime, setLapTime] = useState(124.1)
  const [tankCapacity, setTankCapacity] = useState(75)
  const [pitLoss, setPitLoss] = useState(48.2)
  const [weather, setWeather] = useState<'dry' | 'variable'>('dry')
  const strategy = scenarios[selectedScenario]
  const projection = useMemo(() => projectRaceResources({
    race: {
      kind: 'timed',
      durationSeconds: duration * 60,
      elapsedSeconds: 0,
      currentLapProgress: 0,
      lapTimeSamplesSeconds: [lapTime + 0.31, lapTime - 0.17, lapTime + 0.08, lapTime - 0.22, lapTime + 0.14, lapTime - 0.04],
      finishRule: 'line-after-zero',
    },
    fuel: {
      name: 'Fuel',
      unit: 'L',
      currentAmount: 1000,
      reserveAmount: 0.6,
      perLapSamples: [fuelPerLap, fuelPerLap + 0.05, fuelPerLap - 0.04, fuelPerLap + 0.02, fuelPerLap - 0.01, fuelPerLap + 0.03],
    },
    virtualEnergy: {
      name: 'Virtual energy',
      unit: '%',
      currentAmount: 1000,
      reserveAmount: 0,
      perLapSamples: [energyPerLap, energyPerLap + 0.08, energyPerLap - 0.06, energyPerLap + 0.03, energyPerLap - 0.02],
    },
  }), [duration, energyPerLap, fuelPerLap, lapTime])
  const projectedLaps = Math.ceil(projection.race.expectedLapEquivalents)
  const totalFuel = projection.fuel.requiredToFinish.expected
  const modelConfidence = Math.round(projection.confidence.score * 100)
  const stopCount = Math.max(0, Math.ceil(totalFuel / Math.max(1, tankCapacity)) - 1)
  const reset = () => {
    setSelectedScenario('balanced'); setDuration(120); setFuelPerLap(3.46); setEnergyPerLap(4.61); setLapTime(124.1); setTankCapacity(75); setPitLoss(48.2); setWeather('dry')
  }

  return (
    <div className="view view--strategy">
      <div className="page-heading">
        <div><div className="eyebrow">Race strategy</div><h1>Build the plan. Stress-test the finish.</h1><p>A transparent strategy model with ranges, assumptions, and what-if scenarios.</p></div>
        <div className="page-heading__actions"><Button variant="secondary" icon={<RotateCcw size={16} />} onClick={reset}>Reset</Button><Button icon={<Save size={16} />} disabled>Save unavailable</Button></div>
      </div>

      <div className="data-provenance-banner"><Badge tone="accent">Mixed alpha model</Badge><span>Lap count, fuel, VE, uncertainty, and finish-boundary risk are calculated from your inputs. Stint cards, pit windows, traffic, tyres, drivers, and weather remain illustrative.</span></div>

      <div className="strategy-layout">
        <aside className="strategy-inputs">
          <Card>
            <CardHeader eyebrow="Event" title="Race assumptions" action={<TooltipHint>Inputs are stored only in this local plan.</TooltipHint>} />
            <div className="field-group">
              <label className="field-label"><span>Example circuit</span><button type="button" disabled>Spa-Francorchamps</button></label>
              <label className="field-label"><span>Example car</span><button type="button" disabled>Porsche 963</button></label>
              <NumberInput label="Race duration" value={duration} unit="min" onChange={setDuration} min={10} />
              <NumberInput label="Average lap" value={lapTime} unit="sec" onChange={setLapTime} min={30} step={0.1} />
            </div>
          </Card>
          <Card>
            <CardHeader eyebrow="Consumption" title="Manual pace model" action={<Badge tone="neutral">6-point synthetic spread</Badge>} />
            <div className="field-group field-group--two">
              <NumberInput label="Fuel / lap" value={fuelPerLap} unit="L" onChange={setFuelPerLap} step={0.01} />
              <NumberInput label="Virtual energy / lap" value={energyPerLap} unit="%" onChange={setEnergyPerLap} step={0.01} />
              <NumberInput label="Tank capacity" value={tankCapacity} unit="L" onChange={setTankCapacity} />
              <NumberInput label="Pit loss" value={pitLoss} unit="sec" onChange={setPitLoss} step={0.1} />
            </div>
            <div className="model-quality"><div><span>Model confidence</span><strong>{modelConfidence}%</strong></div><Progress value={modelConfidence} tone="positive" /><small>Calculated locally from consumption variance, pace stability and race-boundary risk.</small></div>
          </Card>
          <Card>
            <CardHeader eyebrow="Conditions" title="Weather model" />
            <Segmented value={weather} onChange={setWeather} ariaLabel="Weather model" options={[{ value: 'dry', label: 'Dry' }, { value: 'variable', label: 'Variable' }]} />
            <div className="weather-summary"><CloudSun size={23} /><div><strong>{weather === 'dry' ? 'Dry example' : 'Variable example'}</strong><span>Weather does not alter the alpha calculation yet</span></div></div>
            <button type="button" className="add-condition" disabled><Plus size={14} /> Rain transitions unavailable</button>
          </Card>
        </aside>

        <div className="strategy-results">
          <Card className="strategy-verdict">
            <div className="strategy-verdict__icon"><Sparkles size={20} /></div>
            <div><div className="eyebrow">Calculated resource result</div><h2>{stopCount} fuel stop{stopCount === 1 ? '' : 's'} required at minimum</h2><p>{projectedLaps} projected laps require {totalFuel.toFixed(1)} L including the configured reserve. Stint timing and traffic are not yet optimized.</p></div>
            <Badge tone={modelConfidence >= 80 ? 'positive' : 'warning'}>{modelConfidence}% model confidence</Badge>
          </Card>

          <div className="scenario-grid">
            {(Object.entries(scenarios) as Array<[Scenario, typeof scenarios[Scenario]]>).map(([id, scenario]) => (
              <button key={id} type="button" className={`scenario-card ${selectedScenario === id ? 'is-selected' : ''}`} onClick={() => setSelectedScenario(id)}>
                <div className="scenario-card__top"><span className={`scenario-card__radio ${selectedScenario === id ? 'is-selected' : ''}`} /> <strong>{scenario.label}</strong>{id === 'balanced' && <Badge tone="accent">Recommended</Badge>}</div>
                <div className="scenario-card__time">{scenario.total}<span>illustrative</span></div>
                <div className="scenario-card__stats"><span><b>{scenario.stops}</b> stops</span><span><b>+{scenario.margin.toFixed(1)} L</b> margin</span><span><b>{scenario.risk}</b> risk</span></div>
              </button>
            ))}
          </div>

          <Card className="plan-card">
            <CardHeader
              eyebrow={`Plan ${selectedScenario === 'balanced' ? 'A' : selectedScenario === 'safe' ? 'B' : 'C'}`}
              title={strategy.label}
              action={<div className="plan-summary"><span><Timer size={14} /> {duration} min</span><span><Flag size={14} /> {projectedLaps} laps</span><span><Fuel size={14} /> {totalFuel.toFixed(1)} L</span></div>}
            />
            <StrategyTimeline selected={selectedScenario} />
            <div className="pit-table">
              <div className="pit-table__head"><span>Stop</span><span>Window</span><span>Fuel added</span><span>Tyres</span><span>Driver</span><span>Rejoin</span></div>
              <div><strong>01</strong><span>Lap {strategy.first - 1}–{strategy.first + 1}</span><span>+70.1 L</span><span><i className="tyre tyre--m">M</i> New</span><span>A → B</span><Badge tone="positive">P5 · clear</Badge></div>
              <div><strong>02</strong><span>Lap {strategy.second - 1}–{strategy.second + 1}</span><span>+66.8 L</span><span><i className="tyre tyre--m">M</i> New</span><span>B → A</span><Badge tone="warning">P7 · traffic</Badge></div>
            </div>
          </Card>

          <div className="strategy-bottom-grid">
            <Card className="uncertainty-card">
              <CardHeader eyebrow="Robustness" title="What is and is not modeled?" action={<Badge tone="neutral">Analytical bounds</Badge>} />
              <div className="risk-list">
                <div><i className="risk-list__icon risk-list__icon--warning"><Users size={15} /></i><span><strong>Traffic and rejoin position</strong><small>No field forecast is connected to this planner</small></span><em>Unknown</em></div>
                <div><i className="risk-list__icon risk-list__icon--blue"><CloudRain size={15} /></i><span><strong>Weather and tyre crossover</strong><small>The selector is illustrative and does not change the result</small></span><em>Unknown</em></div>
                <div><i className="risk-list__icon risk-list__icon--positive"><Fuel size={15} /></i><span><strong>Fuel variation</strong><small>{projection.fuel.requiredToFinish.optimistic.toFixed(1)}–{projection.fuel.requiredToFinish.conservative.toFixed(1)} L modeled finish range</small></span><em>{modelConfidence}%</em></div>
              </div>
            </Card>

            <Card className="race-brief-card">
              <CardHeader eyebrow="Driver brief" title="Remember three numbers" />
              <div className="brief-numbers">
                <div><span>Target fuel</span><strong>≤ 3.55</strong><small>L / lap</small></div>
                <div><span>Pit call</span><strong>—</strong><small>Not optimized</small></div>
                <div><span>VE input</span><strong>{energyPerLap.toFixed(2)}</strong><small>% / lap</small></div>
              </div>
              <div className="brief-callout"><ShieldCheck size={16} /><span>{projection.race.extraLapRisk?.possible ? `${Math.round(projection.race.extraLapRisk.probability * 100)}% extra-lap boundary risk` : 'No material extra-lap boundary risk'}; 0.6 L reserve included.</span></div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
