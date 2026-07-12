const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function parseSemver(value) {
  const match = typeof value === 'string' ? semverPattern.exec(value) : null
  return match ? match.slice(1).map(Number) : null
}

function compareSemver(left, right) {
  const a = parseSemver(left)
  const b = parseSemver(right)
  if (!a || !b) throw new Error('Invalid semantic version')
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index]
  return 0
}

function validState(value) {
  return Boolean(value && value.schemaVersion === 1 && parseSemver(value.firstSeenVersion)
    && (value.lastAcknowledgedVersion === null || parseSemver(value.lastAcknowledgedVersion))
    && typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt)))
}

class WhatsNewService {
  constructor({ userDataPath, currentVersion, logger = null, filesystem = fs, makeId = randomUUID, now = () => new Date() }) {
    if (!path.isAbsolute(userDataPath)) throw new Error('Whats-new user data path must be absolute')
    if (!parseSemver(currentVersion)) throw new Error('Whats-new current version must be strict SemVer')
    this.currentVersion = currentVersion
    this.logger = logger
    this.fs = filesystem
    this.makeId = makeId
    this.now = now
    this.filePath = path.join(userDataPath, 'whats-new-state-v1.json')
    this.loaded = null
  }

  async getState() {
    if (!this.loaded) this.loaded = await this.readOrInitialize()
    return this.publicState(this.loaded)
  }

  async acknowledge(version) {
    if (!parseSemver(version) || version !== this.currentVersion) return { ok: false, reason: 'invalid-version' }
    const current = this.loaded || await this.readOrInitialize()
    if (current.lastAcknowledgedVersion && compareSemver(current.lastAcknowledgedVersion, version) >= 0) {
      this.loaded = current
      return { ok: true, alreadyAcknowledged: true, state: this.publicState(current) }
    }
    const next = { ...current, lastAcknowledgedVersion: version, updatedAt: this.now().toISOString() }
    await this.writeAtomic(next)
    this.loaded = next
    this.log('info', 'acknowledged', 'Bundled release notes acknowledged.', { version })
    return { ok: true, state: this.publicState(next) }
  }

  publicState(state) {
    return { schemaVersion: 1, currentVersion: this.currentVersion, firstSeenVersion: state.firstSeenVersion, lastAcknowledgedVersion: state.lastAcknowledgedVersion }
  }

  async readOrInitialize() {
    try {
      const value = JSON.parse(await this.fs.readFile(this.filePath, 'utf8'))
      if (!validState(value)) throw new Error('state contract is invalid')
      return value
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        const preserved = `${this.filePath}.corrupt-${this.now().toISOString().replace(/[:.]/g, '-')}`
        try { await this.fs.rename(this.filePath, preserved) } catch {}
        this.log('error', 'state-read-failed', 'Release-note state was invalid and was preserved for diagnostics.', { error: error.message, preserved: path.basename(preserved) })
      }
      const initial = { schemaVersion: 1, firstSeenVersion: this.currentVersion, lastAcknowledgedVersion: null, updatedAt: this.now().toISOString() }
      await this.writeAtomic(initial)
      return initial
    }
  }

  async writeAtomic(value) {
    const directory = path.dirname(this.filePath)
    const temporary = `${this.filePath}.tmp-${process.pid}-${this.makeId()}`
    await this.fs.mkdir(directory, { recursive: true })
    try {
      await this.fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await this.fs.rename(temporary, this.filePath)
    } catch (error) {
      try { await this.fs.rm(temporary, { force: true }) } catch {}
      this.log('error', 'state-write-failed', 'Release-note acknowledgement could not be saved.', { error: error.message })
      throw error
    }
  }

  log(level, event, message, details) { void this.logger?.record(level, 'whats-new', event, message, details) }
}

module.exports = { WhatsNewService, compareSemver, parseSemver }
