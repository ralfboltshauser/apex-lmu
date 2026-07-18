const crypto = require('node:crypto')
const { TERMINAL_BOUNDARY_POLICY, sanitizeTerminalBoundarySamples } = require('./lap-sample-sanitizer.cjs')

const SCHEMA_VERSION = 1
const ALGORITHM_VERSION = 'driver-review-v1'

// These gates are exported deliberately. They are product policy, not hidden
// tuning: private-recording calibration may change them only with new fixture
// evidence and corresponding regression tests.
const REVIEW_CONSTANTS = Object.freeze({
  MAX_DECODED_LAPS: 16,
  GRID_STEP_M: 16,
  SEGMENT_LENGTH_M: 256,
  // Ordinary route coverage and the terminal producer transition are separate
  // evidence policies even though both currently use a two-grid-step bound.
  MAX_CIRCULAR_SAMPLE_GAP_M: 32.001,
  MIN_NON_REFERENCE_LAPS: 3,
  MIN_DIRECTIONAL_AGREEMENT: 0.75,
  MIN_RECURRING_LOSS_MS: 80,
  DIRECTION_EPSILON_MS: 1,
  MAX_HOTSPOTS: 6,
  MAX_OBSERVATIONS_PER_HOTSPOT: 3,
  MAX_EXPERIMENTS_PER_HOTSPOT: 3,
  BRAKE_ONSET_THRESHOLD: 0.12,
  BRAKE_RELEASE_THRESHOLD: 0.05,
  THROTTLE_PICKUP_THRESHOLD: 0.75,
  COAST_BRAKE_MAX: 0.05,
  COAST_THROTTLE_MAX: 0.2,
  EXIT_WINDOW_M: 32,
  MIN_EVENT_DELTA_M: 16,
  MIN_COAST_DELTA_M: 32,
  MIN_SPEED_DELTA_KPH: 3,
})

const EVIDENCE_EXCLUSION_CODES = Object.freeze([
  'not-complete',
  'not-official',
  'not-clean',
  'not-reference-eligible',
  'not-replayable',
  'payload-unavailable',
  'payload-evicted',
  'cohort-limit',
])

const STATUS_CODES = Object.freeze(['ready', 'insufficient-evidence', 'invalid-input'])
const LIMITATION_CODES = Object.freeze([
  'cohort-capped',
  'fewer-than-three-comparisons',
  'no-recurring-hotspots',
  'selected-lap-not-supplied',
  'selected-lap-not-analyzed',
  'selected-lap-is-reference',
])
const OBSERVATION_CODES = Object.freeze([
  'brake-onset-earlier', 'brake-onset-later',
  'brake-release-earlier', 'brake-release-later',
  'throttle-pickup-earlier', 'throttle-pickup-later',
  'coast-distance-more', 'coast-distance-less',
  'minimum-speed-lower', 'minimum-speed-higher',
  'exit-speed-lower', 'exit-speed-higher',
])
const EXPERIMENT_CODES = Object.freeze([
  'brake-onset-later-small-step',
  'brake-release-earlier-small-step',
  'throttle-pickup-earlier-small-step',
  'coast-distance-shorter-small-step',
  'minimum-speed-higher-small-step',
  'exit-speed-higher-small-step',
])
const STRENGTH_CODES = Object.freeze(['recurring-relative-gain', 'smallest-median-relative-loss'])
const VARIABILITY_CODES = Object.freeze(['pace-stable', 'pace-moderate', 'pace-variable'])

const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))
const round = (value, decimals = 3) => Number(value.toFixed(decimals))
function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
function mad(values, center = median(values)) {
  return center === null ? null : median(values.map((value) => Math.abs(value - center)))
}
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function compareText(left, right) {
  const a = String(left)
  const b = String(right)
  return a < b ? -1 : a > b ? 1 : 0
}
function validId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 256 }
function nonnegativeInteger(value) { return Number.isSafeInteger(value) && value >= 0 }

function emptyAccounting(lapCount) {
  return {
    totalLapCount: lapCount,
    strictEligibleTotal: lapCount,
    sampledLapCount: lapCount,
    strictExcludedTotal: 0,
    notDecodedDueToLimit: 0,
    exclusions: {},
  }
}

