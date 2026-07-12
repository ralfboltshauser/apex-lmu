const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../data/recordings/apex-lmu-session-2026-07-12-19-23-14TESTAUFNAMERALF.expected.json')
const { accept, assertSummary, emptySummary } = require('./assert-recording-replay.cjs')

test('rejects stale or uncorrelated replay output', () => {
  assert.throws(() => accept(emptySummary(), { source: 'recording-replay', runId: 'old', type: 'status', state: 'replay-complete' }, 'current'), /uncorrelated/)
  assert.throws(() => accept(emptySummary(), { source: 'lmu-shared-memory', runId: 'current', type: 'status', state: 'replay-complete' }, 'current'), /uncorrelated/)
})

test('wrong expectations and missing completion cannot pass', () => {
  const summary = emptySummary()
  assert.throws(() => assertSummary(summary, manifest.expected), /status sequence mismatch/)
  summary.statuses = [...manifest.expected.statusSequence]
  assert.throws(() => assertSummary(summary, manifest.expected), /telemetry frame count mismatch/)
})

test('zero-opponent telemetry must still carry an explicit array', () => {
  const summary = emptySummary()
  accept(summary, { source: 'recording-replay', runId: 'run', type: 'telemetry', playerTelemetryAvailable: false, session: {}, player: {} }, 'run')
  assert.equal(summary.missingOpponentArrays, 1)
  summary.completionFrames = 1
  assert.throws(() => assertSummary(summary, { ...manifest.expected, statusSequence: [], telemetryFrames: 1, scoringOnlyFrames: 1, firstVehicleTelemetryFrame: null }), /missing opponent arrays/)
})
