const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { FeedbackStore } = require('./feedback-store.cjs')

test('feedback store persists a private versioned outbox atomically', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-feedback-store-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const store = new FeedbackStore({ userDataPath: root })
  await store.initialize()
  await store.mutate((state) => ({ ...state, outbox: [{ id: 'one', type: 'reply' }] }))
  const reopened = new FeedbackStore({ userDataPath: root })
  await reopened.initialize()
  assert.deepEqual(reopened.state.outbox, [{ id: 'one', type: 'reply' }])
  const mode = (await fs.stat(path.join(root, 'feedback', 'state.json'))).mode & 0o777
  assert.equal(mode, 0o600)
})
