import type { TelemetryFrame, TelemetrySample } from '../core'

export interface MeasuredRoutePoint {
  readonly distanceM: number
  readonly x: number
  readonly z: number
  readonly brake: number
  readonly speedKph: number
  readonly elapsedSeconds: number
}

export interface BrakeZone {
  readonly id: string
  readonly startDistanceM: number
  readonly peakDistanceM: number
  readonly releaseDistanceM: number
  readonly endDistanceM: number
  readonly peakPressure: number
  readonly durationSeconds: number
  readonly entrySpeedKph: number
  readonly minimumSpeedKph: number
  readonly exitSpeedKph: number
  readonly sampleCount: number
}

export interface MeasuredTrackSnapshot {
  readonly sessionId: string
  readonly trackName: string
  readonly layoutName: string
  readonly trackLengthM: number
  readonly route: readonly MeasuredRoutePoint[]
  readonly coverage: number
  readonly state: 'empty' | 'learning' | 'partial' | 'complete'
  readonly completedLapCount: number
  readonly selectedLapNumber: number | null
  readonly selectedLap: readonly MeasuredRoutePoint[]
  readonly brakeZones: readonly BrakeZone[]
  readonly geometryFingerprint: string | null
}

export interface BrakeZoneOptions {
  readonly applicationThreshold?: number
  readonly releaseThreshold?: number
  readonly minimumDurationSeconds?: number
  readonly minimumSamples?: number
  readonly mergeGapSeconds?: number
}

function finitePoint(point: MeasuredRoutePoint) {
  return Object.values(point).every((value) => Number.isFinite(value))
    && point.distanceM >= 0
    && point.brake >= 0
    && point.brake <= 1
}

export function detectBrakeZones(
  samples: readonly MeasuredRoutePoint[],
  options: BrakeZoneOptions = {},
): BrakeZone[] {
  const application = options.applicationThreshold ?? 0.12
  const release = options.releaseThreshold ?? 0.05
  const minimumDuration = options.minimumDurationSeconds ?? 0.12
  const minimumSamples = options.minimumSamples ?? 3
  const mergeGap = options.mergeGapSeconds ?? 0.16
  if (!(release >= 0 && release < application && application <= 1)) {
    throw new RangeError('brake thresholds must satisfy 0 <= release < application <= 1')
  }

  const ordered = samples.filter(finitePoint)
  const zones: BrakeZone[] = []
  let active: MeasuredRoutePoint[] | null = null
  let belowSince: number | null = null

  const finish = () => {
    if (!active || active.length === 0) return
    const braking = active.filter((sample) => sample.brake >= release)
    if (braking.length === 0) { active = null; belowSince = null; return }
    const start = active[0]
    const end = active.at(-1)!
    const duration = Math.max(0, end.elapsedSeconds - start.elapsedSeconds)
    if (duration >= minimumDuration && braking.length >= minimumSamples) {
      const peak = braking.reduce((best, sample) => sample.brake > best.brake ? sample : best)
      const minimum = active.reduce((best, sample) => sample.speedKph < best.speedKph ? sample : best)
      const lastPressure = [...braking].reverse()[0]
      zones.push({
        id: `brake-${zones.length + 1}-${Math.round(start.distanceM)}`,
        startDistanceM: start.distanceM,
        peakDistanceM: peak.distanceM,
        releaseDistanceM: lastPressure.distanceM,
        endDistanceM: end.distanceM,
        peakPressure: peak.brake,
        durationSeconds: duration,
        entrySpeedKph: start.speedKph,
        minimumSpeedKph: minimum.speedKph,
        exitSpeedKph: end.speedKph,
        sampleCount: active.length,
      })
    }
    active = null
    belowSince = null
  }

  for (const sample of ordered) {
    if (!active) {
      if (sample.brake >= application) active = [sample]
      continue
    }
    active.push(sample)
    if (sample.brake >= release) {
      belowSince = null
      continue
    }
    belowSince ??= sample.elapsedSeconds
    if (sample.elapsedSeconds - belowSince > mergeGap) finish()
  }
  finish()
  return zones
}

