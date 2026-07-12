const { EventEmitter } = require('node:events')

const RELEASE_URL = 'https://github.com/ralfboltshauser/apex-lmu/releases'

function releaseNotesText(notes) {
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) return notes.map((item) => item.note || '').filter(Boolean).join('\n\n')
  return String(notes)
}

class UpdateManager extends EventEmitter {
  constructor({ app, broadcast, logger = null, updater = null, platform = process.platform, schedule = setTimeout }) {
    super()
    this.app = app
    this.broadcast = broadcast
    this.logger = logger
    this.platform = platform
    this.schedule = schedule
    this.updater = updater
    this.state = {
      status: !app.isPackaged ? 'development' : platform !== 'win32' ? 'unsupported' : 'idle',
      currentVersion: app.getVersion(),
      availableVersion: null,
      progress: null,
      message: !app.isPackaged ? 'Updates are checked only in an installed or packaged build.' : platform !== 'win32' ? 'Automatic updates are currently available for the Windows installer.' : 'Ready to check for updates.',
      releaseNotes: '',
      releaseUrl: RELEASE_URL,
    }
    if (this.state.status === 'idle') this.configure()
  }

  configure() {
    if (!this.updater) this.updater = require('electron-updater').autoUpdater
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.updater.allowPrerelease = true
    this.updater.allowDowngrade = false
    this.updater.fullChangelog = true
    this.updater.logger = {
      info: (message) => this.log('info', 'library', String(message)),
      warn: (message) => this.log('warning', 'library', String(message)),
      error: (message) => this.log('error', 'library', String(message)),
      debug: (message) => this.log('debug', 'library', String(message)),
    }
    this.updater.on('checking-for-update', () => this.setState({ status: 'checking', message: 'Checking GitHub Releases…', progress: null }))
    this.updater.on('update-available', (info) => this.setState({ status: 'available', availableVersion: info.version, message: `Apex ${info.version} is available.`, releaseNotes: releaseNotesText(info.releaseNotes), progress: null }))
    this.updater.on('update-not-available', (info) => this.setState({ status: 'up-to-date', availableVersion: info?.version || this.app.getVersion(), message: `Apex ${this.app.getVersion()} is up to date.`, progress: null }))
    this.updater.on('download-progress', (progress) => this.setState({ status: 'downloading', progress: { percent: progress.percent, transferred: progress.transferred, total: progress.total, bytesPerSecond: progress.bytesPerSecond }, message: `Downloading update… ${Math.floor(progress.percent)}%` }))
    this.updater.on('update-downloaded', (info) => this.setState({ status: 'downloaded', availableVersion: info.version, progress: { percent: 100, transferred: 1, total: 1, bytesPerSecond: 0 }, message: `Apex ${info.version} is ready to install.`, releaseNotes: releaseNotesText(info.releaseNotes) }))
    this.updater.on('error', (error) => this.setState({ status: 'error', message: error.message || String(error), error: { message: error.message || String(error), stack: error.stack || '', code: error.code || '' } }))
  }

  start() {
    if (this.state.status !== 'idle') return
    this.schedule(() => void this.check(true), 8000)
  }

  getState() { return this.state }

  async check(automatic = false) {
    if (!this.updater) return this.state
    this.log('info', automatic ? 'automatic-check' : 'manual-check', 'Checking for updates.', { currentVersion: this.app.getVersion() })
    try { await this.updater.checkForUpdates() }
    catch (error) { this.setState({ status: 'error', message: error.message || String(error), error: { message: error.message || String(error), stack: error.stack || '', code: error.code || '' } }) }
    return this.state
  }

  async download() {
    if (!this.updater || this.state.status !== 'available') return { ok: false, reason: 'no-update-available' }
    this.setState({ status: 'downloading', message: 'Starting update download…', progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 } })
    try { await this.updater.downloadUpdate(); return { ok: true } }
    catch (error) { this.setState({ status: 'error', message: error.message || String(error), error: { message: error.message || String(error), stack: error.stack || '', code: error.code || '' } }); return { ok: false, reason: 'download-failed' } }
  }

  install() {
    if (!this.updater || this.state.status !== 'downloaded') return { ok: false, reason: 'update-not-downloaded' }
    this.log('info', 'install-requested', 'Installing downloaded update.', { version: this.state.availableVersion })
    this.updater.quitAndInstall(false, true)
    return { ok: true }
  }

  setState(patch) {
    this.state = { ...this.state, ...patch }
    this.log(this.state.status === 'error' ? 'error' : 'info', `state-${this.state.status}`, this.state.message, { availableVersion: this.state.availableVersion, progress: this.state.progress, error: this.state.error })
    this.broadcast(this.state)
    this.emit('state', this.state)
  }

  log(level, event, message, details) { void this.logger?.record(level, 'updater', event, message, details) }
}

module.exports = { UpdateManager, RELEASE_URL, releaseNotesText }
