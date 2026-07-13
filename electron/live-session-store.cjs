const crypto = require('node:crypto')

const SCHEMA_VERSION = 1
const QUALITY_POLICY_VERSION = 'lap-quality-v1'
const COVERAGE_BIN_M = 12
const CLEAN_COVERAGE = 0.97
const LIMITED_COVERAGE = 0.8
const MAX_FINAL_SAMPLES = 4096
const MAX_CURRENT_SAMPLES = 32768
const DEFAULT_MEMORY_BUDGET = 64 * 1024 * 1024

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
function safeLength(message) { return Math.max(1, finite(message.session?.trackLengthM) ? message.session.trackLengthM : 1) }

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
  const bins = new Set(lap.samples.map((sample) => clamp(Math.floor(sample.distanceM / COVERAGE_BIN_M), 0, Math.ceil(trackLengthM / COVERAGE_BIN_M) - 1)))
  const totalBins = Math.max(1, Math.ceil(trackLengthM / COVERAGE_BIN_M))
  const ordered = [...lap.samples].sort((left, right) => left.distanceM - right.distanceM)
  let maximumGapM = Math.max(0, ordered[0].distanceM, trackLengthM - ordered.at(-1).distanceM)
  for (let index = 1; index < ordered.length; index += 1) maximumGapM = Math.max(maximumGapM, ordered[index].distanceM - ordered[index - 1].distanceM)
  return { coverage: Math.min(1, bins.size / totalBins), maximumGapM }
}

function classifyLap(lap, trackLengthM) {
  const { coverage, maximumGapM } = lapCoverage(lap, trackLengthM)
  const reasons = new Set(lap.reasons)
  if (lap.state !== 'complete') reasons.add('incomplete')
  if (coverage < CLEAN_COVERAGE) reasons.add('coverage-low')
  const disqualifying = ['pit', 'ai-control', 'remote-control', 'replay-control', 'time-reset', 'lap-counter-jump']
  const quality = lap.state === 'complete' && coverage >= CLEAN_COVERAGE && !disqualifying.some((reason) => reasons.has(reason))
    ? 'clean'
    : lap.samples?.length > 1 && coverage >= LIMITED_COVERAGE && !['pit', 'ai-control', 'remote-control', 'replay-control'].some((reason) => reasons.has(reason))
      ? 'limited'
      : 'ineligible'
  return { quality, reasons: [...reasons].sort(), coverage, maximumGapM }
}

