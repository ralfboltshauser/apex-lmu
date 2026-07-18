const crypto = require('node:crypto')
const { playbackSamples } = require('./lap-sample-sanitizer.cjs')

const SCHEMA_VERSION = 1
const QUALITY_POLICY_VERSION = 'lap-quality-v2'
const COVERAGE_BIN_M = 16
const CLEAN_COVERAGE = 0.97
const LIMITED_COVERAGE = 0.8
const MAX_CLEAN_GAP_M = COVERAGE_BIN_M * 2
const MAX_FINAL_SAMPLES = 4096
const MAX_CURRENT_SAMPLES = 16384
const ESTIMATED_SAMPLE_BYTES = 512
const DEFAULT_MEMORY_BUDGET = 64 * 1024 * 1024
const OFFICIAL_LAP_TIME_GRACE_SECONDS = 1
const OFFICIAL_LAP_TIME_GRACE_FRAMES = 100
const REPLAY_IDENTITY_VERSION = 'recording-replay-identity-v1'
const DRIVER_REVIEW_MAX_EVIDENCE_LAPS = 16

function finite(value) { return typeof value === 'number' && Number.isFinite(value) }
function normalize(value) { return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ') }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)) }
function stableId(prefix, value) { return `${prefix}-${crypto.createHash('sha256').update(value).digest('hex').slice(0, 24)}` }
function sessionTrackKey(message) {
  const session = message.session || {}
  return `${normalize(session.track)}|${normalize(session.layout)}|${Math.round(Number(session.trackLengthM) || 0)}`
}
function sessionElapsed(message) {
  return finite(message.player?.gameElapsedSeconds) ? message.player.gameElapsedSeconds : message.session?.elapsedSeconds
}
function lapStart(message) { return finite(message.player?.lapStartSeconds) ? message.player.lapStartSeconds : null }
function currentLapNumber(message) { return Number.isSafeInteger(message.player?.lap) ? Math.max(1, message.player.lap) : 1 }
function sourceKind(message) { return message.source === 'recording-replay' ? 'recording-replay' : 'live' }
function sourceRunId(message) { return typeof message.runId === 'string' ? message.runId : '' }
function safeLength(message) { return Math.max(1, finite(message.session?.trackLengthM) ? message.session.trackLengthM : 1) }
function officialLapSeconds(message) { return finite(message.player?.lastLapSeconds) ? message.player.lastLapSeconds : null }
function officialPublicationExpected(lap) {
  const flags = lap.samples.map((sample) => sample.countLapFlag).filter((value) => value !== null)
  return flags.length === 0 || flags.some((value) => value === 2)
}

function compactSamples(samples, maximum = MAX_FINAL_SAMPLES) {
  if (samples.length <= maximum) return samples.map((sample) => ({ ...sample }))
  const keep = new Set([0, samples.length - 1])
  let minimumSpeed = 0
  let maximumSpeed = 0
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].speedKph < samples[minimumSpeed].speedKph) minimumSpeed = index
    if (samples[index].speedKph > samples[maximumSpeed].speedKph) maximumSpeed = index
    const previous = samples[index - 1]
    const current = samples[index]
    for (const threshold of [0.05, 0.12]) {
      if ((previous.brake < threshold && current.brake >= threshold) || (previous.brake >= threshold && current.brake < threshold)) {
        keep.add(index - 1); keep.add(index)
      }
    }
    for (const threshold of [0.05, 0.95]) {
      if ((previous.throttle < threshold && current.throttle >= threshold) || (previous.throttle >= threshold && current.throttle < threshold)) {
        keep.add(index - 1); keep.add(index)
      }
    }
  }
  keep.add(minimumSpeed); keep.add(maximumSpeed)
  const required = [...keep].sort((left, right) => left - right)
  if (required.length >= maximum) {
    return Array.from({ length: maximum }, (_, outputIndex) => {
      const requiredIndex = Math.round(outputIndex * (required.length - 1) / (maximum - 1))
      return { ...samples[required[requiredIndex]] }
    })
  }
  const remaining = maximum - required.length
  for (let outputIndex = 1; outputIndex <= remaining; outputIndex += 1) {
    keep.add(Math.round(outputIndex * (samples.length - 1) / (remaining + 1)))
  }
  return [...keep].sort((left, right) => left - right).slice(0, maximum).map((index) => ({ ...samples[index] }))
}

function lapCoverage(lap, trackLengthM) {
  if (!lap.samples?.length) return { coverage: 0, maximumGapM: trackLengthM }
  const distances = lap.samples.map((sample) => sample.distanceM).filter(finite).map((distanceM) => clamp(distanceM, 0, trackLengthM))
  if (!distances.length) return { coverage: 0, maximumGapM: trackLengthM }
  const bins = new Set(distances.map((distanceM) => clamp(Math.floor(distanceM / COVERAGE_BIN_M), 0, Math.ceil(trackLengthM / COVERAGE_BIN_M) - 1)))
  const totalBins = Math.max(1, Math.ceil(trackLengthM / COVERAGE_BIN_M))
  const ordered = distances.sort((left, right) => left - right)
  // A lap is circular: the unsampled seam is the distance from the final
  // sample to the first sample through start/finish, not the larger of those
  // two partial distances. Treating them separately hid real seam gaps.
  let maximumGapM = Math.max(0, ordered[0] + trackLengthM - ordered.at(-1))
  for (let index = 1; index < ordered.length; index += 1) maximumGapM = Math.max(maximumGapM, ordered[index] - ordered[index - 1])
  return { coverage: Math.min(1, bins.size / totalBins), maximumGapM }
}

