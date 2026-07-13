const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { UpdateManager, releaseNotesText } = require('./updater.cjs')

class FakeUpdater extends EventEmitter {
  constructor() { super(); this.checks = 0; this.downloads = 0; this.installs = 0 }
  async checkForUpdates() { this.checks += 1 }
  async downloadUpdate() { this.downloads += 1 }
  quitAndInstall() { this.installs += 1 }
}

function manager(updater = new FakeUpdater()) {
  const states = []
  return { updater, states, value: new UpdateManager({ app: { isPackaged: true, getVersion: () => '1.0.0' }, platform: 'win32', updater, broadcast: (state) => states.push(state), schedule: () => 1 }) }
}

test('configures explicit prerelease downloads and reports availability', () => {
  const { updater, states, value } = manager()
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.allowPrerelease, true)
  assert.equal(updater.allowDowngrade, false)
  updater.emit('update-available', { version: '1.1.0', releaseNotes: 'Safer discovery' })
  assert.equal(value.getState().status, 'available')
  assert.equal(value.getState().availableVersion, '1.1.0')
  assert.equal(states.at(-1).releaseNotes, 'Safer discovery')
})

test('downloads only after an available update and installs only after completion', async () => {
  const { updater, value } = manager()
  assert.deepEqual(await value.download(), { ok: false, reason: 'no-update-available' })
  updater.emit('update-available', { version: '1.1.0' })
  assert.deepEqual(await value.download(), { ok: true })
  assert.equal(updater.downloads, 1)
  updater.emit('download-progress', { percent: 42.8, transferred: 42, total: 100, bytesPerSecond: 10 })
  assert.equal(value.getState().progress.percent, 42.8)
  updater.emit('update-downloaded', { version: '1.1.0' })
  assert.deepEqual(await value.install(), { ok: true })
  assert.equal(updater.installs, 1)
})

test('does not start the installer when durable data cannot flush', async () => {
  const updater = new FakeUpdater()
  const value = new UpdateManager({ app: { isPackaged: true, getVersion: () => '1.0.0' }, platform: 'win32', updater, broadcast: () => {}, schedule: () => 1, beforeInstall: async () => { throw new Error('disk failure') } })
  updater.emit('update-available', { version: '1.1.0' })
  await value.download()
  updater.emit('update-downloaded', { version: '1.1.0' })
  assert.deepEqual(await value.install(), { ok: false, reason: 'data-flush-failed' })
  assert.equal(updater.installs, 0)
  assert.equal(value.getState().status, 'error')
})

test('does not initialize an updater in development', () => {
  const value = new UpdateManager({ app: { isPackaged: false, getVersion: () => '1.0.0' }, platform: 'win32', broadcast: () => {} })
  assert.equal(value.getState().status, 'development')
})

test('normalizes array release notes', () => {
  assert.equal(releaseNotesText([{ version: '1.1.0', note: 'One' }, { version: '1.2.0', note: 'Two' }]), 'One\n\nTwo')
})
