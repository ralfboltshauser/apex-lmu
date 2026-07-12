import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudRain,
  Copy,
  Download,
  FileClock,
  Filter,
  Gauge,
  GitCompare,
  HardDriveDownload,
  History,
  Info,
  Library,
  Lock,
  MessageSquareText,
  MoreHorizontal,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Star,
  Undo2,
  Upload,
  Users,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, CardHeader, Progress, Segmented } from '../components/ui'
import { demoSetups, setupDiff } from '../data/demo'

type SetupTab = 'library' | 'mine' | 'engineer'
type Symptom = 'understeer' | 'oversteer' | 'traction' | 'kerbs'

export function SetupsView({ onImport }: { onImport?: () => void }) {
  const [tab, setTab] = useState<SetupTab>('library')
  const [selectedSetup, setSelectedSetup] = useState('safe-race')
  const [symptom, setSymptom] = useState<Symptom>('oversteer')
  const [phase, setPhase] = useState<'entry' | 'mid' | 'exit'>('exit')
  const [speed, setSpeed] = useState<'slow' | 'medium' | 'fast'>('medium')
  const [proposalReady, setProposalReady] = useState(false)
  const selected = demoSetups.find((setup) => setup.id === selectedSetup)!

  return (
    <div className="view view--setups">
      <div className="page-heading">
        <div><div className="eyebrow">Setup workshop</div><h1>Make the car work for you.</h1><p>Install, compare, explain and evolve every setup without losing the original.</p></div>
        <div className="page-heading__actions"><Button variant="secondary" icon={<Upload size={16} />} onClick={onImport}>Import setup</Button><Button icon={<Sparkles size={16} />} onClick={() => setTab('engineer')}>Ask setup engineer</Button></div>
      </div>

      <div className="data-provenance-banner"><Badge tone="accent">Example content</Badge><span>The community cards, history, and telemetry evidence are generated UX fixtures. Only “Import setup” writes a user-selected .svm file, with a backup.</span></div>

      <div className="section-tabs" role="tablist" aria-label="Setup sections">
        <button role="tab" aria-selected={tab === 'library'} className={tab === 'library' ? 'is-active' : ''} onClick={() => setTab('library')}><Library size={16} /> Example library <Badge tone="neutral">4</Badge></button>
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'is-active' : ''} onClick={() => setTab('mine')}><SlidersHorizontal size={16} /> Example history <Badge tone="neutral">Demo</Badge></button>
        <button role="tab" aria-selected={tab === 'engineer'} className={tab === 'engineer' ? 'is-active' : ''} onClick={() => setTab('engineer')}><Bot size={16} /> Setup engineer</button>
      </div>

      {tab === 'library' && (
        <div className="setup-library-layout">
          <div className="setup-library-main">
            <Card className="setup-context-card">
              <div className="setup-context-card__item"><span>Car</span><button type="button">Porsche 963 <ChevronDown size={14} /></button></div>
              <div className="setup-context-card__item"><span>Track</span><button type="button">Spa-Francorchamps <ChevronDown size={14} /></button></div>
              <div className="setup-context-card__item"><span>Game version</span><button type="button">v1.3.3 · Current <ChevronDown size={14} /></button></div>
              <div className="setup-context-card__search"><Search size={15} /><input placeholder="Search setups or creators" aria-label="Search setups" /></div>
              <button className="icon-button" type="button" aria-label="Filter setups"><Filter size={17} /></button>
            </Card>

            <div className="setup-result-heading"><div><strong>4 generated setup examples</strong><span>No files or compatibility claims are attached</span></div><span><Badge tone="neutral">Illustrative</Badge></span></div>
            <div className="setup-grid">
              {demoSetups.map((setup, index) => {
                const isSelected = selectedSetup === setup.id
                return (
                  <Card key={setup.id} className={`setup-card ${isSelected ? 'is-selected' : ''}`} onClick={() => setSelectedSetup(setup.id)}>
                    <div className="setup-card__top">
                      <div className={`setup-card__type setup-card__type--${setup.tags[0].toLowerCase()}`}>{setup.tags[0] === 'Wet' ? <CloudRain size={18} /> : index === 0 ? <Shield size={18} /> : <Gauge size={18} />}</div>
                      <div className="setup-card__badges">{index === 0 && <Badge tone="accent">Best match</Badge>}<button className="icon-button" type="button" aria-label="Setup options"><MoreHorizontal size={16} /></button></div>
                    </div>
                    <h3>{setup.name}</h3>
                    <p>by {setup.author}</p>
                    <div className="setup-card__rating"><Star size={13} fill="currentColor" /><strong>{setup.rating}</strong><span>{setup.votes} drivers</span></div>
                    <div className="setup-card__tags">{setup.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                    <div className="setup-card__metadata"><span>Example v{setup.version}</span><span>Generated metadata</span></div>
                    <Button variant="secondary" size="sm" icon={<Info size={14} />} onClick={(event) => { event.stopPropagation(); setSelectedSetup(setup.id) }}>Preview details</Button>
                  </Card>
                )
              })}
            </div>
          </div>

          <Card className="setup-detail-panel">
            <div className="setup-detail-panel__hero"><div className="setup-detail-panel__icon"><Shield size={24} /></div><Badge tone="accent">Generated example</Badge></div>
            <div className="eyebrow">Selected setup</div><h2>{selected.name}</h2><p>Built for predictable rotation and consistent double stints without sacrificing too much straight-line speed.</p>
            <div className="setup-detail-panel__author"><div>EX</div><span><strong>{selected.author}</strong><small>Example creator identity</small></span></div>
            <div className="setup-detail-panel__metrics"><div><span>Community pace</span><strong>Top 8%</strong></div><div><span>Consistency</span><strong>94%</strong></div><div><span>Drivers</span><strong>{selected.votes}</strong></div></div>
            <div className="setup-detail-panel__confidence"><span>Recommendation confidence <strong>91%</strong></span><Progress value={91} tone="positive" /><small>Matches your pace, control inputs and preferred stable balance.</small></div>
            <div className="setup-detail-panel__notes"><strong>Creator notes</strong><p>Run brake migration 3 for a stable entry. TC 4 is a safe baseline; use TC 3 once rear temperatures settle.</p></div>
            <div className="setup-detail-panel__actions"><Button icon={<Upload size={15} />} onClick={onImport}>Import a real .svm</Button><Button variant="secondary" icon={<GitCompare size={15} />} disabled>Compare unavailable</Button></div>
            <div className="setup-detail-panel__safety"><Lock size={13} /> Real imports use the guarded installer and back up name collisions.</div>
          </Card>
        </div>
      )}

      {tab === 'mine' && (
        <div className="my-setups-layout">
          <Card className="setup-history-card">
            <CardHeader eyebrow="Active setup" title="Endurance stable · personal branch" action={<Badge tone="positive"><Check size={11} /> In sync</Badge>} />
            <div className="setup-file-hero"><div><FileClock size={24} /></div><span><strong>APX_P963_SPA_ENDU_R07_personal.svm</strong><small>Generated history example</small></span><Button variant="secondary" size="sm" icon={<Copy size={14} />} disabled>Example only</Button></div>
            <div className="history-timeline">
              <div className="is-current"><i /><span><strong>Personal v3</strong><small>Rear stability adjustment · Today, 19:38</small></span><Badge tone="accent">Current</Badge></div>
              <div><i /><span><strong>Personal v2</strong><small>Lower rear wing test · example</small></span><button type="button" disabled>Restore</button></div>
              <div><i /><span><strong>Original community setup</strong><small>Example source revision</small></span><button type="button" disabled>Restore</button></div>
            </div>
          </Card>
          <Card className="setup-diff-card">
            <CardHeader eyebrow="Example diff" title="4 illustrative values" action={<Button variant="quiet" size="sm" icon={<Undo2 size={13} />} disabled>Reset unavailable</Button>} />
            <div className="setup-diff-table"><div className="setup-diff-table__head"><span>Setting</span><span>Original</span><span>Current</span></div>{setupDiff.map((change) => <div key={change.property}><span><small>{change.group}</small><strong>{change.property}</strong></span><span>{change.current}</span><span className="changed">{change.suggested} {change.direction === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}</span></div>)}</div>
          </Card>
        </div>
      )}

      {tab === 'engineer' && (
        <div className="engineer-layout">
          <Card className="engineer-intro">
            <div className="engineer-intro__icon"><Bot size={24} /></div>
            <div><Badge tone="accent">Evidence-aware</Badge><h2>What is the car doing?</h2><p>I’ll combine your feedback with the last stint’s telemetry, propose a small reversible change, and tell you what trade-off to expect.</p></div>
            <div className="engineer-intro__source"><Info size={14} /><span><strong>Example mode</strong>No real setup or telemetry is loaded</span></div>
          </Card>

          <Card className="engineer-questionnaire">
            <div className="question-step"><span>1</span><div><strong>Choose the main symptom</strong><small>Start with the issue costing the most confidence.</small></div></div>
            <div className="choice-grid choice-grid--symptoms">
              {([
                ['understeer', 'Understeer', 'Front washes wide'], ['oversteer', 'Oversteer', 'Rear steps out'], ['traction', 'Poor traction', 'Wheelspin on exit'], ['kerbs', 'Kerb instability', 'Car unsettles over kerbs'],
              ] as Array<[Symptom, string, string]>).map(([id, title, description]) => <button type="button" key={id} className={symptom === id ? 'is-selected' : ''} onClick={() => { setSymptom(id); setProposalReady(false) }}><span className="choice-radio" /><strong>{title}</strong><small>{description}</small></button>)}
            </div>

            <div className="question-step"><span>2</span><div><strong>When does it happen?</strong><small>Select the corner phase where it begins.</small></div></div>
            <Segmented value={phase} onChange={(value) => { setPhase(value); setProposalReady(false) }} ariaLabel="Corner phase" options={[{ value: 'entry', label: 'Entry / braking' }, { value: 'mid', label: 'Mid-corner' }, { value: 'exit', label: 'Exit / throttle' }]} />

            <div className="question-step"><span>3</span><div><strong>Which corners expose it?</strong><small>Speed changes the likely mechanical or aero cause.</small></div></div>
            <Segmented value={speed} onChange={(value) => { setSpeed(value); setProposalReady(false) }} ariaLabel="Corner speed" options={[{ value: 'slow', label: 'Slow' }, { value: 'medium', label: 'Medium' }, { value: 'fast', label: 'Fast' }]} />

            <div className="engineer-evidence"><Sparkles size={16} /><div><strong>Example evidence pattern</strong><span>A real proposal will require an ingested stint and parsed setup values.</span></div><Badge tone="neutral">Not measured</Badge></div>
            <Button icon={<Wrench size={16} />} onClick={() => setProposalReady(true)}>Build a reversible proposal</Button>
          </Card>

          <Card className={`engineer-proposal ${proposalReady ? 'is-ready' : ''}`}>
            {proposalReady ? <>
              <CardHeader eyebrow="Proposed branch" title="More progressive power delivery" action={<Badge tone="accent">2 changes</Badge>} />
              <div className="proposal-summary"><MessageSquareText size={16} /><p>The loss begins after initial throttle rather than at rotation. That points first to differential locking and rear toe, not springs or aero.</p></div>
              <div className="proposal-changes">
                <div><span><small>Differential</small><strong>Power ramp</strong></span><em>65°</em><ArrowRight size={14} /><b>70°</b><Badge tone="neutral">Less locking</Badge></div>
                <div><span><small>Alignment</small><strong>Rear toe</strong></span><em>+0.10°</em><ArrowRight size={14} /><b>+0.14°</b><Badge tone="neutral">More stability</Badge></div>
              </div>
              <div className="proposal-tradeoff"><Info size={15} /><span><strong>Expected trade-off</strong>Slightly slower initial rotation and approximately 0.3 km/h additional tyre scrub on straights.</span></div>
              <div className="proposal-test"><strong>Validation plan</strong><ol><li>Run three clean laps on comparable fuel.</li><li>Keep TC and brake migration unchanged.</li><li>Apex will compare exit slip, throttle pickup and lap time.</li></ol></div>
              <div className="proposal-actions"><Button icon={<Check size={15} />} disabled>Create unavailable</Button><Button variant="secondary" disabled>Save unavailable</Button></div>
            </> : <div className="engineer-proposal__empty"><Wrench size={27} /><h3>Your proposal will appear here</h3><p>Apex changes no more than two related values at once so you can measure cause and effect.</p></div>}
          </Card>
        </div>
      )}
    </div>
  )
}
