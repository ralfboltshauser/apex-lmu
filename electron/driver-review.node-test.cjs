const assert = require('node:assert/strict')
const test = require('node:test')
const {
  buildDriverReview,
  REVIEW_CONSTANTS,
  ALGORITHM_VERSION,
  OBSERVATION_CODES,
  EXPERIMENT_CODES,
} = require('./driver-review.cjs')
const { TERMINAL_BOUNDARY_POLICY } = require('./lap-sample-sanitizer.cjs')

const TRACK_LENGTH_M = 1024
const SESSION_ID = 'same-session'

function controls(distanceM, comparison = false) {
  if (distanceM < 256 || distanceM > 512) return { brake: 0, throttle: 1, speedKph: 200 }
  const brakeStart = comparison ? 320 : 352
  const brakeEnd = comparison ? 432 : 416
  const throttleStart = comparison ? 304 : 336
  const throttleEnd = comparison ? 496 : 448
  const corner = distanceM >= throttleStart && distanceM < throttleEnd
  const braking = distanceM >= brakeStart && distanceM < brakeEnd
  const apexDistance = comparison ? 432 : 416
  const distanceFromApex = Math.abs(distanceM - apexDistance)
  const minimum = comparison ? 70 : 80
  const speedKph = corner ? Math.min(200, minimum + distanceFromApex * 1.2) : comparison && distanceM >= 480 ? 190 : 200
  return { brake: braking ? 0.8 : 0, throttle: corner ? 0 : 1, speedKph }
}

function elapsedAt(distanceM, segmentDurationsMs) {
  const segment = Math.min(3, Math.floor(distanceM / 256))
  const before = segmentDurationsMs.slice(0, segment).reduce((sum, value) => sum + value, 0)
  return before + segmentDurationsMs[segment] * ((distanceM - segment * 256) / 256)
}

function lap({
  id,
  number,
  segmentDurationsMs = [10_000, 10_000, 10_000, 10_000],
  comparison = false,
  sessionId = SESSION_ID,
  mutateSamples = null,
  replayable = true,
} = {}) {
  const samples = []
  for (let distanceM = 0; distanceM < TRACK_LENGTH_M; distanceM += REVIEW_CONSTANTS.GRID_STEP_M) {
    const input = controls(distanceM, comparison)
    samples.push({
      distanceM,
      distanceIndexM: distanceM,
      lapElapsedSeconds: elapsedAt(distanceM, segmentDurationsMs) / 1000,
      ...input,
    })
  }
  mutateSamples?.(samples)
  return {
    schemaVersion: 1,
    payloadHash: `hash-${id}`,
    privateDriverName: 'must-not-escape',
    localPath: '/home/private/recording.apexrec',
    session: { id: sessionId, track: { lengthM: TRACK_LENGTH_M }, car: { name: 'Private Driver' } },
    lap: {
      id,
      number,
      state: 'complete',
      quality: 'clean',
      replayable,
      referenceEligible: true,
      timingSource: 'official',
      lapTimeMs: segmentDurationsMs.reduce((sum, value) => sum + value, 0),
    },
    samples,
  }
}

function cohort(overrides = {}) {
  const laps = [
    lap({ id: 'reference', number: 1 }),
    lap({ id: 'subject-a', number: 2, segmentDurationsMs: [10_000, 10_200, 9_900, 10_000], comparison: true }),
    lap({ id: 'subject-b', number: 3, segmentDurationsMs: [10_000, 10_220, 9_900, 10_000], comparison: true }),
    lap({ id: 'subject-c', number: 4, segmentDurationsMs: [10_000, 10_180, 9_950, 10_000], comparison: true }),
  ]
  return { sessionId: SESSION_ID, trackLengthM: TRACK_LENGTH_M, selectedLapId: 'subject-a', referenceLapId: 'reference', laps, ...overrides }
}

