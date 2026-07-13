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

export interface MeasuredLapRecord {
  readonly id: string
  readonly number: number
  readonly state: 'current' | 'complete' | 'incomplete'
  readonly quality: 'clean' | 'limited' | 'ineligible'
  readonly samples: readonly MeasuredRoutePoint[]
}

export interface MeasuredSessionRecord {
  readonly id: string
  readonly trackName: string
  readonly layoutName: string
  readonly trackLengthM: number
  readonly laps: readonly MeasuredLapRecord[]
  readonly trackModel?: {
    readonly published: boolean
    readonly coverage: number
    readonly geometryHash: string
    readonly points: readonly { distanceM: number; x: number; y?: number; z: number }[]
  } | null
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

export function buildMeasuredTrackSnapshot(session: MeasuredSessionRecord, selectedLapId: string, binSizeM = 12): MeasuredTrackSnapshot | null {
  const selected = session.laps.find((lap) => lap.id === selectedLapId && lap.samples.length > 1)
  if (!selected) return null
  const completed = session.laps.filter((lap) => lap.state === 'complete')
  const routeLaps = completed.filter((lap) => lap.quality === 'clean' && lap.samples.length > 1).slice(-3)
  const routeSource = routeLaps.length > 0 ? routeLaps.map((lap) => lap.samples) : [selected.samples]
  const learnedRoute = session.trackModel?.published ? session.trackModel.points.map((point) => ({ distanceM: point.distanceM, x: point.x, z: point.z, brake: 0, speedKph: 0, elapsedSeconds: 0 })) : null
  const route = learnedRoute?.length ? learnedRoute : aggregateRoute(routeSource, session.trackLengthM, binSizeM)
  const totalBins = Math.max(1, Math.ceil(session.trackLengthM / binSizeM))
  const coverage = learnedRoute ? session.trackModel!.coverage : Math.min(1, route.length / totalBins)
  const state = route.length === 0 ? 'empty' : learnedRoute ? 'complete' : routeLaps.length > 0 && coverage >= 0.82 ? 'complete' : coverage >= 0.25 ? 'partial' : 'learning'
  return {
    sessionId: session.id,
    trackName: session.trackName,
    layoutName: session.layoutName,
    trackLengthM: session.trackLengthM,
    route,
    coverage,
    state,
    completedLapCount: completed.length,
    selectedLapNumber: selected.number,
    selectedLap: selected.samples,
    brakeZones: detectBrakeZones(selected.samples),
    geometryFingerprint: learnedRoute ? session.trackModel!.geometryHash : fingerprint(route),
  }
}
