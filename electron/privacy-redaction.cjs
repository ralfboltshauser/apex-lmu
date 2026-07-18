const path = require('node:path')

const PRIVATE_PATH_PLACEHOLDER = '[private recording]'
const PRIVATE_PROTOCOL_MESSAGE = '[private recording] decoder details withheld.'

function sensitivePathTokens(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return []
  const baseTokens = new Set([
    filePath,
    filePath.replaceAll('\\', '/'),
    filePath.replaceAll('/', '\\'),
    path.posix.basename(filePath),
    path.posix.dirname(filePath),
    path.win32.basename(filePath),
    path.win32.dirname(filePath),
  ])
  const tokens = new Set()
  for (const token of baseTokens) {
    if (typeof token !== 'string' || token.length < 3 || token === '.') continue
    tokens.add(token)
    tokens.add(token.replaceAll('\\', '/'))
    tokens.add(token.replaceAll('/', '\\'))
    tokens.add(JSON.stringify(token).slice(1, -1))
  }
  return [...tokens].filter((token) => token.length >= 3).sort((left, right) => right.length - left.length)
}

function redactSensitiveText(value, sensitivePaths = []) {
  let result = typeof value === 'string' ? value : String(value ?? '')
  const tokens = new Set(sensitivePaths.flatMap((candidate) => sensitivePathTokens(candidate)))
  for (const token of [...tokens].sort((left, right) => right.length - left.length)) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(escaped, 'gi'), PRIVATE_PATH_PLACEHOLDER)
  }
  return result
}

function redactProtocolDiagnostic(message, sensitivePaths = []) {
  if (!message || typeof message !== 'object' || !['status', 'diagnostic'].includes(message.type)) return message
  return Object.fromEntries(Object.entries(message).map(([key, value]) => [
    key,
    typeof value === 'string' ? redactSensitiveText(value, sensitivePaths) : value,
  ]))
}

function privateProtocolDiagnostic(message) {
  if (!message || typeof message !== 'object' || !['status', 'diagnostic'].includes(message.type)) return message
  const state = typeof message.state === 'string' && /^[a-z0-9-]{1,64}$/.test(message.state) ? message.state : undefined
  const level = ['info', 'warning', 'error'].includes(message.level) ? message.level : undefined
  const recordingSha256 = typeof message.recordingSha256 === 'string' && /^[a-f0-9]{64}$/.test(message.recordingSha256)
    ? message.recordingSha256
    : undefined
  return {
    ...(Number.isSafeInteger(message.protocolVersion) ? { protocolVersion: message.protocolVersion } : {}),
    source: 'recording-replay',
    ...(typeof message.runId === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(message.runId) ? { runId: message.runId } : {}),
    type: message.type,
    ...(state ? { state } : message.type === 'status' ? { state: 'error' } : {}),
    ...(level ? { level } : {}),
    message: PRIVATE_PROTOCOL_MESSAGE,
    ...(Number.isSafeInteger(message.frames) && message.frames >= 0 ? { frames: message.frames } : {}),
    ...(typeof message.bytes === 'number' && Number.isSafeInteger(message.bytes) && message.bytes >= 0 ? { bytes: message.bytes } : {}),
    ...(typeof message.durationSeconds === 'number' && Number.isFinite(message.durationSeconds) && message.durationSeconds >= 0 ? { durationSeconds: message.durationSeconds } : {}),
    ...(Number.isSafeInteger(message.gameVersion) ? { gameVersion: message.gameVersion } : {}),
    ...(recordingSha256 ? { recordingSha256 } : {}),
  }
}

module.exports = { PRIVATE_PATH_PLACEHOLDER, PRIVATE_PROTOCOL_MESSAGE, privateProtocolDiagnostic, redactProtocolDiagnostic, redactSensitiveText, sensitivePathTokens }
