import {
  AlertTriangle,
  Clock3,
  Flag,
  Fuel,
  Gauge,
  Info,
  Radio,
  RotateCcw,
  Save,
  ShieldCheck,
  Timer,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NumericField } from '../components/forms/NumericField'
import { Badge, Button, Card, CardHeader, Segmented, TooltipHint } from '../components/ui'
import type { LiveFuelEstimate } from '../core'
import {
  buildLiveFuelPlan,
  compareLiveFuelPlans,
  generateTimedStrategyCandidates,
  summarizeLiveFuelPlan,
  type LiveFuelPlanChange,
  type LiveFuelPlanMissing,
  type LiveFuelPlanSnapshot,
  type LiveFuelPlanSummary,
  type StrategyCandidate,
  type StrategyResult,
} from '../engine'
import { formatMessage, useI18n, useMessages, type Language } from '../i18n'
import { strategyMessages } from '../i18n/strategyMessages'

type Mode = 'manual' | 'live'
const MODE_KEY = 'apex:strategy-mode'
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
  extraLap: false,
} as const

function formatNumber(value: number, language: Language, digits: number) {
  return new Intl.NumberFormat(language, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

function candidateDistance(candidate: StrategyCandidate) {
  return candidate.stints.reduce((total, stint) => total + stint.lapEquivalents, 0)
}

function StrategyTimeline({ candidate, language }: { candidate: StrategyCandidate; language: Language }) {
  const m = useMessages(strategyMessages)
  const distance = candidateDistance(candidate)
  const scale = Math.max(distance, 1)
  let cumulative = 0
  return <div className="strategy-timeline strategy-timeline--calculated">
    <div className="strategy-timeline__track" aria-label={String(candidate.stints.length) + ' ' + m.verdict.stints}>
      {candidate.stints.map((stint, index) => {
        const left = cumulative / scale * 100
        cumulative += stint.lapEquivalents
        return <span key={stint.index} className="stint" style={{ left: String(left) + '%', width: String(stint.lapEquivalents / scale * 100) + '%' }} data-stint={index % 3} />
      })}
      {candidate.pitStops.map((stop) => <span key={stop.index} className="stop" style={{ left: String(stop.afterLapEquivalentsFromNow / scale * 100) + '%' }}><i /><b>{m.plan.stop} {stop.index}</b></span>)}
    </div>
    <div className="strategy-timeline__axis"><span>{m.plan.start}</span><span>{formatNumber(distance / 2, language, 1)} {m.units.laps}</span><span>{formatNumber(distance, language, 2)} {m.units.laps} · {m.plan.finish}</span></div>
    <div className="strategy-timeline__stints">
      {candidate.stints.map((stint) => <div key={stint.index}><i data-stint={(stint.index - 1) % 3} /><span><strong>{m.plan.stint} {stint.index}</strong><small>{formatNumber(stint.lapEquivalents, language, 2)} {m.units.laps} · {formatNumber(stint.conservativeFuelUseLitres, language, 1)} {m.units.liters} {m.plan.uses}</small></span></div>)}
    </div>
  </div>
}

export function StrategyView({ live = null }: { live?: LiveFuelEstimate | null }) {
  const m = useMessages(strategyMessages)
  const { language } = useI18n()
  const [mode, setMode] = useState<Mode>(() => {
    try { return window.localStorage.getItem(MODE_KEY) === 'live' ? 'live' : 'manual' } catch { return 'manual' }
  })
  const [duration, setDuration] = useState<number>(defaults.duration)
  const [lapTime, setLapTime] = useState<number>(defaults.lapTime)
  const [expectedFuelPerLap, setExpectedFuelPerLap] = useState<number>(defaults.expectedFuelPerLap)
  const [planningFuelPerLap, setPlanningFuelPerLap] = useState<number>(defaults.planningFuelPerLap)
  const [currentFuel, setCurrentFuel] = useState<number>(defaults.currentFuel)
  const [tankCapacity, setTankCapacity] = useState<number>(defaults.tankCapacity)
  const [reserve, setReserve] = useState<number>(defaults.reserve)
  const [pitLoss, setPitLoss] = useState<number>(defaults.pitLoss)
  const [refuelRate, setRefuelRate] = useState<number>(defaults.refuelRate)
  const [extraLap, setExtraLap] = useState<boolean>(defaults.extraLap)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [planChanges, setPlanChanges] = useState<readonly LiveFuelPlanChange[]>([])
  const previousSummary = useRef<LiveFuelPlanSummary | null>(null)
  const previousSessionId = useRef<string | null>(null)

  const setStrategyMode = (next: Mode) => {
    setMode(next)
    try { window.localStorage.setItem(MODE_KEY, next) } catch { /* The view remains usable without persistence. */ }
    setSelectedId(null)
  }

  const manualResult = useMemo(() => generateTimedStrategyCandidates({
    durationSeconds: duration * 60,
    currentFuelLitres: currentFuel,
    tankCapacityLitres: tankCapacity,
    fuel: { mean: expectedFuelPerLap, conservative: planningFuelPerLap },
    fuelReserveLitres: reserve,
    averageLapTimeSeconds: lapTime,
    pitLaneLossSeconds: pitLoss,
    refuelLitresPerSecond: refuelRate,
    finishRule: extraLap ? 'line-after-zero-plus-one' : 'line-after-zero',
    serviceConcurrency: 'parallel',
  }), [currentFuel, duration, expectedFuelPerLap, extraLap, lapTime, pitLoss, planningFuelPerLap, refuelRate, reserve, tankCapacity])

  const liveModel = useMemo<LiveFuelPlanSnapshot | null>(() => live ? {
    sessionId: live.sessionId,
    sessionKind: 'unknown',
    trackName: live.trackName,
    carName: live.carName,
    fuelSamplesLiters: live.fuelSamplesLiters,
    lapTimeSamplesSeconds: live.lapTimeSamplesSeconds,
    sessionFuelSampleCount: live.sessionFuelSampleCount,
    sessionLapTimeSampleCount: live.sessionLapTimeSampleCount,
    currentFuelLiters: live.currentFuelLiters,
    tankCapacityLiters: live.tankCapacityLiters,
    completedLaps: live.completedLaps,
    currentLapProgress: live.currentLapProgress,
    totalLaps: live.totalLaps,
    durationSeconds: live.durationSeconds,
    elapsedSeconds: live.elapsedSeconds,
    modelRevision: live.modelRevision,
    modelEvent: live.modelEvent,
    lastAcceptedLap: live.lastAcceptedLap,
    calibrationExclusion: live.calibrationExclusion,
  } : null,
  // Candidate generation is deliberately keyed to accepted model events or
  // manual assumptions, not 50 Hz fuel frames. An assumption edit therefore
  // captures the latest current fuel/progress exactly once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [extraLap, live?.sessionId, live?.modelRevision, pitLoss, refuelRate, reserve])

  const livePlan = useMemo(() => buildLiveFuelPlan(liveModel, {
    reserveLiters: reserve,
    pitLaneLossSeconds: pitLoss,
    refuelLitersPerSecond: refuelRate,
    finishRule: extraLap ? 'line-after-zero-plus-one' : 'line-after-zero',
  }), [extraLap, liveModel, pitLoss, refuelRate, reserve])
  const liveSummary = useMemo(() => summarizeLiveFuelPlan(livePlan, liveModel?.fuelSamplesLiters.length ?? 0), [liveModel?.fuelSamplesLiters.length, livePlan])

  useEffect(() => {
    if (mode !== 'live' || !liveSummary) return
    const sessionId = liveModel?.sessionId ?? null
    if (previousSessionId.current !== sessionId) {
      previousSessionId.current = sessionId
      previousSummary.current = null
    }
    const previous = previousSummary.current
    const unchanged = previous
      && previous.modelRevision === liveSummary.modelRevision
      && previous.sampleCount === liveSummary.sampleCount
      && previous.planningFuelPerLap === liveSummary.planningFuelPerLap
      && previous.stopCount === liveSummary.stopCount
      && previous.nextStopLap === liveSummary.nextStopLap
      && previous.reserveState === liveSummary.reserveState
    // React Strict Mode re-runs effects in development. Keep the first adoption
    // explanation instead of replacing it with a no-op comparison.
    if (unchanged) return
    setPlanChanges(compareLiveFuelPlans(previous, liveSummary, liveModel?.modelEvent ?? null))
    previousSummary.current = liveSummary
  }, [liveModel?.modelEvent, liveModel?.sessionId, liveSummary, mode])

  const activeResult: StrategyResult | null = mode === 'manual'
    ? manualResult
    : livePlan.status === 'ready' ? livePlan.strategy : null
  const recommended = activeResult?.recommended
  const selected = activeResult?.candidates.find((candidate) => candidate.id === selectedId) ?? recommended
  const projectedLaps = selected ? candidateDistance(selected) : mode === 'live' && livePlan.status === 'ready' ? livePlan.remainingLapEquivalents : manualResult.projectedLapCount
  const activeExpectedRate = mode === 'live' && livePlan.status === 'ready' ? livePlan.expectedFuelPerLap : expectedFuelPerLap
  const activePlanningRate = mode === 'live' && livePlan.status === 'ready' ? livePlan.planningFuelPerLap : planningFuelPerLap
  const expectedDemand = projectedLaps * activeExpectedRate + reserve
  const planningDemand = projectedLaps * activePlanningRate + reserve
  const currentVisibleFuel = mode === 'live' ? live?.currentFuelLiters ?? 0 : currentFuel
  const conservativeRange = Math.max(0, currentVisibleFuel - reserve) / Math.max(activePlanningRate, 0.000001)
  const livePaused = mode === 'live' && live?.calibrationExclusion
  const profileFuelSamples = Math.max(0, (liveModel?.fuelSamplesLiters.length ?? 0) - (liveModel?.sessionFuelSampleCount ?? 0))

  const missingLabel = (reason: LiveFuelPlanMissing) => ({
    'live-session': m.missing.liveSession,
    'fuel-evidence': m.missing.fuelEvidence,
    'pace-evidence': m.missing.paceEvidence,
    'race-distance': m.missing.raceDistance,
    'current-fuel': m.missing.currentFuel,
    'tank-capacity': m.missing.tankCapacity,
    'manual-assumptions': m.missing.manualAssumptions,
  })[reason]
  const changeText = (change: LiveFuelPlanChange) => {
    if (change === 'adopted') return m.changes.adopted
    if (change === 'consumption') return formatMessage(m.changes.consumption, { count: liveSummary?.sampleCount ?? 0 })
    if (change === 'next-stop') return liveSummary?.nextStopLap === null ? m.changes.noNextStop : formatMessage(m.changes.nextStop, { lap: liveSummary?.nextStopLap ?? '—' })
    if (change === 'stop-count') return formatMessage(m.changes.stopCount, { count: liveSummary?.stopCount ?? 0 })
    if (change === 'reserve-state') return formatMessage(m.changes.reserveState, { state: liveSummary ? m.states[liveSummary.reserveState] : '—' })
    return m.changes.refuel
  }

  const reset = () => {
    setDuration(defaults.duration); setLapTime(defaults.lapTime)
    setExpectedFuelPerLap(defaults.expectedFuelPerLap); setPlanningFuelPerLap(defaults.planningFuelPerLap)
    setCurrentFuel(defaults.currentFuel); setTankCapacity(defaults.tankCapacity)
    setReserve(defaults.reserve); setPitLoss(defaults.pitLoss); setRefuelRate(defaults.refuelRate)
    setExtraLap(defaults.extraLap); setSelectedId(null)
  }

  return <div className="view view--strategy" data-feedback-redact={mode === 'live' ? 'measured-fuel-model' : undefined}>
    <div className="page-heading">
      <div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.heading.title}</h1><p>{m.heading.description}</p></div>
      <div className="page-heading__actions"><Button variant="secondary" icon={<RotateCcw size={16} />} onClick={reset}>{m.heading.reset}</Button><Button icon={<Save size={16} />} disabled>{m.heading.saveUnavailable}</Button></div>
    </div>

    <div className="strategy-mode-bar"><Segmented value={mode} onChange={setStrategyMode} ariaLabel={m.mode.aria} options={[{ value: 'manual', label: m.mode.manual }, { value: 'live', label: m.mode.live }]} /><span><ShieldCheck size={14} /> {m.mode.local}</span></div>
    <div className={'data-provenance-banner' + (livePaused ? ' is-error' : '')}>
      <Badge tone={mode === 'live' && livePlan.status === 'ready' && !livePaused ? 'positive' : 'warning'}>{mode === 'live' ? livePaused ? m.provenance.paused : m.provenance.liveBadge : m.provenance.manualBadge}</Badge>
      <span>{mode === 'manual' ? m.provenance.manualDescription : !liveModel ? m.provenance.waitingDescription : livePaused === 'non-local-control' ? m.provenance.pausedNonLocal : livePaused === 'session-only' ? m.provenance.pausedSession : m.provenance.liveDescription}</span>
    </div>

    {mode === 'live' && livePlan.status === 'unavailable' && <Card className="strategy-live-unavailable">
      <AlertTriangle size={24} /><div><h2>{m.missing.title}</h2><p>{m.missing.description}</p><ul>{livePlan.missing.map((reason) => <li key={reason}>{missingLabel(reason)}</li>)}</ul></div>
    </Card>}

    <div className="strategy-layout">
      <aside className="strategy-inputs">
        <Card>
          <CardHeader eyebrow={m.event.eyebrow} title={m.event.title} action={<TooltipHint>{m.event.help}</TooltipHint>} />
          {mode === 'manual' ? <div className="field-group">
            <NumericField label={m.event.duration} value={duration} unit={m.units.minutes} onCommit={setDuration} min={10} max={1440} step={1} integer />
            <NumericField label={m.event.lapTime} value={lapTime} unit={m.units.seconds} onCommit={setLapTime} min={30} max={3600} step={0.1} />
          </div> : <div className="strategy-live-facts">
            <span><small>{m.event.format}</small><strong>{liveModel?.totalLaps !== null && liveModel?.totalLaps !== undefined ? m.event.fixed : liveModel?.durationSeconds ? m.event.timed : '—'}</strong></span>
            <span><small>{liveModel?.totalLaps !== null && liveModel?.totalLaps !== undefined ? m.event.totalLaps : m.event.duration}</small><strong>{liveModel?.totalLaps ?? (liveModel?.durationSeconds ? formatNumber(liveModel.durationSeconds / 60, language, 0) + ' ' + m.units.minutes : '—')}</strong></span>
            <span><small>{m.event.completed}</small><strong>{liveModel?.completedLaps ?? '—'}</strong></span>
            <span><small>{m.event.progress}</small><strong>{liveModel ? formatNumber(liveModel.currentLapProgress * 100, language, 0) + '%' : '—'}</strong></span>
          </div>}
          {(mode === 'manual' || liveModel?.durationSeconds) && <label className="toggle-row"><span><b>{m.event.finishRule}</b><small>{m.event.finishRuleHelp}</small></span><input type="checkbox" checked={extraLap} onChange={(event) => setExtraLap(event.target.checked)} /></label>}
          <small className="strategy-source-note">{mode === 'live' ? m.provenance.unknownKind : m.provenance.manualSource}</small>
        </Card>

        <Card>
          <CardHeader eyebrow={m.fuel.eyebrow} title={m.fuel.title} action={<Badge tone={mode === 'live' ? 'positive' : 'neutral'}>{mode === 'live' ? m.provenance.liveSource : m.provenance.manualSource}</Badge>} />
          {mode === 'manual' ? <div className="field-group field-group--two">
            <NumericField label={m.fuel.expectedRate} value={expectedFuelPerLap} unit={m.units.liters} onCommit={(value) => { setExpectedFuelPerLap(value); if (value > planningFuelPerLap) setPlanningFuelPerLap(value) }} min={0.01} max={1000} step={0.01} />
            <NumericField label={m.fuel.planningRate} value={planningFuelPerLap} unit={m.units.liters} onCommit={setPlanningFuelPerLap} min={expectedFuelPerLap} max={1000} step={0.01} help={<TooltipHint>{m.fuel.planningHelp}</TooltipHint>} />
            <NumericField label={m.fuel.start} value={currentFuel} unit={m.units.liters} onCommit={setCurrentFuel} min={reserve} max={tankCapacity} step={0.1} />
            <NumericField label={m.fuel.capacity} value={tankCapacity} unit={m.units.liters} onCommit={(value) => { setTankCapacity(value); if (currentFuel > value) setCurrentFuel(value); if (reserve > value) setReserve(value) }} min={1} max={1000} step={0.1} />
            <NumericField label={m.fuel.reserve} value={reserve} unit={m.units.liters} onCommit={setReserve} min={0} max={Math.min(currentFuel, tankCapacity)} step={0.1} />
          </div> : <>
            <div className="strategy-live-facts">
              <span><small>{m.fuel.expectedRate}</small><strong>{livePlan.status === 'ready' ? formatNumber(livePlan.expectedFuelPerLap, language, 2) + ' ' + m.units.liters : '—'}</strong></span>
              <span><small>{m.fuel.planningRate}</small><strong>{livePlan.status === 'ready' ? formatNumber(livePlan.planningFuelPerLap, language, 2) + ' ' + m.units.liters : '—'}</strong></span>
              <span><small>{m.fuel.current}</small><strong>{live ? formatNumber(live.currentFuelLiters, language, 1) + ' ' + m.units.liters : '—'}</strong></span>
              <span><small>{m.fuel.capacity}</small><strong>{liveModel ? formatNumber(liveModel.tankCapacityLiters, language, 1) + ' ' + m.units.liters : '—'}</strong></span>
              <span><small>{m.fuel.samples}</small><strong>{liveModel?.fuelSamplesLiters.length ?? 0}</strong></span>
              <span><small>{m.fuel.range}</small><strong>{liveModel?.fuelSamplesLiters.length ? formatNumber(Math.min(...liveModel.fuelSamplesLiters), language, 2) + '–' + formatNumber(Math.max(...liveModel.fuelSamplesLiters), language, 2) : '—'}</strong></span>
            </div>
            <div className="field-group"><NumericField label={m.fuel.reserve} value={reserve} unit={m.units.liters} onCommit={setReserve} min={0} max={liveModel?.tankCapacityLiters ?? 1000} step={0.1} /></div>
          </>}
          <small className="strategy-source-note">{mode === 'live' ? formatMessage(m.fuel.evidence, { session: liveModel?.sessionFuelSampleCount ?? 0, profile: profileFuelSamples }) : m.provenance.manualEvidence}</small>
        </Card>

        <Card>
          <CardHeader eyebrow={m.service.eyebrow} title={m.service.title} action={<Badge tone="neutral">{m.service.source}</Badge>} />
          <div className="field-group field-group--two">
            <NumericField label={m.service.pitLoss} value={pitLoss} unit={m.units.seconds} onCommit={setPitLoss} min={0} max={3600} step={0.1} help={<TooltipHint>{m.service.pitLossHelp}</TooltipHint>} />
            <NumericField label={m.service.refuelRate} value={refuelRate} unit={m.service.refuelUnit} onCommit={setRefuelRate} min={0.01} max={100} step={0.01} />
          </div>
          <small className="strategy-source-note">{m.service.concurrency}</small>
        </Card>
      </aside>

      <div className="strategy-results">
        {mode === 'live' && livePlan.status === 'ready' && <section className="strategy-live-metrics" aria-label={m.provenance.liveBadge}>
          <div><small>{m.liveMetrics.fuel}</small><strong>{formatNumber(currentVisibleFuel, language, 1)} {m.units.liters}</strong></div>
          <div><small>{m.liveMetrics.range}</small><strong>{formatNumber(conservativeRange, language, 1)} {m.units.laps}</strong></div>
          <div><small>{m.liveMetrics.stops}</small><strong>{activeResult?.minimumStops ?? '—'}</strong></div>
          <div><small>{m.liveMetrics.next}</small><strong>{recommended?.pitStops[0]?.estimatedRaceLap ?? m.liveMetrics.noStop}</strong></div>
        </section>}

        {recommended && <Card className="strategy-verdict">
          <div className="strategy-verdict__icon"><ShieldCheck size={20} /></div>
          <div><div className="eyebrow">{m.verdict.eyebrow}</div><h2>{recommended.stopCount} {recommended.stopCount === 1 ? m.verdict.stop : m.verdict.stops} · {recommended.stints.length} {m.verdict.stints} · {formatNumber(projectedLaps, language, 2)} {m.units.laps}</h2><p>{m.verdict.rationale}</p></div>
          <Badge tone="positive">{activeResult?.minimumStops} {(activeResult?.minimumStops ?? 0) === 1 ? m.verdict.stop : m.verdict.stops} {m.verdict.minimum}</Badge>
          <div className="strategy-verdict__metrics"><span><b>{formatNumber(expectedDemand, language, 1)} {m.units.liters}</b>{m.verdict.expectedDemand}</span><span><b>{formatNumber(planningDemand, language, 1)} {m.units.liters}</b>{m.verdict.planningDemand}</span><span><b>{formatNumber(recommended.projectedPitTimeSeconds, language, 1)} {m.units.seconds}</b>{m.alternatives.pitCost}</span></div>
        </Card>}
        {activeResult && !recommended && <Card className="strategy-verdict strategy-verdict--infeasible"><div className="strategy-verdict__icon"><AlertTriangle size={20} /></div><div><div className="eyebrow">{m.verdict.eyebrow}</div><h2>{m.verdict.infeasible}</h2><p>{m.verdict.infeasibleDetail}</p></div></Card>}

        {activeResult && <Card className="strategy-candidates">
          <CardHeader eyebrow={m.alternatives.eyebrow} title={m.alternatives.title} description={m.alternatives.description} />
          <div className="scenario-grid" role="list">
            {activeResult.candidates.map((candidate) => {
              const isRecommended = candidate.id === recommended?.id
              const isSelected = candidate.id === selected?.id
              const lapDelta = (recommended ? candidateDistance(recommended) : 0) - candidateDistance(candidate)
              return <button key={candidate.id} type="button" role="listitem" aria-pressed={isSelected} className={'scenario-card' + (isSelected ? ' is-selected' : '')} onClick={() => setSelectedId(candidate.id)}>
                <div className="scenario-card__top"><span className={'scenario-card__radio' + (isSelected ? ' is-selected' : '')} /><strong>{candidate.stopCount} {candidate.stopCount === 1 ? m.verdict.stop : m.verdict.stops}</strong>{isRecommended && <Badge tone="accent">{m.alternatives.recommended}</Badge>}</div>
                <div className="scenario-card__time">{formatNumber(candidateDistance(candidate), language, 2)}<span>{m.units.laps}</span></div>
                <div className="scenario-card__stats"><span><b>{candidate.stints.length}</b> {m.verdict.stints}</span><span><b>{formatNumber(candidate.projectedPitTimeSeconds, language, 1)} {m.units.seconds}</b> {m.alternatives.pitCost}</span><span><b>{formatNumber(candidate.expectedFuelAtFinishLitres, language, 1)} {m.units.liters}</b> {m.alternatives.finishFuel}</span></div>
                {!isRecommended && <small className="scenario-card__delta">{lapDelta > 0 ? '−' + formatNumber(lapDelta, language, 2) + ' ' + m.alternatives.fewerLaps : m.alternatives.sameDistance}</small>}
              </button>
            })}
          </div>
          {activeResult.candidates.length === 1 && <div className="strategy-empty-alternative"><Info size={15} /><span>{m.alternatives.noAlternative}</span></div>}
        </Card>}

        {selected && <Card className="plan-card">
          <CardHeader eyebrow={m.plan.eyebrow} title={m.plan.title} action={<div className="plan-summary"><span><Timer size={14} /> {mode === 'live' ? m.mode.live : String(duration) + ' ' + m.units.minutes}</span><span><Flag size={14} /> {formatNumber(projectedLaps, language, 2)} {m.units.laps}</span><span><Fuel size={14} /> {selected.stopCount} {selected.stopCount === 1 ? m.verdict.stop : m.verdict.stops}</span></div>} />
          <StrategyTimeline candidate={selected} language={language} />
          <div className="pit-table">
            <div className="pit-table__head"><span>{m.plan.stop}</span><span>{m.plan.afterLap}</span><span>{m.plan.fuelAdded}</span><span>{m.plan.exitTarget}</span><span>{m.plan.totalCost}</span></div>
            {selected.pitStops.map((stop) => <div key={stop.index}><strong>{String(stop.index).padStart(2, '0')}</strong><span>{stop.estimatedRaceLap}</span><span>+{formatNumber(stop.maximumFuelToAddLitres, language, 1)} {m.units.liters}</span><span>{formatNumber(stop.targetFuelOnExitLitres, language, 1)} {m.units.liters}</span><span>{formatNumber(stop.totalPitCostSeconds, language, 1)} {m.units.seconds}</span></div>)}
          </div>
        </Card>}

        {mode === 'live' && livePlan.status === 'ready' && <Card className="strategy-change-card">
          <CardHeader eyebrow={m.changes.eyebrow} title={m.changes.title} action={<Badge tone="neutral">{formatMessage(m.provenance.revision, { revision: livePlan.modelRevision })}</Badge>} />
          <div className="strategy-explanation">{(planChanges.length ? planChanges.map(changeText) : [m.changes.none]).map((text, index) => <span key={String(index) + text}><Radio size={15} /><b>{text}</b></span>)}<span><Clock3 size={15} /><b>{m.changes.distance}</b></span><span><Gauge size={15} /><b>{m.changes.manual}</b></span></div>
          <small className="strategy-source-note">{liveModel?.lastAcceptedLap ? formatMessage(m.provenance.lastLap, { lap: liveModel.lastAcceptedLap }) : m.provenance.noAcceptedLap}</small>
        </Card>}

        {selected && <div className={'strategy-bottom-grid' + (mode === 'live' ? ' strategy-bottom-grid--single' : '')}>
          {mode === 'manual' && <Card><CardHeader eyebrow={m.changes.eyebrow} title={m.changes.title} /><div className="strategy-explanation"><span><Clock3 size={15} /><b>{m.changes.distance}</b></span><span><Fuel size={15} /><b>{m.changes.manual}</b></span></div></Card>}
          <Card className="race-brief-card"><CardHeader eyebrow={m.brief.eyebrow} title={m.brief.title} /><div className="brief-numbers"><div><span>{m.brief.target}</span><strong>{formatNumber(activePlanningRate, language, 2)}</strong><small>{m.units.liters} / {m.units.lap}</small></div><div><span>{m.brief.firstStop}</span><strong>{selected.pitStops[0]?.estimatedRaceLap ?? '—'}</strong><small>{selected.pitStops[0] ? m.brief.afterLap : m.brief.noStop}</small></div><div><span>{m.brief.finish}</span><strong>{formatNumber(selected.expectedFuelAtFinishLitres, language, 1)}</strong><small>{m.units.liters}</small></div></div><div className="brief-callout"><ShieldCheck size={16} /><span>{m.brief.reserve}</span></div></Card>
        </div>}

        <Card className="unsupported-card">
          <CardHeader eyebrow={m.unsupported.eyebrow} title={m.unsupported.title} action={<Badge tone="warning">{m.unsupported.unavailable}</Badge>} />
          <div className="unsupported-grid">{[m.unsupported.traffic, m.unsupported.weather, m.unsupported.tyres, m.unsupported.drivers, m.unsupported.energy, m.unsupported.detection].map((label) => <span key={label}><AlertTriangle size={14} /><b>{label}</b><em>{m.unsupported.unavailable}</em></span>)}</div>
          <p>{m.unsupported.note}</p>
        </Card>
      </div>
    </div>
  </div>
}
