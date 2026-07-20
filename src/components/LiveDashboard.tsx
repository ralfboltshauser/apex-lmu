import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, GripVertical, Maximize2, Minimize2, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import {
  LIVE_MODULE_DESCRIPTORS,
  isDefaultLiveDashboardLayout,
  loadLiveDashboardLayout,
  moveLiveDashboardModule,
  resetLiveDashboardLayout,
  saveLiveDashboardLayout,
  updateLiveDashboardModule,
  type LiveDashboardLayoutV1,
  type LiveModuleId,
} from '../live-layout'
import { Button } from './ui'

export interface LiveDashboardLabels {
  edit: string
  done: string
  help: string
  reset: string
  resetQuestion: string
  confirmReset: string
  cancel: string
  drag: string
  moveBefore: string
  moveAfter: string
  makeCompact: string
  makeWide: string
  earlier: string
  later: string
  compact: string
  wide: string
  hideShort: string
  hide: string
  hidden: string
  restore: string
  moved: string
  resized: string
  hiddenAnnouncement: string
  restored: string
  resetAnnouncement: string
  modules: Record<'trackMap' | 'fuel' | 'standings' | 'carState' | 'events', string>
}

function reportStorageIssue(message: string) {
  void window.apexDesktop?.reportError({ message, context: 'live-layout-storage' })
}

