const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')
const { OverlayManager, applyConfigPatch, defaultConfig, normalizeConfig } = require('./overlay-manager.cjs')

function display(id, x, width, scaleFactor = 1, rotation = 0, label = '') {
  return { id, label, bounds: { x, y: 0, width, height: 1080 }, workArea: { x, y: 0, width, height: 1040 }, scaleFactor, rotation }
}

function harness(initialDisplays = [display(1, 0, 1920, 1, 0, 'Main')]) {
  const screen = new EventEmitter()
  screen.displays = initialDisplays
  screen.getAllDisplays = () => screen.displays
  screen.getPrimaryDisplay = () => screen.displays[0]
  const writes = []
  const fs = {
    readFile: async () => { const error = new Error('missing'); error.code = 'ENOENT'; throw error },
    mkdir: async () => {}, writeFile: async (name, value) => writes.push([name, value]), rename: async () => {},
  }
  const windows = []
  const intervals = new Map()
  let nextInterval = 1
  class MockWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false; this.shown = 0; this.bounds = null; this.mouse = null; this.moves = 0
      this.webContents = new EventEmitter(); this.webContents.id = windows.length + 10
      windows.push(this)
    }
    setAlwaysOnTop(value, level) { this.top = [value, level] }
    isAlwaysOnTop() { return this.top?.[0] === true }
    moveTop() { this.moves += 1 }
    setIgnoreMouseEvents(value, options) { this.mouse = [value, options] }
    loadFile() { return Promise.resolve() }
    showInactive() { this.shown += 1 }
    isDestroyed() { return this.destroyed }
    setBounds(value) { this.bounds = value }
    close() { this.destroyed = true; this.emit('closed') }
    destroy() { this.destroyed = true; this.emit('closed') }
  }
  const events = []
  const logs = []
  const manager = new OverlayManager({
    app: { getPath: () => '/tmp/apex-test' }, BrowserWindow: MockWindow, screen, fs,
    diagnostics: { record: async (...args) => logs.push(args) }, broadcast: (...args) => events.push(args),
    preloadPath: '/app/preload.cjs', rendererPath: '/app/index.html', readyTimeoutMs: 50,
    platform: 'win32',
    scheduleInterval: (callback, milliseconds) => { const id = nextInterval++; intervals.set(id, { callback, milliseconds }); return id },
    cancelInterval: (id) => intervals.delete(id),
  })
  return { manager, screen, windows, writes, events, logs, intervals, tickIntervals: () => { for (const { callback } of [...intervals.values()]) callback() } }
}

test('normalizes persisted config and rejects untrusted patches', () => {
  const config = normalizeConfig({ opacity: 9, widgets: [{ id: 'relative', enabled: false, bounds: { x: -2, y: 2, width: 4, height: 4 } }] })
  assert.equal(config.opacity, 1)
  assert.equal(config.widgets[0].enabled, false)
  assert.deepEqual(config.widgets[0].bounds, { x: 0, y: 0, width: 1, height: 1 })
  assert.throws(() => applyConfigPatch(defaultConfig(), { widgets: [{ id: 'radar', enabled: true }] }), /unsupported or invalid/)
  assert.throws(() => applyConfigPatch(defaultConfig(), { widgets: [{ id: 'relative', enabled: true }] }), /invalid bounds/)
  assert.throws(() => applyConfigPatch(defaultConfig(), { widgets: [{ id: 'relative', enabled: true, bounds: { x: 0, y: 0, width: 0.2, height: 0.2 } }, { id: 'relative', enabled: false, bounds: { x: 0, y: 0, width: 0.2, height: 0.2 } }] }), /duplicate/)
  assert.throws(() => applyConfigPatch(defaultConfig(), { widgets: [{ id: 'relative', enabled: true, bounds: { x: 0, y: 0, width: 0.2, height: 0.2 }, arbitrary: true }] }), /Unsupported overlay widget field/)
  assert.throws(() => applyConfigPatch(defaultConfig(), { arbitraryWindowOption: true }), /Unsupported/)
})

