import { createSimulationFrames, type SimulationOptions } from './simulation'
import type { TelemetryFrame } from './types'

export type AdapterConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error'

export interface TelemetryAdapterCapabilities {
  readonly liveTelemetry: boolean
  readonly opponents: boolean
  readonly weather: boolean
  readonly hybrid: boolean
  readonly tyreSurfaceTemperatures: boolean
  readonly setupRead: boolean
  readonly setupWrite: boolean
}

export interface TelemetryAdapterStatus {
  readonly state: AdapterConnectionState
  readonly sourceName: string
  readonly sampleRateHz: number
  readonly connectedAt: string | null
  readonly lastFrameAt: string | null
  readonly framesReceived: number
  readonly error: string | null
  /** Human-readable transport state, e.g. waiting for LMU shared memory. */
  readonly detail?: string
}

export type TelemetryFrameListener = (frame: TelemetryFrame) => void
export type AdapterStatusListener = (status: TelemetryAdapterStatus) => void
export type Unsubscribe = () => void

/**
 * Boundary between the application domain and an LMU-specific transport.
 * Implementations may read shared memory, replay a recording, or generate
 * deterministic demo data; consumers do not need to know which one is active.
 */
export interface TelemetryAdapter {
  readonly id: string
  readonly displayName: string
  readonly capabilities: TelemetryAdapterCapabilities

  connect(): Promise<void>
  disconnect(): Promise<void>
  getStatus(): TelemetryAdapterStatus
  getLatestFrame(): TelemetryFrame | null
  subscribe(listener: TelemetryFrameListener): Unsubscribe
  subscribeStatus(listener: AdapterStatusListener): Unsubscribe
}

export interface MockTelemetryAdapterOptions extends SimulationOptions {
  /** Disable the interval for tests, storybooks, and frame-by-frame inspection. */
  readonly autoTick?: boolean
}

export class MockTelemetryAdapter implements TelemetryAdapter {
  readonly id = 'mock-lmu'
  readonly displayName = 'LMU deterministic simulation'
  readonly capabilities: TelemetryAdapterCapabilities = Object.freeze({
    liveTelemetry: true,
    opponents: true,
    weather: true,
    hybrid: true,
    tyreSurfaceTemperatures: true,
    setupRead: false,
    setupWrite: false,
  })

  private readonly options: MockTelemetryAdapterOptions
  private readonly frameListeners = new Set<TelemetryFrameListener>()
  private readonly statusListeners = new Set<AdapterStatusListener>()
  private stream: Generator<TelemetryFrame, never, void>
  private interval: ReturnType<typeof setInterval> | null = null
  private latestFrame: TelemetryFrame | null = null
  private status: TelemetryAdapterStatus

  constructor(options: MockTelemetryAdapterOptions = {}) {
    this.options = options
    this.stream = createSimulationFrames(options)
    const stepMs = options.stepMs ?? 100
    this.status = {
      state: 'idle',
      sourceName: this.displayName,
      sampleRateHz: 1_000 / stepMs,
      connectedAt: null,
      lastFrameAt: null,
      framesReceived: 0,
      error: null,
    }
  }

  async connect(): Promise<void> {
    if (this.status.state === 'connected' || this.status.state === 'connecting') return
    this.setStatus({ state: 'connecting', error: null })
    try {
      const connectedAt = new Date().toISOString()
      this.setStatus({ state: 'connected', connectedAt, error: null })
      this.advanceOneFrame()
      if (this.options.autoTick !== false) {
        const intervalMs = this.options.stepMs ?? 100
        this.interval = setInterval(() => this.advanceOneFrame(), intervalMs)
      }
    } catch (error) {
      this.setStatus({
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.status.state === 'idle') return
    this.setStatus({ state: 'disconnecting' })
    if (this.interval !== null) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.setStatus({ state: 'idle', connectedAt: null })
  }

  getStatus(): TelemetryAdapterStatus {
    return this.status
  }

  getLatestFrame(): TelemetryFrame | null {
    return this.latestFrame
  }

  subscribe(listener: TelemetryFrameListener): Unsubscribe {
    this.frameListeners.add(listener)
    return () => this.frameListeners.delete(listener)
  }

  subscribeStatus(listener: AdapterStatusListener): Unsubscribe {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  /**
   * Emits exactly one deterministic frame. This is intentionally public: the
   * UI can offer a paused demo scrubber and tests need no clock mocking.
   */
  advanceOneFrame(): TelemetryFrame {
    const frame = this.stream.next().value
    this.latestFrame = frame
    this.setStatus({
      lastFrameAt: frame.capturedAt,
      framesReceived: this.status.framesReceived + 1,
    })
    for (const listener of this.frameListeners) listener(frame)
    return frame
  }

  /** Restart the mock source from the same seed and options. */
  reset(): void {
    this.stream = createSimulationFrames(this.options)
    this.latestFrame = null
    this.setStatus({ lastFrameAt: null, framesReceived: 0, error: null })
  }

  private setStatus(update: Partial<TelemetryAdapterStatus>): void {
    this.status = Object.freeze({ ...this.status, ...update })
    for (const listener of this.statusListeners) listener(this.status)
  }
}
