const path = require('node:path')
const fs = require('node:fs/promises')

const EMPTY_STATE = Object.freeze({ schemaVersion: 1, credential: null, items: {}, outbox: [], eventCursor: 0, notifiedMessageIds: [], unreadFeedbackIds: [] })

function initialState() {
  return structuredClone(EMPTY_STATE)
}

function validateState(value) {
  if (!value || value.schemaVersion !== 1 || typeof value.items !== 'object' || !Array.isArray(value.outbox)) throw new Error('Feedback cache has an unsupported structure')
  return { ...initialState(), ...value, items: value.items || {}, outbox: value.outbox || [] }
}

class FeedbackStore {
  constructor({ userDataPath, runtime = {} }) {
    this.fs = runtime.fs ?? fs
    this.dir = path.join(userDataPath, 'feedback')
    this.filePath = path.join(this.dir, 'state.json')
    this.state = initialState()
    this.ready = null
    this.writeChain = Promise.resolve()
  }

  async initialize() {
    if (this.ready) return this.ready
    this.ready = (async () => {
      await this.fs.mkdir(this.dir, { recursive: true, mode: 0o700 })
      try { this.state = validateState(JSON.parse(await this.fs.readFile(this.filePath, 'utf8'))) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      return this.snapshot()
    })()
    return this.ready
  }

  snapshot() { return structuredClone(this.state) }

  async mutate(change) {
    await this.initialize()
    const next = change(this.snapshot())
    this.state = validateState(next)
    this.writeChain = this.writeChain.then(async () => {
      const temporary = `${this.filePath}.${process.pid}.tmp`
      await this.fs.writeFile(temporary, `${JSON.stringify(this.state)}\n`, { mode: 0o600 })
      await this.fs.rename(temporary, this.filePath)
    })
    await this.writeChain
    return this.snapshot()
  }
}

module.exports = { FeedbackStore, EMPTY_STATE, initialState, validateState }