export function LiveDashboard({ renderModule, labels }: { renderModule: (id: LiveModuleId) => ReactNode; labels: LiveDashboardLabels }) {
  const [loaded] = useState(() => loadLiveDashboardLayout())
  const [layout, setLayout] = useState<LiveDashboardLayoutV1>(loaded.layout)
  const [editing, setEditing] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [focusId, setFocusId] = useState<LiveModuleId | null>(null)
  const [pointerTarget, setPointerTarget] = useState<LiveModuleId | null>(null)
  const pointerDrag = useRef<{ pointerId: number; sourceId: LiveModuleId; targetId: LiveModuleId } | null>(null)
  const handleRefs = useRef(new Map<LiveModuleId, HTMLDivElement>())

  useEffect(() => {
    if (loaded.recoveredFrom) reportStorageIssue(`Recovered the Live dashboard default after ${loaded.recoveredFrom}.`)
  }, [loaded.recoveredFrom])

  useEffect(() => {
    if (!focusId) return
    handleRefs.current.get(focusId)?.focus()
    setFocusId(null)
  }, [focusId, layout])

  const titleFor = (id: LiveModuleId) => {
    const descriptor = LIVE_MODULE_DESCRIPTORS.find((candidate) => candidate.id === id)!
    return labels.modules[descriptor.titleKey]
  }

  const positionText = (next: LiveDashboardLayoutV1, id: LiveModuleId) => labels.moved
    .replace('{title}', titleFor(id))
    .replace('{position}', String(next.modules.filter((module) => module.visible).findIndex((module) => module.id === id) + 1))
    .replace('{count}', String(next.modules.filter((module) => module.visible).length))

  const commit = (next: LiveDashboardLayoutV1, message: string, nextFocusId?: LiveModuleId) => {
    setLayout(next)
    setAnnouncement(message)
    if (nextFocusId) setFocusId(nextFocusId)
    try { saveLiveDashboardLayout(next) }
    catch { reportStorageIssue('The Live dashboard layout changed for this session but could not be saved.') }
  }

  const move = (id: LiveModuleId, toIndex: number) => {
    const next = moveLiveDashboardModule(layout, id, toIndex)
    if (next === layout) return
    commit(next, positionText(next, id), id)
  }

  const resize = (id: LiveModuleId, span: 'compact' | 'wide') => {
    const next = updateLiveDashboardModule(layout, id, { span })
    commit(next, labels.resized.replace('{title}', titleFor(id)).replace('{size}', span === 'wide' ? labels.wide : labels.compact), id)
  }

  const setVisibility = (id: LiveModuleId, visible: boolean) => {
    const next = updateLiveDashboardModule(layout, id, { visible })
    commit(next, (visible ? labels.restored : labels.hiddenAnnouncement).replace('{title}', titleFor(id)), visible ? id : undefined)
  }

  const finishReset = () => {
    let next: LiveDashboardLayoutV1
    try { next = resetLiveDashboardLayout() }
    catch {
      next = loadLiveDashboardLayout({ getItem: () => null }).layout
      reportStorageIssue('The Live dashboard default was restored for this session but the saved preference could not be removed.')
    }
    setLayout(next)
    setConfirmingReset(false)
    setAnnouncement(labels.resetAnnouncement)
  }

  const pointerModuleAt = (clientX: number, clientY: number) => {
    const candidate = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-live-module]')?.dataset.liveModule
    return layout.modules.some((module) => module.visible && module.id === candidate) ? candidate as LiveModuleId : null
  }

  const startPointerMove = (event: PointerEvent<HTMLDivElement>, sourceId: LiveModuleId) => {
    if (!editing || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointerDrag.current = { pointerId: event.pointerId, sourceId, targetId: sourceId }
    setPointerTarget(sourceId)
  }

  const trackPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = pointerDrag.current
    if (!active || active.pointerId !== event.pointerId) return
    const targetId = pointerModuleAt(event.clientX, event.clientY)
    if (!targetId) return
    active.targetId = targetId
    setPointerTarget(targetId)
  }

  const finishPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = pointerDrag.current
    if (!active || active.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    pointerDrag.current = null
    setPointerTarget(null)
    if (active.sourceId === active.targetId) return
    move(active.sourceId, layout.modules.findIndex((module) => module.id === active.targetId))
  }

  const cancelPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerDrag.current?.pointerId !== event.pointerId) return
    pointerDrag.current = null
    setPointerTarget(null)
  }

  const hiddenModules = layout.modules.filter((module) => !module.visible)

  return <>
    <div className={`live-layout-toolbar ${editing ? 'is-editing' : ''}`} data-live-layout-toolbar>
      <div>
        <strong>{editing ? labels.edit : labels.help}</strong>
        {editing && <span>{labels.help}</span>}
      </div>
      <div className="live-layout-toolbar__actions">
        {editing ? <>
          {!confirmingReset && <Button variant="quiet" size="sm" icon={<RotateCcw size={14} />} disabled={isDefaultLiveDashboardLayout(layout)} onClick={() => setConfirmingReset(true)}>{labels.reset}</Button>}
          <Button variant="secondary" size="sm" icon={<Check size={14} />} onClick={() => { setEditing(false); setConfirmingReset(false) }}>{labels.done}</Button>
        </> : <Button variant="secondary" size="sm" icon={<SlidersHorizontal size={14} />} onClick={() => setEditing(true)}>{labels.edit}</Button>}
      </div>
    </div>

    {editing && confirmingReset && <div className="live-layout-reset" role="alert">
      <span>{labels.resetQuestion}</span>
      <div><Button variant="quiet" size="sm" icon={<X size={14} />} onClick={() => setConfirmingReset(false)}>{labels.cancel}</Button><Button variant="danger" size="sm" icon={<RotateCcw size={14} />} onClick={finishReset}>{labels.confirmReset}</Button></div>
    </div>}

    {editing && hiddenModules.length > 0 && <div className="live-hidden-modules">
      <strong>{labels.hidden}</strong>
      <div>{hiddenModules.map((module) => <button key={module.id} type="button" onClick={() => setVisibility(module.id, true)}><Eye size={14} /> {labels.restore.replace('{title}', titleFor(module.id))}</button>)}</div>
    </div>}

    <div className={`live-layout live-layout--customizable ${editing ? 'is-editing' : ''}`}>
      {layout.modules.filter((module) => module.visible).map((module, visibleIndex, visibleModules) => {
        const index = layout.modules.findIndex((candidate) => candidate.id === module.id)
        const descriptor = LIVE_MODULE_DESCRIPTORS.find((candidate) => candidate.id === module.id)!
        const title = titleFor(module.id)
        return <div
          className="live-module"
          data-live-module={module.id}
          data-span={module.span}
          data-pointer-target={pointerTarget === module.id || undefined}
          key={module.id}
        >
          {editing && <div className="live-module-controls">
            <div
              className="live-module-drag"
              role="group"
              tabIndex={-1}
              ref={(node) => { if (node) handleRefs.current.set(module.id, node); else handleRefs.current.delete(module.id) }}
              onPointerDown={(event) => startPointerMove(event, module.id)}
              onPointerMove={trackPointerMove}
              onPointerUp={finishPointerMove}
              onPointerCancel={cancelPointerMove}
              aria-label={labels.drag.replace('{title}', title)}
            ><GripVertical size={15} /><span>{title}</span></div>
            <div>
              <button type="button" disabled={visibleIndex === 0} aria-label={labels.moveBefore.replace('{title}', title)} onClick={() => move(module.id, layout.modules.findIndex((candidate) => candidate.id === visibleModules[visibleIndex - 1]?.id))}><ArrowLeft size={14} /><span>{labels.earlier}</span></button>
              <button type="button" disabled={visibleIndex === visibleModules.length - 1} aria-label={labels.moveAfter.replace('{title}', title)} onClick={() => move(module.id, layout.modules.findIndex((candidate) => candidate.id === visibleModules[visibleIndex + 1]?.id))}><ArrowRight size={14} /><span>{labels.later}</span></button>
              {descriptor.canResize && <button type="button" aria-label={(module.span === 'wide' ? labels.makeCompact : labels.makeWide).replace('{title}', title)} onClick={() => resize(module.id, module.span === 'wide' ? 'compact' : 'wide')}>{module.span === 'wide' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}<span>{module.span === 'wide' ? labels.compact : labels.wide}</span></button>}
              {descriptor.canHide && <button type="button" aria-label={labels.hide.replace('{title}', title)} onClick={() => setVisibility(module.id, false)}><EyeOff size={14} /><span>{labels.hideShort}</span></button>}
            </div>
          </div>}
          {renderModule(module.id)}
        </div>
      })}
    </div>
    <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
  </>
}
