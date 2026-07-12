import { useEffect, useState } from 'react'

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

export function OverlayApp() {
  const [frame, setFrame] = useState<OverlayFrame | null>(null)
  useEffect(() => {
    const unsubscribe = window.apexDesktop?.onTelemetryMessage((message) => {
      if (isFrame(message)) setFrame(message)
      else if (closesLiveSession(message)) setFrame(null)
    })
    void window.apexDesktop?.startTelemetry()
    return () => unsubscribe?.()
  }, [])

  if (!frame) return <div className="overlay-waiting"><span /><strong>APEX</strong><small>Waiting for LMU session</small></div>
  const sorted = [...frame.opponents, { id: -1, position: frame.player.position, driver: 'YOU', behindLeaderSeconds: frame.player.timeBehindLeaderSeconds, class: '' }].sort((a, b) => a.position - b.position)
  const playerIndex = sorted.findIndex((row) => row.id === -1)
  const relative = sorted.slice(Math.max(0, playerIndex - 2), playerIndex + 3)
  return <div className="race-overlay">
    <section className="race-overlay__relative"><header><span>RELATIVE</span><b>P{frame.player.position}</b></header>{relative.map((row) => <div key={row.id} className={row.id === -1 ? 'is-player' : ''}><span>{row.position}</span><strong>{row.driver}</strong><em>{row.id === -1 ? '—' : `${row.behindLeaderSeconds - frame.player.timeBehindLeaderSeconds > 0 ? '+' : ''}${(row.behindLeaderSeconds - frame.player.timeBehindLeaderSeconds).toFixed(1)}`}</em></div>)}</section>
    <section className={`race-overlay__delta ${frame.player.deltaBestSeconds <= 0 ? 'is-gain' : ''}`}><span>DELTA</span><strong>{frame.player.deltaBestSeconds > 0 ? '+' : ''}{frame.player.deltaBestSeconds.toFixed(3)}</strong><small>to personal best</small></section>
    <section className="race-overlay__inputs"><div><i style={{ transform: `scaleY(${frame.player.throttle})` }} /><span>THR</span></div><div><i style={{ transform: `scaleY(${frame.player.brake})` }} /><span>BRK</span></div><strong>{Math.round(frame.player.speedKph)}<small>km/h</small></strong><b>{frame.player.gear}</b></section>
    <section className="race-overlay__fuel"><header><span>FUEL</span><b>LIVE</b></header><strong>{frame.player.fuelL.toFixed(1)} <small>L</small></strong><p>Finish forecast appears after 3 clean laps</p></section>
  </div>
}