// Evidence accounting is explicitly numeric and code-whitelisted so caller
// metadata can never smuggle a driver identity, filename, or local path into a
// generated review. Transport can preserve counts after it caps decoded laps.
function normalizeEvidence(evidence, lapCount) {
  if (evidence === undefined || evidence === null) return emptyAccounting(lapCount)
  if (typeof evidence !== 'object' || Array.isArray(evidence)) return null
  const fields = ['totalLapCount', 'strictEligibleTotal', 'sampledLapCount', 'strictExcludedTotal', 'notDecodedDueToLimit']
  if (fields.some((field) => !nonnegativeInteger(evidence[field]))) return null
  if (evidence.sampledLapCount !== lapCount
    || evidence.totalLapCount < evidence.strictEligibleTotal
    || evidence.strictEligibleTotal < evidence.sampledLapCount
    || evidence.strictExcludedTotal !== evidence.totalLapCount - evidence.strictEligibleTotal
    || evidence.notDecodedDueToLimit !== evidence.strictEligibleTotal - evidence.sampledLapCount) return null
  if (typeof evidence.exclusions !== 'object' || evidence.exclusions === null || Array.isArray(evidence.exclusions)) return null
  if (Object.keys(evidence.exclusions).some((code) => !EVIDENCE_EXCLUSION_CODES.includes(code))) return null
  const exclusions = {}
  for (const code of EVIDENCE_EXCLUSION_CODES) {
    const count = evidence.exclusions[code]
    if (count === undefined) continue
    if (!nonnegativeInteger(count)) return null
    if (count > 0) exclusions[code] = count
  }
  if ((exclusions['cohort-limit'] ?? 0) !== evidence.notDecodedDueToLimit) return null
  return { ...Object.fromEntries(fields.map((field) => [field, evidence[field]])), exclusions }
}

function invalidResult(reasonCode, source = null) {
  return {
    schemaVersion: SCHEMA_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    inputFingerprint: hash([ALGORITHM_VERSION, 'invalid-input', reasonCode, source]),
    status: { code: 'invalid-input', reasonCode },
    cohort: { decodedLapCount: 0, analyzedLapCount: 0, nonReferenceLapCount: 0, accounting: emptyAccounting(0) },
    reference: null,
    selectedComparison: null,
    hotspots: [],
    strength: null,
    variability: null,
    limitations: [],
  }
}

function strictLap(payload, sessionId, trackLengthM) {
  if (!payload || typeof payload !== 'object' || !payload.lap || !payload.session) return { error: 'lap-payload-malformed' }
  const lap = payload.lap
  const payloadSessionId = payload.session.id
  if (payloadSessionId !== sessionId) return { error: 'lap-session-mismatch' }
  if (!validId(lap.id) || !Number.isSafeInteger(lap.number) || lap.number < 0) return { error: 'lap-identity-malformed' }
  if (lap.state !== 'complete' || lap.quality !== 'clean' || lap.referenceEligible !== true
    || lap.replayable !== true || lap.timingSource !== 'official' || !finite(lap.lapTimeMs) || lap.lapTimeMs <= 0) return { error: 'lap-not-strict-eligible' }
  const payloadLength = payload.session.track?.lengthM
  if (finite(payloadLength) && Math.abs(payloadLength - trackLengthM) > 1) return { error: 'lap-track-length-mismatch' }
  if (!Array.isArray(payload.samples) || payload.samples.length < 3) return { error: 'lap-samples-unavailable' }

  const rawSamples = []
  let previousDistance = -Infinity
  for (const sample of payload.samples) {
    const distanceM = finite(sample?.distanceIndexM) ? sample.distanceIndexM : sample?.distanceM
    const timeMs = finite(sample?.lapElapsedSeconds) ? sample.lapElapsedSeconds * 1000 : NaN
    const values = [distanceM, timeMs, sample?.brake, sample?.throttle, sample?.speedKph]
    if (values.some((value) => !finite(value))) return { error: 'lap-sample-nonfinite' }
    if (distanceM < 0 || distanceM > trackLengthM || timeMs < 0
      || sample.brake < 0 || sample.brake > 1 || sample.throttle < 0 || sample.throttle > 1 || sample.speedKph < 0) return { error: 'lap-sample-out-of-range' }
    if (distanceM < previousDistance - 1e-6) return { error: 'lap-samples-decreasing' }
    const normalized = { distanceM, timeMs, brake: sample.brake, throttle: sample.throttle, speedKph: sample.speedKph }
    rawSamples.push(normalized)
    previousDistance = distanceM
  }
  const boundaryResult = sanitizeTerminalBoundarySamples(rawSamples, { trackLengthM, officialLapTimeMs: lap.lapTimeMs })
  if (boundaryResult.status === 'invalid-reset') return { error: 'lap-samples-decreasing' }
  const boundarySanitized = boundaryResult.samples
  const samples = []
  for (const sample of boundarySanitized) {
    if (samples.length && Math.abs(samples.at(-1).distanceM - sample.distanceM) <= 1e-6) samples[samples.length - 1] = sample
    else samples.push(sample)
  }
  if (samples.length < 3) return { error: 'lap-distance-evidence-insufficient' }
  if (samples.at(-1).timeMs - samples[0].timeMs > lap.lapTimeMs + 250) return { error: 'lap-time-span-invalid' }
  let maximumGapM = samples[0].distanceM + trackLengthM - samples.at(-1).distanceM
  for (let index = 1; index < samples.length; index += 1) maximumGapM = Math.max(maximumGapM, samples[index].distanceM - samples[index - 1].distanceM)
  if (maximumGapM > REVIEW_CONSTANTS.MAX_CIRCULAR_SAMPLE_GAP_M) return { error: 'lap-circular-coverage-insufficient' }
  return {
    value: {
      id: lap.id,
      number: lap.number,
      lapTimeMs: lap.lapTimeMs,
      samples,
    },
  }
}

