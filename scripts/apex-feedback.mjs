#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import crypto from 'node:crypto'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: {
    status: { type: 'string' },
    limit: { type: 'string', default: '50' },
    message: { type: 'string' },
    summary: { type: 'string' },
    of: { type: 'string' },
    revision: { type: 'string' },
    dir: { type: 'string' },
    timeout: { type: 'string', default: '120' },
    interval: { type: 'string', default: '5' },
  },
})

const command = positionals[0]
const id = positionals[1]
const apiBase = (process.env.APEX_FEEDBACK_API_URL || 'https://apex-lmu-feedback.vercel.app/api/v1').replace(/\/$/, '')
const adminToken = process.env.APEX_FEEDBACK_ADMIN_TOKEN

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function fail(code, message, details, exitCode = 1) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: { code, message, ...(details ? { details } : {}) } })}\n`)
  process.exit(exitCode)
}

if (!command) fail('usage', 'A command is required', { commands: ['list', 'show', 'download-attachments', 'acknowledge', 'investigate', 'ask', 'reply', 'start', 'resolve', 'dismiss', 'duplicate', 'reopen', 'watch'] }, 2)
if (!adminToken) fail('configuration', 'APEX_FEEDBACK_ADMIN_TOKEN is required', undefined, 2)

async function request(relative, init = {}) {
  let response
  try {
    response = await fetch(`${apiBase}${relative}`, {
      ...init,
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    })
  } catch (error) {
    fail('network', error instanceof Error ? error.message : String(error))
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    if (!response.ok) fail('http_error', `Feedback API returned HTTP ${response.status}`)
    return response
  }
  const body = await response.json()
  if (!response.ok || body.ok === false) {
    const code = body?.error?.code || 'api_error'
    const exitCode = response.status === 401 ? 3 : response.status === 409 ? 4 : 1
    fail(code, body?.error?.message || `Feedback API returned HTTP ${response.status}`, body?.error?.issues, exitCode)
  }
  return body.data
}

function requireId() {
  if (!id) fail('usage', `${command} requires a feedback ID`, undefined, 2)
}

function expectedRevision() {
  if (values.revision == null) return undefined
  const revision = Number(values.revision)
  if (!Number.isInteger(revision) || revision < 0) fail('usage', '--revision must be a non-negative integer', undefined, 2)
  return revision
}

async function mutateStatus(status, extra = {}) {
  requireId()
  return request(`/admin/feedback/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status, expectedRevision: expectedRevision(), ...extra }) })
}

async function main() {
  if (command === 'list') {
    const query = new URLSearchParams({ limit: values.limit })
    if (values.status) query.set('status', values.status)
    output({ ok: true, data: await request(`/admin/feedback?${query}`) })
    return
  }
  if (command === 'show') {
    requireId()
    output({ ok: true, data: await request(`/admin/feedback/${encodeURIComponent(id)}`) })
    return
  }
  if (command === 'download-attachments') {
    requireId()
    const detail = await request(`/admin/feedback/${encodeURIComponent(id)}`)
    const directory = path.resolve(values.dir || path.join('.tmp', 'apex-feedback', id))
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const files = []
    for (const attachment of detail.feedback.attachments) {
      const response = await fetch(`${apiBase}/admin/feedback/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachment.id)}`, { headers: { Authorization: `Bearer ${adminToken}` } })
      if (!response.ok) fail('attachment_download', `Unable to download attachment ${attachment.id}`)
      const extension = attachment.mediaType === 'image/png' ? 'png' : attachment.mediaType === 'image/webp' ? 'webp' : 'jpg'
      const file = path.join(directory, `${attachment.kind}-${attachment.id}.${extension}`)
      await writeFile(file, Buffer.from(await response.arrayBuffer()), { mode: 0o600 })
      files.push({ id: attachment.id, kind: attachment.kind, path: file, sha256: attachment.sha256 })
    }
    output({ ok: true, data: { directory, files } })
    return
  }
  if (command === 'ask' || command === 'reply') {
    requireId()
    if (!values.message?.trim()) fail('usage', `--message is required for ${command}`, undefined, 2)
    const data = await request(`/admin/feedback/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ clientMessageId: crypto.randomUUID(), body: values.message, kind: command === 'ask' ? 'question' : 'comment', expectedRevision: expectedRevision() }) })
    output({ ok: true, data })
    return
  }
  const simpleStatuses = { acknowledge: 'acknowledged', investigate: 'investigating', start: 'in_progress', reopen: 'reopened' }
  if (command in simpleStatuses) {
    output({ ok: true, data: await mutateStatus(simpleStatuses[command]) })
    return
  }
  if (command === 'resolve' || command === 'dismiss') {
    if (!values.summary?.trim()) fail('usage', `--summary is required for ${command}`, undefined, 2)
    output({ ok: true, data: await mutateStatus(command === 'resolve' ? 'resolved' : 'dismissed', { summary: values.summary }) })
    return
  }
  if (command === 'duplicate') {
    if (!values.of) fail('usage', '--of is required for duplicate', undefined, 2)
    output({ ok: true, data: await mutateStatus('duplicate', { duplicateOf: values.of, summary: values.summary || `Duplicate of ${values.of}` }) })
    return
  }
  if (command === 'watch') {
    const timeoutSeconds = Math.max(1, Math.min(300, Number(values.timeout) || 120))
    const intervalSeconds = Math.max(1, Math.min(30, Number(values.interval) || 5))
    const deadline = Date.now() + timeoutSeconds * 1000
    const known = new Map()
    while (Date.now() < deadline) {
      const data = await request('/admin/feedback?limit=200')
      const changed = data.feedback.filter((item) => known.get(item.id) !== item.revision)
      for (const item of data.feedback) known.set(item.id, item.revision)
      if (changed.length) { output({ ok: true, data: { feedback: changed } }); return }
      await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000))
    }
    output({ ok: true, data: { feedback: [], timedOut: true } })
    return
  }
  fail('usage', `Unknown command: ${command}`, undefined, 2)
}

await main()
