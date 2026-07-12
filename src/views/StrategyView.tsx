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
import { NumericField } from '../components/forms/NumericField'
import { projectRaceResources } from '../engine'
import { defineMessages, useI18n, useMessages, type Language } from '../i18n'

type Scenario = 'balanced' | 'safe' | 'attack'

const scenarios = {
  balanced: { stops: 2, total: '2:03:41', margin: 2.1, first: 21, second: 42, save: 0, color: 'accent' },
  safe: { stops: 2, total: '2:03:58', margin: 5.4, first: 20, second: 40, save: 0, color: 'blue' },
  attack: { stops: 3, total: '2:03:26', margin: 1.3, first: 16, second: 32, save: 0, color: 'warning' },
} as const

function formatNumber(value: number, language: Language, digits: number) {
  return new Intl.NumberFormat(language, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

const copy = defineMessages({
  scenarios: { balanced: { label: 'Balanced', risk: 'Low' }, safe: { label: 'Safety margin', risk: 'Very low' }, attack: { label: 'Track position', risk: 'Medium' } },
  units: { minutes: 'min', seconds: 's', liters: 'L', percent: '%' },
  resources: { fuel: 'Fuel', virtualEnergy: 'Virtual energy' },
  timeline: { pit: 'Pit', start: 'Start', finish: 'Finish', stint: 'Stint', medium: 'Medium', laps: 'laps', driver: 'Driver' },
  heading: { eyebrow: 'Race strategy', title: 'Build the plan. Stress-test the finish.', description: 'A transparent strategy model with ranges, assumptions, and what-if scenarios.', reset: 'Reset', saveUnavailable: 'Save unavailable' },
  provenance: { badge: 'Mixed alpha model', description: 'Lap count, fuel, VE, uncertainty, and finish-boundary risk are calculated from your inputs. Stint cards, pit windows, traffic, tyres, drivers, and weather remain illustrative.' },
  event: { eyebrow: 'Event', title: 'Race assumptions', help: 'Inputs are stored only in this local plan.', exampleCircuit: 'Example circuit', exampleCircuitValue: 'Spa-Francorchamps', exampleCar: 'Example car', exampleCarValue: 'Porsche 963', raceDuration: 'Race duration', averageLap: 'Average lap' },
  consumption: { eyebrow: 'Consumption', title: 'Manual pace model', spread: '6-point synthetic spread', fuelPerLap: 'Fuel / lap', energyPerLap: 'Virtual energy / lap', energyHelp: "LMU's regulated virtual-energy allocation consumed per lap.", tankCapacity: 'Tank capacity', pitLoss: 'Pit loss', confidence: 'Model confidence', confidenceHelp: 'Input stability and finish-boundary evidence—not the probability that this strategy wins.', confidenceDetail: 'Calculated locally from consumption variance, pace stability and race-boundary risk.' },
  conditions: { eyebrow: 'Conditions', title: 'Weather model', aria: 'Weather model', dry: 'Dry', variable: 'Variable', dryExample: 'Dry example', variableExample: 'Variable example', calculationNote: 'Weather does not alter the alpha calculation yet', rainUnavailable: 'Rain transitions unavailable' },
  verdict: { eyebrow: 'Calculated resource result', fuelStop: 'fuel stop', fuelStops: 'fuel stops', required: 'required at minimum', projectedLaps: 'projected laps require', includingReserve: 'including the configured reserve. Stint timing and traffic are not yet optimized.', modelConfidence: 'model confidence' },
  card: { recommended: 'Recommended', illustrative: 'illustrative', stops: 'stops', margin: 'margin', risk: 'risk' },
  plan: { plan: 'Plan', minutes: 'min', laps: 'laps', stop: 'Stop', window: 'Window', fuelAdded: 'Fuel added', tyres: 'Tyres', driver: 'Driver', rejoin: 'Rejoin', lap: 'Lap', newTyres: 'New', mediumCode: 'M', clear: 'clear', traffic: 'traffic' },
  robustness: { eyebrow: 'Robustness', title: 'What is and is not modeled?', bounds: 'Analytical bounds', trafficTitle: 'Traffic and rejoin position', trafficDetail: 'No field forecast is connected to this planner', weatherTitle: 'Weather and tyre crossover', weatherDetail: 'The selector is illustrative and does not change the result', fuelTitle: 'Fuel variation', modeledRange: 'modeled finish range', unknown: 'Unknown' },
  brief: { eyebrow: 'Driver brief', title: 'Remember three numbers', targetFuel: 'Target fuel', pitCall: 'Pit call', notOptimized: 'Not optimized', energyInput: 'VE input', extraLapRisk: 'extra-lap boundary risk', noExtraLapRisk: 'No material extra-lap boundary risk', reserveIncluded: 'reserve included.' },
}, {
  scenarios: { balanced: { label: 'Ausgewogen', risk: 'Niedrig' }, safe: { label: 'Sicherheitsreserve', risk: 'Sehr niedrig' }, attack: { label: 'Streckenposition', risk: 'Mittel' } },
  units: { minutes: 'min', seconds: 's', liters: 'L', percent: '%' },
  resources: { fuel: 'Kraftstoff', virtualEnergy: 'Virtuelle Energie' },
  timeline: { pit: 'Stopp', start: 'Start', finish: 'Ziel', stint: 'Stint', medium: 'Medium', laps: 'Runden', driver: 'Fahrer' },
  heading: { eyebrow: 'Rennstrategie', title: 'Baue den Plan. Prüfe das Ziel unter Belastung.', description: 'Ein transparentes Strategiemodell mit Bandbreiten, Annahmen und Was-wäre-wenn-Szenarien.', reset: 'Zurücksetzen', saveUnavailable: 'Speichern nicht verfügbar' },
  provenance: { badge: 'Gemischtes Alpha-Modell', description: 'Rundenzahl, Kraftstoff, VE, Unsicherheit und Zielgrenzenrisiko werden aus deinen Eingaben berechnet. Stint-Karten, Boxenfenster, Verkehr, Reifen, Fahrer und Wetter bleiben illustrativ.' },
  event: { eyebrow: 'Event', title: 'Rennannahmen', help: 'Eingaben werden nur in diesem lokalen Plan gespeichert.', exampleCircuit: 'Beispielstrecke', exampleCircuitValue: 'Spa-Francorchamps', exampleCar: 'Beispielfahrzeug', exampleCarValue: 'Porsche 963', raceDuration: 'Renndauer', averageLap: 'Durchschnittsrunde' },
  consumption: { eyebrow: 'Verbrauch', title: 'Manuelles Tempomodell', spread: 'Synthetische Streuung aus 6 Punkten', fuelPerLap: 'Kraftstoff / Runde', energyPerLap: 'Virtuelle Energie / Runde', energyHelp: 'Die pro Runde verbrauchte, regulierte Zuteilung virtueller Energie in LMU.', tankCapacity: 'Tankkapazität', pitLoss: 'Boxenzeitverlust', confidence: 'Modellkonfidenz', confidenceHelp: 'Stabilität der Eingaben und Belege zur Zielgrenze – nicht die Gewinnwahrscheinlichkeit dieser Strategie.', confidenceDetail: 'Lokal aus Verbrauchsstreuung, Tempostabilität und Zielgrenzenrisiko berechnet.' },
  conditions: { eyebrow: 'Bedingungen', title: 'Wettermodell', aria: 'Wettermodell', dry: 'Trocken', variable: 'Wechselhaft', dryExample: 'Trockenes Beispiel', variableExample: 'Wechselhaftes Beispiel', calculationNote: 'Das Wetter beeinflusst die Alpha-Berechnung noch nicht', rainUnavailable: 'Regenübergänge nicht verfügbar' },
  verdict: { eyebrow: 'Berechnetes Ressourcenergebnis', fuelStop: 'Tankstopp', fuelStops: 'Tankstopps', required: 'mindestens erforderlich', projectedLaps: 'prognostizierte Runden benötigen', includingReserve: 'einschließlich der eingestellten Reserve. Stint-Zeitpunkte und Verkehr sind noch nicht optimiert.', modelConfidence: 'Modellkonfidenz' },
  card: { recommended: 'Empfohlen', illustrative: 'illustrativ', stops: 'Stopps', margin: 'Reserve', risk: 'Risiko' },
  plan: { plan: 'Plan', minutes: 'Min.', laps: 'Runden', stop: 'Stopp', window: 'Fenster', fuelAdded: 'Kraftstoff', tyres: 'Reifen', driver: 'Fahrer', rejoin: 'Rückkehr', lap: 'Runde', newTyres: 'Neu', mediumCode: 'M', clear: 'frei', traffic: 'Verkehr' },
  robustness: { eyebrow: 'Robustheit', title: 'Was wird modelliert – und was nicht?', bounds: 'Analytische Grenzen', trafficTitle: 'Verkehr und Rückkehrposition', trafficDetail: 'An diesen Planer ist keine Feldprognose angeschlossen', weatherTitle: 'Wetter und Reifen-Crossover', weatherDetail: 'Die Auswahl ist illustrativ und verändert das Ergebnis nicht', fuelTitle: 'Kraftstoffstreuung', modeledRange: 'modellierte Zielbandbreite', unknown: 'Unbekannt' },
  brief: { eyebrow: 'Fahrerbriefing', title: 'Drei Zahlen merken', targetFuel: 'Zielverbrauch', pitCall: 'Boxenruf', notOptimized: 'Nicht optimiert', energyInput: 'VE-Eingabe', extraLapRisk: 'Risiko einer Zusatzrunde', noExtraLapRisk: 'Kein relevantes Risiko einer Zusatzrunde', reserveIncluded: 'Reserve enthalten.' },
})

function StrategyTimeline({ selected }: { selected: Scenario }) {
  const m = useMessages(copy)
  const strategy = scenarios[selected]
  return (
    <div className="strategy-timeline">
      <div className="strategy-timeline__track">
        <span className="stint stint--one" style={{ width: `${strategy.first / 60 * 100}%` }} />
        <span className="stop" style={{ left: `${strategy.first / 60 * 100}%` }}><i /><b>{m.timeline.pit} 1</b></span>
        <span className="stint stint--two" style={{ left: `${strategy.first / 60 * 100}%`, width: `${(strategy.second - strategy.first) / 60 * 100}%` }} />
        <span className="stop" style={{ left: `${strategy.second / 60 * 100}%` }}><i /><b>{m.timeline.pit} 2</b></span>
        <span className="stint stint--three" style={{ left: `${strategy.second / 60 * 100}%`, width: `${(60 - strategy.second) / 60 * 100}%` }} />
        {strategy.stops === 3 && <span className="stop stop--third" style={{ left: '80%' }}><i /><b>{m.timeline.pit} 3</b></span>}
      </div>
      <div className="strategy-timeline__axis"><span>{m.timeline.start}</span><span>30 {m.units.minutes}</span><span>60 {m.units.minutes}</span><span>90 {m.units.minutes}</span><span>{m.timeline.finish}</span></div>
      <div className="strategy-timeline__stints">
        <div><i className="stint-one" /><span><strong>{m.timeline.stint} 1 · {m.timeline.medium}</strong><small>{strategy.first} {m.timeline.laps} · 72.4 {m.units.liters} · {m.timeline.driver} A</small></span></div>
        <div><i className="stint-two" /><span><strong>{m.timeline.stint} 2 · {m.timeline.medium}</strong><small>{strategy.second - strategy.first} {m.timeline.laps} · 70.1 {m.units.liters} · {m.timeline.driver} B</small></span></div>
        <div><i className="stint-three" /><span><strong>{m.timeline.stint} 3 · {m.timeline.medium}</strong><small>{60 - strategy.second} {m.timeline.laps} · 66.8 {m.units.liters} · {m.timeline.driver} A</small></span></div>
      </div>
    </div>
  )
}

export function StrategyView() {
  const m = useMessages(copy)
  const { language } = useI18n()
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
      name: m.resources.fuel,
      unit: m.units.liters,
      currentAmount: 1000,
      reserveAmount: 0.6,
      perLapSamples: [fuelPerLap, fuelPerLap + 0.05, fuelPerLap - 0.04, fuelPerLap + 0.02, fuelPerLap - 0.01, fuelPerLap + 0.03],
    },
    virtualEnergy: {
      name: m.resources.virtualEnergy,
      unit: m.units.percent,
      currentAmount: 1000,
      reserveAmount: 0,
      perLapSamples: [energyPerLap, energyPerLap + 0.08, energyPerLap - 0.06, energyPerLap + 0.03, energyPerLap - 0.02],
    },
  }), [duration, energyPerLap, fuelPerLap, lapTime, m.resources.fuel, m.resources.virtualEnergy, m.units.liters, m.units.percent])
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
        <div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.heading.title}</h1><p>{m.heading.description}</p></div>
        <div className="page-heading__actions"><Button variant="secondary" icon={<RotateCcw size={16} />} onClick={reset}>{m.heading.reset}</Button><Button icon={<Save size={16} />} disabled>{m.heading.saveUnavailable}</Button></div>
      </div>

      <div className="data-provenance-banner"><Badge tone="accent">{m.provenance.badge}</Badge><span>{m.provenance.description}</span></div>

      <div className="strategy-layout">
        <aside className="strategy-inputs">
          <Card>
            <CardHeader eyebrow={m.event.eyebrow} title={m.event.title} action={<TooltipHint>{m.event.help}</TooltipHint>} />
            <div className="field-group">
              <label className="field-label"><span>{m.event.exampleCircuit}</span><button type="button" disabled>{m.event.exampleCircuitValue}</button></label>
              <label className="field-label"><span>{m.event.exampleCar}</span><button type="button" disabled>{m.event.exampleCarValue}</button></label>
              <NumericField label={m.event.raceDuration} value={duration} unit={m.units.minutes} onCommit={setDuration} min={10} max={1440} step={1} integer />
              <NumericField label={m.event.averageLap} value={lapTime} unit={m.units.seconds} onCommit={setLapTime} min={30} max={3600} step={0.1} />
            </div>
          </Card>
          <Card>
            <CardHeader eyebrow={m.consumption.eyebrow} title={m.consumption.title} action={<Badge tone="neutral">{m.consumption.spread}</Badge>} />
            <div className="field-group field-group--two">
              <NumericField label={m.consumption.fuelPerLap} value={fuelPerLap} unit={m.units.liters} onCommit={setFuelPerLap} min={0.01} max={1000} step={0.01} />
              <NumericField label={m.consumption.energyPerLap} value={energyPerLap} unit={m.units.percent} onCommit={setEnergyPerLap} min={0} max={100} step={0.01} help={<TooltipHint>{m.consumption.energyHelp}</TooltipHint>} />
              <NumericField label={m.consumption.tankCapacity} value={tankCapacity} unit={m.units.liters} onCommit={setTankCapacity} min={1} max={1000} step={0.1} />
              <NumericField label={m.consumption.pitLoss} value={pitLoss} unit={m.units.seconds} onCommit={setPitLoss} min={0} max={3600} step={0.1} />
            </div>
            <div className="model-quality"><div><span>{m.consumption.confidence} <TooltipHint>{m.consumption.confidenceHelp}</TooltipHint></span><strong>{modelConfidence}{m.units.percent}</strong></div><Progress value={modelConfidence} tone="positive" /><small>{m.consumption.confidenceDetail}</small></div>
          </Card>
          <Card>
            <CardHeader eyebrow={m.conditions.eyebrow} title={m.conditions.title} />
            <Segmented value={weather} onChange={setWeather} ariaLabel={m.conditions.aria} options={[{ value: 'dry', label: m.conditions.dry }, { value: 'variable', label: m.conditions.variable }]} />
            <div className="weather-summary"><CloudSun size={23} /><div><strong>{weather === 'dry' ? m.conditions.dryExample : m.conditions.variableExample}</strong><span>{m.conditions.calculationNote}</span></div></div>
            <button type="button" className="add-condition" disabled><Plus size={14} /> {m.conditions.rainUnavailable}</button>
          </Card>
        </aside>

        <div className="strategy-results">
          <Card className="strategy-verdict">
            <div className="strategy-verdict__icon"><Sparkles size={20} /></div>
            <div><div className="eyebrow">{m.verdict.eyebrow}</div><h2>{stopCount} {stopCount === 1 ? m.verdict.fuelStop : m.verdict.fuelStops} {m.verdict.required}</h2><p>{projectedLaps} {m.verdict.projectedLaps} {formatNumber(totalFuel, language, 1)} {m.units.liters} {m.verdict.includingReserve}</p></div>
            <Badge tone={modelConfidence >= 80 ? 'positive' : 'warning'}>{modelConfidence}{m.units.percent} {m.verdict.modelConfidence}</Badge>
          </Card>

          <div className="scenario-grid">
            {(Object.entries(scenarios) as Array<[Scenario, typeof scenarios[Scenario]]>).map(([id, scenario]) => (
              <button key={id} type="button" className={`scenario-card ${selectedScenario === id ? 'is-selected' : ''}`} onClick={() => setSelectedScenario(id)}>
                <div className="scenario-card__top"><span className={`scenario-card__radio ${selectedScenario === id ? 'is-selected' : ''}`} /> <strong>{m.scenarios[id].label}</strong>{id === 'balanced' && <Badge tone="accent">{m.card.recommended}</Badge>}</div>
                <div className="scenario-card__time">{scenario.total}<span>{m.card.illustrative}</span></div>
                <div className="scenario-card__stats"><span><b>{scenario.stops}</b> {m.card.stops}</span><span><b>+{formatNumber(scenario.margin, language, 1)} {m.units.liters}</b> {m.card.margin}</span><span><b>{m.scenarios[id].risk}</b> {m.card.risk}</span></div>
              </button>
            ))}
          </div>

          <Card className="plan-card">
            <CardHeader
              eyebrow={`${m.plan.plan} ${selectedScenario === 'balanced' ? 'A' : selectedScenario === 'safe' ? 'B' : 'C'}`}
              title={m.scenarios[selectedScenario].label}
              action={<div className="plan-summary"><span><Timer size={14} /> {duration} {m.plan.minutes}</span><span><Flag size={14} /> {projectedLaps} {m.plan.laps}</span><span><Fuel size={14} /> {formatNumber(totalFuel, language, 1)} {m.units.liters}</span></div>}
            />
            <StrategyTimeline selected={selectedScenario} />
            <div className="pit-table">
              <div className="pit-table__head"><span>{m.plan.stop}</span><span>{m.plan.window}</span><span>{m.plan.fuelAdded}</span><span>{m.plan.tyres}</span><span>{m.plan.driver}</span><span>{m.plan.rejoin}</span></div>
              <div><strong>01</strong><span>{m.plan.lap} {strategy.first - 1}–{strategy.first + 1}</span><span>+70.1 {m.units.liters}</span><span><i className="tyre tyre--m">{m.plan.mediumCode}</i> {m.plan.newTyres}</span><span>A → B</span><Badge tone="positive">P5 · {m.plan.clear}</Badge></div>
              <div><strong>02</strong><span>{m.plan.lap} {strategy.second - 1}–{strategy.second + 1}</span><span>+66.8 {m.units.liters}</span><span><i className="tyre tyre--m">{m.plan.mediumCode}</i> {m.plan.newTyres}</span><span>B → A</span><Badge tone="warning">P7 · {m.plan.traffic}</Badge></div>
            </div>
          </Card>

          <div className="strategy-bottom-grid">
            <Card className="uncertainty-card">
              <CardHeader eyebrow={m.robustness.eyebrow} title={m.robustness.title} action={<Badge tone="neutral">{m.robustness.bounds}</Badge>} />
              <div className="risk-list">
                <div><i className="risk-list__icon risk-list__icon--warning"><Users size={15} /></i><span><strong>{m.robustness.trafficTitle}</strong><small>{m.robustness.trafficDetail}</small></span><em>{m.robustness.unknown}</em></div>
                <div><i className="risk-list__icon risk-list__icon--blue"><CloudRain size={15} /></i><span><strong>{m.robustness.weatherTitle}</strong><small>{m.robustness.weatherDetail}</small></span><em>{m.robustness.unknown}</em></div>
                <div><i className="risk-list__icon risk-list__icon--positive"><Fuel size={15} /></i><span><strong>{m.robustness.fuelTitle}</strong><small>{formatNumber(projection.fuel.requiredToFinish.optimistic, language, 1)}–{formatNumber(projection.fuel.requiredToFinish.conservative, language, 1)} {m.units.liters} {m.robustness.modeledRange}</small></span><em>{modelConfidence}{m.units.percent}</em></div>
              </div>
            </Card>

            <Card className="race-brief-card">
              <CardHeader eyebrow={m.brief.eyebrow} title={m.brief.title} />
              <div className="brief-numbers">
                <div><span>{m.brief.targetFuel}</span><strong>≤ 3.55</strong><small>{m.units.liters} / {m.plan.lap.toLowerCase()}</small></div>
                <div><span>{m.brief.pitCall}</span><strong>—</strong><small>{m.brief.notOptimized}</small></div>
                <div><span>{m.brief.energyInput}</span><strong>{formatNumber(energyPerLap, language, 2)}</strong><small>{m.units.percent} / {m.plan.lap.toLowerCase()}</small></div>
              </div>
              <div className="brief-callout"><ShieldCheck size={16} /><span>{projection.race.extraLapRisk?.possible ? `${Math.round(projection.race.extraLapRisk.probability * 100)}${m.units.percent} ${m.brief.extraLapRisk}` : m.brief.noExtraLapRisk}; 0.6 {m.units.liters} {m.brief.reserveIncluded}</span></div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
