import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Calculator, Check, Fuel, Gauge, Info, Radio, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Progress, Segmented, TooltipHint } from '../components/ui'
import { NumericField } from '../components/forms/NumericField'
import type { LiveFuelEstimate } from '../core'
import { buildFuelPlan } from '../engine'
import { defineMessages, useI18n, useMessages, type Language } from '../i18n'

type Mode = 'automatic' | 'manual'
type RaceKind = 'timed' | 'laps'

const STORAGE_KEY = 'apex:fuel-calculator'
const RECOVERY_STORAGE_KEY = `${STORAGE_KEY}:recovered`
const defaults = { raceKind: 'timed' as RaceKind, durationMinutes: 60, totalLaps: 30, averageLapSeconds: 124, fuelPerLap: 3.4, currentFuel: 40, tankCapacity: 90, reserve: 2, extraLap: false }
type FuelInputs = typeof defaults

const copy = defineMessages({
  heading: { eyebrow: 'Fuel calculator', title: 'Start with certainty. Finish with margin.', description: 'Calculate the fuel, stops and final stint from live clean laps or your own assumptions.', reset: 'Reset manual inputs' },
  mode: { aria: 'Calculation source', automatic: 'Automatic', manual: 'Manual', live: 'Live LMU data', local: 'Calculated locally' },
  automatic: { title: 'Automatic from your driving', ready: 'Live model ready', waiting: 'Learning your consumption', readyCopy: '{count} clean laps measured for {car} at {track}. Pit and refuel laps are excluded.', waitingCopy: 'Complete one clean lap without refuelling. Apex measures the fuel drop at the timing line; two or more laps improve confidence.', sample: 'Clean samples', currentFuel: 'Current fuel', tank: 'Tank capacity', useManual: 'Enter values manually instead' },
  race: { eyebrow: 'Race distance', title: 'What are you finishing?', aria: 'Race format', timed: 'Timed race', laps: 'Fixed laps', duration: 'Race duration', totalLaps: 'Race laps', averageLap: 'Average lap', extraLap: 'Mandatory lap after zero', extraLapHelp: 'Enable only when the event rules require a complete additional lap after the first crossing at zero.' },
  fuel: { eyebrow: 'Fuel model', title: 'Consumption and safety', perLap: 'Fuel per lap', current: 'Fuel currently in car', tank: 'Tank capacity', reserve: 'Finish reserve', sampleSpread: 'Sample range', conservative: 'Conservative planning rate' },
  result: { eyebrow: 'Recommended plan', total: 'Fuel required', expected: 'Expected use', stops: 'Pit stops', finalStint: 'Final stint fuel', start: 'Start with', add: 'Add before start', laps: 'Projected laps', confidence: 'Model confidence', noStops: 'No fuel stop', oneStop: '1 fuel stop', manyStops: '{count} fuel stops', comfortable: 'Comfortable margin', marginal: 'Boundary-sensitive', short: 'Fuel shortfall', extraRisk: '{probability}% chance of another lap near the timed finish', protected: 'The recommendation includes the conservative extra-lap and consumption bounds.', exact: 'Expected arithmetic plus reserve; recommendation adds uncertainty protection.' },
  stints: { eyebrow: 'Tank plan', title: 'Fuel load by stint', opening: 'Opening stint', stint: 'Stint {number}', liters: '{fuel} L', empty: 'No driving distance remains.' },
  explain: { eyebrow: 'What Apex used', title: 'Transparent assumptions', distance: 'Distance', pace: 'Pace model', consumption: 'Consumption model', reserve: 'Finish reserve', automatic: 'Measured clean laps only', manual: 'Manual input', timedBoundary: 'Timed boundary protected', fixedDistance: 'Fixed lap count', local: 'Everything is calculated on this PC. No account, upload or hidden reference data.' },
  units: { minutes: 'min', seconds: 's', lap: 'lap', laps: 'laps', liters: 'L', perLap: 'L/lap', percent: '%' },
}, {
  heading: { eyebrow: 'Kraftstoffrechner', title: 'Starte mit Gewissheit. Ziele mit Reserve.', description: 'Berechne Kraftstoff, Stopps und den letzten Stint aus sauberen Live-Runden oder eigenen Annahmen.', reset: 'Manuelle Eingaben zurücksetzen' },
  mode: { aria: 'Berechnungsquelle', automatic: 'Automatisch', manual: 'Manuell', live: 'Live-Daten aus LMU', local: 'Lokal berechnet' },
  automatic: { title: 'Automatisch aus deiner Fahrt', ready: 'Live-Modell bereit', waiting: 'Verbrauch wird gelernt', readyCopy: '{count} saubere Runden für {car} auf {track} gemessen. Boxen- und Tankrunden werden ausgeschlossen.', waitingCopy: 'Fahre eine saubere Runde ohne Nachtanken. Apex misst den Kraftstoffabfall an der Zeitlinie; ab zwei Runden steigt die Konfidenz.', sample: 'Saubere Messwerte', currentFuel: 'Aktueller Kraftstoff', tank: 'Tankkapazität', useManual: 'Werte stattdessen manuell eingeben' },
  race: { eyebrow: 'Renndistanz', title: 'Welche Distanz musst du beenden?', aria: 'Rennformat', timed: 'Zeitrennen', laps: 'Feste Rundenzahl', duration: 'Renndauer', totalLaps: 'Rennrunden', averageLap: 'Durchschnittsrunde', extraLap: 'Pflichtrunde nach Ablauf der Zeit', extraLapHelp: 'Nur aktivieren, wenn das Reglement nach der ersten Zieldurchfahrt bei null eine vollständige Zusatzrunde verlangt.' },
  fuel: { eyebrow: 'Kraftstoffmodell', title: 'Verbrauch und Sicherheit', perLap: 'Kraftstoff pro Runde', current: 'Kraftstoff im Auto', tank: 'Tankkapazität', reserve: 'Zielreserve', sampleSpread: 'Messwertbereich', conservative: 'Konservative Planungsrate' },
  result: { eyebrow: 'Empfohlener Plan', total: 'Benötigter Kraftstoff', expected: 'Erwarteter Verbrauch', stops: 'Boxenstopps', finalStint: 'Kraftstoff im letzten Stint', start: 'Startmenge', add: 'Vor dem Start nachtanken', laps: 'Prognostizierte Runden', confidence: 'Modellkonfidenz', noStops: 'Kein Tankstopp', oneStop: '1 Tankstopp', manyStops: '{count} Tankstopps', comfortable: 'Komfortable Reserve', marginal: 'Empfindliche Zielgrenze', short: 'Kraftstoffdefizit', extraRisk: '{probability} % Wahrscheinlichkeit einer Zusatzrunde nahe dem Zeitlimit', protected: 'Die Empfehlung berücksichtigt konservative Grenzen für Zusatzrunde und Verbrauch.', exact: 'Erwartungswert plus Reserve; die Empfehlung ergänzt einen Unsicherheitspuffer.' },
  stints: { eyebrow: 'Tankplan', title: 'Kraftstoffmenge je Stint', opening: 'Startstint', stint: 'Stint {number}', liters: '{fuel} l', empty: 'Es verbleibt keine Fahrdistanz.' },
  explain: { eyebrow: 'Grundlage der Berechnung', title: 'Transparente Annahmen', distance: 'Distanz', pace: 'Tempomodell', consumption: 'Verbrauchsmodell', reserve: 'Zielreserve', automatic: 'Nur gemessene saubere Runden', manual: 'Manuelle Eingabe', timedBoundary: 'Zeitgrenze abgesichert', fixedDistance: 'Feste Rundenzahl', local: 'Alles wird auf diesem PC berechnet. Kein Konto, kein Upload und keine versteckten Referenzdaten.' },
  units: { minutes: 'Min.', seconds: 's', lap: 'Runde', laps: 'Runden', liters: 'l', perLap: 'l/Runde', percent: '%' },
})

