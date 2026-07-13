const assert = require('node:assert/strict')
const test = require('node:test')
const { buildTrackModel } = require('./track-model.cjs')

function circleLap({ radius = 100, lateral = 0, offtrackAt = -1, id = 'lap' } = {}) {
  const length = 2 * Math.PI * radius
  const samples = []
  for (let distance = 0; distance < length; distance += 1) {
    const angle = distance / radius
    const applied = Math.abs(distance - offtrackAt) < 2 ? 30 : lateral
    const drivenRadius = radius + applied
    samples.push({ distanceIndexM: distance, x: Math.cos(angle) * drivenRadius, y: 0, z: Math.sin(angle) * drivenRadius, pathLateralM: applied, trackEdgeM: applied === 30 ? 5 : 8, countLapFlag: 2 })
  }
  return { payloadHash: id, lap: { trackModelEligible: true }, samples }
}

test('a perfect repeated line produces a deterministic published center path', () => {
  const length = 2 * Math.PI * 100
  const first = buildTrackModel({ trackKey: 'test', trackLengthM: length, laps: [circleLap({ lateral: 4, id: 'a' }), circleLap({ lateral: 4, id: 'b' })] })
  const second = buildTrackModel({ trackKey: 'test', trackLengthM: length, laps: [circleLap({ lateral: 4, id: 'b' }), circleLap({ lateral: 4, id: 'a' })] })
  assert.equal(first.published, true)
  assert.equal(first.geometryHash, second.geometryHash)
  const radii = first.points.map((point) => Math.hypot(point.x, point.z))
  assert.ok(Math.abs(radii.reduce((sum, value) => sum + value, 0) / radii.length - 100) < 0.2)
})

test('off-track observations and ineligible laps cannot move the learned route', () => {
  const length = 2 * Math.PI * 100
  const clean = circleLap({ id: 'clean' })
  const withOfftrack = circleLap({ offtrackAt: 200, id: 'offtrack' })
  const ineligible = circleLap({ lateral: 40, id: 'bad' }); ineligible.lap.trackModelEligible = false
  const baseline = buildTrackModel({ trackKey: 'test', trackLengthM: length, laps: [clean] })
  const model = buildTrackModel({ trackKey: 'test', trackLengthM: length, laps: [clean, withOfftrack, ineligible] })
  const near = (candidate) => candidate.points.reduce((best, point) => Math.abs(point.distanceM - 200) < Math.abs(best.distanceM - 200) ? point : best)
  assert.ok(Math.hypot(near(model).x - near(baseline).x, near(model).z - near(baseline).z) < 0.2)
})

test('one eligible lap remains a draft instead of publishing an uncorroborated route', () => {
  const length = 2 * Math.PI * 100
  const model = buildTrackModel({ trackKey: 'test', trackLengthM: length, laps: [circleLap({ id: 'only' })] })
  assert.equal(model.coverage > 0.97, true)
  assert.equal(model.published, false)
})

test('one unsafe sample rejects that lap\'s entire distance bin', () => {
  const length = 2 * Math.PI * 100
  const clean = circleLap({ id: 'clean' })
  const unsafe = circleLap({ id: 'unsafe' })
  for (const sample of unsafe.samples) {
    if (sample.distanceIndexM < 200 || sample.distanceIndexM >= 202) continue
    const scale = (Math.hypot(sample.x, sample.z) + 15) / Math.hypot(sample.x, sample.z)
    sample.x *= scale
    sample.z *= scale
    sample.pathLateralM = 0
    sample.trackEdgeM = 100
  }
  unsafe.samples.find((sample) => sample.distanceIndexM === 200).x = Number.NaN

  const baseline = buildTrackModel({ trackKey: 'test', trackLengthM: length, laps: [clean] })
  const model = buildTrackModel({ trackKey: 'test', trackLengthM: length, laps: [clean, unsafe] })
  const near = (candidate) => candidate.points.reduce((best, point) => Math.abs(point.distanceM - 201) < Math.abs(best.distanceM - 201) ? point : best)
  assert.ok(Math.hypot(near(model).x - near(baseline).x, near(model).z - near(baseline).z) < 0.2)
})