test('builds a deterministic recurring hotspot from strict same-session evidence', () => {
  const input = cohort()
  const before = structuredClone(input)
  const review = buildDriverReview(input)

  assert.equal(review.algorithmVersion, ALGORITHM_VERSION)
  assert.deepEqual(review.status, { code: 'ready' })
  assert.deepEqual(review.reference, { lapId: 'reference', lapNumber: 1, lapTimeMs: 40_000 })
  assert.equal(review.selectedComparison.deltaToReferenceMs, 100)
  assert.equal(review.selectedComparison.segmentLossTotalMs, 100)
  assert.equal(review.selectedComparison.segments.reduce((sum, segment) => sum + segment.lossMs, 0), 100)
  assert.equal(review.hotspots.length, 1)
  assert.deepEqual(review.hotspots[0], {
    id: 'segment-002',
    startDistanceM: 256,
    endDistanceM: 512,
    representativeLapId: 'subject-a',
    representativeLapNumber: 2,
    medianLossMs: 200,
    minimumLossMs: 180,
    maximumLossMs: 220,
    madLossMs: 20,
    directionalAgreement: 1,
    comparedLapCount: 3,
    observations: [
      { code: 'exit-speed-lower', medianDelta: -30.8, unit: 'kph', directionalAgreement: 1, comparedLapCount: 3 },
      { code: 'minimum-speed-lower', medianDelta: -10, unit: 'kph', directionalAgreement: 1, comparedLapCount: 3 },
      { code: 'throttle-pickup-later', medianDelta: 48, unit: 'm', directionalAgreement: 1, comparedLapCount: 3 },
    ],
    experiments: ['exit-speed-higher-small-step', 'minimum-speed-higher-small-step', 'throttle-pickup-earlier-small-step'],
  })
  assert.equal(review.strength.code, 'recurring-relative-gain')
  assert.equal(review.variability.comparedLapCount, 4)
  assert.deepEqual(input, before)
  assert.equal(JSON.stringify(review).includes('must-not-escape'), false)
  assert.equal(JSON.stringify(review).includes('/home/private'), false)
})

test('input order cannot change reference, findings, stable IDs, or fingerprint', () => {
  const firstInput = cohort()
  const secondInput = cohort({ laps: [...firstInput.laps].reverse() })
  assert.deepEqual(buildDriverReview(firstInput), buildDriverReview(secondInput))
})

test('selected lap is optional while a supplied selected reference telescopes to zero', () => {
  const absent = buildDriverReview(cohort({ selectedLapId: undefined }))
  assert.equal(absent.selectedComparison, null)
  assert.ok(absent.limitations.includes('selected-lap-not-supplied'))

  const selectedReference = buildDriverReview(cohort({ selectedLapId: 'reference' }))
  assert.equal(selectedReference.selectedComparison.deltaToReferenceMs, 0)
  assert.equal(selectedReference.selectedComparison.segmentLossTotalMs, 0)
  assert.ok(selectedReference.selectedComparison.segments.every((segment) => segment.lossMs === 0))
  assert.ok(selectedReference.limitations.includes('selected-lap-is-reference'))
})

test('three non-reference laps and joint 75% recurrence are hard gates', () => {
  const onlyTwo = cohort(); onlyTwo.laps.pop()
  const insufficient = buildDriverReview(onlyTwo)
  assert.equal(insufficient.status.code, 'insufficient-evidence')
  assert.deepEqual(insufficient.hotspots, [])

  const base = cohort()
  const fourth = lap({ id: 'subject-d', number: 5, segmentDurationsMs: [10_000, 10_210, 9_900, 10_000], comparison: false })
  // It is slower in the recurring segment but does not share the input trace;
  // three of four laps still jointly match, exactly the 75% boundary.
  const boundary = buildDriverReview({ ...base, laps: [...base.laps, fourth] })
  assert.equal(boundary.hotspots.length, 1)
  assert.equal(boundary.hotspots[0].observations[0].directionalAgreement, 0.75)

  const fifth = lap({ id: 'subject-e', number: 6, segmentDurationsMs: [10_000, 10_190, 9_900, 10_000], comparison: false })
  const below = buildDriverReview({ ...base, laps: [...base.laps, fourth, fifth] })
  assert.deepEqual(below.hotspots, [])
  assert.ok(below.limitations.includes('no-recurring-hotspots'))
})

test('the positive-loss recurrence gate includes exactly 75% and rejects below it', () => {
  const base = cohort()
  const fasterSegment = lap({ id: 'subject-d', number: 5, segmentDurationsMs: [10_100, 9_980, 10_000, 10_000], comparison: true })
  const boundary = buildDriverReview({ ...base, laps: [...base.laps, fasterSegment] })
  assert.equal(boundary.hotspots.length, 1)
  assert.equal(boundary.hotspots[0].directionalAgreement, 0.75)

  const anotherFasterSegment = lap({ id: 'subject-e', number: 6, segmentDurationsMs: [10_100, 9_970, 10_000, 10_000], comparison: true })
  const below = buildDriverReview({ ...base, laps: [...base.laps, fasterSegment, anotherFasterSegment] })
  assert.deepEqual(below.hotspots, [])
})

