import {
  AlertTriangle,
  Clock3,
  Flag,
  Fuel,
  Gauge,
  Info,
  RotateCcw,
  Save,
  ShieldCheck,
  Timer,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { NumericField } from '../components/forms/NumericField'
import { Badge, Button, Card, CardHeader, TooltipHint } from '../components/ui'
import {
  generateTimedStrategyCandidates,
  type StrategyCandidate,
} from '../engine'
import { defineMessages, useI18n, useMessages, type Language } from '../i18n'

const defaults = {
  duration: 120,
  lapTime: 124.1,
  expectedFuelPerLap: 3.46,
  planningFuelPerLap: 3.46,
  currentFuel: 75,
  tankCapacity: 75,
  reserve: 0.6,
  pitLoss: 48.2,
  refuelRate: 2,
} as const

function formatNumber(value: number, language: Language, digits: number) {
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function candidateDistance(candidate: StrategyCandidate) {
  return candidate.stints.reduce((total, stint) => total + stint.lapEquivalents, 0)
}

const copy = defineMessages({
  units: { minutes: 'min', seconds: 's', liters: 'L', laps: 'laps', lap: 'lap' },
  heading: { eyebrow: 'Race strategy', title: 'Build a plan you can verify.', description: 'Every displayed stop, stint and fuel target now comes from the selected calculation.', reset: 'Reset', saveUnavailable: 'Save unavailable' },
  provenance: { badge: 'Manual fuel model', description: 'All active inputs are manual assumptions. No measured LMU laps are connected here yet, so Apex reports feasibility—not a probability of winning.', source: 'Source: manual', evidence: 'One manual value; no synthetic samples or confidence percentage.' },
  event: { eyebrow: 'Race', title: 'Distance assumptions', help: 'A timed race finishes at the first modeled line crossing after zero. Pit time is coupled back into the projected lap count.', duration: 'Race duration', lapTime: 'Average lap time' },
  fuel: { eyebrow: 'Fuel', title: 'Capacity and consumption', expectedRate: 'Expected fuel / lap', planningRate: 'Planning fuel / lap', planningHelp: 'The conservative rate used to prove that every stint fits. Raising the expected rate also raises this value when necessary.', current: 'Start fuel', capacity: 'Tank capacity', reserve: 'Finish reserve' },
  service: { eyebrow: 'Pit service', title: 'Time assumptions', pitLoss: 'Pit-lane loss', pitLossHelp: 'Time lost entering, traversing and exiting the pit lane, excluding refuelling.', refuelRate: 'Refuel rate', refuelUnit: 'L/s', concurrency: 'Fuel-only service; no tyre or driver timing is assumed.' },
  verdict: { eyebrow: 'Recommended fuel-only baseline', stop: 'stop', stops: 'stops', stints: 'stints', for: 'for', rationale: 'Maximizes projected completed laps, then minimizes modeled pit cost and fuel-range pressure.', minimum: 'minimum feasible', planningDemand: 'planning fuel demand', expectedDemand: 'expected fuel demand', infeasible: 'No feasible fuel plan', infeasibleDetail: 'The tank has no usable range after the configured reserve, or the current assumptions cannot cover one stint. Adjust capacity, start fuel, reserve, or planning consumption.' },
  alternatives: { eyebrow: 'Feasible plans', title: 'Calculated alternatives', description: 'Only non-invented candidates are shown. Select one to update every detail below.', recommended: 'Recommended', fewerLaps: 'fewer projected laps', sameDistance: 'same projected distance', pitCost: 'pit cost', finishFuel: 'expected finish fuel', noAlternative: 'No non-dominated alternative is supported by these assumptions.' },
  plan: { eyebrow: 'Selected plan', title: 'Fuel stint schedule', projected: 'projected', stop: 'Stop', afterLap: 'After lap', fuelAdded: 'Fuel added', exitTarget: 'Exit target', totalCost: 'Total pit cost', start: 'Start', finish: 'Finish', stint: 'Stint', uses: 'planning use' },
  explanation: { eyebrow: 'Why this changed', title: 'Cause and effect', distance: 'Pit time is included in the timed-race distance. More pit time can reduce the number of completed laps.', fuel: 'The planning rate and reserve constrain every stint; expected consumption only estimates finish fuel.', objective: 'Objective: maximize completed laps, then minimize modeled time and risk. Stable stop count breaks ties.' },
  unsupported: { eyebrow: 'Outside this model', title: 'Explicitly not modeled', traffic: 'Traffic and rejoin position', weather: 'Weather and tyre crossover', tyres: 'Tyre inventory, degradation and compounds', drivers: 'Driver rules and swap timing', energy: 'Virtual Energy allocation', note: 'These factors cannot change or decorate this plan until verified inputs and rules are connected.', unavailable: 'Not modeled' },
  brief: { eyebrow: 'Driver brief', title: 'Calculated fuel calls', target: 'Planning rate', firstStop: 'First stop', finish: 'Expected finish', noStop: 'No stop', afterLap: 'after lap', reserve: 'The conservative schedule protects the configured finish reserve.' },
}, {
  units: { minutes: 'min', seconds: 's', liters: 'L', laps: 'Runden', lap: 'Runde' },
  heading: { eyebrow: 'Rennstrategie', title: 'Baue einen überprüfbaren Plan.', description: 'Jeder angezeigte Stopp, Stint und jedes Kraftstoffziel stammt jetzt aus der ausgewählten Berechnung.', reset: 'Zurücksetzen', saveUnavailable: 'Speichern nicht verfügbar' },
  provenance: { badge: 'Manuelles Kraftstoffmodell', description: 'Alle aktiven Eingaben sind manuelle Annahmen. Hier sind noch keine gemessenen LMU-Runden verbunden; Apex bewertet deshalb Machbarkeit – nicht die Gewinnwahrscheinlichkeit.', source: 'Quelle: manuell', evidence: 'Ein manueller Wert; keine synthetischen Stichproben oder Konfidenzprozente.' },
  event: { eyebrow: 'Rennen', title: 'Distanzannahmen', help: 'Ein Zeitrennen endet bei der ersten modellierten Ziellinienüberfahrt nach null. Die Boxenzeit fließt zurück in die prognostizierte Rundenzahl.', duration: 'Renndauer', lapTime: 'Durchschnittliche Rundenzeit' },
  fuel: { eyebrow: 'Kraftstoff', title: 'Kapazität und Verbrauch', expectedRate: 'Erwarteter Kraftstoff / Runde', planningRate: 'Planungsverbrauch / Runde', planningHelp: 'Der konservative Wert, mit dem geprüft wird, ob jeder Stint passt. Ein höherer Erwartungswert erhöht diesen Wert bei Bedarf ebenfalls.', current: 'Startkraftstoff', capacity: 'Tankkapazität', reserve: 'Zielreserve' },
  service: { eyebrow: 'Boxenservice', title: 'Zeitannahmen', pitLoss: 'Boxengassenverlust', pitLossHelp: 'Zeitverlust für Einfahrt, Durchfahrt und Ausfahrt ohne Betankung.', refuelRate: 'Betankungsrate', refuelUnit: 'L/s', concurrency: 'Nur Kraftstoffservice; keine Reifen- oder Fahrerzeit wird angenommen.' },
  verdict: { eyebrow: 'Empfohlene reine Kraftstoffbasis', stop: 'Stopp', stops: 'Stopps', stints: 'Stints', for: 'für', rationale: 'Maximiert die prognostizierten gefahrenen Runden und minimiert danach modellierte Boxenzeit und Reichweitendruck.', minimum: 'mindestens machbar', planningDemand: 'Kraftstoffbedarf der Planung', expectedDemand: 'erwarteter Kraftstoffbedarf', infeasible: 'Kein machbarer Kraftstoffplan', infeasibleDetail: 'Nach der konfigurierten Reserve hat der Tank keine nutzbare Reichweite oder die aktuellen Annahmen decken keinen Stint ab. Passe Kapazität, Startkraftstoff, Reserve oder Planungsverbrauch an.' },
  alternatives: { eyebrow: 'Machbare Pläne', title: 'Berechnete Alternativen', description: 'Es werden nur nicht erfundene Kandidaten gezeigt. Eine Auswahl aktualisiert alle Details darunter.', recommended: 'Empfohlen', fewerLaps: 'weniger prognostizierte Runden', sameDistance: 'gleiche prognostizierte Distanz', pitCost: 'Boxenkosten', finishFuel: 'erwarteter Zielkraftstoff', noAlternative: 'Diese Annahmen stützen keine nicht dominierte Alternative.' },
  plan: { eyebrow: 'Ausgewählter Plan', title: 'Kraftstoff-Stintplan', projected: 'prognostiziert', stop: 'Stopp', afterLap: 'Nach Runde', fuelAdded: 'Kraftstoffmenge', exitTarget: 'Ausfahrtsziel', totalCost: 'Gesamte Boxenkosten', start: 'Start', finish: 'Ziel', stint: 'Stint', uses: 'Planungsverbrauch' },
  explanation: { eyebrow: 'Warum sich das ändert', title: 'Ursache und Wirkung', distance: 'Die Boxenzeit ist in der Distanz des Zeitrennens enthalten. Mehr Boxenzeit kann die Anzahl gefahrener Runden verringern.', fuel: 'Planungsverbrauch und Reserve begrenzen jeden Stint; der erwartete Verbrauch schätzt nur den Zielkraftstoff.', objective: 'Ziel: gefahrene Runden maximieren, danach modellierte Zeit und Risiko minimieren. Eine stabile Stoppzahl entscheidet Gleichstände.' },
  unsupported: { eyebrow: 'Außerhalb dieses Modells', title: 'Explizit nicht modelliert', traffic: 'Verkehr und Rückkehrposition', weather: 'Wetter und Reifen-Crossover', tyres: 'Reifenbestand, Abbau und Mischungen', drivers: 'Fahrerregeln und Wechselzeit', energy: 'Zuteilung virtueller Energie', note: 'Diese Faktoren dürfen den Plan nicht verändern oder ausschmücken, bevor verifizierte Eingaben und Regeln verbunden sind.', unavailable: 'Nicht modelliert' },
  brief: { eyebrow: 'Fahrerbriefing', title: 'Berechnete Kraftstoffangaben', target: 'Planungsverbrauch', firstStop: 'Erster Stopp', finish: 'Erwartetes Ziel', noStop: 'Kein Stopp', afterLap: 'nach Runde', reserve: 'Der konservative Ablauf schützt die konfigurierte Zielreserve.' },
})

function StrategyTimeline({ candidate, language }: { candidate: StrategyCandidate; language: Language }) {
  const m = useMessages(copy)
  const totalLaps = candidateDistance(candidate)
  let cumulative = 0
  return (
    <div className="strategy-timeline strategy-timeline--calculated">
      <div className="strategy-timeline__track" aria-label={`${candidate.stints.length} ${m.verdict.stints}`}>
        {candidate.stints.map((stint, index) => {
          const left = cumulative / totalLaps * 100
          cumulative += stint.lapEquivalents
          return <span key={stint.index} className="stint" style={{ left: `${left}%`, width: `${stint.lapEquivalents / totalLaps * 100}%` }} data-stint={index % 3} />
        })}
        {candidate.pitStops.map((stop) => <span key={stop.index} className="stop" style={{ left: `${stop.afterLapEquivalentsFromNow / totalLaps * 100}%` }}><i /><b>{m.plan.stop} {stop.index}</b></span>)}
      </div>
      <div className="strategy-timeline__axis"><span>{m.plan.start}</span><span>{formatNumber(totalLaps / 2, language, totalLaps % 2 ? 1 : 0)} {m.units.laps}</span><span>{totalLaps} {m.units.laps} · {m.plan.finish}</span></div>
      <div className="strategy-timeline__stints">
        {candidate.stints.map((stint) => <div key={stint.index}><i data-stint={(stint.index - 1) % 3} /><span><strong>{m.plan.stint} {stint.index}</strong><small>{stint.lapEquivalents} {m.units.laps} · {formatNumber(stint.conservativeFuelUseLitres, language, 1)} {m.units.liters} {m.plan.uses}</small></span></div>)}
      </div>
    </div>
  )
}

export function StrategyView() {
  const m = useMessages(copy)
  const { language } = useI18n()
  const [duration, setDuration] = useState<number>(defaults.duration)
  const [lapTime, setLapTime] = useState<number>(defaults.lapTime)
  const [expectedFuelPerLap, setExpectedFuelPerLap] = useState<number>(defaults.expectedFuelPerLap)
  const [planningFuelPerLap, setPlanningFuelPerLap] = useState<number>(defaults.planningFuelPerLap)
  const [currentFuel, setCurrentFuel] = useState<number>(defaults.currentFuel)
  const [tankCapacity, setTankCapacity] = useState<number>(defaults.tankCapacity)
  const [reserve, setReserve] = useState<number>(defaults.reserve)
  const [pitLoss, setPitLoss] = useState<number>(defaults.pitLoss)
  const [refuelRate, setRefuelRate] = useState<number>(defaults.refuelRate)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const result = useMemo(() => generateTimedStrategyCandidates({
    durationSeconds: duration * 60,
    currentFuelLitres: currentFuel,
    tankCapacityLitres: tankCapacity,
    fuel: { mean: expectedFuelPerLap, conservative: planningFuelPerLap },
    fuelReserveLitres: reserve,
    averageLapTimeSeconds: lapTime,
    pitLaneLossSeconds: pitLoss,
    refuelLitresPerSecond: refuelRate,
    serviceConcurrency: 'parallel',
  }), [currentFuel, duration, expectedFuelPerLap, lapTime, pitLoss, planningFuelPerLap, refuelRate, reserve, tankCapacity])
  const recommended = result.recommended
  const selected = result.candidates.find((candidate) => candidate.id === selectedId) ?? recommended
  const projectedLaps = selected ? candidateDistance(selected) : result.projectedLapCount
  const expectedDemand = projectedLaps * expectedFuelPerLap + reserve
  const planningDemand = projectedLaps * planningFuelPerLap + reserve

  const reset = () => {
    setDuration(defaults.duration)
    setLapTime(defaults.lapTime)
    setExpectedFuelPerLap(defaults.expectedFuelPerLap)
    setPlanningFuelPerLap(defaults.planningFuelPerLap)
    setCurrentFuel(defaults.currentFuel)
    setTankCapacity(defaults.tankCapacity)
    setReserve(defaults.reserve)
    setPitLoss(defaults.pitLoss)
    setRefuelRate(defaults.refuelRate)
    setSelectedId(null)
  }

  return (
    <div className="view view--strategy">
      <div className="page-heading">
        <div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.heading.title}</h1><p>{m.heading.description}</p></div>
        <div className="page-heading__actions"><Button variant="secondary" icon={<RotateCcw size={16} />} onClick={reset}>{m.heading.reset}</Button><Button icon={<Save size={16} />} disabled>{m.heading.saveUnavailable}</Button></div>
      </div>

      <div className="data-provenance-banner"><Badge tone="warning">{m.provenance.badge}</Badge><span>{m.provenance.description}</span></div>

      <div className="strategy-layout">
        <aside className="strategy-inputs">
          <Card>
            <CardHeader eyebrow={m.event.eyebrow} title={m.event.title} action={<TooltipHint>{m.event.help}</TooltipHint>} />
            <div className="field-group">
              <NumericField label={m.event.duration} value={duration} unit={m.units.minutes} onCommit={setDuration} min={10} max={1440} step={1} integer />
              <NumericField label={m.event.lapTime} value={lapTime} unit={m.units.seconds} onCommit={setLapTime} min={30} max={3600} step={0.1} />
            </div>
            <small className="strategy-source-note">{m.provenance.source}</small>
          </Card>
          <Card>
            <CardHeader eyebrow={m.fuel.eyebrow} title={m.fuel.title} action={<Badge tone="neutral">{m.provenance.source}</Badge>} />
            <div className="field-group field-group--two">
              <NumericField label={m.fuel.expectedRate} value={expectedFuelPerLap} unit={m.units.liters} onCommit={(value) => { setExpectedFuelPerLap(value); if (value > planningFuelPerLap) setPlanningFuelPerLap(value) }} min={0.01} max={1000} step={0.01} />
              <NumericField label={m.fuel.planningRate} value={planningFuelPerLap} unit={m.units.liters} onCommit={setPlanningFuelPerLap} min={expectedFuelPerLap} max={1000} step={0.01} help={<TooltipHint>{m.fuel.planningHelp}</TooltipHint>} />
              <NumericField label={m.fuel.current} value={currentFuel} unit={m.units.liters} onCommit={setCurrentFuel} min={reserve} max={tankCapacity} step={0.1} />
              <NumericField label={m.fuel.capacity} value={tankCapacity} unit={m.units.liters} onCommit={(value) => { setTankCapacity(value); if (currentFuel > value) setCurrentFuel(value); if (reserve > value) setReserve(value) }} min={1} max={1000} step={0.1} />
              <NumericField label={m.fuel.reserve} value={reserve} unit={m.units.liters} onCommit={setReserve} min={0} max={Math.min(currentFuel, tankCapacity)} step={0.1} />
            </div>
            <small className="strategy-source-note">{m.provenance.evidence}</small>
          </Card>
          <Card>
            <CardHeader eyebrow={m.service.eyebrow} title={m.service.title} />
            <div className="field-group field-group--two">
              <NumericField label={m.service.pitLoss} value={pitLoss} unit={m.units.seconds} onCommit={setPitLoss} min={0} max={3600} step={0.1} help={<TooltipHint>{m.service.pitLossHelp}</TooltipHint>} />
              <NumericField label={m.service.refuelRate} value={refuelRate} unit={m.service.refuelUnit} onCommit={setRefuelRate} min={0.01} max={100} step={0.01} />
            </div>
            <small className="strategy-source-note">{m.service.concurrency}</small>
          </Card>
        </aside>

        <div className="strategy-results">
          {recommended && <Card className="strategy-verdict">
            <div className="strategy-verdict__icon"><ShieldCheck size={20} /></div>
            <div><div className="eyebrow">{m.verdict.eyebrow}</div><h2>{recommended.stopCount} {recommended.stopCount === 1 ? m.verdict.stop : m.verdict.stops} · {recommended.stints.length} {m.verdict.stints} · {projectedLaps} {m.units.laps}</h2><p>{m.verdict.rationale}</p></div>
            <Badge tone="positive">{result.minimumStops} {result.minimumStops === 1 ? m.verdict.stop : m.verdict.stops} {m.verdict.minimum}</Badge>
            <div className="strategy-verdict__metrics"><span><b>{formatNumber(expectedDemand, language, 1)} {m.units.liters}</b>{m.verdict.expectedDemand}</span><span><b>{formatNumber(planningDemand, language, 1)} {m.units.liters}</b>{m.verdict.planningDemand}</span><span><b>{formatNumber(recommended.projectedPitTimeSeconds, language, 1)} {m.units.seconds}</b>{m.alternatives.pitCost}</span></div>
          </Card>}
          {!recommended && <Card className="strategy-verdict strategy-verdict--infeasible">
            <div className="strategy-verdict__icon"><AlertTriangle size={20} /></div>
            <div><div className="eyebrow">{m.verdict.eyebrow}</div><h2>{m.verdict.infeasible}</h2><p>{m.verdict.infeasibleDetail}</p></div>
          </Card>}

          <Card className="strategy-candidates">
            <CardHeader eyebrow={m.alternatives.eyebrow} title={m.alternatives.title} description={m.alternatives.description} />
            <div className="scenario-grid" role="list">
              {result.candidates.map((candidate) => {
                const isRecommended = candidate.id === recommended?.id
                const isSelected = candidate.id === selected?.id
                const lapDelta = (recommended ? candidateDistance(recommended) : 0) - candidateDistance(candidate)
                return <button key={candidate.id} type="button" role="listitem" aria-pressed={isSelected} className={`scenario-card ${isSelected ? 'is-selected' : ''}`} onClick={() => setSelectedId(candidate.id)}>
                  <div className="scenario-card__top"><span className={`scenario-card__radio ${isSelected ? 'is-selected' : ''}`} /><strong>{candidate.stopCount} {candidate.stopCount === 1 ? m.verdict.stop : m.verdict.stops}</strong>{isRecommended && <Badge tone="accent">{m.alternatives.recommended}</Badge>}</div>
                  <div className="scenario-card__time">{candidateDistance(candidate)}<span>{m.units.laps}</span></div>
                  <div className="scenario-card__stats"><span><b>{candidate.stints.length}</b> {m.verdict.stints}</span><span><b>{formatNumber(candidate.projectedPitTimeSeconds, language, 1)} {m.units.seconds}</b> {m.alternatives.pitCost}</span><span><b>{formatNumber(candidate.expectedFuelAtFinishLitres, language, 1)} {m.units.liters}</b> {m.alternatives.finishFuel}</span></div>
                  {!isRecommended && <small className="scenario-card__delta">{lapDelta > 0 ? `−${lapDelta} ${m.alternatives.fewerLaps}` : m.alternatives.sameDistance}</small>}
                </button>
              })}
            </div>
            {result.candidates.length === 1 && <div className="strategy-empty-alternative"><Info size={15} /><span>{m.alternatives.noAlternative}</span></div>}
          </Card>

          {selected && <Card className="plan-card">
            <CardHeader eyebrow={m.plan.eyebrow} title={m.plan.title} action={<div className="plan-summary"><span><Timer size={14} /> {duration} {m.units.minutes}</span><span><Flag size={14} /> {projectedLaps} {m.units.laps}</span><span><Fuel size={14} /> {selected.stopCount} {selected.stopCount === 1 ? m.verdict.stop : m.verdict.stops}</span></div>} />
            <StrategyTimeline candidate={selected} language={language} />
            <div className="pit-table">
              <div className="pit-table__head"><span>{m.plan.stop}</span><span>{m.plan.afterLap}</span><span>{m.plan.fuelAdded}</span><span>{m.plan.exitTarget}</span><span>{m.plan.totalCost}</span></div>
              {selected.pitStops.map((stop) => <div key={stop.index}><strong>{String(stop.index).padStart(2, '0')}</strong><span>{stop.estimatedRaceLap}</span><span>+{formatNumber(stop.maximumFuelToAddLitres, language, 1)} {m.units.liters}</span><span>{formatNumber(stop.targetFuelOnExitLitres, language, 1)} {m.units.liters}</span><span>{formatNumber(stop.totalPitCostSeconds, language, 1)} {m.units.seconds}</span></div>)}
            </div>
          </Card>}

          <div className="strategy-bottom-grid">
            <Card>
              <CardHeader eyebrow={m.explanation.eyebrow} title={m.explanation.title} />
              <div className="strategy-explanation"><span><Clock3 size={15} /><b>{m.explanation.distance}</b></span><span><Fuel size={15} /><b>{m.explanation.fuel}</b></span><span><Gauge size={15} /><b>{m.explanation.objective}</b></span></div>
            </Card>
            <Card className="race-brief-card">
              <CardHeader eyebrow={m.brief.eyebrow} title={m.brief.title} />
              <div className="brief-numbers">
                <div><span>{m.brief.target}</span><strong>{formatNumber(planningFuelPerLap, language, 2)}</strong><small>{m.units.liters} / {m.units.lap}</small></div>
                <div><span>{m.brief.firstStop}</span><strong>{selected?.pitStops[0]?.estimatedRaceLap ?? '—'}</strong><small>{selected?.pitStops[0] ? m.brief.afterLap : m.brief.noStop}</small></div>
                <div><span>{m.brief.finish}</span><strong>{formatNumber(selected?.expectedFuelAtFinishLitres ?? currentFuel, language, 1)}</strong><small>{m.units.liters}</small></div>
              </div>
              <div className="brief-callout"><ShieldCheck size={16} /><span>{m.brief.reserve}</span></div>
            </Card>
          </div>

          <Card className="unsupported-card">
            <CardHeader eyebrow={m.unsupported.eyebrow} title={m.unsupported.title} action={<Badge tone="warning">{m.unsupported.unavailable}</Badge>} />
            <div className="unsupported-grid">{[m.unsupported.traffic, m.unsupported.weather, m.unsupported.tyres, m.unsupported.drivers, m.unsupported.energy].map((label) => <span key={label}><AlertTriangle size={14} /><b>{label}</b><em>{m.unsupported.unavailable}</em></span>)}</div>
            <p>{m.unsupported.note}</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
