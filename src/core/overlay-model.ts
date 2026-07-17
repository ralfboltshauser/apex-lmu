export interface OverlayRelativeRow {
  id: number
  position: number
  driver: string
  gapSeconds: number | null
  player: boolean
}

export interface OverlayViewModel {
  replay: boolean
  playerTelemetryAvailable: boolean
  playerPosition: number | null
  relative: OverlayRelativeRow[]
  deltaBestSeconds: number | null
  speedKph: number | null
  gear: number | null
  throttle: number | null
  brake: number | null
  fuelL: number | null
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function finite(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null }
function text(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value : fallback }

export function buildOverlayViewModel(value: unknown): OverlayViewModel | null {
  if (!record(value) || value.type !== 'telemetry' || value.source === 'self-test' || !record(value.player) || !Array.isArray(value.opponents)) return null
  const player = value.player
  const playerPosition = finite(player.position)
  const playerGap = finite(player.timeBehindLeaderSeconds)
  const rows: OverlayRelativeRow[] = value.opponents.filter(record).map((opponent, index) => ({
    id: finite(opponent.id) ?? index,
    position: finite(opponent.position) ?? 0,
    driver: text(opponent.driver, 'Unknown'),
    gapSeconds: finite(opponent.behindLeaderSeconds),
    player: false,
  }))
  if (playerPosition !== null) rows.push({ id: -1, position: playerPosition, driver: '', gapSeconds: playerGap, player: true })
  rows.sort((a, b) => a.position - b.position)
  const playerIndex = rows.findIndex((row) => row.player)
  const relative = playerIndex < 0 ? [] : rows.slice(Math.max(0, playerIndex - 2), playerIndex + 3).map((row) => ({ ...row, gapSeconds: row.player || row.gapSeconds === null || playerGap === null ? null : row.gapSeconds - playerGap }))
  const available = value.playerTelemetryAvailable !== false
  return {
    replay: value.source === 'recording-replay',
    playerTelemetryAvailable: available,
    playerPosition,
    relative,
    deltaBestSeconds: available ? finite(player.deltaBestSeconds) : null,
    speedKph: available ? finite(player.speedKph) : null,
    gear: available ? finite(player.gear) : null,
    throttle: available ? finite(player.throttle) : null,
    brake: available ? finite(player.brake) : null,
    fuelL: available ? finite(player.fuelL) : null,
  }
}

export function closesOverlaySession(value: unknown): boolean {
  return record(value) && value.type === 'status' && value.source !== 'self-test'
    && !['connected', 'invalid-data', 'degraded-data'].includes(String(value.state))
}
