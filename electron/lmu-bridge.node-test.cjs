const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { setImmediate: waitForImmediate } = require('node:timers/promises')
const { LmuBridgeManager } = require('./lmu-bridge.cjs')

class FakeChild extends EventEmitter {
  constructor() {
    super()
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.stdin = new PassThrough()
    this.killed = false
  }

  kill() {
    this.killed = true
    return true
  }
}

test('runSelfTest spawns a separate finite correlated bridge process', async () => {
  const children = []
  const calls = []
  const broadcasts = []
  let scheduledRestarts = 0
  const manager = new LmuBridgeManager({
    app: { isPackaged: false },
    broadcast: (message) => broadcasts.push(message),
    runtime: {
      platform: 'win32',
      fileExists: () => true,
      randomUUID: () => 'self-test-run-1',
      spawn: (binary, args, options) => {
        const child = new FakeChild()
        children.push(child)
        calls.push({ binary, args, options })
        return child
      },
      setTimeout: () => { scheduledRestarts += 1; return 1 },
      clearTimeout: () => undefined,
    },
  })

  const liveResult = manager.start()
  const selfTestResult = manager.runSelfTest()
  assert.equal(liveResult.ok, true)
  assert.deepEqual(selfTestResult, { ok: true, runId: 'self-test-run-1' })
  assert.equal(children.length, 2, 'live and self-test use independent child processes')
  assert.deepEqual(calls[0].args, ['--hz=50', `--parent-pid=${process.pid}`])
  assert.deepEqual(calls[1].args, ['--self-test', '--frames=8', '--run-id=self-test-run-1'])

  const selfTestChild = children[1]
  selfTestChild.stdout.write(`${JSON.stringify({ protocolVersion: 2, source: 'self-test', runId: 'self-test-run-1', type: 'status', state: 'self-test-starting' })}\n`)
  selfTestChild.stdout.write(`${JSON.stringify({ protocolVersion: 2, source: 'self-test', runId: 'self-test-run-1', type: 'telemetry', sequence: 1, session: {}, player: {}, opponents: [] })}\n`)
  selfTestChild.stdout.write(`${JSON.stringify({ protocolVersion: 2, source: 'self-test', runId: 'self-test-run-1', type: 'status', state: 'self-test-complete', frames: 1 })}\n`)
  await waitForImmediate()

  assert.deepEqual(broadcasts.map((message) => message.state ?? message.type), [
    'self-test-starting',
    'telemetry',
    'self-test-complete',
  ])
  selfTestChild.emit('exit', 0)
  assert.equal(scheduledRestarts, 0, 'successful one-shot process must not restart')
  assert.equal(children[0].killed, false, 'live process remains untouched')
})

test('runSelfTest rejects concurrent runs and drops uncorrelated output', async () => {
  const child = new FakeChild()
  const broadcasts = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false },
    broadcast: (message) => broadcasts.push(message),
    runtime: {
      platform: 'win32',
      fileExists: () => true,
      randomUUID: () => 'self-test-run-2',
      spawn: () => child,
    },
  })

  assert.deepEqual(manager.runSelfTest(), { ok: true, runId: 'self-test-run-2' })
  assert.deepEqual(manager.runSelfTest(), { ok: false, reason: 'self-test-running', runId: 'self-test-run-2' })
  child.stdout.write(`${JSON.stringify({ protocolVersion: 2, source: 'self-test', runId: 'wrong-run', type: 'telemetry' })}\n`)
  await waitForImmediate()

  assert.equal(broadcasts.length, 1)
  assert.equal(broadcasts[0].source, 'self-test')
  assert.equal(broadcasts[0].runId, 'self-test-run-2')
  assert.equal(broadcasts[0].state, 'error')
  assert.match(broadcasts[0].message, /uncorrelated/)
})

test('runSelfTest reports synchronous process launch failures', () => {
  const broadcasts = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false },
    broadcast: (message) => broadcasts.push(message),
    runtime: {
      platform: 'win32',
      fileExists: () => true,
      randomUUID: () => 'self-test-run-3',
      spawn: () => { throw new Error('launch denied') },
    },
  })

  assert.deepEqual(manager.runSelfTest(), { ok: false, reason: 'spawn-failed', runId: 'self-test-run-3' })
  assert.equal(broadcasts.length, 1)
  assert.equal(broadcasts[0].state, 'error')
  assert.equal(broadcasts[0].message, 'launch denied')
})