test('80 ms recurring loss and 16 m trace difference boundaries are inclusive', () => {
  const exactTrace = (samples) => {
    for (const sample of samples) {
      if (sample.distanceM < 256 || sample.distanceM > 512) continue
      const referenceInput = controls(sample.distanceM, false)
      sample.brake = sample.distanceM >= 336 && sample.distanceM < 432 ? 0.8 : 0
      sample.throttle = referenceInput.throttle
      sample.speedKph = referenceInput.speedKph
    }
  }
  const makeSubjects = (lossMs, comparison = true, mutateSamples = exactTrace) => [1, 2, 3].map((number) => lap({
    id: `gate-${lossMs}-${number}`,
    number: number + 1,
    segmentDurationsMs: [10_000, 10_000 + lossMs, 10_000, 10_000],
    comparison,
    mutateSamples,
  }))
  const reference = lap({ id: 'reference', number: 1 })
  const exact = buildDriverReview(cohort({ laps: [reference, ...makeSubjects(80)] }))
  assert.equal(exact.hotspots.length, 1)
  assert.equal(exact.hotspots[0].medianLossMs, 80)
  assert.deepEqual(exact.hotspots[0].observations[0], {
    code: 'brake-onset-earlier', medianDelta: -16, unit: 'm', directionalAgreement: 1, comparedLapCount: 3,
  })

  assert.deepEqual(buildDriverReview(cohort({ laps: [reference, ...makeSubjects(79)] })).hotspots, [])
  // Time loss alone is not a finding when all input traces match reference.
  assert.deepEqual(buildDriverReview(cohort({ laps: [reference, ...makeSubjects(80, false, null)] })).hotspots, [])
})

test('stronger joint throttle evidence outranks a just-at-threshold brake difference', () => {
  const mixedTrace = (samples) => {
    for (const sample of samples) {
      if (sample.distanceM < 256 || sample.distanceM > 512) continue
      // Reference onset is 352 m, so 336 m is exactly the 16 m brake gate.
      sample.brake = sample.distanceM >= 336 && sample.distanceM < 416 ? 0.8 : 0
      // Reference pickup is 448 m; 496 m is three times the 16 m gate.
      sample.throttle = sample.distanceM >= 336 && sample.distanceM < 496 ? 0 : 1
    }
  }
  const reference = lap({ id: 'reference', number: 1 })
  const subjects = [1, 2, 3].map((number) => lap({
    id: `ranked-${number}`,
    number: number + 1,
    segmentDurationsMs: [10_000, 10_100, 10_000, 10_000],
    comparison: false,
    mutateSamples: mixedTrace,
  }))
  const review = buildDriverReview(cohort({ laps: [reference, ...subjects] }))
  const observationCodes = review.hotspots[0].observations.map((observation) => observation.code)
  assert.ok(observationCodes.indexOf('throttle-pickup-later') < observationCodes.indexOf('brake-onset-earlier'))
  assert.equal(review.hotspots[0].observations.find((observation) => observation.code === 'throttle-pickup-later').medianDelta, 48)
  assert.equal(review.hotspots[0].observations.find((observation) => observation.code === 'brake-onset-earlier').medianDelta, -16)
  assert.equal(review.hotspots[0].experiments[0], 'throttle-pickup-earlier-small-step')
  assert.ok(review.hotspots[0].representativeLapId.startsWith('ranked-'))
})

