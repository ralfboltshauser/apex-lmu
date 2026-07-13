const crypto = require('node:crypto')

const TRACK_MODEL_ALGORITHM = 'telemetry-centerline-v1'
const DEFAULT_BIN_M = 2

function finite(value) { return typeof value === 'number' && Number.isFinite(value) }
function median(values) {
  if (!values.length) return 0
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}
function mad(values, center = median(values)) { return median(values.map((value) => Math.abs(value - center))) }
function stableHash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex') }

function tangentAt(samples, index) {
  const before = samples[Math.max(0, index - 5)]
  const after = samples[Math.min(samples.length - 1, index + 5)]
  const dx = after.x - before.x
  const dz = after.z - before.z
  const length = Math.hypot(dx, dz)
  return length > 0.05 ? { x: dx / length, z: dz / length } : null
}

function observationsFor(laps, trackLengthM, binSizeM) {
  const bins = new Map()
  for (const lap of laps) {
    if (!lap?.lap?.trackModelEligible || !Array.isArray(lap.samples) || lap.samples.length < 2) continue
    const samples = lap.samples.filter((sample) => finite(sample.distanceIndexM) && finite(sample.x) && finite(sample.y) && finite(sample.z))
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index]
      if (sample.countLapFlag !== null && sample.countLapFlag !== 2) continue
      if (!finite(sample.pathLateralM)) continue
      if (finite(sample.trackEdgeM) && Math.abs(sample.trackEdgeM) > 0.1 && Math.abs(sample.pathLateralM) > Math.abs(sample.trackEdgeM) + 0.75) continue
      const tangent = tangentAt(samples, index)
      if (!tangent) continue
      const bin = Math.max(0, Math.min(Math.ceil(trackLengthM / binSizeM) - 1, Math.floor(sample.distanceIndexM / binSizeM)))
      const list = bins.get(bin) ?? []
      list.push({ distanceM: sample.distanceIndexM, x: sample.x, y: sample.y, z: sample.z, lateralM: sample.pathLateralM, normalX: -tangent.z, normalZ: tangent.x })
      bins.set(bin, list)
    }
  }
  return bins
}

function correctedPoint(observation, sign) {
  return { x: observation.x + sign * observation.normalX * observation.lateralM, y: observation.y, z: observation.z + sign * observation.normalZ * observation.lateralM }
}

function signScore(bins, sign) {
  const spreads = []
  for (const values of bins.values()) {
    if (values.length < 2) continue
    const corrected = values.map((value) => correctedPoint(value, sign))
    const centerX = median(corrected.map((value) => value.x))
    const centerZ = median(corrected.map((value) => value.z))
    spreads.push(median(corrected.map((value) => Math.hypot(value.x - centerX, value.z - centerZ))))
  }
  return spreads.length ? median(spreads) : 0
}

function buildTrackModel({ trackKey, trackLengthM, laps, binSizeM = DEFAULT_BIN_M }) {
  if (typeof trackKey !== 'string' || !trackKey || !finite(trackLengthM) || trackLengthM <= 0 || !Array.isArray(laps)) return null
  const bins = observationsFor(laps, trackLengthM, binSizeM)
  const totalBins = Math.max(1, Math.ceil(trackLengthM / binSizeM))
  const scoreNegative = signScore(bins, -1)
  const scorePositive = signScore(bins, 1)
  // rFactor's path-lateral value is measured to the right of the forward
  // path. `normal=(-tangent.z,tangent.x)` points left, so adding that normal
  // moves the observed car position back toward the AI path. Repeated laps
  // with different offsets can override the convention if a producer changes.
  const lateralSign = scorePositive <= scoreNegative ? 1 : -1
  const points = []
  for (const [bin, values] of [...bins.entries()].sort(([left], [right]) => left - right)) {
    const corrected = values.map((value) => correctedPoint(value, lateralSign))
    const x = median(corrected.map((value) => value.x))
    const y = median(corrected.map((value) => value.y))
    const z = median(corrected.map((value) => value.z))
    const residuals = corrected.map((value) => Math.hypot(value.x - x, value.z - z))
    const spreadM = mad(residuals)
    points.push({ distanceM: Math.min(trackLengthM, (bin + 0.5) * binSizeM), x, y, z, observations: values.length, spreadM, confidence: Math.max(0, Math.min(1, values.length / 3)) * Math.max(0, Math.min(1, 1 - spreadM / 8)) })
  }
  const coverage = points.length / totalBins
  const seamGapM = points.length > 1 ? Math.hypot(points[0].x - points.at(-1).x, points[0].z - points.at(-1).z) : Infinity
  let maximumJumpM = 0
  for (let index = 1; index < points.length; index += 1) maximumJumpM = Math.max(maximumJumpM, Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z))
  const published = coverage >= 0.97 && points.length > 10 && seamGapM <= 60 && maximumJumpM <= 80
  const sourceHashes = laps.filter((lap) => lap?.lap?.trackModelEligible && typeof lap.payloadHash === 'string').map((lap) => lap.payloadHash).sort()
  const sourceHash = stableHash(sourceHashes)
  const canonical = points.map((point) => [Math.round(point.distanceM * 1000), Math.round(point.x * 1000), Math.round(point.y * 1000), Math.round(point.z * 1000), point.observations, Math.round(point.spreadM * 1000)])
  return { schemaVersion: 1, algorithmVersion: TRACK_MODEL_ALGORITHM, trackKey, trackLengthM, binSizeM, coverage, published, lateralSign, seamGapM, maximumJumpM, sourceHash, geometryHash: stableHash(canonical), points }
}

module.exports = { buildTrackModel, TRACK_MODEL_ALGORITHM, DEFAULT_BIN_M }
