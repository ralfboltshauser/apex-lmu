export type PlaybackMode = 'time' | 'distance'

export interface LapPlaybackSample {
  readonly distanceM: number
  readonly rawDistanceM?: number
  readonly distanceIndexM?: number
  readonly x: number
  readonly y?: number
  readonly z: number
  readonly brake: number
  readonly throttle?: number
  readonly steering?: number
  readonly clutch?: number
  readonly gear?: number
  readonly rpm?: number
  readonly speedKph: number
  readonly elapsedSeconds: number
  readonly lapElapsedSeconds: number
  readonly pathLateralM?: number | null
  readonly trackEdgeM?: number | null
  readonly countLapFlag?: number | null
}

const continuousKeys = ['distanceM', 'rawDistanceM', 'distanceIndexM', 'x', 'y', 'z', 'brake', 'throttle', 'steering', 'clutch', 'rpm', 'speedKph', 'elapsedSeconds', 'lapElapsedSeconds', 'pathLateralM', 'trackEdgeM'] as const

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function axis(sample: LapPlaybackSample, mode: PlaybackMode) { return mode === 'time' ? sample.lapElapsedSeconds : sample.distanceIndexM ?? sample.distanceM }
function interpolate(start: number, end: number, ratio: number) { return start + (end - start) * ratio }

export function playbackMaximum(samples: readonly LapPlaybackSample[], mode: PlaybackMode, officialLapTimeMs?: number | null) {
  if (!samples.length) return 0
  if (mode === 'time' && finite(officialLapTimeMs) && officialLapTimeMs > 0) return officialLapTimeMs / 1000
  return Math.max(0, axis(samples.at(-1)!, mode))
}

export function sampleLapAt(samples: readonly LapPlaybackSample[], mode: PlaybackMode, value: number): LapPlaybackSample | null {
  if (!samples.length || !finite(value)) return null
  if (value <= axis(samples[0], mode)) return { ...samples[0] }
  if (value >= axis(samples.at(-1)!, mode)) return { ...samples.at(-1)! }
  let low = 0
  let high = samples.length - 1
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (axis(samples[middle], mode) <= value) low = middle
    else high = middle
  }
  while (high < samples.length - 1 && axis(samples[high], mode) <= axis(samples[low], mode)) high += 1
  const before = samples[low]
  const after = samples[high]
  const span = axis(after, mode) - axis(before, mode)
  const ratio = span > 0 ? Math.max(0, Math.min(1, (value - axis(before, mode)) / span)) : 0
  const result = { ...before } as Record<string, unknown>
  for (const key of continuousKeys) {
    const start = before[key]
    const end = after[key]
    if (finite(start) && finite(end)) result[key] = interpolate(start, end, ratio)
    else if (start === null || end === null) result[key] = start ?? end
  }
  result.gear = ratio < 1 ? before.gear : after.gear
  result.countLapFlag = ratio < 1 ? before.countLapFlag : after.countLapFlag
  return result as unknown as LapPlaybackSample
}

export function normalizedPlayhead(samples: readonly LapPlaybackSample[], mode: PlaybackMode, value: number, officialLapTimeMs?: number | null) {
  const maximum = playbackMaximum(samples, mode, officialLapTimeMs)
  return maximum > 0 ? Math.max(0, Math.min(1, value / maximum)) : 0
}

export function deltaAtDistance(subject: readonly LapPlaybackSample[], reference: readonly LapPlaybackSample[], distanceM: number) {
  const subjectSample = sampleLapAt(subject, 'distance', distanceM)
  const referenceSample = sampleLapAt(reference, 'distance', distanceM)
  return subjectSample && referenceSample ? subjectSample.lapElapsedSeconds - referenceSample.lapElapsedSeconds : null
}

export function comparisonDeltaTrace(subject: readonly LapPlaybackSample[], reference: readonly LapPlaybackSample[], trackLengthM: number, stepM = 2) {
  if (!(trackLengthM > 0) || !(stepM > 0)) return []
  const trace = []
  for (let distanceM = 0; distanceM <= trackLengthM; distanceM += stepM) {
    const deltaSeconds = deltaAtDistance(subject, reference, distanceM)
    if (deltaSeconds !== null) trace.push({ distanceM, deltaSeconds })
  }
  return trace
}