function interpolatedChannels(samples, distanceM, trackLengthM, lapTimeMs, rightIndex) {
  let left
  let right
  let leftDistanceM
  let rightDistanceM
  let leftTimeOffsetMs = 0
  let rightTimeOffsetMs = 0
  if (rightIndex >= samples.length) {
    left = samples.at(-1)
    right = samples[0]
    leftDistanceM = left.distanceM
    rightDistanceM = right.distanceM + trackLengthM
    rightTimeOffsetMs = lapTimeMs
  } else if (rightIndex === 0 && samples[0].distanceM > distanceM) {
    left = samples.at(-1)
    right = samples[0]
    leftDistanceM = left.distanceM - trackLengthM
    rightDistanceM = right.distanceM
    leftTimeOffsetMs = -lapTimeMs
  } else if (rightIndex === 0) {
    return { timeMs: samples[0].timeMs, brake: samples[0].brake, throttle: samples[0].throttle, speedKph: samples[0].speedKph }
  } else {
    left = samples[rightIndex - 1]
    right = samples[rightIndex]
    leftDistanceM = left.distanceM
    rightDistanceM = right.distanceM
  }
  const span = rightDistanceM - leftDistanceM
  if (span <= 1e-9) return { timeMs: right.timeMs + rightTimeOffsetMs, brake: right.brake, throttle: right.throttle, speedKph: right.speedKph }
  const progress = clamp((distanceM - leftDistanceM) / span, 0, 1)
  const interpolate = (leftValue, rightValue) => leftValue + (rightValue - leftValue) * progress
  return {
    timeMs: interpolate(left.timeMs + leftTimeOffsetMs, right.timeMs + rightTimeOffsetMs),
    brake: interpolate(left.brake, right.brake),
    throttle: interpolate(left.throttle, right.throttle),
    speedKph: interpolate(left.speedKph, right.speedKph),
  }
}

function profileFor(lap, trackLengthM) {
  const distances = []
  for (let distanceM = 0; distanceM < trackLengthM; distanceM += REVIEW_CONSTANTS.GRID_STEP_M) distances.push(distanceM)
  distances.push(trackLengthM)
  // Both source samples and target distances are monotonic. Advance one source
  // cursor across the route and interpolate every channel from the same
  // bracket, making resampling O(samples + grid) instead of repeatedly scanning
  // from sample zero for each grid point and channel.
  const rows = []
  let rightIndex = 0
  for (let index = 0; index < distances.length - 1; index += 1) {
    const distanceM = distances[index]
    while (rightIndex < lap.samples.length && lap.samples[rightIndex].distanceM < distanceM) rightIndex += 1
    rows.push(interpolatedChannels(lap.samples, distanceM, trackLengthM, lap.lapTimeMs, rightIndex))
  }
  const originTimeMs = rows[0].timeMs
  const profile = {
    ...lap,
    distances,
    timeMs: [...rows.map((row) => row.timeMs - originTimeMs), lap.lapTimeMs],
    brake: [...rows.map((row) => row.brake), rows[0].brake],
    throttle: [...rows.map((row) => row.throttle), rows[0].throttle],
    speedKph: [...rows.map((row) => row.speedKph), rows[0].speedKph],
  }
  const channels = [profile.timeMs, profile.brake, profile.throttle, profile.speedKph]
  if (channels.some((channel) => channel.some((value) => !finite(value)))) return null
  if (Math.abs(profile.timeMs[0]) > 1e-6 || Math.abs(profile.timeMs.at(-1) - lap.lapTimeMs) > 1e-6) return null
  for (let index = 1; index < profile.timeMs.length; index += 1) {
    if (profile.timeMs[index] < profile.timeMs[index - 1] - 1e-6 || profile.timeMs[index] > lap.lapTimeMs + 1e-6) return null
  }
  return profile
}