test('every retained observation is exhibited by the representative lap', () => {
  const reference = lap({ id: 'reference', number: 1 })
  const brakeOnly = (samples) => {
    for (const sample of samples) {
      if (sample.distanceM < 256 || sample.distanceM > 512) continue
      sample.brake = sample.distanceM >= 336 && sample.distanceM < 416 ? 0.8 : 0
      sample.throttle = 1 // no throttle-pickup event on this subset
    }
  }
  const throttleOnly = (samples) => {
    for (const sample of samples) {
      if (sample.distanceM < 256 || sample.distanceM > 512) continue
      sample.brake = 0 // no brake-onset event on this disjoint subset
      sample.throttle = sample.distanceM >= 336 && sample.distanceM < 496 ? 0 : 1
    }
  }
  const subjects = [
    ...[1, 2, 3].map((number) => lap({ id: `brake-only-${number}`, number: number + 1, segmentDurationsMs: [10_000, 10_100, 10_000, 10_000], mutateSamples: brakeOnly })),
    ...[1, 2, 3].map((number) => lap({ id: `throttle-only-${number}`, number: number + 4, segmentDurationsMs: [10_000, 10_100, 10_000, 10_000], mutateSamples: throttleOnly })),
  ]
  const review = buildDriverReview({ sessionId: SESSION_ID, trackLengthM: TRACK_LENGTH_M, referenceLapId: 'reference', laps: [reference, ...subjects] })
  const hotspot = review.hotspots[0]
  assert.deepEqual(hotspot.observations.map((observation) => observation.code), ['throttle-pickup-later'])
  assert.ok(hotspot.representativeLapId.startsWith('throttle-only-'))
  // The equally recurring but disjoint brake observation is withheld; the UI
  // can therefore show every retained trace difference on this representative.
  assert.equal(hotspot.observations.some((observation) => observation.code === 'brake-onset-earlier'), false)
})

test('a recurring strength code requires the same 75% directional gate', () => {
  const base = cohort()
  // Segment three has a negative median, but only two of four comparisons are
  // actually faster there. A bare median must not earn the recurring code.
  const mixed = [
    base.laps[0],
    base.laps[1],
    base.laps[2],
    lap({ id: 'subject-c', number: 4, segmentDurationsMs: [10_000, 10_180, 10_020, 10_000], comparison: true }),
    lap({ id: 'subject-d', number: 5, segmentDurationsMs: [10_000, 10_190, 10_030, 10_000], comparison: true }),
  ]
  const review = buildDriverReview({ ...base, laps: mixed })
  assert.equal(review.strength.code, 'smallest-median-relative-loss')
  assert.equal(review.strength.segmentId, 'segment-001')
  assert.equal(review.strength.medianLossMs, 0)
})

function twoSegmentLap({ id, number, durationsMs }) {
  const trackLengthM = 512
  const samples = []
  for (let distanceM = 0; distanceM < trackLengthM; distanceM += REVIEW_CONSTANTS.GRID_STEP_M) {
    const segment = distanceM < 256 ? 0 : 1
    const timeBeforeMs = segment === 0 ? 0 : durationsMs[0]
    const withinSegmentM = distanceM - segment * 256
    samples.push({
      distanceM,
      distanceIndexM: distanceM,
      lapElapsedSeconds: (timeBeforeMs + durationsMs[segment] * withinSegmentM / 256) / 1000,
      brake: 0,
      throttle: 1,
      speedKph: 180,
    })
  }
  return {
    session: { id: SESSION_ID, track: { lengthM: trackLengthM } },
    lap: { id, number, state: 'complete', quality: 'clean', replayable: true, referenceEligible: true, timingSource: 'official', lapTimeMs: durationsMs[0] + durationsMs[1] },
    samples,
  }
}

test('closest-strength fallback breaks equal absolute medians toward nonnegative evidence', () => {
  const reference = twoSegmentLap({ id: 'reference', number: 1, durationsMs: [10_000, 10_000] })
  const subjects = [
    twoSegmentLap({ id: 'early-gain-a', number: 2, durationsMs: [9_900, 10_100] }),
    twoSegmentLap({ id: 'early-gain-b', number: 3, durationsMs: [9_900, 10_100] }),
    twoSegmentLap({ id: 'even-a', number: 4, durationsMs: [10_000, 10_000] }),
    twoSegmentLap({ id: 'even-b', number: 5, durationsMs: [10_000, 10_000] }),
  ]
  const review = buildDriverReview({ sessionId: SESSION_ID, trackLengthM: 512, referenceLapId: 'reference', laps: [reference, ...subjects] })
  assert.equal(review.strength.code, 'smallest-median-relative-loss')
  assert.equal(review.strength.segmentId, 'segment-002')
  assert.equal(review.strength.medianLossMs, 50)
})

