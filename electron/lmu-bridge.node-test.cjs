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
