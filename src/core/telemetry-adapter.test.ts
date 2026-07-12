import { describe, expect, it, vi } from 'vitest'
import { MockTelemetryAdapter } from './telemetry-adapter'

describe('MockTelemetryAdapter', () => {
  it('follows the adapter lifecycle and emits an immediate frame', async () => {
    const adapter = new MockTelemetryAdapter({ autoTick: false, seed: 12 })
    const frames = vi.fn()
    const statuses = vi.fn()
    const unsubscribeFrame = adapter.subscribe(frames)
    const unsubscribeStatus = adapter.subscribeStatus(statuses)

    expect(adapter.getStatus().state).toBe('idle')
    await adapter.connect()

    expect(adapter.getStatus().state).toBe('connected')
    expect(adapter.getStatus().framesReceived).toBe(1)
    expect(frames).toHaveBeenCalledTimes(1)
    expect(adapter.getLatestFrame()?.sequence).toBe(0)

    adapter.advanceOneFrame()
    expect(adapter.getLatestFrame()?.sequence).toBe(1)
    expect(frames).toHaveBeenCalledTimes(2)

    await adapter.disconnect()
    expect(adapter.getStatus().state).toBe('idle')
    expect(statuses).toHaveBeenCalled()

    unsubscribeFrame()
    unsubscribeStatus()
  })

  it('can reset to the exact first deterministic frame', async () => {
    const adapter = new MockTelemetryAdapter({ autoTick: false, seed: 99 })
    await adapter.connect()
    const first = adapter.getLatestFrame()
    adapter.advanceOneFrame()
    adapter.reset()
    const replayed = adapter.advanceOneFrame()

    expect(replayed).toEqual(first)
    expect(adapter.getStatus().framesReceived).toBe(1)
    await adapter.disconnect()
  })

  it('does not duplicate timers or frames when connected twice', async () => {
    const adapter = new MockTelemetryAdapter({ autoTick: false })
    await adapter.connect()
    await adapter.connect()

    expect(adapter.getStatus().framesReceived).toBe(1)
    await adapter.disconnect()
  })
})
