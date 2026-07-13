#!/usr/bin/env node
import crypto from 'node:crypto'
import sharp from 'sharp'

const baseUrl = (process.env.APEX_FEEDBACK_API_URL || 'https://apex-lmu-feedback.vercel.app/api/v1').replace(/\/$/, '')
const adminToken = process.env.APEX_FEEDBACK_ADMIN_TOKEN
if (!adminToken) throw new Error('APEX_FEEDBACK_ADMIN_TOKEN is required')

async function request(path, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, body, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || `HTTP ${response.status} for ${path}`)
  return payload.data
}

const health = await request('/health')
if (health.status !== 'ready' || health.schemaVersion !== 1) throw new Error('Feedback health contract is not ready')

const installation = await request('/installations', { method: 'POST', body: JSON.stringify({ appVersion: 'production-smoke', platform: process.platform }), headers: { 'Content-Type': 'application/json' } })
const clientRequestId = crypto.randomUUID()
const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#b8f34a' } }).jpeg({ quality: 80 }).toBuffer()
const form = new FormData()
form.set('metadata', JSON.stringify({
  clientRequestId,
  comment: `Production lifecycle smoke ${clientRequestId}`,
  context: {
    view: 'feedback-smoke', appVersion: 'production-smoke', language: 'en', platform: process.platform, source: 'offline',
    screen: { width: 1280, height: 720, scaleFactor: 1 }, viewport: { width: 1280, height: 720 },
    element: { feedbackId: 'production-smoke', selector: '[data-feedback-id="production-smoke"]', tagName: 'button', accessibleName: 'Production smoke', rect: { x: 1, y: 1, width: 8, height: 8 } },
    redactionVersion: 1,
  },
}))
form.set('attachmentDimensions', JSON.stringify({ selectedArea: { width: 8, height: 8 } }))
form.set('selectedArea', new Blob([image], { type: 'image/jpeg' }), 'selected-area.jpg')

let feedback = (await request('/feedback', { token: installation.token, method: 'POST', body: form })).feedback
if (feedback.status !== 'new' || feedback.attachments.length !== 1) throw new Error('Initial feedback submission was not persisted completely')

feedback = (await request(`/admin/feedback/${feedback.id}/messages`, { token: adminToken, method: 'POST', body: JSON.stringify({ clientMessageId: crypto.randomUUID(), body: 'Can you confirm the production lifecycle?', kind: 'question', expectedRevision: feedback.revision }), headers: { 'Content-Type': 'application/json' } })).feedback
if (feedback.status !== 'needs_user_answer') throw new Error('Agent question did not update the feedback state')

const events = await request('/events?after=0&limit=100', { token: installation.token })
if (!events.events.some((event) => event.feedbackId === feedback.id && event.eventType === 'agent.question')) throw new Error('Agent question event was not delivered')

feedback = (await request(`/feedback/${feedback.id}/messages`, { token: installation.token, method: 'POST', body: JSON.stringify({ clientMessageId: crypto.randomUUID(), body: 'Confirmed by the production smoke test.', expectedRevision: feedback.revision }), headers: { 'Content-Type': 'application/json' } })).feedback
if (feedback.status !== 'user_answered') throw new Error('User answer did not update the feedback state')

feedback = (await request(`/admin/feedback/${feedback.id}/status`, { token: adminToken, method: 'POST', body: JSON.stringify({ status: 'resolved', summary: 'Production feedback lifecycle passed.', expectedRevision: feedback.revision }), headers: { 'Content-Type': 'application/json' } })).feedback
if (feedback.status !== 'resolved' || !feedback.resolutionSummary) throw new Error('Resolution did not persist')

const attachment = feedback.attachments[0]
const attachmentResponse = await fetch(`${baseUrl}/feedback/${feedback.id}/attachments/${attachment.id}`, { headers: { Authorization: `Bearer ${installation.token}` } })
if (!attachmentResponse.ok || attachmentResponse.headers.get('content-type') !== 'image/jpeg' || (await attachmentResponse.arrayBuffer()).byteLength !== attachment.bytes) throw new Error('Authenticated screenshot retrieval failed')

process.stdout.write(`${JSON.stringify({ ok: true, feedbackId: feedback.id, reference: feedback.reference, status: feedback.status, revision: feedback.revision, messages: feedback.messages.length, attachmentBytes: attachment.bytes })}\n`)