function classifyLap(lap, trackLengthM) {
  const { coverage, maximumGapM } = lapCoverage(lap, trackLengthM)
  const reasons = new Set(lap.reasons)
  if (lap.state !== 'complete') reasons.add('incomplete')
  const routeIncomplete = coverage < CLEAN_COVERAGE || maximumGapM > MAX_CLEAN_GAP_M
  if (routeIncomplete) reasons.add('coverage-low')
  const disqualifying = ['pit', 'ai-control', 'remote-control', 'replay-control', 'time-reset', 'lap-counter-jump']
  const quality = lap.state === 'complete' && !routeIncomplete && !disqualifying.some((reason) => reasons.has(reason))
    ? 'clean'
    : lap.samples?.length > 1 && coverage >= LIMITED_COVERAGE && !['pit', 'ai-control', 'remote-control', 'replay-control'].some((reason) => reasons.has(reason))
      ? 'limited'
      : 'ineligible'
  return { quality, reasons: [...reasons].sort(), coverage, maximumGapM }
}

const DRIVER_REVIEW_EXCLUSION_KEYS = [
  'not-complete',
  'not-official',
  'not-clean',
  'not-reference-eligible',
  'not-replayable',
  'payload-unavailable',
  'payload-evicted',
  'cohort-limit',
]

/** Return every directly observed reason for withholding a lap. */
function driverReviewLapExclusions(lap, payloadUnavailableReason) {
  const reasons = []
  if (lap?.state !== 'complete') reasons.push('not-complete')
  if (lap?.timingSource !== 'official' || !finite(lap?.lapTimeMs) || lap.lapTimeMs <= 0) reasons.push('not-official')
  if (lap?.quality !== 'clean') reasons.push('not-clean')
  if (lap?.referenceEligible !== true) reasons.push('not-reference-eligible')
  if (lap?.replayable !== true) reasons.push('not-replayable')
  if (lap?.samplesAvailable !== true) reasons.push(lap?.driverReviewPayloadState === 'evicted' ? 'payload-evicted' : payloadUnavailableReason)
  return reasons
}

function compareDriverReviewIds(left, right) {
  const a = String(left)
  const b = String(right)
  return a < b ? -1 : a > b ? 1 : 0
}

function chronologicalDriverReviewLaps(laps) {
  return laps.map((lap, index) => ({ lap, index })).sort((left, right) => (
    Number(left.lap.number) - Number(right.lap.number)
    || compareDriverReviewIds(left.lap.id, right.lap.id)
    || left.index - right.index
  )).map(({ lap }) => lap)
}

function deterministicChronologicalSample(laps, maximum) {
  if (maximum <= 0 || laps.length === 0) return []
  if (laps.length <= maximum) return [...laps]
  if (maximum === 1) return [laps[Math.floor((laps.length - 1) / 2)]]
  const selected = []
  for (let index = 0; index < maximum; index += 1) {
    selected.push(laps[Math.round(index * (laps.length - 1) / (maximum - 1))])
  }
  return selected
}

/**
 * Select a bounded, representative same-session cohort. The fastest eligible
 * reference and an explicitly selected eligible lap are pinned; remaining
 * slots are sampled evenly across chronological lap order.
 */
function selectDriverReviewEvidence(laps, selectedLapId = null, maximum = DRIVER_REVIEW_MAX_EVIDENCE_LAPS, payloadUnavailableReason = 'payload-unavailable') {
  const safeLaps = Array.isArray(laps) ? laps : []
  const limit = Math.max(1, Math.min(DRIVER_REVIEW_MAX_EVIDENCE_LAPS, Number.isSafeInteger(maximum) ? maximum : DRIVER_REVIEW_MAX_EVIDENCE_LAPS))
  const exclusions = Object.fromEntries(DRIVER_REVIEW_EXCLUSION_KEYS.map((key) => [key, 0]))
  const eligible = []
  for (const lap of safeLaps) {
    const reasons = driverReviewLapExclusions(lap, payloadUnavailableReason === 'payload-evicted' ? 'payload-evicted' : 'payload-unavailable')
    for (const reason of reasons) exclusions[reason] += 1
    if (reasons.length > 0) continue
    eligible.push(lap)
  }
  const chronological = chronologicalDriverReviewLaps(eligible)
  const reference = [...eligible].sort((left, right) => (
    left.lapTimeMs - right.lapTimeMs
    || Number(left.number) - Number(right.number)
    || compareDriverReviewIds(left.id, right.id)
  ))[0] ?? null
  const selected = selectedLapId ? eligible.find((lap) => lap.id === selectedLapId) ?? null : null
  const pinnedIds = new Set([reference?.id, selected?.id].filter(Boolean))
  const pinned = chronological.filter((lap) => pinnedIds.has(lap.id))
  const unpinned = chronological.filter((lap) => !pinnedIds.has(lap.id))
  const sampled = chronologicalDriverReviewLaps([
    ...pinned,
    ...deterministicChronologicalSample(unpinned, Math.max(0, limit - pinned.length)),
  ])
  exclusions['cohort-limit'] = Math.max(0, eligible.length - sampled.length)
  return {
    laps: sampled,
    referenceLapId: reference?.id ?? null,
    selectedLapEligible: selectedLapId ? Boolean(selected) : null,
    accounting: {
      totalLapCount: safeLaps.length,
      strictEligibleTotal: eligible.length,
      sampledLapCount: sampled.length,
      strictExcludedTotal: safeLaps.length - eligible.length,
      notDecodedDueToLimit: Math.max(0, eligible.length - sampled.length),
      exclusions,
    },
  }
}

