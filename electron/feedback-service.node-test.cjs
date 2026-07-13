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
})