test('records useful live status transitions without logging telemetry frames', async () => {
  const child = new FakeChild()
  const entries = []
  const broadcasts = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false },
    broadcast: (message) => broadcasts.push(message),
    logger: { record: (...entry) => { entries.push(entry) } },
    runtime: { platform: 'win32', fileExists: () => true, randomUUID: () => 'live-run-1', spawn: () => child },
  })

  manager.start()
  const privateDriverToken = 'SECRET_SCORING_DRIVER_7656119'
  child.stdout.write(`${JSON.stringify({ protocolVersion: 2, source: 'lmu-shared-memory', type: 'status', state: 'invalid-data', message: `Could not decode ${privateDriverToken}` })}\n`)
  child.stdout.write(`${JSON.stringify({ protocolVersion: 2, source: 'lmu-shared-memory', type: 'telemetry', sequence: 1, session: {}, player: {}, opponents: [] })}\n`)
  await waitForImmediate()

  const status = entries.find((entry) => entry[2] === 'status')
  assert.ok(status)
  assert.equal(status[0], 'warning')
  assert.match(status[3], /invalid-data/)
  assert.equal(JSON.stringify(entries).includes(privateDriverToken), false)
  assert.equal(broadcasts[0].message.includes(privateDriverToken), true, 'non-private UI status remains useful without persisting its text')
  assert.equal(entries.filter((entry) => entry[2] === 'status').length, 1)
  assert.equal(broadcasts.length, 2)
  assert.equal(broadcasts.every((message) => message.runId === 'live-run-1'), true)
})

test('malformed stdout is diagnosed by bounded metadata without retaining its telemetry text', async () => {
  const child = new FakeChild()
  const entries = []
  const broadcasts = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: (message) => broadcasts.push(message),
    logger: { record: (...entry) => { entries.push(entry) } },
    runtime: { platform: 'win32', fileExists: () => true, randomUUID: () => 'live-invalid-json', spawn: () => child },
  })
  manager.start()
  const secret = 'SECRET_DRIVER_INSIDE_ALMOST_JSON'
  child.stdout.write(`{"type":"telemetry","player":{"driver":"${secret}"}\n`)
  await waitForImmediate()
  const serialized = JSON.stringify(entries)
  assert.equal(serialized.includes(secret), false)
  assert.equal(serialized.includes('"player"'), false)
  const invalid = entries.find((entry) => entry[2] === 'invalid-frame')
  assert.ok(invalid)
  assert.equal(invalid[4].errorType, 'SyntaxError')
  assert.ok(invalid[4].bytes > 0)
  assert.equal(broadcasts.at(-1).state, 'error')
})

test('records raw sessions in a separate stoppable bridge process', async () => {
  const child = new FakeChild()
  const states = []
  let call
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: () => {}, broadcastRecording: (state) => states.push(state),
    runtime: { platform: 'win32', fileExists: () => true, spawn: (binary, args, options) => { call = { binary, args, options }; return child } },
  })
  const result = manager.startRecording('C:\\captures\\practice.apexrec', '0.2.0')
  assert.equal(result.ok, true)
  assert.deepEqual(call.args, ['--hz=50', `--parent-pid=${process.pid}`, '--record=C:\\captures\\practice.apexrec', '--app-version=0.2.0'])
  child.stdout.write(`${JSON.stringify({ type: 'recording', state: 'recording', frames: 125, bytes: 2048, durationSeconds: 2.5, message: 'Recording' })}\n`)
  await waitForImmediate()
  assert.equal(manager.getRecordingState().frames, 125)
  let command = ''
  child.stdin.on('data', (chunk) => { command += String(chunk) })
  assert.deepEqual(manager.stopRecording(), { ok: true })
  await waitForImmediate()
  assert.equal(command, 'stop\n')
  assert.equal(states.at(-1).status, 'stopping')
})

test('recorder and replay ownership cannot overlap in either start order', () => {
  const children = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: () => {},
    runtime: { platform: 'win32', fileExists: () => true, spawn: () => { const child = new FakeChild(); children.push(child); return child } },
  })
  assert.deepEqual(manager.acquireReplayOwnership('private-import', { privateReplay: true }), { ok: true, ownerId: 'private-import' })
  assert.deepEqual(manager.startRecording('C:\\capture.apexrec', '0.3.0'), { ok: false, reason: 'busy' })
  assert.equal(children.length, 0)

  manager.replayOwnership = { ownerId: 'private-import', privateReplay: true, sensitivePaths: [], external: true }
  manager.recordingProcess = new FakeChild()
  assert.deepEqual(manager.startReplay('C:\\capture.apexrec', { speed: 0, strict: true, runId: 'private-run', ownershipId: 'private-import' }), { ok: false, reason: 'busy' })
  assert.equal(children.length, 0)
})

