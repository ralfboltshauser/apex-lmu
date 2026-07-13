const path = require('node:path')

const CONFIG_VERSION = 1
const SUPPORTED_WIDGETS = new Set(['relative', 'delta', 'inputs', 'fuel'])
const DEFAULT_WIDGETS = Object.freeze([
  { id: 'relative', enabled: true, bounds: { x: 0.014, y: 0.025, width: 0.168, height: 0.23 } },
  { id: 'delta', enabled: true, bounds: { x: 0.436, y: 0.025, width: 0.128, height: 0.105 } },
  { id: 'inputs', enabled: true, bounds: { x: 0.826, y: 0.855, width: 0.16, height: 0.12 } },
  { id: 'fuel', enabled: true, bounds: { x: 0.826, y: 0.025, width: 0.16, height: 0.13 } },
])

function finite(value) { return typeof value === 'number' && Number.isFinite(value) }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)) }
function displayFingerprint(display) {
  const bounds = display?.bounds || {}
  const label = String(display?.label || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
  return `display-v2|${label}|${bounds.x || 0},${bounds.y || 0},${bounds.width || 0}x${bounds.height || 0}|${finite(display?.scaleFactor) ? display.scaleFactor : 1}|${display?.rotation || 0}`
}
function describeDisplay(display, index, primaryId) {
  const bounds = display.bounds
  return {
    id: String(display.id),
    label: String(display.label || `Display ${index + 1}`),
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    workArea: { x: display.workArea.x, y: display.workArea.y, width: display.workArea.width, height: display.workArea.height },
    scaleFactor: display.scaleFactor,
    rotation: [0, 90, 180, 270].includes(display.rotation) ? display.rotation : 0,
    primary: String(display.id) === primaryId,
    fingerprint: displayFingerprint(display),
  }
}
function normalizeBounds(value, fallback) {
  if (!value || !finite(value.x) || !finite(value.y) || !finite(value.width) || !finite(value.height)) return { ...fallback }
  const width = clamp(value.width, 0.05, 1)
  const height = clamp(value.height, 0.04, 1)
  return { x: clamp(value.x, 0, 1 - width), y: clamp(value.y, 0, 1 - height), width, height }
}
function defaultConfig() {
  return { version: CONFIG_VERSION, displayId: null, displayFingerprint: null, opacity: 0.92, clickThrough: true, widgets: DEFAULT_WIDGETS.map((widget) => ({ ...widget, bounds: { ...widget.bounds } })) }
}
function normalizeConfig(value, fallback = defaultConfig()) {
  if (!value || typeof value !== 'object') return fallback
  const rawWidgets = Array.isArray(value.widgets) ? value.widgets : []
  const widgets = DEFAULT_WIDGETS.map((base) => {
    const raw = rawWidgets.find((candidate) => candidate && candidate.id === base.id)
    return { id: base.id, enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : base.enabled, bounds: normalizeBounds(raw?.bounds, base.bounds) }
  })
  return {
    version: CONFIG_VERSION,
    displayId: typeof value.displayId === 'string' && value.displayId ? value.displayId : null,
    displayFingerprint: typeof value.displayFingerprint === 'string' && value.displayFingerprint ? value.displayFingerprint : null,
    opacity: finite(value.opacity) ? clamp(value.opacity, 0.35, 1) : fallback.opacity,
    clickThrough: typeof value.clickThrough === 'boolean' ? value.clickThrough : fallback.clickThrough,
    widgets,
  }
}
function applyConfigPatch(current, patch) {
  if (!patch || typeof patch !== 'object') throw new TypeError('Overlay configuration patch must be an object.')
  const allowed = new Set(['displayId', 'opacity', 'clickThrough', 'widgets'])
  for (const key of Object.keys(patch)) if (!allowed.has(key)) throw new TypeError(`Unsupported overlay configuration field: ${key}`)
  const next = { ...current }
  if ('displayId' in patch) {
    if (typeof patch.displayId !== 'string' || !patch.displayId) throw new TypeError('displayId must be a non-empty string.')
    next.displayId = patch.displayId
  }
  if ('opacity' in patch) {
    if (!finite(patch.opacity) || patch.opacity < 0.35 || patch.opacity > 1) throw new TypeError('opacity must be between 0.35 and 1.')
    next.opacity = patch.opacity
  }
  if ('clickThrough' in patch) {
    if (typeof patch.clickThrough !== 'boolean') throw new TypeError('clickThrough must be a boolean.')
    next.clickThrough = patch.clickThrough
  }
  if ('widgets' in patch) {
    if (!Array.isArray(patch.widgets)) throw new TypeError('widgets must be an array.')
    const seen = new Set()
    for (const widget of patch.widgets) {
      if (!widget || !SUPPORTED_WIDGETS.has(widget.id) || typeof widget.enabled !== 'boolean') throw new TypeError('widgets contains an unsupported or invalid entry.')
      for (const key of Object.keys(widget)) if (!['id', 'enabled', 'bounds'].includes(key)) throw new TypeError(`Unsupported overlay widget field: ${key}`)
      if (seen.has(widget.id)) throw new TypeError(`widgets contains duplicate ${widget.id} entries.`)
      seen.add(widget.id)
      if (!widget.bounds || Object.keys(widget.bounds).some((key) => !['x', 'y', 'width', 'height'].includes(key)) || !finite(widget.bounds.x) || !finite(widget.bounds.y) || !finite(widget.bounds.width) || !finite(widget.bounds.height) || widget.bounds.x < 0 || widget.bounds.y < 0 || widget.bounds.width < 0.05 || widget.bounds.height < 0.04 || widget.bounds.x + widget.bounds.width > 1 || widget.bounds.y + widget.bounds.height > 1) throw new TypeError(`widgets contains invalid bounds for ${widget.id}.`)
    }
    next.widgets = current.widgets.map((widget) => {
      const update = patch.widgets.find((candidate) => candidate.id === widget.id)
      return update ? { ...widget, enabled: update.enabled, bounds: { ...update.bounds } } : widget
    })
  }
  return normalizeConfig(next, current)
}

class OverlayManager {
  constructor({ app, BrowserWindow, screen, fs, diagnostics, broadcast, developmentUrl = '', preloadPath, rendererPath, readyTimeoutMs = 8000, closeTimeoutMs = 2000 }) {
    this.app = app
    this.BrowserWindow = BrowserWindow
    this.screen = screen
    this.fs = fs
    this.diagnostics = diagnostics
    this.broadcast = broadcast
    this.developmentUrl = developmentUrl
    this.preloadPath = preloadPath
    this.rendererPath = rendererPath
    this.readyTimeoutMs = readyTimeoutMs
    this.closeTimeoutMs = closeTimeoutMs
    this.configPath = path.join(app.getPath('userData'), 'overlay-config-v1.json')
    this.config = defaultConfig()
    this.state = { status: 'closed', displayId: null, message: '', fallbackFrom: null }
    this.window = null
    this.openPromise = null
    this.rendererReady = null
    this.closePromise = null
    this.topologyListeners = []
  }

  async initialize() {
    try {
      const text = await this.fs.readFile(this.configPath, 'utf8')
      this.config = normalizeConfig(JSON.parse(text))
    } catch (error) {
      if (error?.code !== 'ENOENT') await this.record('warning', 'config-read-failed', 'Overlay configuration could not be read; defaults were applied.', error)
    }
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
      const listener = () => void this.onDisplaysChanged()
      this.screen.on(event, listener)
      this.topologyListeners.push([event, listener])
    }
    try { await this.resolveDisplay(true) } catch (error) {
      this.state = { status: 'error', displayId: null, message: error.message, fallbackFrom: null }
      await this.record('warning', 'no-display', 'No display was available during overlay initialization.', error)
    }
    return this
  }

  getInternalDisplays() {
    const displays = this.screen.getAllDisplays()
    let primaryId = ''
    try { primaryId = String(this.screen.getPrimaryDisplay().id) } catch { /* A transient headless session can report no primary display. */ }
    return displays.map((display, index) => describeDisplay(display, index, primaryId))
  }
  getDisplays() {
    return this.getInternalDisplays().map(({ fingerprint: _fingerprint, ...display }) => display)
  }
  getConfig() { return JSON.parse(JSON.stringify(this.config)) }
  getState() { return { ...this.state } }

  async setConfig(patch) {
    const previous = this.config
    const candidate = applyConfigPatch(previous, patch)
    if (candidate.displayId) {
      const display = this.getInternalDisplays().find((entry) => entry.id === candidate.displayId)
      if (!display) throw new TypeError('The selected display is no longer connected.')
      candidate.displayFingerprint = display.fingerprint
    }
    this.config = candidate
    try { await this.persistConfig() } catch (error) {
      this.config = previous
      await this.record('error', 'config-write-failed', 'Overlay configuration could not be saved.', error)
      throw new Error('Overlay configuration could not be saved.')
    }
    await this.applyWindowConfig()
    this.broadcast('apex:overlay-config', this.getConfig())
    return this.getConfig()
  }

  async persistConfig() {
    await this.fs.mkdir(path.dirname(this.configPath), { recursive: true })
    const temporary = `${this.configPath}.tmp`
    await this.fs.writeFile(temporary, `${JSON.stringify(this.config, null, 2)}\n`, 'utf8')
    await this.fs.rename(temporary, this.configPath)
  }

  async resolveDisplay(persistFallback = false) {
    const displays = this.getInternalDisplays()
    if (!displays.length) throw new Error('No connected display is available.')
    let selected = displays.find((display) => display.id === this.config.displayId)
    if (!selected && this.config.displayFingerprint) selected = displays.find((display) => display.fingerprint === this.config.displayFingerprint)
    const fallbackFrom = this.config.displayId && !selected ? this.config.displayId : null
    selected ||= displays.find((display) => display.primary) || displays[0]
    if (this.config.displayId !== selected.id || this.config.displayFingerprint !== selected.fingerprint) {
      this.config = { ...this.config, displayId: selected.id, displayFingerprint: selected.fingerprint }
      if (persistFallback) await this.persistConfig().catch((error) => this.record('warning', 'config-write-failed', 'The display fallback could not be saved.', error))
    }
    return { display: selected, fallbackFrom }
  }

  async onDisplaysChanged() {
    try {
      const { display, fallbackFrom } = await this.resolveDisplay(true)
      if (this.window && !this.window.isDestroyed()) this.window.setBounds(display.bounds)
      if (fallbackFrom) this.setState({ ...this.state, displayId: display.id, fallbackFrom, message: `Display ${fallbackFrom} disconnected; moved to ${display.label}.` })
      this.broadcast('apex:displays-changed', this.getDisplays())
      this.broadcast('apex:overlay-config', this.getConfig())
    } catch (error) {
      this.setState({ status: 'error', displayId: null, message: error.message, fallbackFrom: null })
      await this.record('error', 'display-enumeration-failed', 'Displays could not be enumerated.', error)
    }
  }

  async open() {
    if (this.window && !this.window.isDestroyed() && this.state.status === 'ready') {
      this.window.showInactive()
      return { ok: true, state: this.getState() }
    }
    if (this.openPromise) return this.openPromise
    this.openPromise = this.createAndOpen().catch(async (error) => {
      this.setState({ status: 'error', displayId: null, message: error.message, fallbackFrom: null })
      await this.record('error', 'open-failed', error.message, error)
      return { ok: false, reason: error.message, state: this.getState() }
    }).finally(() => { this.openPromise = null })
    return this.openPromise
  }

  async createAndOpen() {
    const { display, fallbackFrom } = await this.resolveDisplay(true)
    this.setState({ status: 'opening', displayId: display.id, message: '', fallbackFrom })
    const window = new this.BrowserWindow({
      ...display.bounds,
      show: false,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      backgroundColor: '#00000000',
      webPreferences: { preload: this.preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    this.window = window
    // Windows can clamp a non-resizable BrowserWindow's constructor bounds to
    // the taskbar-excluding work area. Reapply the selected display's full DIP
    // bounds after creation so the HUD canvas still covers borderless LMU.
    window.setBounds(display.bounds)
    window.setAlwaysOnTop(true, 'screen-saver')
    window.setIgnoreMouseEvents(this.config.clickThrough, { forward: true })
    window.on('closed', () => {
      if (this.window === window) this.window = null
      if (this.state.status !== 'error') this.setState({ status: 'closed', displayId: null, message: '', fallbackFrom: null })
    })
    window.webContents.on('did-fail-load', (_event, code, description, url) => this.failWindow(window, 'load-failed', `${description} (${code})`, { url }))
    window.webContents.on('render-process-gone', (_event, details) => this.failWindow(window, 'renderer-gone', 'Overlay renderer stopped.', details))
    this.rendererReady = this.waitForRenderer(window)
    try {
      const load = this.developmentUrl
        ? window.loadURL(`${this.developmentUrl}/?overlay=1`)
        : window.loadFile(this.rendererPath, { query: { overlay: '1' } })
      await Promise.all([load, this.rendererReady.promise])
      if (window.isDestroyed()) throw new Error('Overlay window closed before it became ready.')
      window.showInactive()
      this.setState({ status: 'ready', displayId: display.id, message: '', fallbackFrom })
      await this.record('info', 'ready', 'Overlay opened.', { displayId: display.id, bounds: display.bounds })
      return { ok: true, state: this.getState() }
    } catch (error) {
      await this.failWindow(window, 'open-failed', error.message, error)
      return { ok: false, reason: error.message, state: this.getState() }
    } finally { this.rendererReady = null }
  }

  waitForRenderer(window) {
    let resolve
    let reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    const timer = setTimeout(() => reject(new Error('Overlay renderer readiness timed out.')), this.readyTimeoutMs)
    return { webContentsId: window.webContents.id, promise, resolve: () => { clearTimeout(timer); resolve() }, reject: (error) => { clearTimeout(timer); reject(error) } }
  }

  markRendererReady(webContentsId) {
    if (!this.rendererReady || this.rendererReady.webContentsId !== webContentsId) return { ok: false }
    this.rendererReady.resolve()
    return { ok: true }
  }

  async applyWindowConfig() {
    const window = this.window
    if (!window || window.isDestroyed()) return
    const { display } = await this.resolveDisplay(false)
    window.setBounds(display.bounds)
    window.setIgnoreMouseEvents(this.config.clickThrough, { forward: true })
    this.setState({ ...this.state, displayId: display.id })
  }

  async close() {
    if (this.closePromise) return this.closePromise
    const window = this.window
    this.rendererReady?.reject(new Error('Overlay closed.'))
    if (!window || window.isDestroyed()) {
      this.setState({ status: 'closed', displayId: null, message: '', fallbackFrom: null })
      return { ok: true, state: this.getState() }
    }
    this.closePromise = new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ ok: true, state: this.getState() })
      }
      window.once('closed', finish)
      const timer = setTimeout(() => {
        if (!window.isDestroyed()) window.destroy()
        finish()
      }, this.closeTimeoutMs)
      window.close()
      if (window.isDestroyed()) finish()
    }).finally(() => { this.closePromise = null })
    return this.closePromise
  }

  async failWindow(window, code, message, details) {
    if (this.window !== window) return
    const error = details instanceof Error ? details : new Error(message)
    this.rendererReady?.reject(error)
    this.setState({ status: 'error', displayId: this.config.displayId, message, fallbackFrom: null })
    await this.record('error', code, message, details)
    if (!window.isDestroyed()) window.destroy()
  }

  setState(state) {
    this.state = state
    this.broadcast('apex:overlay-state', this.getState())
  }
  record(level, code, message, details) { return this.diagnostics?.record(level, 'overlay', code, message, details) || Promise.resolve() }

  async shutdown() {
    for (const [event, listener] of this.topologyListeners) this.screen.removeListener(event, listener)
    this.topologyListeners = []
    await this.close()
  }
}

module.exports = { OverlayManager, CONFIG_VERSION, SUPPORTED_WIDGETS, defaultConfig, normalizeConfig, applyConfigPatch, displayFingerprint }