class LiveSessionStore {
  constructor({ logger = null, makeId = crypto.randomUUID, memoryBudgetBytes = DEFAULT_MEMORY_BUDGET, now = () => new Date() } = {}) {
    this.logger = logger
    this.makeId = makeId
    this.memoryBudgetBytes = memoryBudgetBytes
    this.now = now
    this.sessions = []
    this.active = null
    this.revision = 0
    this.health = { telemetryFrames: 0, statuses: 0, sessions: 0, completedLaps: 0, incompleteLaps: 0, evictedLapPayloads: 0 }
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

    if (message.playerTelemetryAvailable !== false) this.ingestVehicleFrame(message)
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
    const interrupted = ['waiting', 'waiting-for-vehicle', 'mapping-open', 'invalid-data', 'disconnected', 'stopped', 'missing', 'error'].includes(message.state)
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
    const id = stableId('analysis-session', `${this.makeId()}|${generation}|${sourceKind(message)}|${sessionTrackKey(message)}`)
    this.active = {
      id, revision: this.revision, source: sourceKind(message), state: 'active', startedAt: createdAt, updatedAt: createdAt, endedAt: null,
      trackKey: sessionTrackKey(message), track: { name: message.session.track, layout: message.session.layout || '', lengthM: safeLength(message) },
      car: { id: Number.isSafeInteger(message.player.id) ? message.player.id : 0, name: message.player.name || '', class: message.player.class || '' },
      sourceSegments: [], interruptionCount: 0, laps: [], currentLap: null, lastFrame: null,
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

  ingestVehicleFrame(message) {
    const identity = this.frameIdentity(message)
    const previous = this.active.lastFrame
    const boundary = previous && this.lapBoundary(previous, identity, this.active.track.lengthM)
    if (!this.active.currentLap) this.startLap(message, identity)
    else if (boundary) {
      if (boundary === 'lap-counter-jump') this.active.currentLap.reasons.add(boundary)
      const officialLapTimeMs = finite(message.player?.lastLapSeconds) && message.player.lastLapSeconds > 0
        ? message.player.lastLapSeconds * 1000
        : null
      this.finalizeCurrent('complete', officialLapTimeMs)
      this.startLap(message, identity)
    }
    const lap = this.active.currentLap
    if (!lap) return
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
    lap.samples.push(sample)
    lap.lastSequence = message.sequence
    if (lap.samples.length > MAX_CURRENT_SAMPLES) {
      lap.samples = compactSamples(lap.samples, Math.floor(MAX_CURRENT_SAMPLES / 2))
      lap.reasons.add('sample-compacted')
    }
  }

  startLap(message, identity) {
    const number = identity.lap
    const id = stableId('analysis-lap', `${this.active.id}|${number}|${identity.lapStart ?? identity.elapsed}|${this.makeId()}`)
    this.active.currentLap = { id, number, state: 'current', startedAt: message.capturedAt || this.now().toISOString(), endedAt: null, samples: [], reasons: new Set(), lastSequence: null, ownerCandidate: null, ownerCount: 0, pitCount: 0, justStarted: true }
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
      distanceM, x: position.x, z: position.z,
      brake: clamp(finite(message.player.brake) ? message.player.brake : 0, 0, 1),
      throttle: clamp(finite(message.player.throttle) ? message.player.throttle : 0, 0, 1),
      steering: clamp(finite(message.player.steering) ? message.player.steering : 0, -1, 1),
      speedKph: Math.max(0, finite(message.player.speedKph) ? message.player.speedKph : 0),
      elapsedSeconds: elapsed,
      lapElapsedSeconds: Math.max(0, elapsed - (lapStart(message) ?? elapsed)),
    }
  }

  frameIdentity(message) {
    return { runId: message.runId || '', sequence: message.sequence, elapsed: sessionElapsed(message), lapStart: lapStart(message), lap: currentLapNumber(message), distanceM: finite(message.player?.lapDistanceM) ? message.player.lapDistanceM : null }
  }

  lapBoundary(previous, current, trackLengthM) {
    if (current.lap > previous.lap) return current.lap === previous.lap + 1 ? 'lap-number' : 'lap-counter-jump'
    if (current.lapStart !== null && previous.lapStart !== null && current.lapStart > previous.lapStart + 0.5) return 'lap-start-time'
    if ((current.lapStart === null || previous.lapStart === null) && finite(current.distanceM) && finite(previous.distanceM) && previous.distanceM > trackLengthM * 0.6 && current.distanceM < trackLengthM * 0.4) return 'distance-wrap'
    return null
  }

  finalizeCurrent(state, officialLapTimeMs = null) {
    const lap = this.active?.currentLap
    if (!lap) return
    lap.state = state
    lap.endedAt = this.active.updatedAt
    if (state !== 'complete') lap.reasons.add('incomplete')
    lap.samples = compactSamples(lap.samples)
    lap.sampleCount = lap.samples.length
    lap.lapTimeMs = state === 'complete' && finite(officialLapTimeMs)
      ? Math.max(0, officialLapTimeMs)
      : state === 'complete' && lap.samples.length > 1
        ? Math.max(0, (lap.samples.at(-1).elapsedSeconds - lap.samples[0].elapsedSeconds) * 1000)
        : null
    const classified = classifyLap(lap, this.active.track.lengthM)
    lap.quality = classified.quality
    lap.coverage = classified.coverage
    lap.maximumGapM = classified.maximumGapM
    lap.finalReasons = classified.reasons
    this.active.laps.push(lap)
    this.active.currentLap = null
    if (state === 'complete') this.health.completedLaps += 1
    else this.health.incompleteLaps += 1
    this.record('info', 'analysis-lap-finalized', 'In-memory analysis lap finalized.', { sessionId: this.active.id, lapNumber: lap.number, state, quality: lap.quality, reasons: lap.finalReasons, coverageBucket: Math.round(lap.coverage * 20) * 5, sampleCount: lap.samples.length })
    this.enforceMemoryBudget()
  }

  archiveActive(reason) {
    if (!this.active) return
    if (this.active.currentLap) this.finalizeCurrent('incomplete')
    this.active.state = 'finished'
    this.active.endedAt = this.active.updatedAt || this.now().toISOString()
    this.record('info', 'analysis-session-archived', 'In-memory analysis session archived.', { sessionId: this.active.id, reason, laps: this.active.laps.length })
    this.active = null
  }

  enforceMemoryBudget() {
    const bytes = () => this.sessions.reduce((total, session) => total + session.laps.reduce((lapTotal, lap) => lapTotal + (lap.samples?.length ?? 0) * 9 * 8, 0) + (session.currentLap?.samples?.length ?? 0) * 9 * 8, 0)
    if (bytes() <= this.memoryBudgetBytes) return
    const clean = this.sessions.flatMap((session) => session.laps.filter((lap) => lap.quality === 'clean' && lap.samples).map((lap) => ({ session, lap })))
    const pinned = new Set(clean.slice(-3).map(({ lap }) => lap.id))
    const all = this.sessions.flatMap((session) => session.laps.filter((lap) => lap.samples).map((lap) => ({ session, lap })))
    const newestCleanId = clean.at(-1)?.lap.id
    const candidates = [...all.filter(({ lap }) => !pinned.has(lap.id)), ...all.filter(({ lap }) => pinned.has(lap.id) && lap.id !== newestCleanId)]
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
      id: session.id, source: session.source, state: session.state, startedAt: session.startedAt, endedAt: session.endedAt,
      track: { ...session.track }, car: { ...session.car }, laps, currentLapId: session.currentLap?.id ?? null,
      interruptionCount: session.interruptionCount, sourceSegmentCount: session.sourceSegments.length,
    }
  }

