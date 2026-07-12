import { useEffect, useMemo, useState } from 'react'
import { defineMessages, I18nProvider, useI18n, useMessages } from './i18n'

export const overlayMessages = defineMessages({
  productName: 'APEX',
  waiting: 'Waiting for LMU session',
  you: 'YOU',
  relative: 'RELATIVE',
  delta: 'DELTA',
  personalBest: 'to personal best',
  throttle: 'THR',
  brake: 'BRK',
  fuel: 'FUEL',
  live: 'LIVE',
  finishForecast: 'Finish forecast appears after 3 clean laps',
  speedUnit: 'km/h',
}, {
  productName: 'APEX',
  waiting: 'Warte auf LMU-Session',
  you: 'DU',
  relative: 'RELATIV',
  delta: 'DELTA',
  personalBest: 'zur persönlichen Bestzeit',
  throttle: 'GAS',
  brake: 'BRM',
  fuel: 'KRAFTSTOFF',
  live: 'LIVE',
  finishForecast: 'Zielprognose nach 3 sauberen Runden',
  speedUnit: 'km/h',
})

interface OverlayFrame {
  source?: 'lmu-shared-memory' | 'self-test'
  type: 'telemetry'
  player: { position: number; fuelL: number; deltaBestSeconds: number; speedKph: number; gear: number; throttle: number; brake: number; timeBehindLeaderSeconds: number }
  opponents: Array<{ id: number; position: number; driver: string; behindLeaderSeconds: number; class: string }>
}

const isFrame = (value: unknown): value is OverlayFrame => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { type?: string; source?: string }
  return candidate.type === 'telemetry' && candidate.source !== 'self-test'
}

const closesLiveSession = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { type?: string; source?: string; state?: string }
  return candidate.type === 'status'
    && candidate.source !== 'self-test'
    && candidate.state !== 'connected'
}

function OverlayContent() {
  const m = useMessages(overlayMessages)
  const { language } = useI18n()
  const numbers = useMemo(() => ({
    one: new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    three: new Intl.NumberFormat(language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
  }), [language])
  const [frame, setFrame] = useState<OverlayFrame | null>(null)
  useEffect(() => {
    const unsubscribe = window.apexDesktop?.onTelemetryMessage((message) => {
      if (isFrame(message)) setFrame(message)
      else if (closesLiveSession(message)) setFrame(null)
    })
    void window.apexDesktop?.startTelemetry()
    return () => unsubscribe?.()
  }, [])

  if (!frame) return <div className="overlay-waiting"><span /><strong>{m.productName}</strong><small>{m.waiting}</small></div>
  const sorted = [...frame.opponents, { id: -1, position: frame.player.position, driver: m.you, behindLeaderSeconds: frame.player.timeBehindLeaderSeconds, class: '' }].sort((a, b) => a.position - b.position)
  const playerIndex = sorted.findIndex((row) => row.id === -1)
  const relative = sorted.slice(Math.max(0, playerIndex - 2), playerIndex + 3)
  return <div className="race-overlay">
    <section className="race-overlay__relative"><header><span>{m.relative}</span><b>P{frame.player.position}</b></header>{relative.map((row) => <div key={row.id} className={row.id === -1 ? 'is-player' : ''}><span>{row.position}</span><strong>{row.driver}</strong><em>{row.id === -1 ? '—' : `${row.behindLeaderSeconds - frame.player.timeBehindLeaderSeconds > 0 ? '+' : ''}${numbers.one.format(row.behindLeaderSeconds - frame.player.timeBehindLeaderSeconds)}`}</em></div>)}</section>
    <section className={`race-overlay__delta ${frame.player.deltaBestSeconds <= 0 ? 'is-gain' : ''}`}><span>{m.delta}</span><strong>{frame.player.deltaBestSeconds > 0 ? '+' : ''}{numbers.three.format(frame.player.deltaBestSeconds)}</strong><small>{m.personalBest}</small></section>
    <section className="race-overlay__inputs"><div><i style={{ transform: `scaleY(${frame.player.throttle})` }} /><span>{m.throttle}</span></div><div><i style={{ transform: `scaleY(${frame.player.brake})` }} /><span>{m.brake}</span></div><strong>{Math.round(frame.player.speedKph)}<small>{m.speedUnit}</small></strong><b>{frame.player.gear}</b></section>
    <section className="race-overlay__fuel"><header><span>{m.fuel}</span><b>{m.live}</b></header><strong>{numbers.one.format(frame.player.fuelL)} <small>L</small></strong><p>{m.finishForecast}</p></section>
  </div>
}

export function OverlayApp() {
  return <I18nProvider><OverlayContent /></I18nProvider>
}