class LiveSessionStore {
  constructor({ logger = null, makeId = crypto.randomUUID, memoryBudgetBytes = DEFAULT_MEMORY_BUDGET, now = () => new Date(), onLapFinalized = null, onSessionFinalized = null } = {}) {
    this.logger = logger
    this.makeId = makeId
    this.memoryBudgetBytes = memoryBudgetBytes
    this.currentLapSampleLimit = Math.max(1, Math.min(MAX_CURRENT_SAMPLES, Math.floor(memoryBudgetBytes / ESTIMATED_SAMPLE_BYTES)))
    this.now = now
    this.onLapFinalized = onLapFinalized
    this.onSessionFinalized = onSessionFinalized
    this.sessions = []
    this.active = null
    this.revision = 0
    this.health = { telemetryFrames: 0, statuses: 0, sessions: 0, completedLaps: 0, incompleteLaps: 0, evictedLapPayloads: 0, sampleOverflowLaps: 0 }
  }

  ingest(message) {
    if (!message || typeof message !== 'object') return { changed: false, notify: false, revision: this.revision }
    if (message.type === 'status') return this.ingestStatus(message)
    if (message.type !== 'telemetry' || message.source === 'self-test') return { changed: false, notify: false, revision: this.revision }
    if (!message.session || !message.player || !message.session.track) return { changed: false, notify: false, revision: this.revision }
    this.health.telemetryFrames += 1

    const boundary = this.sessionBoundary(message)
    if (boundary) this.archiveActive(boundary)
    if (!this.active) this.startSession(message)
    else if (this.active.state === 'interrupted') {
      this.active.state = 'active'
      this.record('info', 'analysis-source-resumed', 'Live analysis source resumed.', { sessionId: this.active.id, sourceSegments: this.active.sourceSegments.length })
    }
    this.updateSessionSource(message)

    let officialPublication = this.observeOfficialPublication(message)
    officialPublication = this.consumeQuarantinedPublication(officialPublication, message)
    officialPublication = this.reconcilePendingLap(message, officialPublication)
    if (message.playerTelemetryAvailable !== false) this.ingestVehicleFrame(message, officialPublication)
    else this.discardUnownedPublication(officialPublication)
    this.active.lastFrame = this.frameIdentity(message)
    this.active.updatedAt = message.capturedAt || this.now().toISOString()
    this.revision += 1
    this.active.revision = this.revision
    const lap = this.active.currentLap
    const notify = Boolean(lap?.justStarted || boundary || message.sequence % 25 === 0)
    if (lap) lap.justStarted = false
    return { changed: true, notify, kind: boundary ? 'session' : 'sample', revision: this.revision, sessionId: this.active.id, lapId: lap?.id ?? null, startedAt: this.active.startedAt }
  }

  ingestStatus(message) {
    this.health.statuses += 1
    if (!this.active || message.source === 'self-test') return { changed: false, notify: false, revision: this.revision }
    const interrupted = ['waiting', 'waiting-for-vehicle', 'mapping-open', 'stale-data', 'disconnected', 'stopped', 'missing', 'error'].includes(message.state)
    const finished = message.state === 'replay-complete'
    if (!interrupted && !finished) return { changed: false, notify: false, revision: this.revision }
    if (finished) {
      this.archiveActive('source-complete')
    } else if (this.active.state !== 'interrupted') {
      this.active.state = 'interrupted'
      this.active.interruptionCount += 1
      if (this.active.currentLap) this.active.currentLap.reasons.add('source-interrupted')
      this.record('info', 'analysis-source-interrupted', 'Live analysis source was interrupted without clearing session data.', { sessionId: this.active.id, state: message.state })
    }
    this.revision += 1
    if (this.active) this.active.revision = this.revision
    return { changed: true, notify: true, kind: 'status', revision: this.revision, sessionId: this.active?.id ?? null, lapId: this.active?.currentLap?.id ?? null, startedAt: this.active?.startedAt ?? null }
  }

  sessionBoundary(message) {
    if (!this.active) return null
    const previous = this.active.lastFrame
    if (!previous) return null
    if (sourceKind(message) !== this.active.source) return 'source-kind-changed'
    if (sessionTrackKey(message) !== this.active.trackKey) return 'track-changed'
    const nextCarName = normalize(message.player?.name)
    const nextCarClass = normalize(message.player?.class)
    if ((normalize(this.active.car.name) && nextCarName && nextCarName !== normalize(this.active.car.name))
      || (normalize(this.active.car.class) && nextCarClass && nextCarClass !== normalize(this.active.car.class))) return 'car-changed'
    const elapsed = sessionElapsed(message)
    if (finite(elapsed) && finite(previous.elapsed) && elapsed < previous.elapsed - 1) return 'session-time-reset'
    const lap = currentLapNumber(message)
    if (lap < previous.lap && finite(elapsed) && elapsed <= previous.elapsed + 1) return 'lap-counter-reset'
    return null
  }