  lapSummary(lap, trackLengthM) {
    const classified = lap.quality ? { quality: lap.quality, reasons: lap.finalReasons, coverage: lap.coverage, maximumGapM: lap.maximumGapM } : classifyLap(lap, trackLengthM)
    const first = lap.samples?.[0]
    const last = lap.samples?.at(-1)
    const lapTimeMs = lap.lapTimeMs !== undefined ? lap.lapTimeMs : lap.state === 'complete' && first && last ? Math.max(0, (last.elapsedSeconds - first.elapsedSeconds) * 1000) : null
    return { id: lap.id, number: lap.number, state: lap.state, quality: classified.quality, reasons: classified.reasons, lapTimeMs, coverage: classified.coverage, maximumGapM: classified.maximumGapM, sampleCount: lap.sampleCount ?? lap.samples?.length ?? 0, samplesAvailable: Boolean(lap.samples?.length) }
  }

  getLap(sessionId, lapId) {
    const session = this.sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return null
    const lap = session.currentLap?.id === lapId ? session.currentLap : session.laps.find((candidate) => candidate.id === lapId)
    if (!lap) return null
    return { schemaVersion: SCHEMA_VERSION, session: this.sessionSummary(session), lap: this.lapSummary(lap, session.track.lengthM), samples: lap.samples?.map((sample) => ({ ...sample })) ?? null }
  }

  getHealth() { return { schemaVersion: SCHEMA_VERSION, qualityPolicyVersion: QUALITY_POLICY_VERSION, revision: this.revision, memoryBudgetBytes: this.memoryBudgetBytes, ...this.health } }
  record(level, event, message, details) { void this.logger?.record(level, 'analysis-session', event, message, details) }
}

module.exports = { LiveSessionStore, compactSamples, classifyLap, constants: { SCHEMA_VERSION, QUALITY_POLICY_VERSION, COVERAGE_BIN_M, CLEAN_COVERAGE, LIMITED_COVERAGE, MAX_FINAL_SAMPLES, DEFAULT_MEMORY_BUDGET } }