function appendTerminalBoundary(samples, {
  endpointDistanceM = TRACK_LENGTH_M - 12,
  endpointTimeMs = 39_999.5,
  resetTimesMs = [20],
} = {}) {
  const input = controls(endpointDistanceM, false)
  samples.push({ distanceM: endpointDistanceM, distanceIndexM: endpointDistanceM, lapElapsedSeconds: endpointTimeMs / 1000, ...input })
  for (const resetTimeMs of resetTimesMs) {
    samples.push({ distanceM: endpointDistanceM, distanceIndexM: endpointDistanceM, lapElapsedSeconds: resetTimeMs / 1000, ...input })
  }
}

test('sanitizes only the real terminal scoring-to-new-lap timestamp shape', () => {
  const measuredEndpointMs = 40_000 - 9.666
  const clean = lap({ id: 'terminal-boundary', number: 1, mutateSamples: (samples) => appendTerminalBoundary(samples, { endpointTimeMs: measuredEndpointMs, resetTimesMs: [] }) })
  const withReset = lap({ id: 'terminal-boundary', number: 1, mutateSamples: (samples) => appendTerminalBoundary(samples, {
    endpointTimeMs: measuredEndpointMs,
    resetTimesMs: [2.505, 22.505, 42.505, 62.505, 82.505, 102.505, 122.505, 142.505, 162.505],
  }) })
  withReset.payloadHash = 'different-canonical-payload-hash-after-producer-suffix'
  const request = (payload) => ({ sessionId: SESSION_ID, trackLengthM: TRACK_LENGTH_M, referenceLapId: 'terminal-boundary', laps: [payload] })
  const cleanReview = buildDriverReview(request(clean))
  const resetReview = buildDriverReview(request(withReset))
  assert.equal(resetReview.status.code, 'insufficient-evidence')
  assert.deepEqual(resetReview.reference, { lapId: 'terminal-boundary', lapNumber: 1, lapTimeMs: 40_000 })
  // The discarded producer-transition suffix and its raw-payload hash are not
  // usable review evidence; both inputs analyze as the same completed lap.
  assert.equal(resetReview.inputFingerprint, cleanReview.inputFingerprint)
})

test('terminal reset sanitizer rejects every near-miss instead of tolerating general decreases', () => {
  const cases = [
    // A reset in the middle of otherwise continuing lap evidence.
    lap({ id: 'mid-lap-reset', number: 2, mutateSamples: (samples) => { samples[20].lapElapsedSeconds = 0.02 } }),
    // A closing timestamp and reset too far from start/finish.
    lap({ id: 'far-from-finish', number: 2, mutateSamples: (samples) => {
      samples.splice(34)
      appendTerminalBoundary(samples, { endpointDistanceM: 528 })
    } }),
    // A reset timestamp that is not a small new-lap suffix.
    lap({ id: 'large-reset', number: 2, mutateSamples: (samples) => appendTerminalBoundary(samples, { resetTimesMs: [251] }) }),
    // The retained prefix does not tightly close against the official time.
    lap({ id: 'non-closing-prefix', number: 2, mutateSamples: (samples) => appendTerminalBoundary(samples, { endpointTimeMs: 39_749 }) }),
    // Even the discarded terminal suffix must itself remain monotonic.
    lap({ id: 'second-reset', number: 2, mutateSamples: (samples) => appendTerminalBoundary(samples, { resetTimesMs: [20, 10] }) }),
    // The suffix is bounded in frames as well as elapsed time.
    lap({ id: 'unbounded-suffix', number: 2, mutateSamples: (samples) => appendTerminalBoundary(samples, {
      resetTimesMs: Array.from(
        { length: TERMINAL_BOUNDARY_POLICY.maximumSuffixSamples + 1 },
        (_unused, index) => (index + 1) * TERMINAL_BOUNDARY_POLICY.maximumResetElapsedMs
          / (TERMINAL_BOUNDARY_POLICY.maximumSuffixSamples + 1),
      ),
    }) }),
  ]
  for (const invalidLap of cases) {
    const review = buildDriverReview({ sessionId: SESSION_ID, trackLengthM: TRACK_LENGTH_M, laps: [invalidLap] })
    assert.equal(review.status.code, 'invalid-input', invalidLap.lap.id)
    assert.equal(review.status.reasonCode, 'lap-samples-decreasing', invalidLap.lap.id)
    assert.equal(review.reference, null)
  }
})

