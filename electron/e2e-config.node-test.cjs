const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { readE2EConfig } = require('./e2e-config.cjs')

const absolute = path.resolve('fixture.apexrec')
const userData = path.resolve('tmp-user-data')

test('E2E replay mode is opt-in and validates a narrow launch contract', () => {
  assert.equal(readE2EConfig({}), null)
  assert.deepEqual(readE2EConfig({ APEX_E2E: '1', APEX_E2E_REPLAY: absolute, APEX_E2E_USER_DATA: userData, APEX_E2E_RUN_ID: 'run-1', APEX_E2E_REPLAY_SPEED: '0' }), { replayPath: absolute, userDataPath: userData, runId: 'run-1', speed: 0, strict: true })
})

test('E2E replay mode rejects unsafe paths, ids, and speeds', () => {
  const base = { APEX_E2E: '1', APEX_E2E_REPLAY: absolute, APEX_E2E_USER_DATA: userData, APEX_E2E_RUN_ID: 'run-1' }
  assert.throws(() => readE2EConfig({ ...base, APEX_E2E_REPLAY: 'relative.apexrec' }), /absolute/)
  assert.throws(() => readE2EConfig({ ...base, APEX_E2E_USER_DATA: 'relative' }), /isolated/)
  assert.throws(() => readE2EConfig({ ...base, APEX_E2E_RUN_ID: '../unsafe' }), /correlation/)
  assert.throws(() => readE2EConfig({ ...base, APEX_E2E_REPLAY_SPEED: '17' }), /between 0 and 16/)
})