test('replay stdout flow control is bound to the exact owner, run, and child', () => {
  const children = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: () => {},
    runtime: { platform: 'win32', fileExists: () => true, spawn: () => { const child = new FakeChild(); children.push(child); return child } },
  })

  assert.deepEqual(manager.acquireReplayOwnership('owner-one', { privateReplay: true }), { ok: true, ownerId: 'owner-one' })
  assert.equal(manager.startReplay('C:\\one.apexrec', { speed: 0, strict: true, runId: 'run-one', ownershipId: 'owner-one' }).ok, true)
  const first = children[0]
  assert.deepEqual(manager.setReplayOutputPaused('wrong-owner', 'run-one', true), { ok: false, reason: 'ownership-mismatch' })
  assert.deepEqual(manager.setReplayOutputPaused('owner-one', 'wrong-run', true), { ok: false, reason: 'run-mismatch' })
  assert.deepEqual(manager.setReplayOutputPaused('owner-one', 'run-one', true), { ok: true, paused: true })
  assert.equal(first.stdout.isPaused(), true)
  assert.deepEqual(manager.setReplayOutputPaused('owner-one', 'run-one', true), { ok: true, paused: true, unchanged: true })
  manager.stopReplay()
  assert.deepEqual(manager.setReplayOutputPaused('owner-one', 'run-one', false), { ok: false, reason: 'stopping' })
  first.emit('close', null)
  assert.deepEqual(manager.releaseReplayOwnership('owner-one'), { ok: true })

  assert.deepEqual(manager.acquireReplayOwnership('owner-two', { privateReplay: true }), { ok: true, ownerId: 'owner-two' })
  assert.equal(manager.startReplay('C:\\two.apexrec', { speed: 0, strict: true, runId: 'run-two', ownershipId: 'owner-two' }).ok, true)
  const second = children[1]
  assert.deepEqual(manager.setReplayOutputPaused('owner-two', 'run-two', true), { ok: true, paused: true })
  assert.deepEqual(manager.setReplayOutputPaused('owner-one', 'run-one', false), { ok: false, reason: 'ownership-mismatch' })
  assert.equal(second.stdout.isPaused(), true, 'a stale resume cannot affect the replacement replay')
  assert.deepEqual(manager.setReplayOutputPaused('owner-two', 'run-two', false), { ok: true, paused: false })
  assert.equal(second.stdout.isPaused(), false)
})