test('malformed, non-finite, decreasing, non-replayable, and non-closing profiles fail closed', () => {
  const cases = [
    lap({ id: 'bad-finite', number: 2, mutateSamples: (samples) => { samples[10].brake = Number.NaN } }),
    lap({ id: 'bad-distance', number: 2, mutateSamples: (samples) => { samples[10].distanceIndexM = samples[9].distanceIndexM - 1 } }),
    lap({ id: 'bad-time', number: 2, mutateSamples: (samples) => { samples[10].lapElapsedSeconds = samples[9].lapElapsedSeconds - 1 } }),
    lap({ id: 'not-replayable', number: 2, replayable: false }),
    lap({ id: 'bad-close', number: 2, segmentDurationsMs: [10_000, 10_000, 10_000, 10_000], mutateSamples: (samples) => {
      for (const sample of samples) sample.lapElapsedSeconds *= 1.02
    } }),
  ]
  for (const invalidLap of cases) {
    const review = buildDriverReview(cohort({ laps: [lap({ id: 'reference', number: 1 }), invalidLap] }))
    assert.equal(review.status.code, 'invalid-input', invalidLap.lap.id)
    assert.equal(review.reference, null)
    assert.deepEqual(review.hotspots, [])
  }
})

test('reference must be the supplied same-session fastest strict lap', () => {
  assert.equal(buildDriverReview(cohort({ referenceLapId: 'subject-a' })).status.reasonCode, 'reference-not-fastest-strict')
  const otherSession = cohort(); otherSession.laps[1] = lap({ id: 'foreign', number: 2, sessionId: 'foreign-session' })
  assert.equal(buildDriverReview(otherSession).status.reasonCode, 'lap-session-mismatch')
})

function linearLap({ id, number, lapTimeMs, trackLengthM, startDistanceM = 0 }) {
  const samples = []
  for (let distanceM = startDistanceM; distanceM < trackLengthM; distanceM += REVIEW_CONSTANTS.GRID_STEP_M) {
    samples.push({
      distanceM,
      distanceIndexM: distanceM,
      lapElapsedSeconds: distanceM / trackLengthM * lapTimeMs / 1000,
      brake: 0,
      throttle: 1,
      speedKph: trackLengthM / (lapTimeMs / 1000) * 3.6,
    })
  }
  return {
    payloadHash: `hash-${id}`,
    session: { id: SESSION_ID, track: { lengthM: trackLengthM } },
    lap: { id, number, state: 'complete', quality: 'clean', replayable: true, referenceEligible: true, timingSource: 'official', lapTimeMs },
    samples,
  }
}

test('circular interpolation supports a non-zero first sample and a short final segment', () => {
  const trackLengthM = 1001
  // Canonical live laps may begin after the start/finish sample; the clean-lap
  // policy is circular, so the analyzer must bridge that seam without inventing
  // a discontinuity. The 1001 m route also ends with a 233 m segment.
  const reference = linearLap({ id: 'reference', number: 1, lapTimeMs: 100_000, trackLengthM, startDistanceM: 8 })
  const subject = linearLap({ id: 'subject', number: 2, lapTimeMs: 101_234, trackLengthM, startDistanceM: 8 })
  const review = buildDriverReview({ sessionId: SESSION_ID, trackLengthM, referenceLapId: 'reference', selectedLapId: 'subject', laps: [reference, subject] })
  assert.equal(review.status.code, 'insufficient-evidence')
  assert.equal(review.selectedComparison.deltaToReferenceMs, 1234)
  assert.equal(review.selectedComparison.segmentLossTotalMs, 1234)
  assert.equal(review.selectedComparison.segments.reduce((sum, segment) => sum + segment.lossMs, 0), 1234)
  assert.equal(review.selectedComparison.segments.at(-1).endDistanceM, 1001)
})

