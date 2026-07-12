const test = require('node:test')
const assert = require('node:assert/strict')
const { SUPPORT_EMAIL, MAX_MAILTO_URL_LENGTH, buildSupportMailto } = require('./support-mail.cjs')

test('puts a short complete support bundle directly into the email draft', () => {
  const result = buildSupportMailto({ bundleText: '{"logs":"bridge failed"}', version: '0.1.7', platform: 'win32' })
  assert.equal(result.includedInBody, true)
  assert.ok(result.url.startsWith(`mailto:${SUPPORT_EMAIL}?`))
  assert.match(decodeURIComponent(result.url), /bridge failed/)
})

test('keeps oversized support bundles out of mailto and tells the user to paste the copied bundle', () => {
  const privateTail = 'private-final-log-line'
  const result = buildSupportMailto({ bundleText: `${'x'.repeat(MAX_MAILTO_URL_LENGTH)}${privateTail}`, version: '0.1.7', platform: 'win32' })
  const decoded = decodeURIComponent(result.url)
  assert.equal(result.includedInBody, false)
  assert.ok(result.url.length <= MAX_MAILTO_URL_LENGTH)
  assert.match(decoded, /Ctrl\+V/)
  assert.doesNotMatch(decoded, new RegExp(privateTail))
})