function number(value: number, language: Language, digits = 1) {
  return new Intl.NumberFormat(language, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

function safe(value: number, fallback: number, minimum = 0) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback
}

const numericRules: Record<Exclude<keyof FuelInputs, 'raceKind' | 'extraLap'>, { min: number; max: number; integer?: boolean }> = {
  durationMinutes: { min: 1, max: 1440 }, totalLaps: { min: 1, max: 10000, integer: true }, averageLapSeconds: { min: 10, max: 3600 },
  fuelPerLap: { min: 0.01, max: 1000 }, currentFuel: { min: 0, max: 1000 }, tankCapacity: { min: 1, max: 1000 }, reserve: { min: 0, max: 1000 },
}

export function loadFuelCalculatorInputs(storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage): { inputs: FuelInputs; recoveredFields: string[] } {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return { inputs: { ...defaults }, recoveredFields: [] }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch {
    storage.setItem(RECOVERY_STORAGE_KEY, raw)
    return { inputs: { ...defaults }, recoveredFields: ['json'] }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    storage.setItem(RECOVERY_STORAGE_KEY, raw)
    return { inputs: { ...defaults }, recoveredFields: ['root'] }
  }
  const source = parsed as Record<string, unknown>
  const inputs = { ...defaults }
  const recoveredFields: string[] = []
  if (source.raceKind === 'timed' || source.raceKind === 'laps') inputs.raceKind = source.raceKind
  else if ('raceKind' in source) recoveredFields.push('raceKind')
  if (typeof source.extraLap === 'boolean') inputs.extraLap = source.extraLap
  else if ('extraLap' in source) recoveredFields.push('extraLap')
  for (const [key, rule] of Object.entries(numericRules) as Array<[keyof typeof numericRules, (typeof numericRules)[keyof typeof numericRules]]>) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= rule.min && value <= rule.max && (!rule.integer || Number.isInteger(value))) inputs[key] = value
    else if (key in source) recoveredFields.push(key)
  }
  if (recoveredFields.length) storage.setItem(RECOVERY_STORAGE_KEY, raw)
  return { inputs, recoveredFields }
}