test('replay temporarily replaces live telemetry and resumes it afterwards', async () => {
  const children = []
  const broadcasts = []
  const finished = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: (message) => broadcasts.push(message),
    onReplayFinished: (result) => finished.push(result),
    runtime: { platform: 'win32', fileExists: () => true, spawn: () => { const child = new FakeChild(); children.push(child); return child } },
  })
  manager.start()
  const replay = manager.startReplay('C:\\captures\\practice.apexrec', { speed: 0, strict: true, runId: 'replay-test' })
  assert.equal(replay.ok, true)
  assert.equal(children[0].killed, true)
  children[1].stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'replay-test', type: 'status', state: 'replay-starting' })}\n`)
  children[1].stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'replay-test', type: 'telemetry', sequence: 1, session: {}, player: {}, opponents: [] })}\n`)
  const recordingSha256 = 'a'.repeat(64)
  children[1].stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'replay-test', type: 'status', state: 'replay-complete', recordingSha256 })}\n`)
  await waitForImmediate()
  assert.equal(broadcasts.at(-1).source, 'recording-replay')
  children[1].emit('close', 0)
  assert.deepEqual(finished, [{ runId: 'replay-test', complete: true, stopped: false, message: 'Replay complete', code: 0, recordingSha256 }])
  assert.equal(children.length, 3, 'live bridge restarts after replay')
})

test('stopping renderer live telemetry cannot kill an exact private replay and a later request stays deferred', async () => {
  const children = []
  const finished = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: () => {}, onReplayFinished: (result) => finished.push(result),
    runtime: { platform: 'win32', fileExists: () => true, spawn: () => { const child = new FakeChild(); children.push(child); return child } },
  })
  const ownerId = 'analysis-import-language-change'
  const runId = 'private-language-change-run'

  assert.deepEqual(manager.start(), { ok: true })
  assert.deepEqual(manager.acquireReplayOwnership(ownerId, { privateReplay: true }), { ok: true, ownerId })
  assert.equal(children[0].killed, true)
  assert.deepEqual(manager.startReplay('C:\\private\\language-change.apexrec', {
    speed: 0, strict: true, runId, reportRecordingState: false, ownershipId: ownerId,
  }), { ok: true, runId })
  const replayChild = children[1]

  assert.deepEqual(manager.stopLive(), { ok: true })
  assert.equal(manager.requested, false)
  assert.equal(replayChild.killed, false, 'renderer cleanup must only stop live telemetry')
  assert.equal(manager.replayProcess, replayChild)
  assert.deepEqual(manager.start(), { ok: true, deferred: true })
  assert.equal(manager.requested, true)
  assert.equal(children.length, 2, 'the later live request remains deferred behind private replay ownership')

  replayChild.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId, type: 'status', state: 'replay-starting' })}\n`)
  replayChild.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId, type: 'status', state: 'replay-complete', recordingSha256: 'c'.repeat(64) })}\n`)
  await waitForImmediate()
  replayChild.emit('close', 0)
  assert.equal(replayChild.killed, false)
  assert.equal(children.length, 2, 'external import ownership keeps the requested live bridge deferred through finalization')
  assert.deepEqual(finished, [{ runId, complete: true, stopped: false, message: 'Replay complete', code: 0, recordingSha256: 'c'.repeat(64) }])

  assert.deepEqual(manager.releaseReplayOwnership(ownerId), { ok: true })
  assert.equal(children.length, 3, 'the later live request resumes only after private replay ownership is released')
})

test('replay rejects stale output and exit zero without correlated completion', async () => {
  const children = []
  const states = []
  const finished = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: () => {}, broadcastRecording: (state) => states.push(state),
    onReplayFinished: (result) => finished.push(result),
    runtime: { platform: 'win32', fileExists: () => true, spawn: () => { const child = new FakeChild(); children.push(child); return child } },
  })
  assert.equal(manager.startReplay('C:\\capture.apexrec', { speed: 0, strict: true, runId: 'current-run' }).ok, true)
  children[0].stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'old-run', type: 'status', state: 'replay-complete', recordingSha256: 'b'.repeat(64) })}\n`)
  await waitForImmediate()
  children[0].emit('close', 0)
  assert.equal(states.at(-1).status, 'error')
  assert.match(states.at(-1).message, /without correlated completion/)
  assert.equal(finished[0].complete, false)
  assert.equal(finished[0].runId, 'current-run')
  assert.equal(Object.prototype.hasOwnProperty.call(finished[0], 'recordingSha256'), false)
})

test('replay rejects a malformed decoder stream hash', async () => {
  const child = new FakeChild()
  const finished = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: () => {}, onReplayFinished: (result) => finished.push(result),
    runtime: { platform: 'win32', fileExists: () => true, spawn: () => child },
  })
  assert.equal(manager.startReplay('C:\\capture.apexrec', { speed: 0, strict: true, runId: 'hash-run' }).ok, true)
  child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'hash-run', type: 'status', state: 'replay-starting' })}\n`)
  child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'hash-run', type: 'status', state: 'replay-complete', recordingSha256: 'not-a-sha256' })}\n`)
  await waitForImmediate()
  child.emit('close', 0)
  assert.deepEqual(finished, [{ runId: 'hash-run', complete: false, stopped: false, message: 'Replay exited without correlated completion.', code: 0 }])
})

test('strict replay completion rejects malformed protocol output', async () => {
  const child = new FakeChild()
  const finished = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: () => {}, onReplayFinished: (result) => finished.push(result),
    runtime: { platform: 'win32', fileExists: () => true, spawn: () => child },
  })
  assert.equal(manager.startReplay('C:\\capture.apexrec', { speed: 0, strict: true, runId: 'strict-run' }).ok, true)
  child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'strict-run', type: 'status', state: 'replay-starting' })}\n`)
  child.stdout.write('{malformed-json}\n')
  child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'strict-run', type: 'status', state: 'replay-complete' })}\n`)
  await waitForImmediate()
  child.emit('close', 0)
  assert.equal(finished[0].complete, false)
  assert.match(finished[0].message, /without correlated completion/)
})

