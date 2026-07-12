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
import { useMessages } from '../i18n'
import { formatMessage, setupsMessages } from '../i18n/view-resources'

type SetupTab = 'library' | 'mine' | 'engineer'
type Symptom = 'understeer' | 'oversteer' | 'traction' | 'kerbs'

export function SetupsView({ onImport }: { onImport?: () => void }) {
  const m = useMessages(setupsMessages)
  const [tab, setTab] = useState<SetupTab>('library')
  const [selectedSetup, setSelectedSetup] = useState('safe-race')
  const [symptom, setSymptom] = useState<Symptom>('oversteer')
  const [phase, setPhase] = useState<'entry' | 'mid' | 'exit'>('exit')
  const [speed, setSpeed] = useState<'slow' | 'medium' | 'fast'>('medium')
  const [proposalReady, setProposalReady] = useState(false)
  const selected = demoSetups.find((setup) => setup.id === selectedSetup)!
  const setupNames: Record<string, string> = { 'safe-race': m.fixtures.setups.safeRace, 'esport-race': m.fixtures.setups.esportRace, wet: m.fixtures.setups.wet, quali: m.fixtures.setups.quali }
  const tagLabels: Record<string, string> = { Race: m.fixtures.tags.race, Stable: m.fixtures.tags.stable, 'Double stint': m.fixtures.tags.doubleStint, Aggressive: m.fixtures.tags.aggressive, Wet: m.fixtures.tags.wet, Qualifying: m.fixtures.tags.qualifying }
  const diffLabels: Record<string, string> = {
    Aerodynamics: m.fixtures.diff.aerodynamics, 'Rear wing': m.fixtures.diff.rearWing, 'Mechanical grip': m.fixtures.diff.mechanicalGrip, 'Front anti-roll bar': m.fixtures.diff.frontAntiRollBar,
    Differential: m.fixtures.diff.differential, 'Power ramp': m.fixtures.diff.powerRamp, Alignment: m.fixtures.diff.alignment, 'Rear toe': m.fixtures.diff.rearToe,
  }

  return (
    <div className="view view--setups">
      <div className="page-heading">
        <div><div className="eyebrow">{m.heading.eyebrow}</div><h1>{m.heading.title}</h1><p>{m.heading.description}</p></div>
        <div className="page-heading__actions"><Button variant="secondary" icon={<Upload size={16} />} onClick={onImport}>{m.heading.import}</Button><Button icon={<Sparkles size={16} />} onClick={() => setTab('engineer')}>{m.heading.askEngineer}</Button></div>
      </div>

      <div className="data-provenance-banner"><Badge tone="accent">{m.provenance.badge}</Badge><span>{m.provenance.copy}</span></div>

      <div className="section-tabs" role="tablist" aria-label={m.tabs.aria}>
        <button role="tab" aria-selected={tab === 'library'} className={tab === 'library' ? 'is-active' : ''} onClick={() => setTab('library')}><Library size={16} /> {m.tabs.library} <Badge tone="neutral">4</Badge></button>
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'is-active' : ''} onClick={() => setTab('mine')}><SlidersHorizontal size={16} /> {m.tabs.history} <Badge tone="neutral">{m.tabs.demo}</Badge></button>
        <button role="tab" aria-selected={tab === 'engineer'} className={tab === 'engineer' ? 'is-active' : ''} onClick={() => setTab('engineer')}><Bot size={16} /> {m.tabs.engineer}</button>
      </div>

      {tab === 'library' && (
        <div className="setup-library-layout">
          <div className="setup-library-main">
            <Card className="setup-context-card">
              <div className="setup-context-card__item"><span>{m.context.car}</span><button type="button">{m.context.carValue} <ChevronDown size={14} /></button></div>
              <div className="setup-context-card__item"><span>{m.context.track}</span><button type="button">{m.context.trackValue} <ChevronDown size={14} /></button></div>
              <div className="setup-context-card__item"><span>{m.context.gameVersion}</span><button type="button">v1.3.3 · {m.context.current} <ChevronDown size={14} /></button></div>
              <div className="setup-context-card__search"><Search size={15} /><input placeholder={m.context.searchPlaceholder} aria-label={m.context.searchAria} /></div>
              <button className="icon-button" type="button" aria-label={m.context.filterAria}><Filter size={17} /></button>
            </Card>

            <div className="setup-result-heading"><div><strong>{m.results.title}</strong><span>{m.results.subtitle}</span></div><span><Badge tone="neutral">{m.results.badge}</Badge></span></div>
            <div className="setup-grid">
              {demoSetups.map((setup, index) => {
                const isSelected = selectedSetup === setup.id
                return (
                  <Card key={setup.id} className={`setup-card ${isSelected ? 'is-selected' : ''}`} onClick={() => setSelectedSetup(setup.id)}>
                    <div className="setup-card__top">
                      <div className={`setup-card__type setup-card__type--${setup.tags[0].toLowerCase()}`}>{setup.tags[0] === 'Wet' ? <CloudRain size={18} /> : index === 0 ? <Shield size={18} /> : <Gauge size={18} />}</div>
                      <div className="setup-card__badges">{index === 0 && <Badge tone="accent">{m.card.bestMatch}</Badge>}<button className="icon-button" type="button" aria-label={m.card.optionsAria}><MoreHorizontal size={16} /></button></div>
                    </div>
                    <h3>{setupNames[setup.id] ?? setup.name}</h3>
                    <p>{formatMessage(m.card.by, { author: setup.author })}</p>
                    <div className="setup-card__rating"><Star size={13} fill="currentColor" /><strong>{setup.rating}</strong><span>{formatMessage(m.card.drivers, { count: setup.votes })}</span></div>
                    <div className="setup-card__tags">{setup.tags.map((tag) => <span key={tag}>{tagLabels[tag] ?? tag}</span>)}</div>
                    <div className="setup-card__metadata"><span>{formatMessage(m.card.exampleVersion, { version: setup.version })}</span><span>{m.card.generatedMetadata}</span></div>
                    <Button variant="secondary" size="sm" icon={<Info size={14} />} onClick={(event) => { event.stopPropagation(); setSelectedSetup(setup.id) }}>{m.card.preview}</Button>
                  </Card>
                )
              })}
            </div>
          </div>

          <Card className="setup-detail-panel">
            <div className="setup-detail-panel__hero"><div className="setup-detail-panel__icon"><Shield size={24} /></div><Badge tone="accent">{m.detail.generated}</Badge></div>
            <div className="eyebrow">{m.detail.selected}</div><h2>{setupNames[selected.id] ?? selected.name}</h2><p>{m.detail.description}</p>
            <div className="setup-detail-panel__author"><div>{m.detail.initials}</div><span><strong>{selected.author}</strong><small>{m.detail.creatorIdentity}</small></span></div>
            <div className="setup-detail-panel__metrics"><div><span>{m.detail.communityPace}</span><strong>{m.detail.topEight}</strong></div><div><span>{m.detail.consistency}</span><strong>94{m.detail.percent}</strong></div><div><span>{m.detail.drivers}</span><strong>{selected.votes}</strong></div></div>
            <div className="setup-detail-panel__confidence"><span>{m.detail.confidence} <strong>91{m.detail.percent}</strong></span><Progress value={91} tone="positive" /><small>{m.detail.confidenceNote}</small></div>
            <div className="setup-detail-panel__notes"><strong>{m.detail.creatorNotes}</strong><p>{m.detail.notes}</p></div>
            <div className="setup-detail-panel__actions"><Button icon={<Upload size={15} />} onClick={onImport}>{m.detail.importReal}</Button><Button variant="secondary" icon={<GitCompare size={15} />} disabled>{m.detail.compareUnavailable}</Button></div>
            <div className="setup-detail-panel__safety"><Lock size={13} /> {m.detail.safety}</div>
          </Card>
        </div>
      )}

      {tab === 'mine' && (
        <div className="my-setups-layout">
          <Card className="setup-history-card">
            <CardHeader eyebrow={m.history.eyebrow} title={m.history.title} action={<Badge tone="positive"><Check size={11} /> {m.history.inSync}</Badge>} />
            <div className="setup-file-hero"><div><FileClock size={24} /></div><span><strong>{m.history.filename}</strong><small>{m.history.generated}</small></span><Button variant="secondary" size="sm" icon={<Copy size={14} />} disabled>{m.history.exampleOnly}</Button></div>
            <div className="history-timeline">
              <div className="is-current"><i /><span><strong>{m.history.personalV3}</strong><small>{m.history.personalV3Note}</small></span><Badge tone="accent">{m.history.current}</Badge></div>
              <div><i /><span><strong>{m.history.personalV2}</strong><small>{m.history.personalV2Note}</small></span><button type="button" disabled>{m.history.restore}</button></div>
              <div><i /><span><strong>{m.history.original}</strong><small>{m.history.originalNote}</small></span><button type="button" disabled>{m.history.restore}</button></div>
            </div>
          </Card>
          <Card className="setup-diff-card">
            <CardHeader eyebrow={m.history.diffEyebrow} title={m.history.diffTitle} action={<Button variant="quiet" size="sm" icon={<Undo2 size={13} />} disabled>{m.history.resetUnavailable}</Button>} />
            <div className="setup-diff-table"><div className="setup-diff-table__head"><span>{m.history.setting}</span><span>{m.history.originalColumn}</span><span>{m.history.currentColumn}</span></div>{setupDiff.map((change) => <div key={change.property}><span><small>{diffLabels[change.group] ?? change.group}</small><strong>{diffLabels[change.property] ?? change.property}</strong></span><span>{change.current}</span><span className="changed">{change.suggested} {change.direction === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}</span></div>)}</div>
          </Card>
        </div>
      )}

      {tab === 'engineer' && (
        <div className="engineer-layout">
          <Card className="engineer-intro">
            <div className="engineer-intro__icon"><Bot size={24} /></div>
            <div><Badge tone="accent">{m.engineer.evidenceAware}</Badge><h2>{m.engineer.title}</h2><p>{m.engineer.intro}</p></div>
            <div className="engineer-intro__source"><Info size={14} /><span><strong>{m.engineer.exampleMode}</strong>{m.engineer.noRealData}</span></div>
          </Card>

          <Card className="engineer-questionnaire">
            <div className="question-step"><span>1</span><div><strong>{m.engineer.chooseSymptom}</strong><small>{m.engineer.chooseSymptomHint}</small></div></div>
            <div className="choice-grid choice-grid--symptoms">
              {([
                ['understeer', m.engineer.understeer, m.engineer.understeerHint], ['oversteer', m.engineer.oversteer, m.engineer.oversteerHint], ['traction', m.engineer.traction, m.engineer.tractionHint], ['kerbs', m.engineer.kerbs, m.engineer.kerbsHint],
              ] as Array<[Symptom, string, string]>).map(([id, title, description]) => <button type="button" key={id} className={symptom === id ? 'is-selected' : ''} onClick={() => { setSymptom(id); setProposalReady(false) }}><span className="choice-radio" /><strong>{title}</strong><small>{description}</small></button>)}
            </div>

            <div className="question-step"><span>2</span><div><strong>{m.engineer.when}</strong><small>{m.engineer.whenHint}</small></div></div>
            <Segmented value={phase} onChange={(value) => { setPhase(value); setProposalReady(false) }} ariaLabel={m.engineer.phaseAria} options={[{ value: 'entry', label: m.engineer.entry }, { value: 'mid', label: m.engineer.mid }, { value: 'exit', label: m.engineer.exit }]} />

            <div className="question-step"><span>3</span><div><strong>{m.engineer.whichCorners}</strong><small>{m.engineer.whichCornersHint}</small></div></div>
            <Segmented value={speed} onChange={(value) => { setSpeed(value); setProposalReady(false) }} ariaLabel={m.engineer.speedAria} options={[{ value: 'slow', label: m.engineer.slow }, { value: 'medium', label: m.engineer.medium }, { value: 'fast', label: m.engineer.fast }]} />

            <div className="engineer-evidence"><Sparkles size={16} /><div><strong>{m.engineer.evidencePattern}</strong><span>{m.engineer.evidenceHint}</span></div><Badge tone="neutral">{m.engineer.notMeasured}</Badge></div>
            <Button icon={<Wrench size={16} />} onClick={() => setProposalReady(true)}>{m.engineer.build}</Button>
          </Card>

          <Card className={`engineer-proposal ${proposalReady ? 'is-ready' : ''}`}>
            {proposalReady ? <>
              <CardHeader eyebrow={m.engineer.branchEyebrow} title={m.engineer.branchTitle} action={<Badge tone="accent">{m.engineer.twoChanges}</Badge>} />
              <div className="proposal-summary"><MessageSquareText size={16} /><p>{m.engineer.summary}</p></div>
              <div className="proposal-changes">
                <div><span><small>{m.engineer.differential}</small><strong>{m.engineer.powerRamp}</strong></span><em>65°</em><ArrowRight size={14} /><b>70°</b><Badge tone="neutral">{m.engineer.lessLocking}</Badge></div>
                <div><span><small>{m.engineer.alignment}</small><strong>{m.engineer.rearToe}</strong></span><em>+0.10°</em><ArrowRight size={14} /><b>+0.14°</b><Badge tone="neutral">{m.engineer.moreStability}</Badge></div>
              </div>
              <div className="proposal-tradeoff"><Info size={15} /><span><strong>{m.engineer.expectedTradeoff}</strong>{m.engineer.tradeoff}</span></div>
              <div className="proposal-test"><strong>{m.engineer.validationPlan}</strong><ol><li>{m.engineer.validationOne}</li><li>{m.engineer.validationTwo}</li><li>{m.engineer.validationThree}</li></ol></div>
              <div className="proposal-actions"><Button icon={<Check size={15} />} disabled>{m.engineer.createUnavailable}</Button><Button variant="secondary" disabled>{m.engineer.saveUnavailable}</Button></div>
            </> : <div className="engineer-proposal__empty"><Wrench size={27} /><h3>{m.engineer.emptyTitle}</h3><p>{m.engineer.emptyCopy}</p></div>}
          </Card>
        </div>
      )}
    </div>
  )
}
