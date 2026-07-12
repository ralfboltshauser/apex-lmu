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
  selfTestChild.stdout.write(`${JSON.stringify({ protocolVersion: 1, source: 'self-test', runId: 'self-test-run-1', type: 'status', state: 'self-test-starting' })}\n`)
  selfTestChild.stdout.write(`${JSON.stringify({ protocolVersion: 1, source: 'self-test', runId: 'self-test-run-1', type: 'telemetry', sequence: 1, session: {}, player: {}, opponents: [] })}\n`)
  selfTestChild.stdout.write(`${JSON.stringify({ protocolVersion: 1, source: 'self-test', runId: 'self-test-run-1', type: 'status', state: 'self-test-complete', frames: 1 })}\n`)
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
  child.stdout.write(`${JSON.stringify({ protocolVersion: 1, source: 'self-test', runId: 'wrong-run', type: 'telemetry' })}\n`)
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
  const manager = new LmuBridgeManager({
    app: { isPackaged: false },
    broadcast: () => {},
    logger: { record: (...entry) => { entries.push(entry) } },
    runtime: { platform: 'win32', fileExists: () => true, spawn: () => child },
  })

  manager.start()
  child.stdout.write(`${JSON.stringify({ protocolVersion: 1, source: 'lmu-shared-memory', type: 'status', state: 'invalid-data', message: 'LMU maximum lap count is invalid' })}\n`)
  child.stdout.write(`${JSON.stringify({ protocolVersion: 1, source: 'lmu-shared-memory', type: 'telemetry', sequence: 1, session: {}, player: {}, opponents: [] })}\n`)
  await waitForImmediate()

  const status = entries.find((entry) => entry[2] === 'status')
  assert.ok(status)
  assert.equal(status[0], 'warning')
  assert.match(status[3], /maximum lap count/)
  assert.equal(entries.filter((entry) => entry[2] === 'status').length, 1)
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

test('replay temporarily replaces live telemetry and resumes it afterwards', async () => {
  const children = []
  const broadcasts = []
  const manager = new LmuBridgeManager({
    app: { isPackaged: false }, broadcast: (message) => broadcasts.push(message),
    runtime: { platform: 'win32', fileExists: () => true, spawn: () => { const child = new FakeChild(); children.push(child); return child } },
  })
  manager.start()
  assert.equal(manager.startReplay('C:\\captures\\practice.apexrec').ok, true)
  assert.equal(children[0].killed, true)
  children[1].stdout.write(`${JSON.stringify({ source: 'recording-replay', type: 'telemetry', sequence: 1, session: {}, player: {}, opponents: [] })}\n`)
  await waitForImmediate()
  assert.equal(broadcasts.at(-1).source, 'recording-replay')
  children[1].emit('exit', 0)
  assert.equal(children.length, 3, 'live bridge restarts after replay')
})