test('enumerates real display geometry and opens an inactive secure window on the selected display', async () => {
  const h = harness([display(1, 0, 1920, 1, 0, 'Primary'), display(2, -2560, 2560, 1.5, 90, 'Portrait')])
  await h.manager.initialize()
  await h.manager.setConfig({ displayId: '2' })
  const opening = h.manager.open()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.manager.markRendererReady(10).ok, true)
  const result = await opening
  assert.equal(result.ok, true)
  const window = h.windows[0]
  assert.equal(window.options.x, -2560)
  assert.equal(window.options.width, 2560)
  assert.equal(window.options.show, false)
  assert.equal(window.options.focusable, false)
  assert.equal(window.options.skipTaskbar, true)
  assert.deepEqual(window.bounds, { x: -2560, y: 0, width: 2560, height: 1080 })
  assert.equal(window.options.webPreferences.sandbox, true)
  assert.equal(window.shown, 1)
  assert.deepEqual(window.top, [true, 'screen-saver'])
  assert.equal(window.moves, 1)
  assert.equal(h.intervals.size, 1)
  assert.equal([...h.intervals.values()][0].milliseconds, 250)
  assert.deepEqual(window.mouse, [true, { forward: true }])
  assert.equal(h.manager.getDisplays()[1].rotation, 90)
  assert.equal(h.manager.getDisplays()[1].scaleFactor, 1.5)
  assert.equal((await h.manager.open()).ok, true)
  assert.equal(h.windows.length, 1)
  assert.equal(window.shown, 2)
  assert.equal(window.moves, 2)
  assert.equal(h.intervals.size, 1)
  h.tickIntervals()
  assert.equal(window.moves, 3)
})

test('close waits for the real closed state and reopen creates one fresh window', async () => {
  const h = harness()
  await h.manager.initialize()
  let opening = h.manager.open(); await new Promise((resolve) => setImmediate(resolve)); h.manager.markRendererReady(10); await opening
  const closed = await h.manager.close()
  assert.equal(closed.state.status, 'closed')
  assert.equal(h.windows[0].destroyed, true)
  assert.equal(h.intervals.size, 0)
  opening = h.manager.open(); await new Promise((resolve) => setImmediate(resolve)); h.manager.markRendererReady(11)
  assert.equal((await opening).ok, true)
  assert.equal(h.windows.length, 2)
  await h.manager.close()
})

test('uses label and topology in fallback fingerprints so identical resolutions do not select the wrong display', async () => {
  const h = harness([display(1, 0, 1920, 1, 0, 'Left'), display(2, 1920, 1920, 1, 0, 'Right')])
  await h.manager.initialize()
  await h.manager.setConfig({ displayId: '2' })
  h.screen.displays = [display(10, 0, 1920, 1, 0, 'Left'), display(20, 1920, 1920, 1, 0, 'Right')]
  await h.manager.onDisplaysChanged()
  assert.equal(h.manager.getConfig().displayId, '20')
  assert.equal(h.manager.getState().fallbackFrom, null)
})

test('falls back to primary on hot unplug, persists it, and moves the open window', async () => {
  const h = harness([display(1, 0, 1920), display(2, -1920, 1920)])
  await h.manager.initialize()
  await h.manager.setConfig({ displayId: '2' })
  const opening = h.manager.open(); await new Promise((resolve) => setImmediate(resolve)); h.manager.markRendererReady(10); await opening
  h.screen.displays = [display(1, 0, 2560, 1.25)]
  await h.manager.onDisplaysChanged()
  assert.equal(h.manager.getConfig().displayId, '1')
  assert.equal(h.manager.getState().fallbackFrom, '2')
  assert.deepEqual(h.windows[0].bounds, { x: 0, y: 0, width: 2560, height: 1080 })
  assert.ok(h.writes.length >= 3)
})

test('returns a failure when the renderer never becomes ready and closes deterministically', async () => {
  const h = harness()
  await h.manager.initialize()
  const result = await h.manager.open()
  assert.equal(result.ok, false)
  assert.equal(result.state.status, 'error')
  assert.match(result.reason, /timed out/)
  assert.equal(h.windows[0].destroyed, true)
  assert.equal((await h.manager.close()).ok, true)
})

test('renderer crash produces a failed open and destroys the unsafe window', async () => {
  const h = harness()
  await h.manager.initialize()
  const opening = h.manager.open()
  await new Promise((resolve) => setImmediate(resolve))
  h.windows[0].webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 9 })
  const result = await opening
  assert.equal(result.ok, false)
  assert.equal(result.state.status, 'error')
  assert.equal(h.windows[0].destroyed, true)
  assert.ok(h.logs.some((entry) => entry[2] === 'renderer-gone'))
})

test('rejects a configuration change when atomic persistence fails', async () => {
  const h = harness()
  await h.manager.initialize()
  const before = h.manager.getConfig()
  h.manager.fs.rename = async () => { throw new Error('disk full') }
  await assert.rejects(() => h.manager.setConfig({ opacity: 0.5 }), /could not be saved/)
  assert.deepEqual(h.manager.getConfig(), before)
  assert.equal(h.logs.at(-1)[2], 'config-write-failed')
})

test('keeps the app usable and reports failure when no display is available', async () => {
  const h = harness([])
  h.screen.getPrimaryDisplay = () => { throw new Error('no primary') }
  await h.manager.initialize()
  assert.deepEqual(h.manager.getDisplays(), [])
  const result = await h.manager.open()
  assert.equal(result.ok, false)
  assert.match(result.reason, /No connected display/)
  assert.equal(h.windows.length, 0)
})
