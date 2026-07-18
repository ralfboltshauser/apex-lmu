const {
  ALGORITHM_VERSION,
  EVIDENCE_EXCLUSION_CODES,
  EXPERIMENT_CODES,
  LIMITATION_CODES,
  OBSERVATION_CODES,
  REVIEW_CONSTANTS,
  STATUS_CODES,
  STRENGTH_CODES,
  VARIABILITY_CODES,
} = require('./driver-review.cjs')

const ANALYSIS_ID = /^[a-z0-9-]{1,96}$/i
const SHA256 = /^[a-f0-9]{64}$/
const SEGMENT_ID = /^segment-[0-9]{3}$/
const REVIEW_REASON_CODES = new Set([
  'request-malformed', 'cohort-limit-exceeded', 'evidence-accounting-malformed',
  'lap-payload-malformed', 'lap-session-mismatch', 'lap-identity-malformed',
  'lap-not-strict-eligible', 'lap-track-length-mismatch', 'lap-samples-unavailable',
  'lap-sample-nonfinite', 'lap-sample-out-of-range', 'lap-samples-decreasing',
  'lap-distance-evidence-insufficient', 'lap-time-span-invalid',
  'lap-circular-coverage-insufficient', 'duplicate-lap-id',
  'reference-not-fastest-strict', 'lap-derived-profile-invalid', 'reference-unavailable',
])
const FORBIDDEN_REVIEW_KEYS = new Set([
  'samples', 'x', 'y', 'z', 'payloadHash', 'trackModel', 'personalBest',
  'session', 'source', 'sourceRunId', 'importProvenance', 'recordingSha256',
  'recordingFormat', 'processingVersion', 'importedAt', 'appVersion', 'path', 'filePath',
])

function validAnalysisId(value) {
  return typeof value === 'string' && ANALYSIS_ID.test(value)
}

function validOutputLapId(value, allowedLapIds) {
  return validAnalysisId(value) && (allowedLapIds === null || allowedLapIds.has(value))
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const count = (value) => Number.isSafeInteger(value) && value >= 0
const positive = (value) => finite(value) && value > 0
const fraction = (value) => finite(value) && value >= 0 && value <= 1
const oneOf = (values, value) => values.includes(value)
const unique = (values) => new Set(values).size === values.length

function exactObject(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key))
}

function validEvidenceAccounting(value) {
  if (!exactObject(value, ['totalLapCount', 'strictEligibleTotal', 'sampledLapCount', 'strictExcludedTotal', 'notDecodedDueToLimit', 'exclusions'])
    || ![value.totalLapCount, value.strictEligibleTotal, value.sampledLapCount, value.strictExcludedTotal, value.notDecodedDueToLimit].every(count)
    || value.totalLapCount < value.strictEligibleTotal || value.strictEligibleTotal < value.sampledLapCount
    || value.strictExcludedTotal !== value.totalLapCount - value.strictEligibleTotal
    || value.notDecodedDueToLimit !== value.strictEligibleTotal - value.sampledLapCount
    || !exactObject(value.exclusions, [], EVIDENCE_EXCLUSION_CODES)) return false
  if (Object.values(value.exclusions).some((entry) => !count(entry))) return false
  return (value.exclusions['cohort-limit'] ?? 0) === value.notDecodedDueToLimit
}

function validReference(value, allowedLapIds) {
  return exactObject(value, ['lapId', 'lapNumber', 'lapTimeMs'])
    && validOutputLapId(value.lapId, allowedLapIds) && count(value.lapNumber) && positive(value.lapTimeMs)
}

function validSegment(value) {
  return exactObject(value, ['id', 'startDistanceM', 'endDistanceM', 'lossMs'])
    && SEGMENT_ID.test(value.id) && finite(value.startDistanceM) && value.startDistanceM >= 0
    && finite(value.endDistanceM) && value.endDistanceM > value.startDistanceM && finite(value.lossMs)
}