  startSession(message) {
    const createdAt = message.capturedAt || this.now().toISOString()
    const generation = this.sessions.length + 1
    const source = sourceKind(message)
    const runId = sourceRunId(message)
    const replayGeneration = source === 'recording-replay'
      ? this.sessions.filter((session) => session.source === source && session.sourceRunId === runId).length + 1
      : null
    const id = source === 'recording-replay'
      ? stableId('analysis-session', JSON.stringify([REPLAY_IDENTITY_VERSION, runId, replayGeneration, message.sequence ?? null, sessionTrackKey(message)]))
      : stableId('analysis-session', `${this.makeId()}|${generation}|${source}|${sessionTrackKey(message)}`)
    this.active = {
      id, revision: this.revision, source, sourceRunId: runId, state: 'active', startedAt: createdAt, updatedAt: createdAt, endedAt: null,
      trackKey: sessionTrackKey(message), track: { name: message.session.track, layout: message.session.layout || '', lengthM: safeLength(message) },
      car: { id: Number.isSafeInteger(message.player.id) ? message.player.id : 0, name: message.player.name || '', class: message.player.class || '' },
      sourceSegments: [], interruptionCount: 0, laps: [], currentLap: null, pendingLap: null, lastFrame: null, lastVehicleFrame: null, lapGeneration: 0,
      officialTiming: {
        observedSeconds: officialLapSeconds(message),
        resetObserved: finite(officialLapSeconds(message)) && officialLapSeconds(message) <= 0,
        publicationSerial: 0,
        quarantinedOwners: [],
      },
    }
    this.sessions.push(this.active)
    this.health.sessions += 1
    this.record('info', 'analysis-session-started', 'In-memory analysis session started.', { sessionId: id, source: this.active.source })
  }

  updateSessionSource(message) {
    if (!this.active.car.name && message.player?.name) this.active.car.name = message.player.name
    if (!this.active.car.class && message.player?.class) this.active.car.class = message.player.class
    const runId = typeof message.runId === 'string' ? message.runId : ''
    const segment = this.active.sourceSegments.at(-1)
    if (!segment || segment.runId !== runId) this.active.sourceSegments.push({ runId, firstSequence: message.sequence, lastSequence: message.sequence })
    else segment.lastSequence = message.sequence
  }

  observeOfficialPublication(message) {
    const timing = this.active?.officialTiming
    const seconds = officialLapSeconds(message)
    if (!timing || !finite(seconds)) return null
    if (seconds <= 0) {
      timing.observedSeconds = seconds
      timing.resetObserved = true
      return null
    }
    const changed = !finite(timing.observedSeconds) || timing.observedSeconds <= 0 || Math.abs(seconds - timing.observedSeconds) > 0.000001
    const published = timing.resetObserved || changed
    timing.observedSeconds = seconds
    timing.resetObserved = false
    if (!published) return null
    timing.publicationSerial += 1
    return { id: timing.publicationSerial, lapTimeMs: seconds * 1000 }
  }

  consumeQuarantinedPublication(publication, message) {
    const timing = this.active?.officialTiming
    if (!publication || !timing?.quarantinedOwners.length) return publication
    const scoringLap = currentLapNumber(message)
    timing.quarantinedOwners = timing.quarantinedOwners.filter((owner) => owner.throughLapNumber >= scoringLap)
    if (!timing.quarantinedOwners.length) return publication
    const owner = timing.quarantinedOwners.shift()
    this.record('info', 'analysis-lap-score-quarantined', 'A late LMU scoring publication was withheld from the active lap.', { sessionId: this.active.id, lapNumber: owner.lapNumber })
    return null
  }

  expireQuarantinedOwners(completedLapNumber) {
    const timing = this.active?.officialTiming
    if (!timing) return
    timing.quarantinedOwners = timing.quarantinedOwners.filter((owner) => owner.throughLapNumber > completedLapNumber)
  }

  assignOfficialPublication(lap, publication) {
    if (!lap || !publication) return
    lap.officialPublication = publication
  }

  discardUnownedPublication(publication) {
    if (!publication) return
    this.record('info', 'analysis-lap-score-unowned', 'An LMU scoring publication had no completed-lap owner and was withheld.', { sessionId: this.active.id })
  }

  ingestVehicleFrame(message, officialPublication) {
    const identity = this.frameIdentity(message)
    const previous = this.active.lastVehicleFrame
    const boundary = previous && this.lapBoundary(previous, identity, this.active.track.lengthM)
    if (!this.active.currentLap) {
      this.startLap(message, identity)
      this.discardUnownedPublication(officialPublication)
    }
    else if (boundary) {
      if (boundary === 'lap-counter-jump') this.active.currentLap.reasons.add(boundary)
      // Distance is the physical lap boundary. LMU can publish that wrap one
      // snapshot before its scoring lap counter advances, so derive the new
      // analysis-lap number from both signals and never start a second lap
      // with the number that just completed.
      const nextLapNumber = Math.max(identity.lap, this.active.currentLap.number + 1)
      this.completeCurrentAtBoundary(message, officialPublication)
      this.startLap(message, identity, nextLapNumber)
    } else if (officialPublication) {
      if (identity.lap > this.active.currentLap.number) this.assignOfficialPublication(this.active.currentLap, officialPublication)
      else this.discardUnownedPublication(officialPublication)
    }
    this.active.lastVehicleFrame = identity
    const lap = this.active.currentLap
    if (!lap) return
    if (identity.lap > lap.number + 1) lap.reasons.add('lap-counter-jump')
    if (previous && previous.runId === identity.runId && Number.isSafeInteger(identity.sequence) && Number.isSafeInteger(previous.sequence) && identity.sequence !== previous.sequence + 1) lap.reasons.add('sequence-gap')
    this.trackControlState(lap, message)
    const sample = this.sampleFromMessage(message)
    if (!sample) { lap.reasons.add('missing-sample'); return }
    const last = lap.samples.at(-1)
    if (last) {
      const delta = sample.elapsedSeconds - last.elapsedSeconds
      if (Math.abs(delta) < 1e-9) return
      if (delta < 0) { lap.reasons.add('time-reset'); return }
      if (delta > 1) lap.reasons.add('telemetry-gap')
      const movement = Math.hypot(sample.x - last.x, sample.z - last.z)
      const plausible = Math.max(20, (sample.speedKph / 3.6) * delta * 3 + 5)
      if (movement > plausible && !boundary) { lap.reasons.add('position-discontinuity'); return }
    }
    sample.distanceIndexM = last ? Math.max(last.distanceIndexM, sample.rawDistanceM) : Math.max(0, sample.rawDistanceM)
    if (lap.samples.length < this.currentLapSampleLimit) {
      lap.samples.push(sample)
    } else {
      // Keep the first bounded route evidence and the newest accepted sample.
      // Replacing one slot is O(1); shifting a long array on every frame is not.
      lap.samples[this.currentLapSampleLimit - 1] = sample
      if (!lap.reasons.has('sample-overflow')) this.health.sampleOverflowLaps += 1
      lap.reasons.add('sample-overflow')
    }
    lap.lastSequence = message.sequence
  }