function segmentDefinitions(trackLengthM) {
  const segments = []
  for (let startDistanceM = 0, index = 0; startDistanceM < trackLengthM; startDistanceM += REVIEW_CONSTANTS.SEGMENT_LENGTH_M, index += 1) {
    segments.push({ id: `segment-${String(index + 1).padStart(3, '0')}`, index, startDistanceM, endDistanceM: Math.min(trackLengthM, startDistanceM + REVIEW_CONSTANTS.SEGMENT_LENGTH_M) })
  }
  return segments
}

function timeAt(profile, distanceM) {
  if (distanceM >= profile.distances.at(-1)) return profile.lapTimeMs
  const index = Math.floor(distanceM / REVIEW_CONSTANTS.GRID_STEP_M)
  const leftDistance = profile.distances[index]
  const rightDistance = profile.distances[index + 1]
  const progress = (distanceM - leftDistance) / (rightDistance - leftDistance)
  return profile.timeMs[index] + (profile.timeMs[index + 1] - profile.timeMs[index]) * progress
}

function comparisonFor(subject, reference, segments) {
  const officialDeltaMs = subject.lapTimeMs - reference.lapTimeMs
  const losses = segments.map((segment) => {
    const start = timeAt(subject, segment.startDistanceM) - timeAt(reference, segment.startDistanceM)
    const end = timeAt(subject, segment.endDistanceM) - timeAt(reference, segment.endDistanceM)
    return end - start
  })
  // Round stable public numbers while forcing the final disjoint segment to
  // close exactly on LMU's official lap-time delta. No gain is estimated.
  const publicLosses = []
  let accumulated = 0
  for (let index = 0; index < losses.length; index += 1) {
    const lossMs = index === losses.length - 1 ? round(officialDeltaMs - accumulated) : round(losses[index])
    publicLosses.push(lossMs)
    accumulated = round(accumulated + lossMs)
  }
  return {
    lapId: subject.id,
    lapNumber: subject.number,
    lapTimeMs: round(subject.lapTimeMs),
    deltaToReferenceMs: round(officialDeltaMs),
    segmentLossTotalMs: round(publicLosses.reduce((sum, value) => sum + value, 0)),
    losses: publicLosses,
    profile: subject,
  }
}

function segmentSlice(profile, segment) {
  const indices = []
  for (let index = 0; index < profile.distances.length; index += 1) {
    if (profile.distances[index] >= segment.startDistanceM - 1e-6 && profile.distances[index] <= segment.endDistanceM + 1e-6) indices.push(index)
  }
  return indices
}

function crossingDistance(profile, indices, field, threshold, direction, afterIndex = null) {
  const start = afterIndex === null ? 1 : Math.max(1, afterIndex + 1)
  for (let local = start; local < indices.length; local += 1) {
    const previous = profile[field][indices[local - 1]]
    const current = profile[field][indices[local]]
    if ((direction === 'up' && previous < threshold && current >= threshold)
      || (direction === 'down' && previous > threshold && current <= threshold)) return profile.distances[indices[local]]
  }
  return null
}

