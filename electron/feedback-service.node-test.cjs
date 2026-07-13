const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { FeedbackService } = require('./feedback-service.cjs')
const { FeedbackStore } = require('./feedback-store.cjs')

function context() {
  return { view: 'home', appVersion: '0.2.3', language: 'en', platform: 'win32', source: 'offline', screen: { width: 1920, height: 1080, scaleFactor: 1 }, viewport: { width: 1512, height: 982 }, element: { selector: '.hero', tagName: 'section', rect: { x: 1, y: 2, width: 3, height: 4 } }, redactionVersion: 1 }
}

test('feedback service queues offline and later replaces the local item', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-feedback-service-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  let online = false
  const client = {
    register: async () => ({ token: 'install.secret' }),
    submit: async (_token, payload) => { if (!online) { const error = new Error('offline'); error.code = 'network'; throw error } return { id: 'remote-one', clientRequestId: payload.clientRequestId, status: 'new', revision: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' } },
    get: async () => ({ id: 'remote-one', reference: 'APX-000001', status: 'needs_user_answer', revision: 1, firstMessage: 'Spacing is wrong', messages: [{ id: 'question', actor: 'agent', kind: 'question', body: 'Where?', createdAt: '2026-01-02' }], attachments: [], createdAt: '2026-01-01', updatedAt: '2026-01-02' }),
    attachment: async () => ({ dataUrl: 'data:image/jpeg;base64,/9j/' }),
    list: async () => [], events: async () => ({ events: [] }),
  }
  const service = new FeedbackService({ app: { getPath: () => root, getVersion: () => '0.2.3' }, safeStorage: { isEncryptionAvailable: () => false }, client, store: new FeedbackStore({ userDataPath: root }), setIntervalFn: () => ({ unref() {} }), clearIntervalFn: () => {} })
  await service.initialize()
  const local = await service.submit({ comment: 'Spacing is wrong', context: context() })
  assert.match(local.id, /^local:/)
  assert.equal(service.getState().pending, 1)
  online = true
  await service.sync()
  assert.equal(service.getState().pending, 0)
  assert.equal(service.list()[0].id, 'remote-one')
  const detail = await service.load('remote-one')
  assert.equal(detail.messages[0].body, 'Where?')
  assert.equal(service.get('remote-one').revision, 1)
  assert.deepEqual(await service.attachment('remote-one', 'shot-one'), { dataUrl: 'data:image/jpeg;base64,/9j/' })
})

test('feedback service resumes a credential-less persisted outbox on startup', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-feedback-restart-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const store = new FeedbackStore({ userDataPath: root })
  await store.initialize()
  await store.mutate((state) => ({
    ...state,
    items: { 'local:request-one': { id: 'local:request-one', clientRequestId: 'request-one', status: 'new', revision: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' } },
    outbox: [{ id: 'outbox-one', type: 'submit', localId: 'local:request-one', payload: { clientRequestId: 'request-one', comment: 'Persisted report', context: context() }, attempts: 0, createdAt: '2026-01-01' }],
  }))
  let registrations = 0
  const client = {
    register: async () => { registrations += 1; return { token: 'install.secret' } },
    submit: async () => ({ id: 'remote-restarted', clientRequestId: 'request-one', status: 'new', revision: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' }),
    list: async () => [], events: async () => ({ events: [] }),
  }
  const service = new FeedbackService({ app: { getPath: () => root, getVersion: () => '0.2.4' }, safeStorage: { isEncryptionAvailable: () => false }, client, store, setIntervalFn: () => ({ unref() {} }), clearIntervalFn: () => {} })
  t.after(() => service.stop())
  await service.initialize()
  assert.equal(registrations, 1)
  assert.equal(service.getState().pending, 0)
  assert.equal(service.list()[0].id, 'remote-restarted')
})