  startLap(message, identity, number = identity.lap) {
    this.active.lapGeneration += 1
    const id = this.active.source === 'recording-replay'
      ? stableId('analysis-lap', JSON.stringify([REPLAY_IDENTITY_VERSION, this.active.id, this.active.lapGeneration, number, identity.sequence ?? null, identity.lapStart ?? identity.elapsed ?? null]))
      : stableId('analysis-lap', `${this.active.id}|${number}|${identity.lapStart ?? identity.elapsed}|${this.makeId()}`)
    this.active.currentLap = { id, number, state: 'current', startedAt: message.capturedAt || this.now().toISOString(), endedAt: null, samples: [], reasons: new Set(), lastSequence: null, ownerCandidate: null, ownerCount: 0, pitCount: 0, justStarted: true, officialPublication: null }
  }

  trackControlState(lap, message) {
    const owner = message.player?.controlOwner || 'unknown'
    if (lap.ownerCandidate === owner) lap.ownerCount += 1
    else { lap.ownerCandidate = owner; lap.ownerCount = 1 }
    if (lap.ownerCount >= 2) {
      if (owner === 'ai') lap.reasons.add('ai-control')
      else if (owner === 'remote') lap.reasons.add('remote-control')
      else if (owner === 'replay') lap.reasons.add('replay-control')
      else if (owner !== 'local-player') lap.reasons.add('unknown-control')
    }
    if (message.player?.inPits || Number(message.player?.pitState) > 0) lap.pitCount += 1
    else lap.pitCount = 0
    if (lap.pitCount >= 2) lap.reasons.add('pit')
  }

  sampleFromMessage(message) {
    const position = message.player?.worldPositionM
    const distanceM = message.player?.lapDistanceM
    const elapsed = sessionElapsed(message)
    if (!position || !finite(position.x) || !finite(position.z) || !finite(distanceM) || distanceM < 0 || distanceM > this.active.track.lengthM * 1.05 || !finite(elapsed)) return null
    return {
      distanceM, rawDistanceM: distanceM, distanceIndexM: distanceM, x: position.x, y: finite(position.y) ? position.y : 0, z: position.z,
      brake: clamp(finite(message.player.brake) ? message.player.brake : 0, 0, 1),
      throttle: clamp(finite(message.player.throttle) ? message.player.throttle : 0, 0, 1),
      steering: clamp(finite(message.player.steering) ? message.player.steering : 0, -1, 1),
      clutch: clamp(finite(message.player.clutch) ? message.player.clutch : 0, 0, 1),
      gear: Number.isSafeInteger(message.player.gear) ? message.player.gear : 0,
      rpm: Math.max(0, finite(message.player.rpm) ? message.player.rpm : 0),
      pathLateralM: finite(message.player.pathLateralM) ? message.player.pathLateralM : null,
      trackEdgeM: finite(message.player.trackEdgeM) ? message.player.trackEdgeM : null,
      countLapFlag: Number.isSafeInteger(message.player.countLapFlag) && message.player.countLapFlag >= 0 && message.player.countLapFlag <= 2 ? message.player.countLapFlag : null,
      speedKph: Math.max(0, finite(message.player.speedKph) ? message.player.speedKph : 0),
      elapsedSeconds: elapsed,
      lapElapsedSeconds: Math.max(0, elapsed - (lapStart(message) ?? elapsed)),
    }
  }

  frameIdentity(message) {
    const rawDistanceM = finite(message.player?.lapDistanceRawM) ? message.player.lapDistanceRawM : message.player?.lapDistanceM
    return { runId: message.runId || '', sequence: message.sequence, elapsed: sessionElapsed(message), lapStart: lapStart(message), lap: currentLapNumber(message), distanceM: finite(rawDistanceM) ? rawDistanceM : null }
  }

  lapBoundary(previous, current, trackLengthM) {
    const measuredDistance = finite(current.distanceM) && finite(previous.distanceM)
    if (measuredDistance) {
      if (previous.distanceM > trackLengthM * 0.6 && current.distanceM < trackLengthM * 0.4) return 'distance-wrap'
      const plausibleSkippedWrap = current.distanceM < trackLengthM * 0.4 && previous.distanceM > current.distanceM
      if (plausibleSkippedWrap && current.lap > previous.lap) return current.lap === previous.lap + 1 ? 'lap-number' : 'lap-counter-jump'
      if (plausibleSkippedWrap && current.lapStart !== null && previous.lapStart !== null && current.lapStart > previous.lapStart + 0.5) return 'lap-start-time'
      return null
    }
    if (current.lap > previous.lap) return current.lap === previous.lap + 1 ? 'lap-number' : 'lap-counter-jump'
    if (current.lapStart !== null && previous.lapStart !== null && current.lapStart > previous.lapStart + 0.5) return 'lap-start-time'
    return null
  }

