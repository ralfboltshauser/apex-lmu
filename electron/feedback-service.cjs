const crypto = require('node:crypto')
const { FeedbackClient } = require('./feedback-client.cjs')
const { FeedbackStore } = require('./feedback-store.cjs')

const POLL_INTERVAL_MS = 15_000
const MAX_OUTBOX = 20

function encryptCredential(safeStorage, value) {
  if (safeStorage?.isEncryptionAvailable?.()) return `safe:${safeStorage.encryptString(value).toString('base64')}`
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`
}

function decryptCredential(safeStorage, value) {
  if (!value) return null
  if (value.startsWith('safe:')) return safeStorage.decryptString(Buffer.from(value.slice(5), 'base64'))
  if (value.startsWith('plain:')) return Buffer.from(value.slice(6), 'base64').toString('utf8')
  return null
}

function publicState(state) {
  const items = Object.values(state.items).sort((left, right) => String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt)))
  return {
    status: state.outbox.some((entry) => entry.lastError) ? 'error' : state.outbox.length ? 'syncing' : 'ready',
    pending: state.outbox.length,
    unread: state.unreadFeedbackIds.length,
    needsAnswer: items.filter((item) => item.status === 'needs_user_answer').length,
    items,
  }
}

class FeedbackService {
  constructor({ app, safeStorage, client, store, logger, notify = () => {}, broadcast = () => {}, now = () => new Date(), setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
    this.app = app
    this.safeStorage = safeStorage
    this.client = client ?? new FeedbackClient()
    this.store = store ?? new FeedbackStore({ userDataPath: app.getPath('userData') })
    this.logger = logger
    this.notify = notify
    this.broadcast = broadcast
    this.now = now
    this.setIntervalFn = setIntervalFn
    this.clearIntervalFn = clearIntervalFn
    this.timer = null
    this.syncing = null
  }

  async initialize() {
    await this.store.initialize()
    if (this.store.state.credential) {
      await this.sync().catch((error) => this.log('warning', 'initial-sync-failed', error.message))
      this.timer = this.setIntervalFn(() => void this.sync().catch((error) => this.log('warning', 'poll-failed', error.message)), POLL_INTERVAL_MS)
      this.timer.unref?.()
    }
    return this.getState()
  }

  token() { return decryptCredential(this.safeStorage, this.store.state.credential) }

  async ensureToken() {
    const existing = this.token()
    if (existing) return existing
    const credential = await this.client.register({ appVersion: this.app.getVersion(), platform: process.platform })
    await this.store.mutate((state) => ({ ...state, credential: encryptCredential(this.safeStorage, credential.token) }))
    if (!this.timer) {
      this.timer = this.setIntervalFn(() => void this.sync().catch((error) => this.log('warning', 'poll-failed', error.message)), POLL_INTERVAL_MS)
      this.timer.unref?.()
    }
    return credential.token
  }

  getState() { return publicState(this.store.state) }
  list() { return this.getState().items }
  get(feedbackId) { return this.store.state.items[feedbackId] ?? null }

  async submit(payload) {
    if (!payload || typeof payload.comment !== 'string' || !payload.comment.trim() || payload.comment.length > 10_000) throw new Error('Feedback comment is required and must be at most 10,000 characters')
    const clientRequestId = payload.clientRequestId || crypto.randomUUID()
    if (this.store.state.outbox.length >= MAX_OUTBOX) throw new Error('Feedback outbox is full; reconnect before adding more feedback')
    const localId = `local:${clientRequestId}`
    const createdAt = this.now().toISOString()
    const item = { id: localId, reference: 'LOCAL', clientRequestId, status: 'new', revision: 0, firstMessage: payload.comment.trim(), context: payload.context, messages: [{ id: clientRequestId, actor: 'human', kind: 'comment', body: payload.comment.trim(), createdAt }], attachments: [], createdAt, updatedAt: createdAt, syncState: 'queued' }
    await this.store.mutate((state) => ({ ...state, items: { ...state.items, [localId]: item }, outbox: [...state.outbox, { id: crypto.randomUUID(), type: 'submit', localId, payload: { ...payload, clientRequestId, comment: payload.comment.trim() }, attempts: 0, createdAt }] }))
    this.changed()
    await this.sync().catch(() => {})
    return this.get(localId) ?? this.list().find((candidate) => candidate.clientRequestId === clientRequestId)
  }

  async reply(feedbackId, body, expectedRevision) {
    if (!feedbackId || feedbackId.startsWith('local:')) throw new Error('Wait for the original feedback to synchronize before replying')
    if (typeof body !== 'string' || !body.trim() || body.length > 10_000) throw new Error('Reply is required and must be at most 10,000 characters')
    const action = { id: crypto.randomUUID(), type: 'reply', feedbackId, payload: { clientMessageId: crypto.randomUUID(), body: body.trim(), expectedRevision }, attempts: 0, createdAt: this.now().toISOString() }
    await this.store.mutate((state) => ({ ...state, outbox: [...state.outbox, action] }))
    this.changed()
    await this.sync().catch(() => {})
    return this.get(feedbackId)
  }

  async reopen(feedbackId, expectedRevision) {
    const action = { id: crypto.randomUUID(), type: 'reopen', feedbackId, payload: { expectedRevision }, attempts: 0, createdAt: this.now().toISOString() }
    await this.store.mutate((state) => ({ ...state, outbox: [...state.outbox, action] }))
    this.changed()
    await this.sync().catch(() => {})
    return this.get(feedbackId)
  }

  async markRead(feedbackId) {
    await this.store.mutate((state) => ({ ...state, unreadFeedbackIds: state.unreadFeedbackIds.filter((id) => id !== feedbackId) }))
    this.changed()
    return this.getState()
  }

  async sync() {
    if (this.syncing) return this.syncing
    this.syncing = this.performSync().finally(() => { this.syncing = null })
    return this.syncing
  }

  async performSync() {
    const token = this.store.state.outbox.length || this.store.state.credential ? await this.ensureToken() : null
    if (!token) return this.getState()
    for (const action of [...this.store.state.outbox]) {
      try {
        let item
        if (action.type === 'submit') item = await this.client.submit(token, action.payload)
        if (action.type === 'reply') item = await this.client.reply(token, action.feedbackId, action.payload)
        if (action.type === 'reopen') item = await this.client.reopen(token, action.feedbackId, action.payload.expectedRevision)
        await this.store.mutate((state) => {
          const items = { ...state.items }
          if (action.localId) delete items[action.localId]
          if (item) items[item.id] = { ...item, syncState: 'synced' }
          return { ...state, items, outbox: state.outbox.filter((entry) => entry.id !== action.id) }
        })
      } catch (error) {
        await this.store.mutate((state) => ({ ...state, outbox: state.outbox.map((entry) => entry.id === action.id ? { ...entry, attempts: entry.attempts + 1, lastError: error.message } : entry) }))
        if (error.status === 401 || error.status === 409 || error.status === 413) break
        throw error
      }
    }
    const [items, eventResult] = await Promise.all([this.client.list(token), this.client.events(token, this.store.state.eventCursor)])
    const nextCursor = eventResult.events.reduce((cursor, event) => Math.max(cursor, event.id), this.store.state.eventCursor)
    const itemMap = { ...this.store.state.items, ...Object.fromEntries(items.map((item) => [item.id, { ...this.store.state.items[item.id], ...item, syncState: 'synced' }])) }
    const agentEvents = eventResult.events.filter((event) => event.actor === 'agent' && ['agent.question', 'agent.message'].includes(event.eventType) && event.payload?.messageId && !this.store.state.notifiedMessageIds.includes(event.payload.messageId))
    await this.store.mutate((state) => ({
      ...state,
      items: itemMap,
      eventCursor: nextCursor,
      notifiedMessageIds: [...state.notifiedMessageIds, ...agentEvents.map((event) => event.payload.messageId)].slice(-1000),
      unreadFeedbackIds: [...new Set([...state.unreadFeedbackIds, ...agentEvents.map((event) => event.feedbackId)])],
    }))
    for (const event of agentEvents) this.notify({ feedbackId: event.feedbackId, kind: event.payload.kind || 'comment', body: String(event.payload.body || '') })
    this.changed()
    return this.getState()
  }

  changed() { this.broadcast('apex:feedback-changed', this.getState()) }
  log(level, event, message) { void this.logger?.record(level, 'feedback', event, message) }
  stop() { if (this.timer) this.clearIntervalFn(this.timer); this.timer = null }
}

module.exports = { FeedbackService, encryptCredential, decryptCredential, publicState, POLL_INTERVAL_MS }