function validSelectedComparison(value, allowedLapIds) {
  return exactObject(value, ['lapId', 'lapNumber', 'lapTimeMs', 'deltaToReferenceMs', 'segmentLossTotalMs', 'segments'])
    && validOutputLapId(value.lapId, allowedLapIds) && count(value.lapNumber) && positive(value.lapTimeMs)
    && finite(value.deltaToReferenceMs) && finite(value.segmentLossTotalMs)
    && Array.isArray(value.segments) && value.segments.length > 0 && value.segments.length <= 512
    && value.segments.every(validSegment) && unique(value.segments.map((segment) => segment.id))
}

function validObservation(value) {
  return exactObject(value, ['code', 'medianDelta', 'unit', 'directionalAgreement', 'comparedLapCount'])
    && oneOf(OBSERVATION_CODES, value.code) && finite(value.medianDelta) && ['m', 'kph'].includes(value.unit)
    && fraction(value.directionalAgreement) && count(value.comparedLapCount)
}

function validHotspot(value, allowedLapIds) {
  return exactObject(value, [
    'id', 'startDistanceM', 'endDistanceM', 'representativeLapId', 'representativeLapNumber',
    'medianLossMs', 'minimumLossMs', 'maximumLossMs', 'madLossMs', 'directionalAgreement',
    'comparedLapCount', 'observations', 'experiments',
  ])
    && SEGMENT_ID.test(value.id) && finite(value.startDistanceM) && value.startDistanceM >= 0
    && finite(value.endDistanceM) && value.endDistanceM > value.startDistanceM
    && validOutputLapId(value.representativeLapId, allowedLapIds) && count(value.representativeLapNumber)
    && [value.medianLossMs, value.minimumLossMs, value.maximumLossMs, value.madLossMs].every(finite)
    && value.minimumLossMs <= value.medianLossMs && value.medianLossMs <= value.maximumLossMs && value.madLossMs >= 0
    && fraction(value.directionalAgreement) && count(value.comparedLapCount)
    && Array.isArray(value.observations) && value.observations.length > 0 && value.observations.length <= REVIEW_CONSTANTS.MAX_OBSERVATIONS_PER_HOTSPOT
    && value.observations.every(validObservation) && unique(value.observations.map((observation) => observation.code))
    && Array.isArray(value.experiments) && value.experiments.length <= REVIEW_CONSTANTS.MAX_EXPERIMENTS_PER_HOTSPOT
    && value.experiments.every((code) => oneOf(EXPERIMENT_CODES, code)) && unique(value.experiments)
}

function validStrength(value, allowedLapIds) {
  return exactObject(value, [
    'code', 'segmentId', 'startDistanceM', 'endDistanceM', 'representativeLapId', 'representativeLapNumber',
    'medianLossMs', 'minimumLossMs', 'maximumLossMs', 'madLossMs', 'comparedLapCount',
  ])
    && oneOf(STRENGTH_CODES, value.code) && SEGMENT_ID.test(value.segmentId)
    && finite(value.startDistanceM) && value.startDistanceM >= 0 && finite(value.endDistanceM) && value.endDistanceM > value.startDistanceM
    && validOutputLapId(value.representativeLapId, allowedLapIds) && count(value.representativeLapNumber)
    && [value.medianLossMs, value.minimumLossMs, value.maximumLossMs, value.madLossMs].every(finite)
    && value.minimumLossMs <= value.medianLossMs && value.medianLossMs <= value.maximumLossMs && value.madLossMs >= 0
    && count(value.comparedLapCount)
}

function validVariability(value) {
  return exactObject(value, ['code', 'medianLapTimeMs', 'madLapTimeMs', 'minimumLapTimeMs', 'maximumLapTimeMs', 'comparedLapCount'])
    && oneOf(VARIABILITY_CODES, value.code) && positive(value.medianLapTimeMs) && finite(value.madLapTimeMs) && value.madLapTimeMs >= 0
    && positive(value.minimumLapTimeMs) && positive(value.maximumLapTimeMs) && value.minimumLapTimeMs <= value.medianLapTimeMs
    && value.medianLapTimeMs <= value.maximumLapTimeMs && count(value.comparedLapCount)
}