  completeCurrentAtBoundary(message, boundaryPublication) {
    const lap = this.active?.currentLap
    if (!lap) return
    if (this.active.pendingLap) this.resolvePendingLap(null, 'next-lap-boundary', { quarantineMissing: true })
    // A missing publication can only remain plausibly owned by the timed-out
    // lap while the immediately following lap is active. Expiring that claim
    // at this boundary prevents one genuinely untimed lap from shifting every
    // later official publication by one lap forever.
    this.expireQuarantinedOwners(lap.number)
    const publication = boundaryPublication || lap.officialPublication
    if (publication) {
      this.finalizeLap(lap, 'complete', publication.lapTimeMs)
      return
    }
    // A scoring flag can announce that a time should count, but only the
    // published last-lap value supplies that time. Give every completed lap
    // the same bounded publication grace instead of converting an all-2 flag
    // sequence into a synthetic duration.
    lap.state = 'complete'
    lap.endedAt = message.capturedAt || this.active.updatedAt
    lap.scoringPending = true
    this.active.laps.push(lap)
    this.active.currentLap = null
    this.active.pendingLap = {
      lap,
      expectsOfficialPublication: officialPublicationExpected(lap),
      boundaryElapsedSeconds: sessionElapsed(message),
      boundarySequence: message.sequence,
    }
    this.record('info', 'analysis-lap-awaiting-score', 'A completed analysis lap is waiting briefly for its official LMU scoring result.', { sessionId: this.active.id, lapNumber: lap.number })
  }

  reconcilePendingLap(message, officialPublication) {
    const pending = this.active?.pendingLap
    if (!pending) return officialPublication
    if (officialPublication) {
      this.resolvePendingLap(officialPublication, 'official-time-published')
      return null
    }
    const elapsed = sessionElapsed(message)
    const elapsedExpired = finite(elapsed) && finite(pending.boundaryElapsedSeconds) && elapsed - pending.boundaryElapsedSeconds >= OFFICIAL_LAP_TIME_GRACE_SECONDS
    const sequenceExpired = Number.isSafeInteger(message.sequence) && Number.isSafeInteger(pending.boundarySequence)
      && message.sequence - pending.boundarySequence >= OFFICIAL_LAP_TIME_GRACE_FRAMES
    if (elapsedExpired || sequenceExpired) this.resolvePendingLap(null, 'official-time-timeout', { quarantineMissing: true })
    return null
  }

  resolvePendingLap(officialPublication, reason, { quarantineMissing = false } = {}) {
    const pending = this.active?.pendingLap
    if (!pending) return
    this.active.pendingLap = null
    if (!officialPublication && quarantineMissing && pending.expectsOfficialPublication) {
      this.active.officialTiming.quarantinedOwners.push({
        lapId: pending.lap.id,
        lapNumber: pending.lap.number,
        throughLapNumber: this.active.currentLap?.number ?? pending.lap.number + 1,
      })
    }
    this.finalizeLap(pending.lap, 'complete', officialPublication?.lapTimeMs ?? null)
    this.record('info', 'analysis-lap-score-resolved', 'A pending analysis lap scoring result was resolved.', { sessionId: this.active.id, lapNumber: pending.lap.number, reason, officialTimeAvailable: Boolean(officialPublication) })
  }

  finalizeCurrent(state, officialLapTimeMs = null) {
    const lap = this.active?.currentLap
    if (!lap) return
    this.finalizeLap(lap, state, officialLapTimeMs)
  }

