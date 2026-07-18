const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { version: appVersion } = require('../package.json')
const { constants: { QUALITY_POLICY_VERSION } } = require('../electron/live-session-store.cjs')
const { PROCESSING_VERSION } = require('../electron/recording-import-service.cjs')
const {
  AuditError,
  acceptAggregate,
  assertAggregateExpectations,
  assertDriverReviewExpectations,
  auditDriverReviews,
  assertNoRecordingIdentity,
  createAuditDiagnostics,
  encodedNeedles,
  importReplayFailureCode,
  initialAggregates,
  parseCli,
  safeErrorCode,
  safeErrorDetail,
  validateDurableHistory,
} = require('./audit-recording-import.cjs')

const recording = path.resolve('/tmp/private-oracle.apexrec')

test('CLI accepts an absolute recording from flags or environment and validates aggregate expectations', () => {
  const fromFlags = parseCli([
    '--recording', recording,
    '--expect-frames=100',
    '--expect-sessions', '3',
    '--expect-laps', '12',
    '--expect-complete-laps', '10',
    '--expect-clean-laps=8',
    '--expect-officially-timed-laps', '9',
    '--expect-reference-laps', '7',
    '--expect-replayable-laps=11',
    '--min-single-car-frames', '4',
    '--min-multi-car-frames=5',
    '--min-driver-review-ready', '2',
    '--min-driver-review-hotspots=3',
    '--timeout-ms', '5000',
  ], {})
  assert.deepEqual({
    recording: fromFlags.recording,
    expectFrames: fromFlags.expectFrames,
    expectSessions: fromFlags.expectSessions,
    expectLaps: fromFlags.expectLaps,
    expectCompleteLaps: fromFlags.expectCompleteLaps,
    expectCleanLaps: fromFlags.expectCleanLaps,
    expectOfficiallyTimedLaps: fromFlags.expectOfficiallyTimedLaps,
    expectReferenceLaps: fromFlags.expectReferenceLaps,
    expectReplayableLaps: fromFlags.expectReplayableLaps,
    minimumSingleCarFrames: fromFlags.minimumSingleCarFrames,
    minimumMultiCarFrames: fromFlags.minimumMultiCarFrames,
    minimumDriverReviewReady: fromFlags.minimumDriverReviewReady,
    minimumDriverReviewHotspots: fromFlags.minimumDriverReviewHotspots,
    timeoutMs: fromFlags.timeoutMs,
  }, {
    recording,
    expectFrames: 100,
    expectSessions: 3,
    expectLaps: 12,
    expectCompleteLaps: 10,
    expectCleanLaps: 8,
    expectOfficiallyTimedLaps: 9,
    expectReferenceLaps: 7,
    expectReplayableLaps: 11,
    minimumSingleCarFrames: 4,
    minimumMultiCarFrames: 5,
    minimumDriverReviewReady: 2,
    minimumDriverReviewHotspots: 3,
    timeoutMs: 5000,
  })
  const fromEnvironment = parseCli([], {
    APEX_RECORDING_AUDIT_FILE: recording,
    APEX_RECORDING_EXPECT_FRAMES: '42',
    APEX_RECORDING_EXPECT_COMPLETE_LAPS: '9',
    APEX_RECORDING_EXPECT_CLEAN_LAPS: '6',
    APEX_RECORDING_EXPECT_OFFICIALLY_TIMED_LAPS: '7',
    APEX_RECORDING_EXPECT_REFERENCE_LAPS: '5',
    APEX_RECORDING_EXPECT_REPLAYABLE_LAPS: '8',
    APEX_RECORDING_MIN_DRIVER_REVIEW_READY: '1',
    APEX_RECORDING_MIN_DRIVER_REVIEW_HOTSPOTS: '2',
  })
  assert.equal(fromEnvironment.recording, recording)
  assert.equal(fromEnvironment.expectFrames, 42)
  assert.equal(fromEnvironment.expectCompleteLaps, 9)
  assert.equal(fromEnvironment.expectCleanLaps, 6)
  assert.equal(fromEnvironment.expectOfficiallyTimedLaps, 7)
  assert.equal(fromEnvironment.expectReferenceLaps, 5)
  assert.equal(fromEnvironment.expectReplayableLaps, 8)
  assert.equal(fromEnvironment.minimumSingleCarFrames, 0)
  assert.equal(fromEnvironment.minimumMultiCarFrames, 0)
  assert.equal(fromEnvironment.minimumDriverReviewReady, 1)
  assert.equal(fromEnvironment.minimumDriverReviewHotspots, 2)
  assert.throws(() => parseCli(['relative.apexrec'], {}), (error) => error instanceof AuditError && error.code === 'invalid-recording')
  assert.equal(parseCli(['--recording', recording, '--min-single-car-frames', '0'], {}).minimumSingleCarFrames, 0)
  assert.throws(() => parseCli(['--recording', recording, '--expect-clean-laps', '-1'], {}), (error) => error instanceof AuditError && error.code === 'invalid-expected-clean-laps')
})

