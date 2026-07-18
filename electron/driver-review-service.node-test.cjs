const assert = require('node:assert/strict')
const test = require('node:test')
const { getDriverReview, validAnalysisId, validDriverReviewOutput } = require('./driver-review-service.cjs')
const { buildDriverReview, REVIEW_CONSTANTS, ALGORITHM_VERSION } = require('./driver-review.cjs')
const { constants: SESSION_STORE_CONSTANTS } = require('./live-session-store.cjs')

function structuredReview() {
  return {
    schemaVersion: 1,
    algorithmVersion: ALGORITHM_VERSION,
    inputFingerprint: 'f'.repeat(64),
    status: { code: 'insufficient-evidence', reasonCode: 'reference-unavailable' },
    cohort: {
      decodedLapCount: 0,
      analyzedLapCount: 0,
      nonReferenceLapCount: 0,
      accounting: { totalLapCount: 0, strictEligibleTotal: 0, sampledLapCount: 0, strictExcludedTotal: 0, notDecodedDueToLimit: 0, exclusions: {} },
    },
    reference: null,
    selectedComparison: null,
    hotspots: [],
    strength: null,
    variability: null,
    limitations: ['fewer-than-three-comparisons', 'selected-lap-not-supplied'],
  }
}

test('transport and engine enforce the same decoded-lap ceiling', () => {
  assert.equal(SESSION_STORE_CONSTANTS.DRIVER_REVIEW_MAX_EVIDENCE_LAPS, REVIEW_CONSTANTS.MAX_DECODED_LAPS)
})

test('driver review IDs use the same bounded analysis identity grammar', async () => {
  assert.equal(validAnalysisId('analysis-session-a012-9'), true)
  assert.equal(validAnalysisId(''), false)
  assert.equal(validAnalysisId('../session'), false)
  assert.equal(validAnalysisId('a'.repeat(97)), false)

  let called = false
  const result = await getDriverReview({
    sessionId: '../session',
    selectedLapId: 'lap-1',
    telemetryDatabase: { flush: () => { called = true } },
    buildDriverReview: () => { called = true },
  })
  assert.equal(result, null)
  assert.equal(called, false)

  const invalidSelection = await getDriverReview({
    sessionId: 'session-1',
    selectedLapId: 'lap/1',
    telemetryDatabase: { flush: () => { called = true } },
    buildDriverReview: () => { called = true },
  })
  assert.equal(invalidSelection, null)
  assert.equal(called, false)
})

test('durable driver review evidence wins after its pending write queue flushes', async () => {
  const order = []
  const input = { sessionId: 'session-1', laps: [{ samples: [{ x: 1, z: 2 }], payloadHash: 'private-hash' }] }
  const expected = structuredReview()
  const review = await getDriverReview({
    sessionId: 'session-1',
    selectedLapId: 'lap-1',
    telemetryDatabase: {
      flush: async () => { order.push('flush') },
      getDriverReviewEvidence: () => { order.push('database'); return { status: 'ready', input } },
    },
    liveSessionStore: { getDriverReviewEvidence: () => { throw new Error('durable session must win') } },
    buildDriverReview: (received) => { order.push('build'); assert.equal(received, input); return expected },
  })

  assert.equal(review, expected)
  assert.deepEqual(order, ['flush', 'database', 'build'])
  const serialized = JSON.stringify(review)
  assert.doesNotMatch(serialized, /samples|private-hash|payloadHash|"x"|"z"/)
})

test('a durable rejected selection cannot fall through to live evidence', async () => {
  let liveCalled = false
  let buildCalled = false
  const review = await getDriverReview({
    sessionId: 'session-1',
    selectedLapId: 'lap-from-another-session',
    telemetryDatabase: {
      flush: async () => {},
      getDriverReviewEvidence: () => ({ status: 'selected-lap-not-found' }),
    },
    liveSessionStore: { getDriverReviewEvidence: () => { liveCalled = true } },
    buildDriverReview: () => { buildCalled = true },
  })
  assert.equal(review, null)
  assert.equal(liveCalled, false)
  assert.equal(buildCalled, false)
})

test('a faulted durable subset fails closed instead of yielding to fuller live evidence', async () => {
  let liveCalled = false
  let buildCalled = false
  const durableSubset = { status: 'storage-error' }
  const fullerLiveInput = { sessionId: 'session-1', laps: [{ lap: { id: 'lap-1' } }, { lap: { id: 'lap-2' } }] }
  const review = await getDriverReview({
    sessionId: 'session-1',
    telemetryDatabase: {
      flush: async () => {},
      getDriverReviewEvidence: () => durableSubset,
    },
    liveSessionStore: {
      getDriverReviewEvidence: () => { liveCalled = true; return { status: 'ready', input: fullerLiveInput } },
    },
    buildDriverReview: () => { buildCalled = true; return { schemaVersion: 1 } },
  })

  assert.equal(review, null)
  assert.equal(liveCalled, false)
  assert.equal(buildCalled, false)
  assert.deepEqual(durableSubset, { status: 'storage-error' }, 'fault details and local paths stay private')
})

test('live driver review evidence is a bounded fallback when no durable session exists', async () => {
  const input = { sessionId: 'live-session', laps: [], evidence: { strictEligibleTotal: 0, sampledLapCount: 0 } }
  const review = await getDriverReview({
    sessionId: 'live-session',
    telemetryDatabase: { flush: async () => {}, getDriverReviewEvidence: () => null },
    liveSessionStore: { getDriverReviewEvidence: () => ({ status: 'ready', input }) },
    buildDriverReview: (received) => received === input ? structuredReview() : null,
  })
  assert.deepEqual(review, structuredReview())
})

