import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Download,
  Filter,
  Flag,
  Gauge,
  GitCompareArrows,
  Info,
  MousePointer2,
  Play,
  Search,
  Share2,
  Sparkles,
  Target,
  TrendingDown,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Button, Card, CardHeader, Progress, Segmented, Select, TooltipHint } from '../components/ui'
import { demoInsights, demoSessions, lapTrace, referenceTrace } from '../data/demo'

type Channel = 'speed' | 'throttle' | 'brake' | 'delta'

const CHANNELS: Array<{ id: Channel; label: string; color: string; min: number; max: number }> = [
  { id: 'speed', label: 'Speed', color: '#f4f5f0', min: 40, max: 340 },
  { id: 'throttle', label: 'Throttle', color: '#b8f34a', min: 0, max: 100 },
  { id: 'brake', label: 'Brake', color: '#ff5d57', min: 0, max: 100 },
  { id: 'delta', label: 'Delta', color: '#63a8ff', min: -0.2, max: 0.8 },
]

function pointsFor(values: typeof lapTrace, channel: Channel, width: number, height: number, min: number, max: number) {
  return values.map((point) => {
    const value = point[channel]
    return `${(point.x * width).toFixed(1)},${(height - ((value - min) / (max - min)) * height).toFixed(1)}`
  }).join(' ')
}

function TelemetryGraph({ channels, cursor }: { channels: Channel[]; cursor: number }) {
  const width = 1000
  const rowHeight = 112
  const gap = 26
  return (
    <div className="telemetry-graph" role="img" aria-label={`Telemetry comparison showing ${channels.join(', ')}`}>
      <svg viewBox={`0 0 ${width} ${channels.length * (rowHeight + gap)}`} preserveAspectRatio="none">
        {channels.map((channel, channelIndex) => {
          const config = CHANNELS.find((item) => item.id === channel)!
          const y = channelIndex * (rowHeight + gap)
          return (
            <g key={channel} transform={`translate(0 ${y})`}>
              <line className="telemetry-graph__baseline" x1="0" x2={width} y1={rowHeight} y2={rowHeight} />
              <line className="telemetry-graph__grid" x1="0" x2={width} y1={rowHeight / 2} y2={rowHeight / 2} />
              <polyline className="telemetry-graph__reference" points={pointsFor(referenceTrace, channel, width, rowHeight, config.min, config.max)} />
              <polyline className="telemetry-graph__current" style={{ stroke: config.color }} points={pointsFor(lapTrace, channel, width, rowHeight, config.min, config.max)} />
              <text x="8" y="16">{config.label}</text>
            </g>
          )
        })}
        <line className="telemetry-graph__cursor" x1={cursor * width} x2={cursor * width} y1="0" y2={channels.length * (rowHeight + gap) - gap} />
        <circle className="telemetry-graph__cursor-dot" cx={cursor * width} cy="38" r="4" />
      </svg>
      <div className="telemetry-tooltip" style={{ left: `${Math.min(91, Math.max(9, cursor * 100))}%` }}>
        <strong>Les Combes · 36.4%</strong>
        <span><i className="current" /> You&nbsp; 241 km/h</span>
        <span><i className="reference" /> Reference&nbsp; 246 km/h</span>
      </div>
    </div>
  )
}

function SegmentRibbon({ selected, onSelect }: { selected: number; onSelect: (index: number) => void }) {
  const segments = [
    ['T1', -0.06], ['Eau Rouge', 0.02], ['Kemmel', 0.04], ['T5–7', 0.31], ['T8–9', 0.08], ['T10–11', 0.18], ['T12–13', -0.03], ['T14–15', 0.07], ['Blanchimont', -0.09], ['Bus Stop', 0.12],
  ] as const
  return (
    <div className="segment-ribbon" aria-label="Lap segment time loss">
      {segments.map(([label, loss], index) => (
        <button key={label} type="button" className={`${loss < 0 ? 'is-gain' : loss > 0.15 ? 'is-high-loss' : 'is-loss'} ${selected === index ? 'is-selected' : ''}`} onClick={() => onSelect(index)}>
          <span>{label}</span><strong>{loss > 0 ? '+' : ''}{loss.toFixed(2)}</strong>
        </button>
      ))}
    </div>
  )
}