test('aggregate audit always requires opponent arrays while population expectations are opt-in', () => {
  const aggregate = initialAggregates()
  acceptAggregate(aggregate, { type: 'telemetry', opponents: [] })
  acceptAggregate(aggregate, { type: 'telemetry', opponents: [{ slot: 2 }] })
  acceptAggregate(aggregate, { type: 'status', state: 'replay-complete', frames: 2 })
  assert.deepEqual(aggregate, { frames: 2, singleCarFrames: 1, multiCarFrames: 1, invalidOpponentFrames: 0, replayCompletionFrames: 2 })
  assert.doesNotThrow(() => assertAggregateExpectations(aggregate, { minimumSingleCarFrames: 1, minimumMultiCarFrames: 1, expectFrames: 2 }))
  assert.doesNotThrow(() => assertAggregateExpectations({ ...aggregate, multiCarFrames: 0 }, { minimumSingleCarFrames: 0, minimumMultiCarFrames: 0 }))
  assert.throws(() => assertAggregateExpectations({ ...aggregate, multiCarFrames: 0 }, { minimumSingleCarFrames: 1, minimumMultiCarFrames: 1 }), /multi-car-frames-missing/)
  assert.throws(() => assertAggregateExpectations({ ...aggregate, invalidOpponentFrames: 1 }, { minimumSingleCarFrames: 1, minimumMultiCarFrames: 1 }), /opponent-array-missing/)
})

const REVIEW_TRACK_LENGTH_M = 1024

function reviewControls(distanceM, comparison) {
  if (distanceM < 256 || distanceM > 512) return { brake: 0, throttle: 1, speedKph: 200 }
  const brakeStart = comparison ? 320 : 352
  const brakeEnd = comparison ? 432 : 416
  const throttleStart = comparison ? 304 : 336
  const throttleEnd = comparison ? 496 : 448
  const corner = distanceM >= throttleStart && distanceM < throttleEnd
  const braking = distanceM >= brakeStart && distanceM < brakeEnd
  const apexDistance = comparison ? 432 : 416
  const minimumSpeedKph = comparison ? 70 : 80
  return {
    brake: braking ? 0.8 : 0,
    throttle: corner ? 0 : 1,
    speedKph: corner ? Math.min(200, minimumSpeedKph + Math.abs(distanceM - apexDistance) * 1.2) : 200,
  }
}

function reviewElapsedMs(distanceM, segmentDurationsMs) {
  const segment = Math.min(3, Math.floor(distanceM / 256))
  const elapsedBefore = segmentDurationsMs.slice(0, segment).reduce((sum, value) => sum + value, 0)
  return elapsedBefore + segmentDurationsMs[segment] * ((distanceM - segment * 256) / 256)
}