test('raw evidence is rejected if a review builder accidentally echoes it', async () => {
  const input = { sessionId: 'session-1', laps: [{ samples: [{ x: 1, z: 2 }], payloadHash: 'a'.repeat(64) }] }
  const options = {
    sessionId: 'session-1',
    telemetryDatabase: { flush: async () => {}, getDriverReviewEvidence: () => ({ status: 'ready', input }) },
    liveSessionStore: null,
  }
  await assert.rejects(getDriverReview({ ...options, buildDriverReview: () => ({ samples: input.laps[0].samples }) }), /private evidence boundary/)
  await assert.rejects(getDriverReview({ ...options, buildDriverReview: () => ({ leaked: input.laps[0].payloadHash }) }), /private payload hash/)
})

test('the public boundary rejects unknown prose, identity keys, and non-finite structured values', async () => {
  const input = { sessionId: 'session-1', laps: [] }
  const options = {
    sessionId: 'session-1',
    telemetryDatabase: { flush: async () => {}, getDriverReviewEvidence: () => ({ status: 'ready', input }) },
  }
  for (const leaked of [
    { ...structuredReview(), driverName: 'Alice Driver' },
    { ...structuredReview(), trackName: 'Private Track' },
    { ...structuredReview(), details: { prose: 'unrestricted output' } },
    { ...structuredReview(), cohort: { ...structuredReview().cohort, decodedLapCount: Number.NaN } },
  ]) {
    assert.equal(validDriverReviewOutput(leaked), false)
    await assert.rejects(getDriverReview({ ...options, buildDriverReview: () => leaked }), /exact public schema/)
  }
  assert.equal(validDriverReviewOutput(structuredReview()), true)
})

test('the real deterministic builder crosses the transport boundary only as a structured review', async () => {
  const makeLap = (number, lapTimeMs) => ({
    session: { id: 'session-1', track: { lengthM: 1000 } },
    lap: { id: `lap-${number}`, number, state: 'complete', quality: 'clean', referenceEligible: true, replayable: true, timingSource: 'official', lapTimeMs },
    payloadHash: String(number).repeat(64),
    samples: Array.from({ length: 63 }, (_, index) => {
      const distanceM = index * 16
      return {
        distanceM,
        distanceIndexM: distanceM,
        lapElapsedSeconds: distanceM / 1000 * lapTimeMs / 1000,
        brake: distanceM >= 256 && distanceM < 320 ? 0.5 : 0,
        throttle: distanceM >= 336 ? 1 : 0.2,
        speedKph: 160,
      }
    }),
  })
  const laps = [makeLap(1, 90_000), makeLap(2, 91_000), makeLap(3, 92_000), makeLap(4, 93_000)]
  const input = {
    sessionId: 'session-1',
    trackLengthM: 1000,
    selectedLapId: 'lap-2',
    referenceLapId: 'lap-1',
    laps,
    evidence: { totalLapCount: 4, strictEligibleTotal: 4, sampledLapCount: 4, strictExcludedTotal: 0, notDecodedDueToLimit: 0, exclusions: {} },
  }
  const review = await getDriverReview({
    sessionId: 'session-1',
    selectedLapId: 'lap-2',
    telemetryDatabase: { flush: async () => {}, getDriverReviewEvidence: () => ({ status: 'ready', input }) },
    buildDriverReview,
  })

  assert.equal(review.status.code, 'ready')
  assert.equal(review.reference.lapId, 'lap-1')
  assert.equal(review.selectedComparison.lapId, 'lap-2')
  assert.doesNotMatch(JSON.stringify(review), /samples|payloadHash|distanceIndexM|lapElapsedSeconds/)

  const allowedLapIds = new Set(laps.map((payload) => payload.lap.id))
  assert.equal(validDriverReviewOutput(review, allowedLapIds), true)
  const foreignReference = { ...review, reference: { ...review.reference, lapId: 'lap-999' } }
  const foreignSelection = { ...review, selectedComparison: { ...review.selectedComparison, lapId: 'lap-999' } }
  const reviewWithHotspot = {
    ...review,
    hotspots: [{
      id: 'segment-001',
      startDistanceM: 0,
      endDistanceM: 256,
      representativeLapId: 'lap-3',
      representativeLapNumber: 3,
      medianLossMs: 100,
      minimumLossMs: 80,
      maximumLossMs: 120,
      madLossMs: 20,
      directionalAgreement: 0.75,
      comparedLapCount: 3,
      observations: [{ code: 'throttle-pickup-later', medianDelta: 16, unit: 'm', directionalAgreement: 0.75, comparedLapCount: 3 }],
      experiments: ['throttle-pickup-earlier-small-step'],
    }],
  }
  const foreignHotspot = {
    ...reviewWithHotspot,
    hotspots: reviewWithHotspot.hotspots.map((hotspot) => ({ ...hotspot, representativeLapId: 'lap-999' })),
  }
  const foreignStrength = { ...review, strength: { ...review.strength, representativeLapId: 'lap-999' } }
  assert.ok(review.strength)
  assert.equal(validDriverReviewOutput(reviewWithHotspot, allowedLapIds), true)
  for (const foreignIdentity of [foreignReference, foreignSelection, foreignHotspot, foreignStrength]) {
    assert.equal(validDriverReviewOutput(foreignIdentity), true, 'identity remains syntactically valid')
    assert.equal(validDriverReviewOutput(foreignIdentity, allowedLapIds), false, 'identity must belong to resolved evidence')
  }
  await assert.rejects(getDriverReview({
    sessionId: 'session-1',
    selectedLapId: 'lap-2',
    telemetryDatabase: { flush: async () => {}, getDriverReviewEvidence: () => ({ status: 'ready', input }) },
    buildDriverReview: () => foreignReference,
  }), /exact public schema/)
})
