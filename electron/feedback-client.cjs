const DEFAULT_FEEDBACK_API_URL = 'https://apex-lmu-feedback.vercel.app/api/v1'

function decodeDataUrl(value) {
  if (!value) return null
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value.dataUrl || '')
  if (!match) throw new Error('Feedback screenshot is not a supported data URL')
  return { mediaType: match[1], buffer: Buffer.from(match[2], 'base64'), width: value.width, height: value.height }
}

class FeedbackClient {
  constructor({ baseUrl = process.env.APEX_FEEDBACK_API_URL || DEFAULT_FEEDBACK_API_URL, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetch = fetchImpl
  }

  async request(path, { token, method = 'GET', body, headers = {} } = {}) {
    let response
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        body,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      })
    } catch (error) {
      const failure = new Error(error instanceof Error ? error.message : String(error))
      failure.code = 'network'
      throw failure
    }
    const payload = await response.json().catch(() => null)
    if (!response.ok || payload?.ok === false) {
      const failure = new Error(payload?.error?.message || `Feedback service returned HTTP ${response.status}`)
      failure.code = payload?.error?.code || `http-${response.status}`
      failure.status = response.status
      throw failure
    }
    return payload.data
  }

  register(input) {
    return this.request('/installations', { method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' } })
  }

  list(token) {
    return this.request('/feedback?limit=200', { token }).then((data) => data.feedback)
  }

  get(token, feedbackId) {
    return this.request(`/feedback/${encodeURIComponent(feedbackId)}`, { token }).then((data) => data.feedback)
  }

  async attachment(token, feedbackId, attachmentId) {
    let response
    try {
      response = await this.fetch(`${this.baseUrl}/feedback/${encodeURIComponent(feedbackId)}/attachments/${encodeURIComponent(attachmentId)}`, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) {
      const failure = new Error(error instanceof Error ? error.message : String(error))
      failure.code = 'network'
      throw failure
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const failure = new Error(payload?.error?.message || `Feedback service returned HTTP ${response.status}`)
      failure.code = payload?.error?.code || `http-${response.status}`
      failure.status = response.status
      throw failure
    }
    const mediaType = String(response.headers.get('content-type') || '').split(';')[0]
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) throw new Error('Feedback service returned an unsupported screenshot type')
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > 2 * 1024 * 1024) throw new Error('Feedback screenshot exceeded the size limit')
    return { dataUrl: `data:${mediaType};base64,${buffer.toString('base64')}` }
  }

  async submit(token, payload) {
    const form = new FormData()
    form.set('metadata', JSON.stringify({ clientRequestId: payload.clientRequestId, comment: payload.comment, context: payload.context }))
    const dimensions = {}
    for (const [field, value] of [['selectedArea', payload.selectedArea], ['fullWindow', payload.fullWindow]]) {
      const decoded = decodeDataUrl(value)
      if (!decoded) continue
      form.set(field, new Blob([decoded.buffer], { type: decoded.mediaType }), `${field}.${decoded.mediaType === 'image/png' ? 'png' : decoded.mediaType === 'image/webp' ? 'webp' : 'jpg'}`)
      dimensions[field] = { width: decoded.width, height: decoded.height }
    }
    form.set('attachmentDimensions', JSON.stringify(dimensions))
    return this.request('/feedback', { token, method: 'POST', body: form }).then((data) => data.feedback)
  }

  reply(token, feedbackId, payload) {
    return this.request(`/feedback/${encodeURIComponent(feedbackId)}/messages`, { token, method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } }).then((data) => data.feedback)
  }

  reopen(token, feedbackId, expectedRevision) {
    return this.request(`/feedback/${encodeURIComponent(feedbackId)}/reopen`, { token, method: 'POST', body: JSON.stringify({ expectedRevision }), headers: { 'Content-Type': 'application/json' } }).then((data) => data.feedback)
  }

  events(token, after) {
    return this.request(`/events?after=${encodeURIComponent(String(after))}&limit=100`, { token })
  }
}

module.exports = { FeedbackClient, DEFAULT_FEEDBACK_API_URL, decodeDataUrl }