function reviewLap(sessionId, id, number, segmentDurationsMs, comparison = false) {
  const samples = []
  for (let distanceM = 0; distanceM < REVIEW_TRACK_LENGTH_M; distanceM += 16) {
    samples.push({
      distanceM,
      distanceIndexM: distanceM,
      lapElapsedSeconds: reviewElapsedMs(distanceM, segmentDurationsMs) / 1000,
      ...reviewControls(distanceM, comparison),
    })
  }
  return {
    schemaVersion: 1,
    payloadHash: `payload-${id}`,
    privateDriverName: 'must-not-leave-the-review-boundary',
    localPath: recording,
    session: { id: sessionId, track: { lengthM: REVIEW_TRACK_LENGTH_M } },
    lap: {
      id,
      number,
      state: 'complete',
      quality: 'clean',
      replayable: true,
      referenceEligible: true,
      timingSource: 'official',
      lapTimeMs: segmentDurationsMs.reduce((sum, value) => sum + value, 0),
    },
    samples,
  }
}

function reviewInput(sessionId, { insufficient = false } = {}) {
  const reference = reviewLap(sessionId, `${sessionId}-reference`, 1, [10_000, 10_000, 10_000, 10_000])
  const comparisons = [
    reviewLap(sessionId, `${sessionId}-subject-a`, 2, [10_000, 10_200, 9_900, 10_000], true),
    reviewLap(sessionId, `${sessionId}-subject-b`, 3, [10_000, 10_220, 9_900, 10_000], true),
    reviewLap(sessionId, `${sessionId}-subject-c`, 4, [10_000, 10_180, 9_950, 10_000], true),
  ]
  const laps = insufficient ? [reference, comparisons[0]] : [reference, ...comparisons]
  return {
    sessionId,
    trackLengthM: REVIEW_TRACK_LENGTH_M,
    selectedLapId: null,
    referenceLapId: reference.lap.id,
    laps,
    evidence: {
      totalLapCount: laps.length,
      strictEligibleTotal: laps.length,
      sampledLapCount: laps.length,
      strictExcludedTotal: 0,
      notDecodedDueToLimit: 0,
      exclusions: {},
    },
  }
}

function reviewDatabase(inputs, resolveInput = (_sessionId, input) => input) {
  let reads = 0
  return {
    get reads() { return reads },
    listSessions: () => inputs.map((input) => ({ id: input.sessionId })),
    flush: async () => {},
    getDriverReviewEvidence: (sessionId) => {
      reads += 1
      const input = inputs.find((candidate) => candidate.sessionId === sessionId)
      return input ? { status: 'ready', input: resolveInput(sessionId, input, reads) } : null
    },
  }
}

test('durable driver-review audit uses the shipped service and engine twice per session but returns counts only', async () => {
  const database = reviewDatabase([
    reviewInput('review-session-ready'),
    reviewInput('review-session-insufficient', { insufficient: true }),
  ])
  const result = await auditDriverReviews(database, recording)
  assert.deepEqual(result, {
    sessions: 2,
    statuses: { ready: 1, 'insufficient-evidence': 1, 'invalid-input': 0 },
    sessionsWithHotspots: 1,
    hotspots: 1,
  })
  assert.equal(database.reads, 4)
  assert.doesNotMatch(JSON.stringify(result), /review-session|reference|subject|payload|samples|private-oracle/)
  assert.doesNotThrow(() => assertDriverReviewExpectations(result, { minimumDriverReviewReady: 1, minimumDriverReviewHotspots: 1 }))
  assert.throws(() => assertDriverReviewExpectations(result, { minimumDriverReviewReady: 2, minimumDriverReviewHotspots: 1 }), (error) => error instanceof AuditError && error.code === 'driver-review-ready-minimum-missing')
  assert.throws(() => assertDriverReviewExpectations(result, { minimumDriverReviewReady: 1, minimumDriverReviewHotspots: 2 }), (error) => error instanceof AuditError && error.code === 'driver-review-hotspot-minimum-missing')
})

