import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { buildOverlayViewModel, closesOverlaySession, type OverlayViewModel } from './core/overlay-model'
import { defineMessages, I18nProvider, useI18n, useMessages } from './i18n'

export const overlayMessages = defineMessages({
  productName: 'APEX', waiting: 'Waiting for LMU session', sessionOnly: 'Vehicle telemetry not available yet', unavailable: '—', you: 'YOU', relative: 'RELATIVE', delta: 'DELTA', personalBest: 'to personal best', throttle: 'THR', brake: 'BRK', fuel: 'FUEL', measured: 'MEASURED', replay: 'REPLAY', speedUnit: 'km/h',
}, {
  productName: 'APEX', waiting: 'Warte auf LMU-Session', sessionOnly: 'Fahrzeugtelemetrie noch nicht verfügbar', unavailable: '—', you: 'DU', relative: 'RELATIV', delta: 'DELTA', personalBest: 'zur persönlichen Bestzeit', throttle: 'GAS', brake: 'BRM', fuel: 'KRAFTSTOFF', measured: 'GEMESSEN', replay: 'REPLAY', speedUnit: 'km/h',
})

const fallbackConfig: ApexOverlayConfig = {
  version: 1, displayId: null, displayFingerprint: null, opacity: 0.92, clickThrough: true,
  widgets: [
    { id: 'relative', enabled: true, bounds: { x: 0.014, y: 0.025, width: 0.168, height: 0.23 } },
    { id: 'delta', enabled: true, bounds: { x: 0.436, y: 0.025, width: 0.128, height: 0.105 } },
    { id: 'inputs', enabled: true, bounds: { x: 0.826, y: 0.855, width: 0.16, height: 0.12 } },
    { id: 'fuel', enabled: true, bounds: { x: 0.826, y: 0.025, width: 0.16, height: 0.13 } },
  ],
}

function OverlayContent() {
  const m = useMessages(overlayMessages)
  const { language } = useI18n()
  const numbers = useMemo(() => ({ one: new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), three: new Intl.NumberFormat(language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) }), [language])
  const [frame, setFrame] = useState<OverlayViewModel | null>(null)
  const [config, setConfig] = useState<ApexOverlayConfig>(fallbackConfig)
  useEffect(() => {
    void window.apexDesktop?.getOverlayConfig().then(setConfig)
    const stopConfig = window.apexDesktop?.onOverlayConfig(setConfig)
    const stopTelemetry = window.apexDesktop?.onTelemetryMessage((message) => {
      const next = buildOverlayViewModel(message)
      if (next) setFrame(next)
      else if (closesOverlaySession(message)) setFrame(null)
    })
    void window.apexDesktop?.startTelemetry()
    void window.apexDesktop?.overlayRendererReady()
    return () => { stopConfig?.(); stopTelemetry?.() }
  }, [])

  if (!frame) return <div className="overlay-waiting"><span /><strong>{m.productName}</strong><small>{m.waiting}</small></div>
  const widget = (id: ApexOverlayWidgetId, content: ReactNode) => {
    const item = config.widgets.find((candidate) => candidate.id === id)
    if (!item?.enabled) return null
    const style: CSSProperties = { left: `${item.bounds.x * 100}%`, top: `${item.bounds.y * 100}%`, width: `${item.bounds.width * 100}%`, height: `${item.bounds.height * 100}%`, right: 'auto', bottom: 'auto', transform: 'none' }
    return <div className={`overlay-slot overlay-slot--${id}`} style={style}>{content}</div>
  }
  const vehicleUnavailable = !frame.playerTelemetryAvailable
  return <div className="race-overlay" style={{ opacity: config.opacity }}>
    {frame.replay && <div className="overlay-source-badge">{m.replay}</div>}
    {vehicleUnavailable && <div className="overlay-availability">{m.sessionOnly}</div>}
    {widget('relative', <section className="race-overlay__relative"><header><span>{m.relative}</span><b>{frame.playerPosition === null ? m.unavailable : `P${frame.playerPosition}`}</b></header>{frame.relative.map((row) => <div key={row.id} className={row.player ? 'is-player' : ''}><span>{row.position || m.unavailable}</span><strong>{row.player ? m.you : row.driver}</strong><em>{row.player || row.gapSeconds === null ? m.unavailable : `${row.gapSeconds > 0 ? '+' : ''}${numbers.one.format(row.gapSeconds)}`}</em></div>)}</section>)}
    {widget('delta', <section className={`race-overlay__delta ${frame.deltaBestSeconds !== null && frame.deltaBestSeconds <= 0 ? 'is-gain' : ''}`}><span>{m.delta}</span><strong>{frame.deltaBestSeconds === null ? m.unavailable : `${frame.deltaBestSeconds > 0 ? '+' : ''}${numbers.three.format(frame.deltaBestSeconds)}`}</strong><small>{frame.deltaBestSeconds === null ? m.sessionOnly : m.personalBest}</small></section>)}
    {widget('inputs', <section className="race-overlay__inputs"><div><i style={{ transform: `scaleY(${frame.throttle ?? 0})` }} /><span>{m.throttle}</span></div><div><i style={{ transform: `scaleY(${frame.brake ?? 0})` }} /><span>{m.brake}</span></div><strong>{frame.speedKph === null ? m.unavailable : Math.round(frame.speedKph)}<small>{frame.speedKph === null ? '' : m.speedUnit}</small></strong><b>{frame.gear ?? m.unavailable}</b></section>)}
    {widget('fuel', <section className="race-overlay__fuel"><header><span>{m.fuel}</span><b>{m.measured}</b></header><strong>{frame.fuelL === null ? m.unavailable : numbers.one.format(frame.fuelL)} <small>{frame.fuelL === null ? '' : 'L'}</small></strong><p>{frame.fuelL === null ? m.sessionOnly : m.measured}</p></section>)}
  </div>
}

export function OverlayApp() { return <I18nProvider><OverlayContent /></I18nProvider> }