  finalizeLap(lap, state, officialLapTimeMs = null) {
    if (!this.active || !lap) return
    lap.state = state
    lap.endedAt ||= this.active.updatedAt
    lap.scoringPending = false
    if (state !== 'complete') lap.reasons.add('incomplete')
    const fullSamples = lap.samples.map((sample) => ({ ...sample }))
    lap.sampleCount = fullSamples.length
    const officialTimeAvailable = state === 'complete' && finite(officialLapTimeMs) && officialLapTimeMs > 0
    // lapTimeMs has one deliberately narrow meaning: the lap time LMU
    // published through scoring. Sample timestamps still provide exact replay
    // duration, but are never promoted into an "official" time or PB.
    lap.lapTimeMs = officialTimeAvailable ? officialLapTimeMs : null
    lap.timingSource = officialTimeAvailable ? 'official' : 'unavailable'
    const classified = classifyLap(lap, this.active.track.lengthM)
    const sampleOverflow = lap.reasons.has('sample-overflow')
    lap.quality = sampleOverflow ? 'ineligible' : classified.quality
    lap.coverage = classified.coverage
    lap.maximumGapM = classified.maximumGapM
    lap.finalReasons = classified.reasons
    const observedCountFlags = fullSamples.map((sample) => sample.countLapFlag).filter((value) => value !== null)
    // LMU exposes three distinct scoring states: do not count, count without a
    // time, and count with a time. Capture integrity is independent from that
    // scoring decision, so keep an otherwise-complete lap replayable while
    // preventing an untimed lap from becoming a PB. The flag describes the
    // scoring decision; it is not itself the published lap-time value.
    const scoringRejected = !officialTimeAvailable
      && observedCountFlags.length > 0
      && observedCountFlags.some((value) => value !== 2)
    if (scoringRejected) {
      lap.finalReasons = [...new Set([...lap.finalReasons, 'lap-invalidated'])].sort()
    }
    lap.replayable = fullSamples.length > 1 && !sampleOverflow
    lap.referenceEligible = lap.state === 'complete' && lap.quality === 'clean' && officialTimeAvailable
    lap.trackModelEligible = lap.referenceEligible
      && fullSamples.some((sample) => sample.pathLateralM !== null && (sample.countLapFlag === null || sample.countLapFlag === 2))
    const finalized = {
      schemaVersion: SCHEMA_VERSION,
      qualityPolicyVersion: QUALITY_POLICY_VERSION,
      session: {
        id: this.active.id, source: this.active.source, sourceRunId: this.active.sourceRunId, state: this.active.state, startedAt: this.active.startedAt, updatedAt: this.active.updatedAt,
        trackKey: this.active.trackKey, track: { ...this.active.track }, car: { ...this.active.car }, interruptionCount: this.active.interruptionCount,
      },
      lap: {
        id: lap.id, number: lap.number, state: lap.state, startedAt: lap.startedAt, endedAt: lap.endedAt, lapTimeMs: lap.lapTimeMs, timingSource: lap.timingSource,
        quality: lap.quality, reasons: [...lap.finalReasons], coverage: lap.coverage, maximumGapM: lap.maximumGapM, sampleCount: lap.sampleCount,
        replayable: lap.replayable, referenceEligible: lap.referenceEligible, trackModelEligible: lap.trackModelEligible,
      },
      samples: fullSamples,
    }
    // Retain the checksum-bearing finalized event exactly as captured, but do
    // not let LMU's bounded finish-line producer transition break in-memory
    // playback. Near misses remain untouched and therefore fail visibly.
    lap.samples = compactSamples(playbackSamples(fullSamples, {
      trackLengthM: this.active.track.lengthM,
      officialLapTimeMs: lap.lapTimeMs,
    }))
    if (!this.active.laps.includes(lap)) this.active.laps.push(lap)
    if (this.active.currentLap === lap) this.active.currentLap = null
    if (state === 'complete') this.health.completedLaps += 1
    else this.health.incompleteLaps += 1
    this.record('info', 'analysis-lap-finalized', 'In-memory analysis lap finalized.', { sessionId: this.active.id, lapNumber: lap.number, state, quality: lap.quality, reasons: lap.finalReasons, coverageBucket: Math.round(lap.coverage * 20) * 5, sampleCount: lap.samples.length })
    if (this.onLapFinalized) {
      try {
        Promise.resolve(this.onLapFinalized(finalized)).catch((error) => this.record('error', 'lap-persist-failed', 'A finalized analysis lap could not be persisted.', { error: error instanceof Error ? error.message : String(error), lapId: lap.id }))
      } catch (error) {
        this.record('error', 'lap-persist-failed', 'A finalized analysis lap could not be queued for persistence.', { error: error instanceof Error ? error.message : String(error), lapId: lap.id })
      }
    }
    this.enforceMemoryBudget()
  }

  archiveActive(reason) {
    if (!this.active) return
    if (this.active.pendingLap) this.resolvePendingLap(null, 'session-archived')
    if (this.active.currentLap) this.finalizeCurrent('incomplete')
    this.active.state = 'finished'
    this.active.endedAt = this.active.updatedAt || this.now().toISOString()
    const finalized = this.sessionSummary(this.active)
    const sessionId = this.active.id
    const lapCount = this.active.laps.length
    this.active = null
    this.record('info', 'analysis-session-archived', 'In-memory analysis session archived.', { sessionId, reason, laps: lapCount })
    if (this.onSessionFinalized) {
      try {
        Promise.resolve(this.onSessionFinalized(finalized)).catch((error) => this.record('error', 'session-persist-failed', 'A finalized analysis session could not be persisted.', { error: error instanceof Error ? error.message : String(error), sessionId }))
      } catch (error) {
        this.record('error', 'session-persist-failed', 'A finalized analysis session could not be queued for persistence.', { error: error instanceof Error ? error.message : String(error), sessionId })
      }
    }
  }

  enforceMemoryBudget() {
    const bytes = () => this.sessions.reduce((total, session) => total + session.laps.reduce((lapTotal, lap) => lapTotal + (lap.samples?.length ?? 0) * ESTIMATED_SAMPLE_BYTES, 0) + (session.currentLap?.samples?.length ?? 0) * ESTIMATED_SAMPLE_BYTES, 0)
    if (bytes() <= this.memoryBudgetBytes) return
    const clean = this.sessions.flatMap((session) => session.laps.filter((lap) => lap.quality === 'clean' && lap.samples).map((lap) => ({ session, lap })))
    const pinned = new Set(clean.slice(-3).map(({ lap }) => lap.id))
    const all = this.sessions.flatMap((session) => session.laps.filter((lap) => lap.samples).map((lap) => ({ session, lap })))
    const newestLapId = all.at(-1)?.lap.id
    const candidates = [
      ...all.filter(({ lap }) => lap.id !== newestLapId && !pinned.has(lap.id)),
      ...all.filter(({ lap }) => lap.id !== newestLapId && pinned.has(lap.id)),
    ]
    for (const { lap } of candidates) {
      if (bytes() <= this.memoryBudgetBytes) break
      lap.samples = null
      this.health.evictedLapPayloads += 1
    }
  }

  listSessions() {
    return [...this.sessions].reverse().map((session) => this.sessionSummary(session))
  }