function validDriverReviewOutput(value, allowedLapIds = null) {
  if (allowedLapIds !== null && !(allowedLapIds instanceof Set)) return false
  if (!exactObject(value, [
    'schemaVersion', 'algorithmVersion', 'inputFingerprint', 'status', 'cohort', 'reference',
    'selectedComparison', 'hotspots', 'strength', 'variability', 'limitations',
  ]) || value.schemaVersion !== 1 || value.algorithmVersion !== ALGORITHM_VERSION || !SHA256.test(value.inputFingerprint)) return false
  if (!exactObject(value.status, ['code'], ['reasonCode']) || !oneOf(STATUS_CODES, value.status.code)
    || (Object.hasOwn(value.status, 'reasonCode') && !REVIEW_REASON_CODES.has(value.status.reasonCode))
    || (value.status.code === 'invalid-input' && !Object.hasOwn(value.status, 'reasonCode'))) return false
  if (!exactObject(value.cohort, ['decodedLapCount', 'analyzedLapCount', 'nonReferenceLapCount', 'accounting'])
    || ![value.cohort.decodedLapCount, value.cohort.analyzedLapCount, value.cohort.nonReferenceLapCount].every(count)
    || value.cohort.analyzedLapCount !== value.cohort.decodedLapCount
    || value.cohort.nonReferenceLapCount !== Math.max(0, value.cohort.analyzedLapCount - 1)
    || !validEvidenceAccounting(value.cohort.accounting)
    || value.cohort.accounting.sampledLapCount !== value.cohort.decodedLapCount) return false
  if (value.reference !== null && !validReference(value.reference, allowedLapIds)) return false
  if (value.selectedComparison !== null && !validSelectedComparison(value.selectedComparison, allowedLapIds)) return false
  if (!Array.isArray(value.hotspots) || value.hotspots.length > REVIEW_CONSTANTS.MAX_HOTSPOTS
    || !value.hotspots.every((hotspot) => validHotspot(hotspot, allowedLapIds)) || !unique(value.hotspots.map((hotspot) => hotspot.id))) return false
  if (value.strength !== null && !validStrength(value.strength, allowedLapIds)) return false
  if (value.variability !== null && !validVariability(value.variability)) return false
  return Array.isArray(value.limitations) && value.limitations.every((code) => oneOf(LIMITATION_CODES, code)) && unique(value.limitations)
}

function assertReviewPrivacy(value, input, depth = 0) {
  if (depth > 12) throw new Error('driver review output exceeds its bounded structure')
  if (Array.isArray(value)) {
    for (const entry of value) assertReviewPrivacy(entry, input, depth + 1)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_REVIEW_KEYS.has(key)) throw new Error('driver review output crossed the private evidence boundary')
    assertReviewPrivacy(entry, input, depth + 1)
  }
  const serialized = depth === 0 ? JSON.stringify(value) : null
  if (serialized) {
    for (const payload of input?.laps ?? []) {
      if (typeof payload?.payloadHash === 'string' && payload.payloadHash.length > 0 && serialized.includes(payload.payloadHash)) {
        throw new Error('driver review output exposed a private payload hash')
      }
    }
  }
}

/**
 * Resolve one authoritative evidence source, then expose only the deterministic
 * review built from it. Raw lap payloads never cross this service boundary.
 */
async function getDriverReview({ telemetryDatabase, liveSessionStore, buildDriverReview, sessionId, selectedLapId = null }) {
  if (!validAnalysisId(sessionId) || (selectedLapId !== null && selectedLapId !== undefined && !validAnalysisId(selectedLapId))) return null
  await telemetryDatabase?.flush()

  const durable = telemetryDatabase?.getDriverReviewEvidence(sessionId, selectedLapId) ?? null
  // A durable session is authoritative after the pending write queue flushes.
  // In particular, do not use a live payload to bypass a rejected cross-session
  // lap selection or a durable integrity decision.
  const resolved = durable ?? liveSessionStore?.getDriverReviewEvidence(sessionId, selectedLapId) ?? null
  if (resolved?.status !== 'ready') return null
  const review = buildDriverReview(resolved.input)
  if (!review || typeof review !== 'object') return null
  assertReviewPrivacy(review, resolved.input)
  const allowedLapIds = new Set((resolved.input.laps ?? []).map((payload) => payload?.lap?.id).filter(validAnalysisId))
  if (!validDriverReviewOutput(review, allowedLapIds)) throw new Error('driver review output failed its exact public schema')
  return review
}

module.exports = { getDriverReview, validAnalysisId, validDriverReviewOutput }