test('strict replay rejects decoder-invalid states but permits scoring before vehicle telemetry', async (t) => {
  await t.test('decoder invalid', async () => {
    const child = new FakeChild()
    const finished = []
    const manager = new LmuBridgeManager({
      app: { isPackaged: false }, broadcast: () => {}, onReplayFinished: (result) => finished.push(result),
      runtime: { platform: 'win32', fileExists: () => true, spawn: () => child },
    })
    manager.startReplay('C:\\capture.apexrec', { speed: 0, strict: true, runId: 'decoder-invalid-run' })
    child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'decoder-invalid-run', type: 'status', state: 'replay-starting' })}\n`)
    child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'decoder-invalid-run', type: 'status', state: 'invalid-data', message: 'private decoder detail' })}\n`)
    child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'decoder-invalid-run', type: 'status', state: 'replay-complete', recordingSha256: 'a'.repeat(64) })}\n`)
    await waitForImmediate()
    child.emit('close', 0)
    assert.equal(finished[0].complete, false)
    assert.equal(Object.hasOwn(finished[0], 'recordingSha256'), false)
  })

  await t.test('waiting for vehicle', async () => {
    const child = new FakeChild()
    const finished = []
    const manager = new LmuBridgeManager({
      app: { isPackaged: false }, broadcast: () => {}, onReplayFinished: (result) => finished.push(result),
      runtime: { platform: 'win32', fileExists: () => true, spawn: () => child },
    })
    manager.startReplay('C:\\capture.apexrec', { speed: 0, strict: true, runId: 'waiting-run' })
    child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'waiting-run', type: 'status', state: 'replay-starting' })}\n`)
    child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'waiting-run', type: 'status', state: 'waiting-for-vehicle', message: 'normal scoring-first lifecycle' })}\n`)
    child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'waiting-run', type: 'status', state: 'replay-complete', recordingSha256: 'b'.repeat(64) })}\n`)
    await waitForImmediate()
    child.emit('close', 0)
    assert.deepEqual(finished, [{ runId: 'waiting-run', complete: true, stopped: false, message: 'Replay complete', code: 0, recordingSha256: 'b'.repeat(64) }])
  })
})

test('private analysis replay does not expose its source path through recording state', async () => {
  const children = []
  const states = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: () => {}, broadcastRecording: (state) => states.push(state),
    runtime: { platform: 'win32', fileExists: () => true, spawn: () => { const child = new FakeChild(); children.push(child); return child } },
  })
  manager.start()
  const initial = manager.getRecordingState()
  const result = manager.startReplay('C:\\private\\driver-name.apexrec', { speed: 0, strict: true, runId: 'private-run', reportRecordingState: false })
  assert.equal(result.ok, true)
  const child = children[1]
  child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'private-run', type: 'status', state: 'replay-starting' })}\n`)
  child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'private-run', type: 'status', state: 'replay-complete' })}\n`)
  await waitForImmediate()
  child.emit('close', 0)
  assert.deepEqual(manager.getRecordingState(), initial)
  assert.deepEqual(states, [])
  assert.equal(children.length, 3, 'live bridge resumes without publishing the private replay path')
})