  sessionSummary(session) {
    const laps = [...session.laps.map((lap) => this.lapSummary(lap, session.track.lengthM))]
    if (session.currentLap) laps.push(this.lapSummary(session.currentLap, session.track.lengthM))
    return {
      schemaVersion: SCHEMA_VERSION, qualityPolicyVersion: QUALITY_POLICY_VERSION, revision: session.revision,
      id: session.id, source: session.source, sourceRunId: session.sourceRunId, state: session.state, startedAt: session.startedAt, endedAt: session.endedAt,
      track: { ...session.track }, car: { ...session.car }, laps, currentLapId: session.currentLap?.id ?? null,
      interruptionCount: session.interruptionCount, sourceSegmentCount: session.sourceSegments.length,
    }
  }

  lapSummary(lap, trackLengthM) {
    const classified = lap.quality ? { quality: lap.quality, reasons: lap.finalReasons, coverage: lap.coverage, maximumGapM: lap.maximumGapM } : classifyLap(lap, trackLengthM)
    const timingSource = lap.timingSource === 'official' ? 'official' : 'unavailable'
    const lapTimeMs = timingSource === 'official' && finite(lap.lapTimeMs) && lap.lapTimeMs > 0 ? lap.lapTimeMs : null
    return { id: lap.id, number: lap.number, state: lap.state, quality: classified.quality, reasons: classified.reasons, lapTimeMs, timingSource, coverage: classified.coverage, maximumGapM: classified.maximumGapM, sampleCount: lap.sampleCount ?? lap.samples?.length ?? 0, samplesAvailable: Boolean(lap.samples?.length), replayable: lap.replayable ?? Boolean(lap.samples?.length > 1), referenceEligible: lap.referenceEligible ?? false, trackModelEligible: lap.trackModelEligible ?? false, officialTimePending: Boolean(lap.scoringPending) }
  }

  getLap(sessionId, lapId) {
    const session = this.sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return null
    const lap = session.currentLap?.id === lapId ? session.currentLap : session.laps.find((candidate) => candidate.id === lapId)
    if (!lap) return null
    const summary = this.lapSummary(lap, session.track.lengthM)
    const samples = lap.samples?.map((sample) => ({ ...sample })) ?? null
    return {
      schemaVersion: SCHEMA_VERSION,
      session: this.sessionSummary(session),
      lap: summary,
      samples: samples ? playbackSamples(samples, { trackLengthM: session.track.lengthM, officialLapTimeMs: summary.lapTimeMs }) : null,
    }
  }

  getDriverReviewEvidence(sessionId, selectedLapId = null) {
    const session = this.sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return null
    const summary = this.sessionSummary(session)
    if (selectedLapId && !summary.laps.some((lap) => lap.id === selectedLapId)) return { status: 'selected-lap-not-found' }
    const storedLaps = new Map([...session.laps, ...(session.currentLap ? [session.currentLap] : [])].map((lap) => [lap.id, lap]))
    const reviewSummaries = summary.laps.map((lap) => {
      const stored = storedLaps.get(lap.id)
      const evicted = !lap.samplesAvailable && Number(stored?.sampleCount) > 0 && stored?.samples === null
      return { ...lap, driverReviewPayloadState: evicted ? 'evicted' : 'unavailable' }
    })
    const selection = selectDriverReviewEvidence(reviewSummaries, selectedLapId)
    const laps = []
    for (const lap of selection.laps) {
      const payload = this.getLap(sessionId, lap.id)
      // The authoritative summary can explicitly report an evicted payload.
      // A payload disappearing after selection is also withheld rather than
      // being promoted into inferred evidence.
      if (!payload?.samples?.length) continue
      laps.push(payload)
    }
    const unavailableAfterSelection = selection.laps.length - laps.length
    if (unavailableAfterSelection > 0) {
      selection.accounting.sampledLapCount = laps.length
      selection.accounting.strictEligibleTotal -= unavailableAfterSelection
      selection.accounting.strictExcludedTotal += unavailableAfterSelection
      selection.accounting.exclusions['payload-evicted'] += unavailableAfterSelection
    }
    return {
      status: 'ready',
      input: {
        sessionId,
        trackLengthM: summary.track.lengthM,
        selectedLapId,
        laps,
        referenceLapId: selection.referenceLapId,
        evidence: selection.accounting,
      },
    }
  }

  /** Lightweight import progress that never reclassifies or sorts lap samples. */
  getProgress() {
    return {
      sessions: this.sessions.length,
      laps: this.sessions.reduce((total, session) => total + session.laps.length + (session.currentLap ? 1 : 0), 0),
    }
  }

  getHealth() { return { schemaVersion: SCHEMA_VERSION, qualityPolicyVersion: QUALITY_POLICY_VERSION, revision: this.revision, memoryBudgetBytes: this.memoryBudgetBytes, currentLapSampleLimit: this.currentLapSampleLimit, ...this.health } }
  record(level, event, message, details) { void this.logger?.record(level, 'analysis-session', event, message, details) }
}

module.exports = { LiveSessionStore, compactSamples, classifyLap, selectDriverReviewEvidence, constants: { SCHEMA_VERSION, QUALITY_POLICY_VERSION, COVERAGE_BIN_M, CLEAN_COVERAGE, LIMITED_COVERAGE, MAX_CLEAN_GAP_M, MAX_FINAL_SAMPLES, MAX_CURRENT_SAMPLES, ESTIMATED_SAMPLE_BYTES, DEFAULT_MEMORY_BUDGET, OFFICIAL_LAP_TIME_GRACE_SECONDS, OFFICIAL_LAP_TIME_GRACE_FRAMES, REPLAY_IDENTITY_VERSION, DRIVER_REVIEW_MAX_EVIDENCE_LAPS } }