export function AnalyzeView() {
  const [comparisonMode, setComparisonMode] = useState<'reference' | 'personal'>('reference')
  const [selectedSession, setSelectedSession] = useState('spa-race')
  const [channels, setChannels] = useState<Channel[]>(['speed', 'throttle', 'brake'])
  const [selectedSegment, setSelectedSegment] = useState(3)
  const [cursor, setCursor] = useState(0.364)
  const [selectedInsight, setSelectedInsight] = useState(demoInsights[0].id)
  const selectedInsightData = demoInsights.find((insight) => insight.id === selectedInsight)!

  const toggleChannel = (channel: Channel) => {
    setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel])
  }

  const sessionOptions = useMemo(() => demoSessions.map((session) => ({ value: session.id, label: `${session.track} · ${session.type} · ${session.date}` })), [])

  return (
    <div className="view view--analyze">
      <div className="page-heading page-heading--compact">
        <div><div className="eyebrow">Analysis</div><h1>Find the time. Understand why.</h1><p>Every conclusion links back to the telemetry that produced it.</p></div>
        <div className="page-heading__actions"><Button variant="secondary" icon={<Share2 size={16} />} disabled>Share unavailable</Button><Button variant="secondary" icon={<Download size={16} />} disabled>Export unavailable</Button></div>
      </div>

      <div className="data-provenance-banner"><Badge tone="accent">Generated example session</Badge><span>This view demonstrates distance-aligned analysis and coaching. DuckDB inspection does not ingest a session into these charts yet.</span></div>

      <div className="analysis-toolbar">
        <Select value={selectedSession} onChange={setSelectedSession} options={sessionOptions} ariaLabel="Example session" />
        <div className="analysis-toolbar__separator" />
        <div className="lap-select"><span className="lap-select__swatch lap-select__swatch--current" /><div><small>Your lap</small><strong>Lap 14 · 2:03.684</strong></div></div>
        <ArrowLeftRight size={15} className="analysis-toolbar__swap" />
        <div className="lap-select"><span className="lap-select__swatch lap-select__swatch--reference" /><div><small>{comparisonMode === 'reference' ? 'Generated reference' : 'Generated personal best'}</small><strong>Example trace · 2:02.971</strong></div></div>
        <div className="analysis-toolbar__spacer" />
        <Segmented value={comparisonMode} onChange={setComparisonMode} ariaLabel="Comparison type" options={[{ value: 'reference', label: 'Reference' }, { value: 'personal', label: 'Personal best' }]} />
      </div>

      <div className="analysis-summary-strip">
        <div><span>Lap difference</span><strong className="negative">+0.713 s</strong><small>Comparable conditions</small></div>
        <div><span>Biggest loss</span><strong>T5–7 · +0.31</strong><small>Exit execution</small></div>
        <div><span>Your advantage</span><strong className="positive">T17 · −0.09</strong><small>Minimum speed</small></div>
        <div><span>Optimal lap <TooltipHint>A stitched estimate using your best comparable segments. It is not a lap you actually drove.</TooltipHint></span><strong>2:03.192</strong><small>0.492 s available</small></div>
        <div className="analysis-quality"><Badge tone="positive"><Check size={12} /> 94% match quality</Badge><TooltipQuality /></div>
      </div>

      <Card className="segment-card">
        <div className="segment-card__header"><span>Time delta through the lap</span><div><i className="is-gain" /> Gaining <i className="is-loss" /> Losing</div></div>
        <SegmentRibbon selected={selectedSegment} onSelect={setSelectedSegment} />
      </Card>

      <div className="analysis-layout">
        <Card className="telemetry-card">
          <CardHeader
            eyebrow="Evidence"
            title="Telemetry comparison"
            action={<div className="channel-toggles">{CHANNELS.map((channel) => <button key={channel.id} type="button" className={channels.includes(channel.id) ? 'is-active' : ''} onClick={() => toggleChannel(channel.id)}><i style={{ background: channel.color }} />{channel.label}</button>)}</div>}
          />
          <div
            className="telemetry-card__interaction"
            onPointerMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect()
              setCursor(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)))
            }}
          >
            <TelemetryGraph channels={channels.length ? channels : ['speed']} cursor={cursor} />
          </div>
          <div className="telemetry-card__axis"><span>La Source</span><span>Eau Rouge</span><span>Les Combes</span><span>Bruxelles</span><span>Blanchimont</span><span>Bus Stop</span></div>
          <div className="telemetry-card__hint"><MousePointer2 size={13} /> Move across the graph to inspect any point · Click a segment above to zoom</div>
        </Card>

        <Card className="coach-panel">
          <CardHeader eyebrow="Apex coach" title="Three things worth changing" action={<Sparkles size={18} />} />
          <div className="insight-list">
            {demoInsights.map((insight, index) => (
              <button key={insight.id} type="button" className={`${selectedInsight === insight.id ? 'is-active' : ''} insight-list__item--${insight.severity}`} onClick={() => setSelectedInsight(insight.id)}>
                <span className="insight-list__number">0{index + 1}</span>
                <span className="insight-list__copy"><small>{insight.corner}</small><strong>{insight.title}</strong><em>{insight.loss > 0 ? '+' : ''}{insight.loss.toFixed(2)} s</em></span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          <div className="coach-detail">
            <div className="coach-detail__confidence"><span>Confidence <TooltipHint>Evidence strength after lap comparability and repeatability checks—not a certainty score.</TooltipHint></span><strong>{selectedInsightData.confidence}%</strong><Progress value={selectedInsightData.confidence} tone={selectedInsightData.severity === 'positive' ? 'positive' : 'accent'} /></div>
            <h3>{selectedInsightData.title}</h3>
            <p>{selectedInsightData.body}</p>
            <div className="coach-detail__action"><Target size={16} /><span><small>Try next</small><strong>{selectedInsightData.action}</strong></span></div>
            <button type="button" className="inline-link" onClick={() => setSelectedSegment(Math.max(0, demoInsights.findIndex((insight) => insight.id === selectedInsight)))}>Focus telemetry on this corner <ArrowRight size={14} /></button>
          </div>
        </Card>

        <Card className="lap-breakdown-card">
          <CardHeader eyebrow="Lap anatomy" title="Where the difference comes from" action={<Badge tone="neutral">18 corners</Badge>} />
          <div className="lap-breakdown">
            <div className="lap-breakdown__bar"><span style={{ width: '44%' }} className="braking" /><span style={{ width: '31%' }} className="corner" /><span style={{ width: '25%' }} className="exit" /></div>
            <div className="lap-breakdown__legend">
              <div><i className="braking" /><span><strong>Braking</strong><small>+0.31 s · 44%</small></span></div>
              <div><i className="corner" /><span><strong>Mid-corner</strong><small>+0.22 s · 31%</small></span></div>
              <div><i className="exit" /><span><strong>Exit</strong><small>+0.18 s · 25%</small></span></div>
            </div>
          </div>
          <div className="lap-breakdown__conclusion"><TrendingDown size={16} /><p><strong>Brake release is the recurring pattern.</strong><span>Five of seven losing corners show an abrupt release before turn-in.</span></p></div>
        </Card>

        <Card className="session-stats-card">
          <CardHeader eyebrow="Session quality" title="18 clean laps" />
          <div className="session-stats-grid">
            <div><Clock3 size={15} /><span>Consistency</span><strong>±0.31 s</strong><small>Top 12% of your sessions</small></div>
            <div><Gauge size={15} /><span>Average pace</span><strong>2:04.118</strong><small>Last 8 clean laps</small></div>
            <div><CircleDot size={15} /><span>Track limits</span><strong>2</strong><small>Both at Raidillon exit</small></div>
            <div><Zap size={15} /><span>Improvement</span><strong className="positive">−0.714 s</strong><small>Across the session</small></div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function TooltipQuality() {
  return <span className="quality-explanation"><Info size={13} /> Same car, BoP, fuel window and track temperature</span>
}
