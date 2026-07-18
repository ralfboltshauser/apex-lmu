const assert = require('node:assert/strict')
const test = require('node:test')
const { TERMINAL_BOUNDARY_POLICY, playbackSamples, sanitizeTerminalBoundarySamples } = require('./lap-sample-sanitizer.cjs')

function sample(distanceM, lapElapsedMs) {
  return { distanceM, distanceIndexM: distanceM, lapElapsedSeconds: lapElapsedMs / 1000 }
}

function measuredBoundary(resetTimesMs = [9.751, 30, 55, 80, 105, 130, 147.505]) {
  return [
    sample(0, 0),
    sample(500, 20_000),
    sample(1012, 40_000 - 9.666),
    ...resetTimesMs.map((timeMs) => sample(1012, timeMs)),
  ]
}

test('terminal sample sanitizer removes only the measured finish-line producer transition', () => {
  const samples = measuredBoundary()
  const result = sanitizeTerminalBoundarySamples(samples, { trackLengthM: 1024, officialLapTimeMs: 40_000 })
  assert.equal(result.status, 'trimmed')
  assert.equal(result.trimmedSampleCount, 7)
  assert.deepEqual(result.samples, samples.slice(0, 3))
  assert.deepEqual(playbackSamples(samples, { trackLengthM: 1024, officialLapTimeMs: 40_000 }), samples.slice(0, 3))
})

test('terminal sample sanitizer accepts the measured canonical 50 Hz suffix before compaction', () => {
  const resetTimesMs = [2.505, 22.505, 42.505, 62.505, 82.505, 102.505, 122.505, 142.505, 162.505]
  const samples = measuredBoundary(resetTimesMs)
  const result = sanitizeTerminalBoundarySamples(samples, { trackLengthM: 1024, officialLapTimeMs: 40_000 })
  assert.equal(result.status, 'trimmed')
  assert.equal(result.trimmedSampleCount, 9)
  assert.deepEqual(result.samples, samples.slice(0, 3))
})

test('terminal sample sanitizer includes every declared numeric boundary', () => {
  const exactCountAndTime = measuredBoundary(Array.from(
    { length: TERMINAL_BOUNDARY_POLICY.maximumSuffixSamples },
    (_unused, index) => index * TERMINAL_BOUNDARY_POLICY.maximumResetElapsedMs
      / (TERMINAL_BOUNDARY_POLICY.maximumSuffixSamples - 1),
  ))
  const exactOfficialDifference = [
    sample(0, 0),
    sample(500, 20_000),
    sample(1012, 40_000 - TERMINAL_BOUNDARY_POLICY.maximumOfficialTimeDifferenceMs),
    sample(1012, 20),
  ]
  const exactFinishDistance = 1024 - TERMINAL_BOUNDARY_POLICY.maximumDistanceFromFinishM
  const exactFinishWindow = [
    sample(0, 0),
    sample(500, 20_000),
    sample(exactFinishDistance, 39_990),
    sample(exactFinishDistance, 20),
  ]

  for (const [samples, expectedTrimmed] of [
    [exactCountAndTime, TERMINAL_BOUNDARY_POLICY.maximumSuffixSamples],
    [exactOfficialDifference, 1],
    [exactFinishWindow, 1],
  ]) {
    const result = sanitizeTerminalBoundarySamples(samples, { trackLengthM: 1024, officialLapTimeMs: 40_000 })
    assert.equal(result.status, 'trimmed')
    assert.equal(result.trimmedSampleCount, expectedTrimmed)
  }
})

test('terminal sample sanitizer leaves monotonic evidence unchanged and exposes every near miss', () => {
  const monotonic = measuredBoundary([])
  assert.deepEqual(sanitizeTerminalBoundarySamples(monotonic, { trackLengthM: 1024, officialLapTimeMs: 40_000 }), { status: 'unchanged', samples: monotonic })

  const cases = [
    [sample(0, 0), sample(500, 20_000), sample(600, 40_000), sample(600, 20)],
    measuredBoundary([TERMINAL_BOUNDARY_POLICY.maximumResetElapsedMs + 1]),
    [sample(0, 0), sample(500, 20_000), sample(1012, 40_000 - 251), sample(1012, 20)],
    [
      sample(0, 0),
      sample(500, 20_000),
      sample(1024 - TERMINAL_BOUNDARY_POLICY.maximumDistanceFromFinishM - 0.001, 39_990),
      sample(1024 - TERMINAL_BOUNDARY_POLICY.maximumDistanceFromFinishM - 0.001, 20),
    ],
    measuredBoundary([20, 10]),
    measuredBoundary(Array.from(
      { length: TERMINAL_BOUNDARY_POLICY.maximumSuffixSamples + 1 },
      (_unused, index) => (index + 1) * TERMINAL_BOUNDARY_POLICY.maximumResetElapsedMs
        / (TERMINAL_BOUNDARY_POLICY.maximumSuffixSamples + 1),
    )),
  ]
  for (const samples of cases) {
    const result = sanitizeTerminalBoundarySamples(samples, { trackLengthM: 1024, officialLapTimeMs: 40_000 })
    assert.equal(result.status, 'invalid-reset')
    assert.equal(result.samples, samples)
    assert.equal(playbackSamples(samples, { trackLengthM: 1024, officialLapTimeMs: 40_000 }), samples)
  }
})