test('equal official times use lap number then stable lap ID as reference tie-breakers', () => {
  const byNumber = [linearLap({ id: 'z', number: 2, lapTimeMs: 40_000, trackLengthM: TRACK_LENGTH_M }), linearLap({ id: 'a', number: 1, lapTimeMs: 40_000, trackLengthM: TRACK_LENGTH_M })]
  assert.equal(buildDriverReview({ sessionId: SESSION_ID, trackLengthM: TRACK_LENGTH_M, referenceLapId: 'a', laps: byNumber }).reference.lapId, 'a')

  const byId = [linearLap({ id: 'z', number: 1, lapTimeMs: 40_000, trackLengthM: TRACK_LENGTH_M }), linearLap({ id: 'a', number: 1, lapTimeMs: 40_000, trackLengthM: TRACK_LENGTH_M })]
  const first = buildDriverReview({ sessionId: SESSION_ID, trackLengthM: TRACK_LENGTH_M, referenceLapId: 'a', laps: byId })
  const second = buildDriverReview({ sessionId: SESSION_ID, trackLengthM: TRACK_LENGTH_M, referenceLapId: 'a', laps: [...byId].reverse() })
  assert.equal(first.reference.lapId, 'a')
  assert.equal(first.inputFingerprint, second.inputFingerprint)
})

test('exact numeric evidence accounting is preserved and privacy-whitelisted', () => {
  const input = cohort({
    evidence: {
      totalLapCount: 10,
      strictEligibleTotal: 6,
      sampledLapCount: 4,
      strictExcludedTotal: 4,
      notDecodedDueToLimit: 2,
      exclusions: { 'not-clean': 4, 'cohort-limit': 2 },
    },
  })
  const review = buildDriverReview(input)
  assert.deepEqual(review.cohort.accounting, input.evidence)
  assert.ok(review.limitations.includes('cohort-capped'))

  for (const malformed of [
    { ...input.evidence, strictExcludedTotal: 3 },
    { ...input.evidence, notDecodedDueToLimit: 1 },
    { ...input.evidence, exclusions: { path: 2, 'cohort-limit': 2 } },
    { ...input.evidence, exclusions: { 'not-clean': 4, 'cohort-limit': 1 } },
  ]) assert.equal(buildDriverReview({ ...input, evidence: malformed }).status.reasonCode, 'evidence-accounting-malformed')
})

test('decoded input is capped at sixteen and public enum codes stay explicit', () => {
  const laps = Array.from({ length: 17 }, (_, index) => lap({ id: `lap-${index}`, number: index + 1, segmentDurationsMs: [10_000, 10_000 + index, 10_000, 10_000], comparison: index > 0 }))
  assert.equal(buildDriverReview(cohort({ laps })).status.reasonCode, 'cohort-limit-exceeded')
  assert.ok(OBSERVATION_CODES.includes('exit-speed-lower'))
  assert.ok(EXPERIMENT_CODES.includes('exit-speed-higher-small-step'))
})

function denseLongLap({ id, number, lapTimeMs, trackLengthM = 13_626 }) {
  const samples = []
  for (let distanceM = 0; distanceM < trackLengthM; distanceM += 2) {
    const phase = distanceM % 900
    samples.push({
      distanceM,
      distanceIndexM: distanceM,
      lapElapsedSeconds: distanceM / trackLengthM * lapTimeMs / 1000,
      brake: phase >= 600 && phase < 680 ? 0.7 : 0,
      throttle: phase >= 560 && phase < 720 ? 0.1 : 1,
      speedKph: 250 - (phase >= 560 && phase < 720 ? 80 : 0),
    })
  }
  return {
    payloadHash: `hash-${id}`,
    session: { id: SESSION_ID, track: { lengthM: trackLengthM } },
    lap: { id, number, state: 'complete', quality: 'clean', replayable: true, referenceEligible: true, timingSource: 'official', lapTimeMs },
    samples,
  }
}

test('sixteen dense long-track laps resample within a bounded synchronous budget', () => {
  const trackLengthM = 13_626
  const laps = Array.from({ length: 16 }, (_, index) => denseLongLap({
    id: `long-${String(index).padStart(2, '0')}`,
    number: index + 1,
    lapTimeMs: 300_000 + index * 10,
    trackLengthM,
  }))
  const started = process.hrtime.bigint()
  const review = buildDriverReview({ sessionId: SESSION_ID, trackLengthM, referenceLapId: 'long-00', laps })
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  assert.equal(review.status.code, 'ready')
  // The former per-grid findIndex implementation measured 4.58 s on the
  // private 16-lap long-track cohort. This generous ceiling catches that
  // complexity regression without treating unit-test timing as a benchmark.
  assert.ok(elapsedMs < 2_500, `long-track review took ${elapsedMs.toFixed(1)} ms`)
})
