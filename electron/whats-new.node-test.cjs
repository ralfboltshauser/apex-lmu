const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { WhatsNewService, compareSemver } = require('./whats-new.cjs')

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-whats-new-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return directory
}

test('initializes pending state and persists explicit acknowledgement atomically', async (t) => {
  const directory = await temporaryDirectory(t)
  const service = new WhatsNewService({ userDataPath: directory, currentVersion: '1.2.0', makeId: () => 'test' })
  assert.deepEqual(await service.getState(), { schemaVersion: 1, currentVersion: '1.2.0', firstSeenVersion: '1.2.0', lastAcknowledgedVersion: null })
  const result = await service.acknowledge('1.2.0')
  assert.equal(result.ok, true)
  const restarted = new WhatsNewService({ userDataPath: directory, currentVersion: '1.2.0' })
  assert.equal((await restarted.getState()).lastAcknowledgedVersion, '1.2.0')
  assert.equal((await fs.readdir(directory)).some((name) => name.includes('.tmp-')), false)
})

test('rejects invalid, older, future, and development versions', async (t) => {
  const service = new WhatsNewService({ userDataPath: await temporaryDirectory(t), currentVersion: '1.2.0' })
  for (const version of ['1.1.0', '1.3.0', 'dev', '1.2.0-beta.1']) assert.deepEqual(await service.acknowledge(version), { ok: false, reason: 'invalid-version' })
})

test('does not move acknowledgement backwards after a downgrade', async (t) => {
  const directory = await temporaryDirectory(t)
  const current = new WhatsNewService({ userDataPath: directory, currentVersion: '2.0.0' })
  await current.acknowledge('2.0.0')
  const downgraded = new WhatsNewService({ userDataPath: directory, currentVersion: '1.5.0' })
  const state = await downgraded.getState()
  assert.equal(state.lastAcknowledgedVersion, '2.0.0')
  assert.deepEqual(await downgraded.acknowledge('1.5.0'), { ok: true, alreadyAcknowledged: true, state })
})

test('preserves corrupt state and safely reinitializes', async (t) => {
  const directory = await temporaryDirectory(t)
  await fs.writeFile(path.join(directory, 'whats-new-state-v1.json'), '{broken')
  const events = []
  const service = new WhatsNewService({ userDataPath: directory, currentVersion: '1.0.0', logger: { record: (...args) => events.push(args) }, now: () => new Date('2026-07-12T20:00:00Z'), makeId: () => 'test' })
  assert.equal((await service.getState()).lastAcknowledgedVersion, null)
  assert.equal((await fs.readdir(directory)).some((name) => name.includes('.corrupt-')), true)
  assert.equal(events.some((event) => event[1] === 'whats-new' && event[2] === 'state-read-failed'), true)
})

test('compares strict semantic versions numerically', () => {
  assert.equal(compareSemver('1.10.0', '1.9.9') > 0, true)
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0)
})