// Event metrics are deliberately gated: an event must occur inside the same
// 256 m segment in both reference and at least three comparison laps. Distance
// resolution is the validated 16 m grid; sub-grid precision is never implied.
function metricsFor(profile, segment) {
  const indices = segmentSlice(profile, segment)
  if (indices.length < 2) return null
  const brakeOnsetM = crossingDistance(profile, indices, 'brake', REVIEW_CONSTANTS.BRAKE_ONSET_THRESHOLD, 'up')
  const onsetLocalIndex = brakeOnsetM === null ? null : indices.findIndex((index) => profile.distances[index] === brakeOnsetM)
  const brakeReleaseM = onsetLocalIndex === null ? null : crossingDistance(profile, indices, 'brake', REVIEW_CONSTANTS.BRAKE_RELEASE_THRESHOLD, 'down', onsetLocalIndex)
  let minimumLocalIndex = 0
  for (let local = 1; local < indices.length; local += 1) {
    if (profile.speedKph[indices[local]] < profile.speedKph[indices[minimumLocalIndex]]) minimumLocalIndex = local
  }
  const throttlePickupM = crossingDistance(profile, indices, 'throttle', REVIEW_CONSTANTS.THROTTLE_PICKUP_THRESHOLD, 'up', minimumLocalIndex)
  let coastDistanceM = 0
  for (let local = 1; local < indices.length; local += 1) {
    const left = indices[local - 1]
    const right = indices[local]
    if ((profile.brake[left] + profile.brake[right]) / 2 <= REVIEW_CONSTANTS.COAST_BRAKE_MAX
      && (profile.throttle[left] + profile.throttle[right]) / 2 <= REVIEW_CONSTANTS.COAST_THROTTLE_MAX) {
      coastDistanceM += profile.distances[right] - profile.distances[left]
    }
  }
  const exitIndices = indices.filter((index) => profile.distances[index] >= segment.endDistanceM - REVIEW_CONSTANTS.EXIT_WINDOW_M)
  return {
    brakeOnsetM,
    brakeReleaseM,
    throttlePickupM,
    coastDistanceM,
    minimumSpeedKph: profile.speedKph[indices[minimumLocalIndex]],
    exitSpeedKph: exitIndices.reduce((sum, index) => sum + profile.speedKph[index], 0) / exitIndices.length,
  }
}

const METRIC_DEFINITIONS = Object.freeze([
  { field: 'brakeOnsetM', unit: 'm', minimum: REVIEW_CONSTANTS.MIN_EVENT_DELTA_M, negative: 'brake-onset-earlier', positive: 'brake-onset-later' },
  { field: 'brakeReleaseM', unit: 'm', minimum: REVIEW_CONSTANTS.MIN_EVENT_DELTA_M, negative: 'brake-release-earlier', positive: 'brake-release-later' },
  { field: 'throttlePickupM', unit: 'm', minimum: REVIEW_CONSTANTS.MIN_EVENT_DELTA_M, negative: 'throttle-pickup-earlier', positive: 'throttle-pickup-later' },
  { field: 'coastDistanceM', unit: 'm', minimum: REVIEW_CONSTANTS.MIN_COAST_DELTA_M, negative: 'coast-distance-less', positive: 'coast-distance-more' },
  { field: 'minimumSpeedKph', unit: 'kph', minimum: REVIEW_CONSTANTS.MIN_SPEED_DELTA_KPH, negative: 'minimum-speed-lower', positive: 'minimum-speed-higher' },
  { field: 'exitSpeedKph', unit: 'kph', minimum: REVIEW_CONSTANTS.MIN_SPEED_DELTA_KPH, negative: 'exit-speed-lower', positive: 'exit-speed-higher' },
])

const EXPERIMENT_FOR_OBSERVATION = Object.freeze({
  'brake-onset-earlier': 'brake-onset-later-small-step',
  'brake-release-later': 'brake-release-earlier-small-step',
  'throttle-pickup-later': 'throttle-pickup-earlier-small-step',
  'coast-distance-more': 'coast-distance-shorter-small-step',
  'minimum-speed-lower': 'minimum-speed-higher-small-step',
  'exit-speed-lower': 'exit-speed-higher-small-step',
})

