const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { spawn } = require('node:child_process')
const path = require('node:path')

const script = path.join(__dirname, 'apex-feedback.mjs')

async function withServer(handler, run) {
  const server = http.createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1`) }
  finally { await new Promise((resolve) => server.close(resolve)) }
}

function cli(base, args, token = 'admin-test-token') {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { env: { ...process.env, APEX_FEEDBACK_API_URL: base, APEX_FEEDBACK_ADMIN_TOKEN: token } })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

test('feedback CLI lists JSON and sends only the bearer credential', async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, 'Bearer admin-test-token')
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ ok: true, data: { feedback: [{ id: 'one', status: 'new' }] } }))
  }, async (base) => {
    const result = await cli(base, ['list'])
    assert.equal(result.code, 0)
    assert.deepEqual(JSON.parse(result.stdout).data.feedback, [{ id: 'one', status: 'new' }])
    assert.equal(result.stdout.includes('admin-test-token'), false)
  })
})

test('feedback CLI returns a distinct conflict exit code', async () => {
  await withServer((_request, response) => {
    response.statusCode = 409
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ ok: false, error: { code: 'revision_conflict', message: 'reload' } }))
  }, async (base) => {
    const result = await cli(base, ['acknowledge', 'f-1', '--revision', '2'])
    assert.equal(result.code, 4)
    assert.equal(JSON.parse(result.stderr).error.code, 'revision_conflict')
  })
})

test('feedback CLI refuses to run without the admin token', async () => {
  const result = await cli('http://127.0.0.1:1/api/v1', ['list'], '')
  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'configuration')
})