test('durable driver-review audit rejects non-repeatable output and recording identity leakage', async () => {
  const stable = reviewInput('review-session-changing')
  const changed = structuredClone(stable)
  changed.laps[1].lap.lapTimeMs += 1
  const changing = reviewDatabase([stable], (_sessionId, input, reads) => (reads % 2 ? input : changed))
  await assert.rejects(auditDriverReviews(changing, recording), (error) => error instanceof AuditError && error.code === 'driver-review-nondeterministic')

  const leakingRecording = path.resolve('/tmp/private-oracle')
  const leaking = reviewInput('review-session-leaking')
  leaking.laps[0].lap.id = path.basename(leakingRecording)
  leaking.referenceLapId = leaking.laps[0].lap.id
  await assert.rejects(auditDriverReviews(reviewDatabase([leaking]), leakingRecording), (error) => error instanceof AuditError && error.code === 'recording-identity-persisted')
})

test('durable driver-review audit reports the bounded reason from any invalid session', async () => {
  const invalid = reviewInput('review-session-invalid')
  invalid.laps[1].lap.replayable = false
  const valid = reviewInput('review-session-valid', { insufficient: true })
  await assert.rejects(auditDriverReviews(reviewDatabase([valid, invalid]), recording), (error) => (
    error instanceof AuditError && error.code === 'driver-review-invalid-input' && error.detail === 'lap-not-strict-eligible'
  ))
})

function fakeHistory({ leak = false } = {}) {
  const provenance = {
    id: 'recording-import-stable',
    recordingSha256: 'a'.repeat(64),
    recordingFormat: 'apex-lmu-raw-v1',
    processingVersion: PROCESSING_VERSION,
    importedAt: '2026-07-17T10:00:00.000Z',
    appVersion,
    sessionCount: 1,
    lapCount: 2,
  }
  const laps = [
    { id: 'lap-1', state: 'complete', quality: 'clean', lapTimeMs: 90_000, timingSource: 'official', replayable: true, referenceEligible: true, payloadHash: 'b'.repeat(64), sampleCount: 2 },
    { id: 'lap-2', state: 'incomplete', quality: 'ineligible', lapTimeMs: null, timingSource: 'unavailable', replayable: false, referenceEligible: false, payloadHash: 'c'.repeat(64), sampleCount: 1 },
  ]
  const sessions = [{ id: 'session-1', source: 'imported-recording', qualityPolicyVersion: QUALITY_POLICY_VERSION, importProvenance: provenance, laps }]
  const reads = []
  return {
    reads,
    listSessions: () => sessions,
    getLap: (sessionId, lapId) => {
      reads.push(lapId)
      const lap = laps.find((candidate) => candidate.id === lapId)
      return { session: { id: sessionId }, lap: { ...lap }, payloadHash: lap.payloadHash, samples: Array.from({ length: lap.sampleCount }, () => (leak && lapId === 'lap-2' ? { source: recording } : { speedKph: 100 })) }
    },
    findRecordingImport: () => ({ ...provenance, sessionIds: ['session-1'] }),
  }
}

test('durable validation decodes every lap and rejects a stored source path, directory, or basename', () => {
  const database = fakeHistory()
  const result = validateDurableHistory(database, recording, { sessions: 1, laps: 2, completeLaps: 1, cleanLaps: 1, officiallyTimedLaps: 1, referenceLaps: 1, replayableLaps: 1 })
  assert.deepEqual({
    sessions: result.sessions,
    laps: result.laps,
    completeLaps: result.completeLaps,
    cleanLaps: result.cleanLaps,
    officiallyTimedLaps: result.officiallyTimedLaps,
    referenceLaps: result.referenceLaps,
    replayableLaps: result.replayableLaps,
    payloads: result.payloads,
  }, { sessions: 1, laps: 2, completeLaps: 1, cleanLaps: 1, officiallyTimedLaps: 1, referenceLaps: 1, replayableLaps: 1, payloads: 2 })
  assert.deepEqual(database.reads, ['lap-1', 'lap-2'])
  assert.throws(() => validateDurableHistory(fakeHistory({ leak: true }), recording), /recording-identity-persisted/)
  assert.throws(() => assertNoRecordingIdentity({ fileName: path.basename(recording) }, [path.basename(recording)]), /recording-identity-persisted/)
  assert.throws(() => assertNoRecordingIdentity({ sourceDirectory: path.dirname(recording) }, encodedNeedles(recording)), /recording-identity-persisted/)
  const quotedRecording = '/tmp/private "directory"/oracle.apexrec'
  const quotedDirectory = path.dirname(quotedRecording)
  assert.equal(encodedNeedles(quotedRecording).includes(JSON.stringify(quotedDirectory).slice(1, -1)), true)
})