function observationsFor(segment, comparisons, reference) {
  const referenceMetrics = metricsFor(reference, segment)
  if (!referenceMetrics) return { observations: [], experiments: [] }
  const metrics = comparisons.map((comparison) => ({ comparison, metrics: metricsFor(comparison.profile, segment) }))
  const observations = []
  for (const definition of METRIC_DEFINITIONS) {
    if (!finite(referenceMetrics[definition.field])) continue
    const pairs = metrics.filter(({ metrics: value }) => value && finite(value[definition.field])).map(({ comparison, metrics: value }) => ({
      comparison,
      delta: value[definition.field] - referenceMetrics[definition.field],
    }))
    if (pairs.length < REVIEW_CONSTANTS.MIN_NON_REFERENCE_LAPS) continue
    const center = median(pairs.map(({ delta }) => delta))
    const sign = center < 0 ? -1 : center > 0 ? 1 : 0
    // This is a joint gate: the same lap must be slower in this segment and
    // exhibit the reported trace direction. Separate 75% marginals could
    // otherwise overlap on only half the cohort.
    const matching = sign === 0 ? [] : pairs.filter(({ comparison, delta }) => (
      comparison.losses[segment.index] > REVIEW_CONSTANTS.DIRECTION_EPSILON_MS
      && (sign < 0 ? delta < 0 : delta > 0)
      && Math.abs(delta) >= definition.minimum
    ))
    const agreement = matching.length / pairs.length
    if (Math.abs(center) < definition.minimum || agreement < REVIEW_CONSTANTS.MIN_DIRECTIONAL_AGREEMENT) continue
    observations.push({
      code: sign < 0 ? definition.negative : definition.positive,
      medianDelta: round(center),
      unit: definition.unit,
      directionalAgreement: round(agreement, 4),
      comparedLapCount: pairs.length,
      matchingLapIds: matching.map(({ comparison }) => comparison.lapId),
      rankingAgreement: agreement,
      normalizedGateStrength: Math.abs(center) / definition.minimum,
    })
  }
  // Metric declaration order is not evidence. Rank the bounded public set by
  // joint recurrence first, then by magnitude relative to that metric's
  // published gate, with the enum code as the stable final tie-break.
  const ranked = observations.sort((left, right) => right.rankingAgreement - left.rankingAgreement
    || right.normalizedGateStrength - left.normalizedGateStrength
    || compareText(left.code, right.code))
  // Every displayed observation must be visible on the one representative lap
  // the UI opens. Greedily retain the strongest ranked mutually-supported set;
  // an observation whose matching-lap intersection is empty is withheld.
  const bounded = []
  let representativeMatchingLapIds = null
  for (const observation of ranked) {
    const matching = new Set(observation.matchingLapIds)
    const intersection = representativeMatchingLapIds === null
      ? [...matching]
      : representativeMatchingLapIds.filter((lapId) => matching.has(lapId))
    if (!intersection.length) continue
    bounded.push(observation)
    representativeMatchingLapIds = intersection
    if (bounded.length >= REVIEW_CONSTANTS.MAX_OBSERVATIONS_PER_HOTSPOT) break
  }
  const experiments = [...new Set(bounded.map((observation) => EXPERIMENT_FOR_OBSERVATION[observation.code]).filter(Boolean))]
    .slice(0, REVIEW_CONSTANTS.MAX_EXPERIMENTS_PER_HOTSPOT)
  return {
    observations: bounded.map(({ matchingLapIds, rankingAgreement, normalizedGateStrength, ...observation }) => observation),
    experiments,
    representativeMatchingLapIds: (representativeMatchingLapIds ?? []).sort(compareText),
  }
}

function representativeFor(comparisons, segmentIndex, center) {
  return [...comparisons].sort((left, right) => Math.abs(left.losses[segmentIndex] - center) - Math.abs(right.losses[segmentIndex] - center)
    || left.lapTimeMs - right.lapTimeMs || left.lapNumber - right.lapNumber || compareText(left.lapId, right.lapId))[0]
}

function variabilityFor(profiles) {
  if (!profiles.length) return null
  const times = profiles.map((profile) => profile.lapTimeMs)
  const center = median(times)
  const deviation = mad(times, center)
  const ratio = center > 0 ? deviation / center : Infinity
  const code = ratio <= 0.005 ? 'pace-stable' : ratio >= 0.015 ? 'pace-variable' : 'pace-moderate'
  return {
    code,
    medianLapTimeMs: round(center),
    madLapTimeMs: round(deviation),
    minimumLapTimeMs: round(Math.min(...times)),
    maximumLapTimeMs: round(Math.max(...times)),
    comparedLapCount: times.length,
  }
}

/**
 * Build a deterministic same-session driver review from decoded strict lap
 * payloads. The return value contains only stable IDs, enum codes, and numbers;
 * it never contains names, paths, prose, causal claims, or estimated gains.
 */
