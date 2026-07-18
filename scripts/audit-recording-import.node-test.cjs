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