test('explicit private replay ownership blocks live restarts and redacts bridge diagnostics', async () => {
  const children = []
  const broadcasts = []
  const entries = []
  const finished = []
  let scheduledRestarts = 0
  const manager = new LmuBridgeManager({
    app: { isPackaged: false },
    broadcast: (message) => broadcasts.push(message),
    logger: { record: (...entry) => { entries.push(entry) } },
    onReplayFinished: (result) => finished.push(result),
    runtime: {
      platform: 'win32',
      fileExists: () => true,
      spawn: () => { const child = new FakeChild(); children.push(child); return child },
      setTimeout: () => { scheduledRestarts += 1; return 1 },
      clearTimeout: () => undefined,
    },
  })
  const filePath = 'C:\\private-driver-folder\\secret-driver-session.apexrec'
  const privateDriverToken = 'SECRET_PRIVATE_DRIVER_76561198000000000'
  const ownerId = 'analysis-import-operation-1'

  assert.equal(manager.start().ok, true)
  assert.deepEqual(manager.acquireReplayOwnership(ownerId, { privateReplay: true }), { ok: true, ownerId })
  assert.equal(children[0].killed, true)
  assert.match(broadcasts.at(-1).message, /Private recording analysis/)
  assert.equal(broadcasts.at(-1).state, 'waiting')
  assert.deepEqual(manager.start(), { ok: true, deferred: true })
  const waitingBroadcasts = broadcasts.length
  children[0].stdout.write(`${JSON.stringify({ source: 'lmu-shared-memory', type: 'telemetry', sequence: 99, session: {}, player: {}, opponents: [] })}\n`)
  children[0].stderr.write('late live diagnostic')
  children[0].emit('error', new Error('late live pipe error'))
  await waitForImmediate()
  assert.equal(broadcasts.length, waitingBroadcasts, 'buffered output from the killed live child cannot repopulate renderers')
  children[0].emit('exit', null)
  assert.equal(children.length, 1)
  assert.equal(scheduledRestarts, 0)

  const replay = manager.startReplay(filePath, { speed: 0, strict: true, runId: 'private-owned-run', reportRecordingState: false, ownershipId: ownerId })
  assert.deepEqual(replay, { ok: true, runId: 'private-owned-run' })
  const child = children[1]
  const split = Math.floor(filePath.length / 2)
  child.stderr.write(`decoder could not read ${filePath.slice(0, split)}`)
  child.stderr.write(filePath.slice(split))
  child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'private-owned-run', type: 'status', state: 'replay-starting', message: `Opening ${filePath} for ${privateDriverToken}`, arbitraryPrivateField: privateDriverToken })}\n`)
  child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'private-owned-run', type: 'diagnostic', level: 'error', message: `Could not decode scoring header for ${privateDriverToken}` })}\n`)
  child.stdout.write(`{"source":"recording-replay","runId":"private-owned-run","type":"status","driver":"${privateDriverToken}"\n`)
  child.emit('error', new Error(`pipe failure while reading ${filePath}`))
  child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'private-owned-run', type: 'status', state: 'replay-complete' })}\n`)
  await waitForImmediate()
  child.emit('close', 1)

  const emitted = JSON.stringify({ broadcasts, entries })
  assert.equal(emitted.includes(filePath), false)
  assert.equal(emitted.includes('secret-driver-session.apexrec'), false)
  assert.equal(emitted.includes('private-driver-folder'), false)
  assert.equal(emitted.includes(privateDriverToken), false)
  assert.match(emitted, /\[private recording\]/)
  assert.equal(broadcasts.some((message) => message.type === 'diagnostic' && message.source === 'recording-replay'), true)
  assert.equal(finished.length, 1)
  assert.equal(finished[0].complete, false)
  assert.equal(children.length, 2, 'external ownership keeps live telemetry paused through import finalization')

  assert.deepEqual(manager.releaseReplayOwnership(ownerId), { ok: true })
  assert.equal(children.length, 3, 'the prior live request resumes only after the import releases ownership')
})

test('replay completion waits for process close so final stdout is drained', async () => {
  const child = new FakeChild()
  const finished = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: () => {}, onReplayFinished: (result) => finished.push(result),
    runtime: { platform: 'win32', fileExists: () => true, spawn: () => child },
  })

  assert.equal(manager.startReplay('C:\\capture.apexrec', { speed: 0, strict: true, runId: 'drain-run' }).ok, true)
  child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'drain-run', type: 'status', state: 'replay-starting' })}\n`)
  await waitForImmediate()
  child.emit('exit', 0)
  child.stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'drain-run', type: 'status', state: 'replay-complete' })}\n`)
  await waitForImmediate()
  assert.deepEqual(finished, [])
  child.emit('close', 0)
  assert.deepEqual(finished, [{ runId: 'drain-run', complete: true, stopped: false, message: 'Replay complete', code: 0 }])
})

test('manager stop marks replay stopped and cannot resume live during shutdown', async () => {
  const children = []
  const finished = []
  let scheduledRestarts = 0
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: () => {}, onReplayFinished: (result) => finished.push(result),
    runtime: {
      platform: 'win32', fileExists: () => true,
      spawn: () => { const child = new FakeChild(); children.push(child); return child },
      setTimeout: () => { scheduledRestarts += 1; return 1 }, clearTimeout: () => undefined,
    },
  })

  manager.start()
  manager.startReplay('C:\\capture.apexrec', { speed: 0, strict: true, runId: 'shutdown-run' })
  children[1].stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'shutdown-run', type: 'status', state: 'replay-starting' })}\n`)
  children[1].stdout.write(`${JSON.stringify({ source: 'recording-replay', runId: 'shutdown-run', type: 'status', state: 'replay-complete' })}\n`)
  await waitForImmediate()
  manager.stop()
  assert.equal(children[1].killed, true)
  children[0].emit('exit', null)
  children[1].emit('close', 0)

  assert.equal(children.length, 2)
  assert.equal(scheduledRestarts, 0)
  assert.deepEqual(finished, [{ runId: 'shutdown-run', complete: false, stopped: true, message: 'Replay stopped', code: 0 }])
})