function buildDriverReview(input) {
  if (!input || typeof input !== 'object' || !validId(input.sessionId)
    || !finite(input.trackLengthM) || input.trackLengthM < 100 || input.trackLengthM > 100000
    || !Array.isArray(input.laps)) return invalidResult('request-malformed')
  if (input.laps.length > REVIEW_CONSTANTS.MAX_DECODED_LAPS) return invalidResult('cohort-limit-exceeded', input.laps.length)
  const accounting = normalizeEvidence(input.evidence, input.laps.length)
  if (!accounting) return invalidResult('evidence-accounting-malformed')

  const decoded = []
  for (const payload of input.laps) {
    const result = strictLap(payload, input.sessionId, input.trackLengthM)
    if (result.error) return invalidResult(result.error)
    decoded.push(result.value)
  }
  decoded.sort((left, right) => left.lapTimeMs - right.lapTimeMs || left.number - right.number || compareText(left.id, right.id))
  if (new Set(decoded.map((lap) => lap.id)).size !== decoded.length) return invalidResult('duplicate-lap-id')

  const fingerprintSource = decoded.map((lap) => [
    lap.id, lap.number, lap.lapTimeMs,
    lap.samples.map((sample) => [sample.distanceM, sample.timeMs, sample.brake, sample.throttle, sample.speedKph]),
  ])
  const inputFingerprint = hash([ALGORITHM_VERSION, input.trackLengthM, accounting, fingerprintSource])
  const cohortBase = { decodedLapCount: input.laps.length, analyzedLapCount: decoded.length, nonReferenceLapCount: Math.max(0, decoded.length - 1), accounting }
  if (!decoded.length) {
    return {
      schemaVersion: SCHEMA_VERSION, algorithmVersion: ALGORITHM_VERSION, inputFingerprint,
      status: { code: 'insufficient-evidence', reasonCode: 'reference-unavailable' }, cohort: cohortBase,
      reference: null, selectedComparison: null, hotspots: [], strength: null, variability: null,
      limitations: ['fewer-than-three-comparisons', ...(input.selectedLapId ? ['selected-lap-not-analyzed'] : ['selected-lap-not-supplied'])],
    }
  }

  const referenceLap = decoded[0]
  if (input.referenceLapId !== undefined && input.referenceLapId !== null && input.referenceLapId !== referenceLap.id) return invalidResult('reference-not-fastest-strict')
  const profiles = decoded.map((lap) => profileFor(lap, input.trackLengthM))
  if (profiles.some((profile) => profile === null)) return invalidResult('lap-derived-profile-invalid')
  const reference = profiles[0]
  const segments = segmentDefinitions(input.trackLengthM)
  const comparisons = profiles.slice(1).map((profile) => comparisonFor(profile, reference, segments))
  const selected = input.selectedLapId ? profiles.find((profile) => profile.id === input.selectedLapId) : null
  const selectedRaw = selected ? comparisonFor(selected, reference, segments) : null
  const selectedComparison = selectedRaw ? {
    lapId: selectedRaw.lapId,
    lapNumber: selectedRaw.lapNumber,
    lapTimeMs: selectedRaw.lapTimeMs,
    deltaToReferenceMs: selectedRaw.deltaToReferenceMs,
    segmentLossTotalMs: selectedRaw.segmentLossTotalMs,
    segments: segments.map((segment, index) => ({ id: segment.id, startDistanceM: round(segment.startDistanceM), endDistanceM: round(segment.endDistanceM), lossMs: selectedRaw.losses[index] })),
  } : null

  const candidates = []
  for (const segment of segments) {
    const losses = comparisons.map((comparison) => comparison.losses[segment.index])
    if (losses.length < REVIEW_CONSTANTS.MIN_NON_REFERENCE_LAPS) continue
    const center = median(losses)
    const agreement = losses.filter((lossMs) => lossMs > REVIEW_CONSTANTS.DIRECTION_EPSILON_MS).length / losses.length
    if (center < REVIEW_CONSTANTS.MIN_RECURRING_LOSS_MS || agreement < REVIEW_CONSTANTS.MIN_DIRECTIONAL_AGREEMENT) continue
    const derived = observationsFor(segment, comparisons, reference)
    if (!derived.observations.length) continue
    const matchingComparisons = comparisons.filter((comparison) => derived.representativeMatchingLapIds.includes(comparison.lapId))
    if (!matchingComparisons.length) continue
    const representative = representativeFor(matchingComparisons, segment.index, center)
    candidates.push({
      id: segment.id,
      startDistanceM: round(segment.startDistanceM),
      endDistanceM: round(segment.endDistanceM),
      representativeLapId: representative.lapId,
      representativeLapNumber: representative.lapNumber,
      medianLossMs: round(center),
      minimumLossMs: round(Math.min(...losses)),
      maximumLossMs: round(Math.max(...losses)),
      madLossMs: round(mad(losses, center)),
      directionalAgreement: round(agreement, 4),
      comparedLapCount: losses.length,
      observations: derived.observations,
      experiments: derived.experiments,
    })
  }
  const hotspots = candidates.sort((left, right) => Number(right.experiments.length > 0) - Number(left.experiments.length > 0)
    || right.medianLossMs - left.medianLossMs || compareText(left.id, right.id)).slice(0, REVIEW_CONSTANTS.MAX_HOTSPOTS)

  let strength = null
  if (comparisons.length >= REVIEW_CONSTANTS.MIN_NON_REFERENCE_LAPS) {
    const strengths = segments.map((segment) => {
      const losses = comparisons.map((comparison) => comparison.losses[segment.index])
      const center = median(losses)
      const representative = representativeFor(comparisons, segment.index, center)
      const recurringGainAgreement = losses.filter((lossMs) => lossMs < -REVIEW_CONSTANTS.DIRECTION_EPSILON_MS).length / losses.length
      return { segment, losses, center, representative, recurringGainAgreement }
    })
    const recurringGains = strengths.filter((candidate) => candidate.center < -REVIEW_CONSTANTS.DIRECTION_EPSILON_MS
      && candidate.recurringGainAgreement >= REVIEW_CONSTANTS.MIN_DIRECTIONAL_AGREEMENT)
      .sort((left, right) => left.center - right.center || compareText(left.segment.id, right.segment.id))
    // Without a truly recurring gain, "strength" means the segment whose
    // median is closest to the fastest reference—not the most-negative but
    // inconsistent outlier. Equal absolute medians prefer nonnegative evidence.
    const fallback = [...strengths].sort((left, right) => Math.abs(left.center) - Math.abs(right.center)
      || Number(left.center < 0) - Number(right.center < 0)
      || compareText(left.segment.id, right.segment.id))[0]
    const best = recurringGains[0] ?? fallback
    strength = {
      code: recurringGains.length ? 'recurring-relative-gain' : 'smallest-median-relative-loss',
      segmentId: best.segment.id,
      startDistanceM: round(best.segment.startDistanceM),
      endDistanceM: round(best.segment.endDistanceM),
      representativeLapId: best.representative.lapId,
      representativeLapNumber: best.representative.lapNumber,
      medianLossMs: round(best.center),
      minimumLossMs: round(Math.min(...best.losses)),
      maximumLossMs: round(Math.max(...best.losses)),
      madLossMs: round(mad(best.losses, best.center)),
      comparedLapCount: best.losses.length,
    }
  }

  const limitations = []
  if (accounting.notDecodedDueToLimit > 0 || accounting.exclusions['cohort-limit'] > 0) limitations.push('cohort-capped')
  if (comparisons.length < REVIEW_CONSTANTS.MIN_NON_REFERENCE_LAPS) limitations.push('fewer-than-three-comparisons')
  if (!hotspots.length && comparisons.length >= REVIEW_CONSTANTS.MIN_NON_REFERENCE_LAPS) limitations.push('no-recurring-hotspots')
  if (!input.selectedLapId) limitations.push('selected-lap-not-supplied')
  else if (!selected) limitations.push('selected-lap-not-analyzed')
  else if (selected.id === reference.id) limitations.push('selected-lap-is-reference')

  return {
    schemaVersion: SCHEMA_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    inputFingerprint,
    status: { code: comparisons.length >= REVIEW_CONSTANTS.MIN_NON_REFERENCE_LAPS ? 'ready' : 'insufficient-evidence' },
    cohort: cohortBase,
    reference: { lapId: reference.id, lapNumber: reference.number, lapTimeMs: round(reference.lapTimeMs) },
    selectedComparison,
    hotspots,
    strength,
    variability: variabilityFor(profiles),
    limitations,
  }
}

module.exports = {
  buildDriverReview,
  normalizeEvidence,
  REVIEW_CONSTANTS,
  SCHEMA_VERSION,
  ALGORITHM_VERSION,
  STATUS_CODES,
  LIMITATION_CODES,
  EVIDENCE_EXCLUSION_CODES,
  OBSERVATION_CODES,
  EXPERIMENT_CODES,
  STRENGTH_CODES,
  VARIABILITY_CODES,
}
