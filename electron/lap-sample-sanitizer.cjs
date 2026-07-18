const TERMINAL_BOUNDARY_POLICY = Object.freeze({
  maximumDistanceFromFinishM: 32.001,
  // The bridge is bounded to 100 Hz. A 250 ms producer transition can contain
  // at most 26 samples when both endpoints are included. The private 50 Hz
  // canonical recording contains nine before in-memory compaction.
  maximumSuffixSamples: 26,
  maximumResetElapsedMs: 250,
  maximumOfficialTimeDifferenceMs: 250,
  numericTolerance: 1e-6,
})

const finite = (value) => typeof value === 'number' && Number.isFinite(value)

function sampleDistanceM(sample) {
  return finite(sample?.distanceIndexM) ? sample.distanceIndexM : sample?.distanceM
}

function sampleTimeMs(sample) {
  if (finite(sample?.timeMs)) return sample.timeMs
  return finite(sample?.lapElapsedSeconds) ? sample.lapElapsedSeconds * 1000 : NaN
}

/**
 * LMU can briefly expose an already-new-lap timestamp while distance still
 * belongs to the completed lap's finish line. Recognize only that measured
 * producer-transition shape. Callers may discard a suffix only when `status`
 * is `trimmed`; every near miss remains untouched and can fail validation.
 */
function sanitizeTerminalBoundarySamples(samples, { trackLengthM, officialLapTimeMs } = {}) {
  if (!Array.isArray(samples) || samples.length === 0 || !finite(trackLengthM) || trackLengthM <= 0
    || !finite(officialLapTimeMs) || officialLapTimeMs <= 0) return { status: 'unchanged', samples }

  let previousDistanceM = -Infinity
  let previousTimeMs = -Infinity
  let resetIndex = null
  for (let index = 0; index < samples.length; index += 1) {
    const distanceM = sampleDistanceM(samples[index])
    const timeMs = sampleTimeMs(samples[index])
    if (!finite(distanceM) || !finite(timeMs) || distanceM < 0 || distanceM > trackLengthM || timeMs < 0
      || distanceM < previousDistanceM - TERMINAL_BOUNDARY_POLICY.numericTolerance) {
      return { status: resetIndex === null ? 'unchanged' : 'invalid-reset', samples }
    }
    if (timeMs < previousTimeMs - TERMINAL_BOUNDARY_POLICY.numericTolerance) {
      if (resetIndex !== null) return { status: 'invalid-reset', samples }
      resetIndex = index
    }
    previousDistanceM = distanceM
    previousTimeMs = timeMs
  }
  if (resetIndex === null) return { status: 'unchanged', samples }

  const prefix = samples.slice(0, resetIndex)
  const suffix = samples.slice(resetIndex)
  if (prefix.length < 3 || suffix.length < 1 || suffix.length > TERMINAL_BOUNDARY_POLICY.maximumSuffixSamples) {
    return { status: 'invalid-reset', samples }
  }
  const endpointDistanceM = sampleDistanceM(prefix.at(-1))
  const endpointTimeMs = sampleTimeMs(prefix.at(-1))
  if (trackLengthM - endpointDistanceM > TERMINAL_BOUNDARY_POLICY.maximumDistanceFromFinishM
    || Math.abs(endpointTimeMs - officialLapTimeMs) > TERMINAL_BOUNDARY_POLICY.maximumOfficialTimeDifferenceMs) {
    return { status: 'invalid-reset', samples }
  }

  previousDistanceM = endpointDistanceM
  let previousSuffixTimeMs = -Infinity
  for (const sample of suffix) {
    const distanceM = sampleDistanceM(sample)
    const timeMs = sampleTimeMs(sample)
    if (trackLengthM - distanceM > TERMINAL_BOUNDARY_POLICY.maximumDistanceFromFinishM
      || distanceM < previousDistanceM - TERMINAL_BOUNDARY_POLICY.numericTolerance
      || timeMs < previousSuffixTimeMs - TERMINAL_BOUNDARY_POLICY.numericTolerance
      || timeMs > TERMINAL_BOUNDARY_POLICY.maximumResetElapsedMs) {
      return { status: 'invalid-reset', samples }
    }
    previousDistanceM = distanceM
    previousSuffixTimeMs = timeMs
  }
  return { status: 'trimmed', samples: prefix, trimmedSampleCount: suffix.length }
}

function playbackSamples(samples, options) {
  const result = sanitizeTerminalBoundarySamples(samples, options)
  return result.status === 'trimmed' ? result.samples : samples
}

module.exports = {
  TERMINAL_BOUNDARY_POLICY,
  playbackSamples,
  sanitizeTerminalBoundarySamples,
}
