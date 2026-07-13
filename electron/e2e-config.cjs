const path = require('node:path')

function readE2EConfig(environment = process.env) {
  if (environment.APEX_E2E !== '1') return null
  const replayPath = environment.APEX_E2E_REPLAY || ''
  const userDataPath = environment.APEX_E2E_USER_DATA || ''
  const runId = environment.APEX_E2E_RUN_ID || ''
  const speed = Number(environment.APEX_E2E_REPLAY_SPEED ?? 0)
  if (!path.isAbsolute(replayPath) || path.extname(replayPath).toLowerCase() !== '.apexrec') throw new Error('APEX_E2E_REPLAY must be an absolute .apexrec path')
  if (!path.isAbsolute(userDataPath)) throw new Error('APEX_E2E_USER_DATA must be an absolute isolated directory')
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(runId)) throw new Error('APEX_E2E_RUN_ID must be a safe 1-64 character correlation id')
  if (!Number.isFinite(speed) || speed < 0 || speed > 16) throw new Error('APEX_E2E_REPLAY_SPEED must be between 0 and 16')
  return Object.freeze({ replayPath: path.normalize(replayPath), userDataPath: path.normalize(userDataPath), runId, speed, strict: true })
}

module.exports = { readE2EConfig }