export function FuelCalculatorView({ live }: { live: LiveFuelEstimate | null }) {
  const m = useMessages(copy)
  const { language } = useI18n()
  const [mode, setMode] = useState<Mode>(() => live?.fuelSamplesLiters.length ? 'automatic' : 'manual')
  const [loaded] = useState(() => loadFuelCalculatorInputs())
  const [inputs, setInputs] = useState(loaded.inputs)
  const automaticReady = Boolean(live && live.fuelSamplesLiters.length > 0)
  const patch = (next: Partial<typeof defaults>) => setInputs((current) => ({ ...current, ...next }))
  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs)) }, [inputs])
  useEffect(() => {
    if (loaded.recoveredFields.length) void window.apexDesktop?.reportError({ message: `Recovered invalid fuel calculator fields: ${loaded.recoveredFields.join(', ')}`, context: 'fuel-calculator-storage' })
  }, [loaded.recoveredFields])

  const effectiveRaceKind: RaceKind = mode === 'automatic' && live?.totalLaps ? 'laps' : mode === 'automatic' && live?.durationSeconds ? 'timed' : inputs.raceKind
  const samples = mode === 'automatic' && automaticReady ? live!.fuelSamplesLiters : [safe(inputs.fuelPerLap, defaults.fuelPerLap, 0.01)]
  const lapTimes = mode === 'automatic' && live?.lapTimeSamplesSeconds.length ? live.lapTimeSamplesSeconds : [safe(inputs.averageLapSeconds, defaults.averageLapSeconds, 1)]
  const currentFuel = safe(mode === 'automatic' && live ? live.currentFuelLiters : inputs.currentFuel, defaults.currentFuel)
  const tank = safe(mode === 'automatic' && live?.tankCapacityLiters ? live.tankCapacityLiters : inputs.tankCapacity, defaults.tankCapacity, 1)
  const race = effectiveRaceKind === 'laps'
    ? { kind: 'laps' as const, totalLaps: safe(mode === 'automatic' && live?.totalLaps ? live.totalLaps : inputs.totalLaps, defaults.totalLaps), completedLaps: safe(mode === 'automatic' && live ? live.completedLaps : 0, 0), currentLapProgress: mode === 'automatic' && live ? live.currentLapProgress : 0 }
    : { kind: 'timed' as const, durationSeconds: safe(mode === 'automatic' && live?.durationSeconds ? live.durationSeconds : inputs.durationMinutes * 60, defaults.durationMinutes * 60), elapsedSeconds: safe(mode === 'automatic' && live ? live.elapsedSeconds : 0, 0), currentLapProgress: mode === 'automatic' && live ? live.currentLapProgress : 0, lapTimeSamplesSeconds: lapTimes, finishRule: inputs.extraLap ? 'line-after-zero-plus-one' as const : 'line-after-zero' as const }
  const reserve = safe(inputs.reserve, defaults.reserve)
  const plan = useMemo(() => buildFuelPlan({ race, perLapSamplesLiters: samples, tankCapacityLiters: tank, currentFuelLiters: Math.min(currentFuel, tank), reserveLiters: reserve, calculationPoint: mode === 'automatic' ? 'in-race' : 'pre-race' }), [race, samples, tank, currentFuel, reserve, mode])
  const confidence = Math.round(plan.fuel.confidence.score * 100)
  const spread = `${number(Math.min(...samples), language, 2)}–${number(Math.max(...samples), language, 2)}`
  const stopsLabel = plan.pitStops === 0 ? m.result.noStops : plan.pitStops === 1 ? m.result.oneStop : m.result.manyStops.replace('{count}', String(plan.pitStops))

  return <div className="view view--fuel" data-feedback-redact={mode === 'automatic' ? 'measured-fuel-model' : undefined}>
    <div className="page-heading">
      <div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.heading.title}</h1><p>{m.heading.description}</p></div>
      <Button variant="secondary" icon={<RotateCcw size={15} />} onClick={() => setInputs(defaults)}>{m.heading.reset}</Button>
    </div>

    <div className="fuel-mode-bar"><Segmented value={mode} onChange={setMode} ariaLabel={m.mode.aria} options={[{ value: 'automatic', label: m.mode.automatic }, { value: 'manual', label: m.mode.manual }]} /><span><ShieldCheck size={14} /> {m.mode.local}</span></div>

    {mode === 'automatic' && <Card className={`fuel-auto-card ${automaticReady ? 'is-ready' : ''}`}>
      <div className="fuel-auto-card__icon">{automaticReady ? <Radio size={22} /> : <Gauge size={22} />}</div>
      <div><Badge tone={automaticReady ? 'positive' : 'neutral'} dot>{automaticReady ? m.automatic.ready : m.automatic.waiting}</Badge><h2>{m.automatic.title}</h2><p>{automaticReady ? m.automatic.readyCopy.replace('{count}', String(live!.fuelSamplesLiters.length)).replace('{car}', live!.carName).replace('{track}', live!.trackName) : m.automatic.waitingCopy}</p></div>
      {automaticReady ? <div className="fuel-auto-card__stats"><span><small>{m.automatic.sample}</small><strong>{live!.fuelSamplesLiters.length}</strong></span><span><small>{m.automatic.currentFuel}</small><strong>{number(currentFuel, language)} {m.units.liters}</strong></span><span><small>{m.automatic.tank}</small><strong>{number(tank, language)} {m.units.liters}</strong></span></div> : <Button variant="secondary" onClick={() => setMode('manual')}>{m.automatic.useManual}</Button>}
    </Card>}

    {(mode !== 'automatic' || automaticReady) && <div className="fuel-calculator-layout">
      <aside className="fuel-inputs">
        <Card><CardHeader eyebrow={m.race.eyebrow} title={m.race.title} />
          {mode === 'manual' ? <Segmented value={effectiveRaceKind} onChange={(value) => patch({ raceKind: value })} ariaLabel={m.race.aria} options={[{ value: 'timed', label: m.race.timed }, { value: 'laps', label: m.race.laps }]} /> : <Badge tone="positive">{effectiveRaceKind === 'timed' ? m.race.timed : m.race.laps}</Badge>}
          <div className="field-group field-group--two">
            {effectiveRaceKind === 'timed' ? <NumericField label={m.race.duration} value={mode === 'automatic' && live?.durationSeconds ? live.durationSeconds / 60 : inputs.durationMinutes} unit={m.units.minutes} min={1} max={1440} step={1} disabled={mode === 'automatic'} onCommit={(durationMinutes) => patch({ durationMinutes })} /> : <NumericField label={m.race.totalLaps} value={mode === 'automatic' && live?.totalLaps ? live.totalLaps : inputs.totalLaps} unit={m.units.laps} min={1} max={10000} step={1} integer disabled={mode === 'automatic'} onCommit={(totalLaps) => patch({ totalLaps })} />}
            <NumericField label={m.race.averageLap} value={mode === 'automatic' ? lapTimes.reduce((sum, value) => sum + value, 0) / lapTimes.length : inputs.averageLapSeconds} unit={m.units.seconds} min={10} max={3600} step={0.1} disabled={mode === 'automatic'} onCommit={(averageLapSeconds) => patch({ averageLapSeconds })} />
          </div>
          {effectiveRaceKind === 'timed' && <label className="toggle-row"><span><b>{m.race.extraLap}</b><small>{m.race.extraLapHelp}</small></span><input type="checkbox" checked={inputs.extraLap} onChange={(event) => patch({ extraLap: event.target.checked })} /></label>}
        </Card>
        <Card><CardHeader eyebrow={m.fuel.eyebrow} title={m.fuel.title} />
          <div className="field-group field-group--two">
            <NumericField label={m.fuel.perLap} value={mode === 'automatic' && automaticReady ? plan.fuel.perLap.mean : inputs.fuelPerLap} unit={m.units.perLap} min={0.01} max={1000} step={0.01} disabled={mode === 'automatic'} onCommit={(fuelPerLap) => patch({ fuelPerLap })} />
            <NumericField label={m.fuel.current} value={currentFuel} unit={m.units.liters} min={0} max={1000} step={0.1} disabled={mode === 'automatic'} onCommit={(currentFuel) => patch({ currentFuel })} />
            <NumericField label={m.fuel.tank} value={tank} unit={m.units.liters} min={1} max={1000} step={0.1} disabled={mode === 'automatic'} onCommit={(tankCapacity) => patch({ tankCapacity })} />
            <NumericField label={m.fuel.reserve} value={inputs.reserve} unit={m.units.liters} min={0} max={1000} step={0.1} onCommit={(reserve) => patch({ reserve })} />
          </div>
          <div className="fuel-model-facts"><span>{m.fuel.sampleSpread}<strong>{spread} {m.units.perLap}</strong></span><span>{m.fuel.conservative}<strong>{number(plan.fuel.perLap.conservative, language, 2)} {m.units.perLap}</strong></span></div>
        </Card>
      </aside>

      <div className="fuel-results">
        <Card className="fuel-hero-result"><div className="fuel-hero-result__icon"><Fuel size={24} /></div><div><div className="eyebrow">{m.result.eyebrow}</div><span>{m.result.total}</span><strong>{number(plan.recommendedFuelLiters, language, 1)} <i>{m.units.liters}</i></strong><small>{m.result.protected}</small></div><Badge tone={plan.pitStops > 0 ? 'accent' : 'positive'}>{stopsLabel}</Badge></Card>
        <div className="fuel-result-grid">
          <Card><span>{m.result.expected}</span><strong>{number(plan.expectedFuelLiters, language, 1)} {m.units.liters}</strong><small>{m.result.exact}</small></Card>
          <Card><span>{m.result.stops}</span><strong>{plan.pitStops}</strong><small>{stopsLabel}</small></Card>
          <Card><span>{m.result.finalStint}</span><strong>{number(plan.finalStintFuelLiters, language, 1)} {m.units.liters}</strong><small>{m.stints.stint.replace('{number}', String(plan.stintFuelLoadsLiters.length))}</small></Card>
          <Card><span>{mode === 'manual' ? m.result.start : m.result.laps}</span><strong>{mode === 'manual' ? `${number(plan.openingFuelTargetLiters, language, 1)} ${m.units.liters}` : number(plan.race.conservativeLapEquivalents, language, 1)}</strong><small>{mode === 'manual' ? `${m.result.add}: ${number(plan.fuelToAddBeforeStartLiters, language, 1)} ${m.units.liters}` : m.units.laps}</small></Card>
        </div>
        <Card className="fuel-stint-card"><CardHeader eyebrow={m.stints.eyebrow} title={m.stints.title} action={<Badge tone="neutral">{plan.stintFuelLoadsLiters.length}</Badge>} />
          <div className="fuel-stint-bars">{plan.stintFuelLoadsLiters.map((load, index) => <div key={index}><span><b>{index === 0 ? m.stints.opening : m.stints.stint.replace('{number}', String(index + 1))}</b><strong>{m.stints.liters.replace('{fuel}', number(load, language, 1))}</strong></span><i><b style={{ width: `${Math.min(100, load / Math.max(tank, 1) * 100)}%` }} /></i></div>)}</div>
        </Card>
        <Card className="fuel-confidence"><div><Sparkles size={17} /><span><b>{m.result.confidence}</b><small>{confidence}{m.units.percent}</small></span></div><Progress value={confidence} tone={confidence >= 70 ? 'positive' : 'warning'} />{plan.race.extraLapRisk?.possible && <p><AlertTriangle size={14} /> {m.result.extraRisk.replace('{probability}', String(Math.round(plan.race.extraLapRisk.probability * 100)))}</p>}</Card>
        <Card><CardHeader eyebrow={m.explain.eyebrow} title={m.explain.title} action={<Calculator size={18} />} /><div className="fuel-assumptions"><span><Check size={14} /><b>{m.explain.distance}</b>{effectiveRaceKind === 'timed' ? m.explain.timedBoundary : m.explain.fixedDistance}</span><span><Check size={14} /><b>{m.explain.pace}</b>{number(plan.fuel.perLap.sampleSize, language, 0)} {plan.fuel.perLap.sampleSize === 1 ? m.units.lap : m.units.laps}</span><span><Check size={14} /><b>{m.explain.consumption}</b>{mode === 'automatic' ? m.explain.automatic : m.explain.manual}</span><span><Check size={14} /><b>{m.explain.reserve}</b>{number(reserve, language, 1)} {m.units.liters}</span></div><div className="strategy-recommendation"><Info size={16} /><div><span>{m.explain.local}</span></div></div></Card>
      </div>
    </div>}
  </div>
}