test('durable validation rejects incorrect lap-quality expectations and replayability metadata', () => {
  assert.throws(() => validateDurableHistory(fakeHistory(), recording, { completeLaps: 2 }), /unexpected-complete-lap-count/)
  assert.throws(() => validateDurableHistory(fakeHistory(), recording, { cleanLaps: 0 }), /unexpected-clean-lap-count/)
  assert.throws(() => validateDurableHistory(fakeHistory(), recording, { officiallyTimedLaps: 0 }), /unexpected-officially-timed-lap-count/)
  assert.throws(() => validateDurableHistory(fakeHistory(), recording, { referenceLaps: 0 }), /unexpected-reference-lap-count/)
  assert.throws(() => validateDurableHistory(fakeHistory(), recording, { replayableLaps: 0 }), /unexpected-replayable-lap-count/)
  const database = fakeHistory()
  const originalGetLap = database.getLap
  database.getLap = (sessionId, lapId) => {
    const payload = originalGetLap(sessionId, lapId)
    if (lapId === 'lap-1') payload.lap.replayable = false
    return payload
  }
  assert.throws(() => validateDurableHistory(database, recording), /invalid-durable-payload/)

  const overflow = fakeHistory()
  Object.assign(overflow.listSessions()[0].laps[0], {
    quality: 'ineligible',
    reasons: ['sample-overflow'],
    replayable: false,
    referenceEligible: false,
    trackModelEligible: false,
  })
  assert.doesNotThrow(() => validateDurableHistory(overflow, recording))

  const ambiguous = fakeHistory()
  ambiguous.listSessions()[0].laps[0].timingSource = 'legacy-unknown'
  assert.throws(() => validateDurableHistory(ambiguous, recording), /invalid-timing-provenance/)
})

test('CLI-facing failures never echo arbitrary error messages', () => {
  assert.equal(safeErrorCode(new AuditError('unexpected-lap-count')), 'unexpected-lap-count')
  assert.equal(safeErrorCode(new Error(`failed near ${recording}`)), 'audit-failed')
  assert.equal(safeErrorDetail(new AuditError('ingest-failed', 'empty-session-finalization')), 'empty-session-finalization')
  assert.equal(safeErrorDetail(new AuditError('driver-review-invalid-input', 'lap-samples-decreasing')), 'lap-samples-decreasing')
  assert.equal(safeErrorDetail(new AuditError('ingest-failed', recording)), null)
  assert.equal(importReplayFailureCode(null, { reason: 'import-limit' }), 'import-limit')
  assert.equal(importReplayFailureCode(null, { reason: recording }), 'strict-replay-failed')
  assert.equal(importReplayFailureCode(new AuditError('import-routing-failed'), { reason: 'import-limit' }), 'import-routing-failed')
})

test('audit diagnostics expose only a bounded failure taxonomy', () => {
  const diagnostics = createAuditDiagnostics()
  diagnostics.record('error', 'recording-import', 'staging-write-failed', 'ignored', {
    kind: 'session',
    error: 'Private staging rejected a session write (not-found).',
  })
  assert.equal(diagnostics.failureDetail(), 'empty-session-finalization')
  diagnostics.record('error', 'recording-import', 'staging-write-failed', 'ignored', {
    kind: 'lap',
    error: `private identity at ${recording}`,
  })
  assert.equal(diagnostics.failureDetail(), 'lap-staging-write')
})