function median(values: readonly number[]) {
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

function fingerprint(points: readonly MeasuredRoutePoint[]) {
  if (points.length < 3) return null
  let hash = 2166136261
  for (const point of points) {
    const token = `${Math.round(point.distanceM / 5)}:${Math.round(point.x * 2)}:${Math.round(point.z * 2)};`
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function aggregateRoute(laps: readonly (readonly MeasuredRoutePoint[])[], trackLengthM: number, binSizeM: number) {
  const bins = new Map<number, MeasuredRoutePoint[]>()
  for (const lap of laps) {
    for (const sample of lap) {
      const bin = Math.max(0, Math.min(Math.ceil(trackLengthM / binSizeM) - 1, Math.floor(sample.distanceM / binSizeM)))
      const values = bins.get(bin) ?? []
      values.push(sample)
      bins.set(bin, values)
    }
  }
  return [...bins.entries()].sort(([left], [right]) => left - right).map(([, samples]) => ({
    distanceM: median(samples.map((sample) => sample.distanceM)),
    x: median(samples.map((sample) => sample.x)),
    z: median(samples.map((sample) => sample.z)),
    brake: median(samples.map((sample) => sample.brake)),
    speedKph: median(samples.map((sample) => sample.speedKph)),
    elapsedSeconds: median(samples.map((sample) => sample.elapsedSeconds)),
  }))
}

function sampleFromFrame(frame: TelemetryFrame): MeasuredRoutePoint | null {
  const position = frame.sample.worldPositionM
  if (!position || frame.sourceState !== 'vehicle-telemetry') return null
  const sample = {
    distanceM: frame.sample.distanceM,
    x: position.x,
    z: position.z,
    brake: frame.sample.inputs.brake,
    speedKph: frame.sample.motion.speedKph,
    elapsedSeconds: frame.sample.sessionElapsedMs / 1000,
  }
  return finitePoint(sample) ? sample : null
}

export class MeasuredTrackRecorder {
  private sessionId = ''
  private trackName = ''
  private layoutName = ''
  private trackLengthM = 0
  private lapId = ''
  private lapNumber = 0
  private currentLap: MeasuredRoutePoint[] = []
  private currentValid = true
  private completedLaps: Array<{ number: number; samples: MeasuredRoutePoint[] }> = []
  private lastSequence = -1
  private lastAccepted: MeasuredRoutePoint | null = null
  private readonly binSizeM: number

  constructor(binSizeM = 12) {
    if (!Number.isFinite(binSizeM) || binSizeM <= 0) throw new RangeError('binSizeM must be greater than zero')
    this.binSizeM = binSizeM
  }

  ingest(frame: TelemetryFrame, createSnapshot = true): MeasuredTrackSnapshot | null {
    const sessionChanged = frame.session.id !== this.sessionId
    if (sessionChanged) this.reset(frame)
    const publish = createSnapshot || sessionChanged
    if (frame.sequence <= this.lastSequence) return publish ? this.snapshot() : null
    this.lastSequence = frame.sequence

    if (frame.sample.lapId !== this.lapId) {
      this.finishLap()
      this.lapId = frame.sample.lapId
      this.lapNumber = frame.player.currentLapNumber
      this.currentLap = []
      this.currentValid = true
      this.lastAccepted = null
    }

    if (frame.sample.controlOwner !== 'local-player' || frame.sample.isInPitLane) {
      this.currentValid = false
      this.lastAccepted = null
      return publish ? this.snapshot() : null
    }
    const sample = sampleFromFrame(frame)
    if (!sample || sample.distanceM > this.trackLengthM * 1.05) {
      this.currentValid = false
      return publish ? this.snapshot() : null
    }
    const previous = this.lastAccepted
    if (previous) {
      const elapsed = sample.elapsedSeconds - previous.elapsedSeconds
      if (Math.abs(elapsed) < 1e-9) return publish ? this.snapshot() : null
      const movement = Math.hypot(sample.x - previous.x, sample.z - previous.z)
      const plausible = Math.max(20, (sample.speedKph / 3.6) * Math.max(0, elapsed) * 3 + 5)
      if (elapsed < 0 || elapsed > 1 || movement > plausible) {
        this.currentValid = false
        this.lastAccepted = null
        return publish ? this.snapshot() : null
      }
      if (sample.distanceM < previous.distanceM - this.trackLengthM * 0.5) {
        this.finishLap()
        this.currentLap = []
        this.currentValid = true
      }
      if (Math.abs(sample.distanceM - previous.distanceM) < 2 && elapsed < 0.08) return publish ? this.snapshot() : null
    }
    this.currentLap.push(sample)
    this.lastAccepted = sample
    return publish ? this.snapshot() : null
  }

  snapshot(): MeasuredTrackSnapshot {
    const selected = this.completedLaps.at(-1)
    const routeSource = this.completedLaps.length > 0
      ? this.completedLaps.map((lap) => lap.samples)
      : this.currentLap.length > 0 ? [this.currentLap] : []
    const route = aggregateRoute(routeSource, this.trackLengthM, this.binSizeM)
    const totalBins = Math.max(1, Math.ceil(this.trackLengthM / this.binSizeM))
    const coverage = Math.min(1, route.length / totalBins)
    const state = route.length === 0 ? 'empty' : this.completedLaps.length > 0 && coverage >= 0.82
      ? 'complete' : coverage >= 0.25 ? 'partial' : 'learning'
    const selectedLap = selected?.samples ?? this.currentLap
    return {
      sessionId: this.sessionId,
      trackName: this.trackName,
      layoutName: this.layoutName,
      trackLengthM: this.trackLengthM,
      route,
      coverage,
      state,
      completedLapCount: this.completedLaps.length,
      selectedLapNumber: selected?.number ?? (this.currentLap.length > 0 ? this.lapNumber : null),
      selectedLap,
      brakeZones: detectBrakeZones(selectedLap),
      geometryFingerprint: fingerprint(route),
    }
  }

  private reset(frame: TelemetryFrame) {
    this.sessionId = frame.session.id
    this.trackName = frame.session.track.name
    this.layoutName = frame.session.track.layout
    this.trackLengthM = Math.max(1, frame.session.track.lengthM)
    this.lapId = frame.sample.lapId
    this.lapNumber = frame.player.currentLapNumber
    this.currentLap = []
    this.currentValid = true
    this.completedLaps = []
    this.lastSequence = -1
    this.lastAccepted = null
  }

  private finishLap() {
    if (this.currentValid && this.currentLap.length >= 10) {
      const distances = this.currentLap.map((sample) => sample.distanceM)
      const coverage = (Math.max(...distances) - Math.min(...distances)) / this.trackLengthM
      if (coverage >= 0.8) {
        this.completedLaps.push({ number: this.lapNumber, samples: [...this.currentLap] })
        this.completedLaps = this.completedLaps.slice(-3)
      }
    }
  }
}

export function makeTrackSample(sample: TelemetrySample): MeasuredRoutePoint | null {
  const position = sample.worldPositionM
  if (!position) return null
  const point = { distanceM: sample.distanceM, x: position.x, z: position.z, brake: sample.inputs.brake, speedKph: sample.motion.speedKph, elapsedSeconds: sample.sessionElapsedMs / 1000 }
  return finitePoint(point) ? point : null
}
