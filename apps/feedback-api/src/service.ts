import { createHash, randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm'
import { createCredential, equalSecret, parseInstallationToken } from './auth'
import { canTransition, type FeedbackStatus } from './contracts'
import { getDb } from './db/client'
import { feedbackAttachments, feedbackEvents, feedbackItems, feedbackMessages, feedbackQuotas, installations } from './db/schema'
import { HttpError } from './http-error'
import type { z } from 'zod'
import type { CreateFeedbackSchema } from './contracts'

type CreateFeedbackInput = z.infer<typeof CreateFeedbackSchema>
export type AttachmentInput = { kind: 'selected-area' | 'full-window'; mediaType: string; width: number; height: number; data: Buffer }
type FeedbackTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

function reference(publicNumber: number) {
  return `APX-${String(publicNumber).padStart(6, '0')}`
}

function exposeItem(row: typeof feedbackItems.$inferSelect, firstMessage?: string) {
  return { ...row, reference: reference(row.publicNumber), firstMessage: firstMessage ?? '' }
}

export async function registerInstallation(appVersion?: string, platform?: string) {
  const id = randomUUID()
  const credential = createCredential(id)
  await getDb().insert(installations).values({ id, credentialDigest: credential.digest, lastAppVersion: appVersion?.slice(0, 32), lastPlatform: platform?.slice(0, 32) })
  return { installationId: id, token: credential.token }
}

export async function authenticateInstallation(token: string | null) {
  const parsed = parseInstallationToken(token)
  if (!parsed) throw new HttpError(401, 'unauthorized', 'Installation authentication is required')
  const [installation] = await getDb().select().from(installations).where(eq(installations.id, parsed.id)).limit(1)
  if (!installation || installation.disabledAt || !equalSecret(installation.credentialDigest, parsed.secret)) throw new HttpError(401, 'unauthorized', 'Installation authentication is invalid')
  await getDb().update(installations).set({ lastSeenAt: new Date() }).where(eq(installations.id, installation.id))
  return installation
}

async function enforceQuota(executor: FeedbackTransaction, installationId: string, kind: 'feedback' | 'message', attachmentBytes = 0) {
  await executor.insert(feedbackQuotas).values({ installationId }).onConflictDoNothing()
  const [quota] = await executor.select().from(feedbackQuotas).where(eq(feedbackQuotas.installationId, installationId)).for('update').limit(1)
  const now = new Date()
  const expired = !quota || now.getTime() - quota.windowStartedAt.getTime() >= 60 * 60 * 1000
  const current = expired ? { feedbackCount: 0, messageCount: 0, attachmentBytes: 0 } : quota
  if (kind === 'feedback' && current.feedbackCount >= 20) throw new HttpError(429, 'feedback_quota', 'The hourly feedback limit was reached')
  if (kind === 'message' && current.messageCount >= 100) throw new HttpError(429, 'message_quota', 'The hourly message limit was reached')
  if (current.attachmentBytes + attachmentBytes > 40 * 1024 * 1024) throw new HttpError(429, 'attachment_quota', 'The hourly screenshot limit was reached')
  const values = {
    installationId,
    windowStartedAt: expired ? now : quota!.windowStartedAt,
    feedbackCount: current.feedbackCount + (kind === 'feedback' ? 1 : 0),
    messageCount: current.messageCount + (kind === 'message' ? 1 : 0),
    attachmentBytes: current.attachmentBytes + attachmentBytes,
  }
  await executor.update(feedbackQuotas).set(values).where(eq(feedbackQuotas.installationId, installationId))
}

export async function createFeedback(installationId: string, input: CreateFeedbackInput, attachments: AttachmentInput[]) {
  const existing = await getDb().select().from(feedbackItems).where(and(eq(feedbackItems.installationId, installationId), eq(feedbackItems.clientRequestId, input.clientRequestId))).limit(1)
  if (existing[0]) return getFeedback(existing[0].id, installationId)
  const attachmentBytes = attachments.reduce((sum, attachment) => sum + attachment.data.length, 0)
  const feedbackId = randomUUID()
  await getDb().transaction(async (tx) => {
    await enforceQuota(tx, installationId, 'feedback', attachmentBytes)
    await tx.insert(feedbackItems).values({
      id: feedbackId,
      installationId,
      clientRequestId: input.clientRequestId,
      view: input.context.view,
      appVersion: input.context.appVersion,
      language: input.context.language,
      platform: input.context.platform,
      context: input.context,
    })
    const messageId = randomUUID()
    await tx.insert(feedbackMessages).values({ id: messageId, feedbackId, clientMessageId: input.clientRequestId, actor: 'human', kind: 'comment', body: input.comment })
    for (const attachment of attachments) {
      await tx.insert(feedbackAttachments).values({
        id: randomUUID(), feedbackId, kind: attachment.kind, mediaType: attachment.mediaType,
        width: attachment.width, height: attachment.height, bytes: attachment.data.length,
        sha256: createHash('sha256').update(attachment.data).digest('hex'), data: attachment.data,
      })
    }
    await tx.insert(feedbackEvents).values({ installationId, feedbackId, actor: 'human', eventType: 'feedback.created', payload: { messageId, status: 'new' } })
  })
  return getFeedback(feedbackId, installationId)
}

export async function listFeedback(options: { installationId?: string; status?: FeedbackStatus; limit: number }) {
  const conditions = [options.installationId ? eq(feedbackItems.installationId, options.installationId) : undefined, options.status ? eq(feedbackItems.status, options.status) : undefined].filter(Boolean)
  const rows = await getDb().select().from(feedbackItems).where(conditions.length ? and(...conditions as Parameters<typeof and>) : undefined).orderBy(desc(feedbackItems.updatedAt)).limit(options.limit)
  if (rows.length === 0) return []
  const firstMessages = await getDb().select().from(feedbackMessages).where(and(inArray(feedbackMessages.feedbackId, rows.map((row) => row.id)), eq(feedbackMessages.actor, 'human'))).orderBy(asc(feedbackMessages.createdAt))
  const byFeedback = new Map<string, string>()
  for (const message of firstMessages) if (!byFeedback.has(message.feedbackId)) byFeedback.set(message.feedbackId, message.body)
  return rows.map((row) => exposeItem(row, byFeedback.get(row.id)))
}

export async function getFeedback(feedbackId: string, installationId?: string) {
  const [row] = await getDb().select().from(feedbackItems).where(and(eq(feedbackItems.id, feedbackId), installationId ? eq(feedbackItems.installationId, installationId) : undefined)).limit(1)
  if (!row) throw new HttpError(404, 'not_found', 'Feedback was not found')
  const [messages, attachments] = await Promise.all([
    getDb().select().from(feedbackMessages).where(eq(feedbackMessages.feedbackId, feedbackId)).orderBy(asc(feedbackMessages.createdAt)),
    getDb().select({ id: feedbackAttachments.id, kind: feedbackAttachments.kind, mediaType: feedbackAttachments.mediaType, width: feedbackAttachments.width, height: feedbackAttachments.height, bytes: feedbackAttachments.bytes, sha256: feedbackAttachments.sha256, createdAt: feedbackAttachments.createdAt }).from(feedbackAttachments).where(eq(feedbackAttachments.feedbackId, feedbackId)).orderBy(asc(feedbackAttachments.createdAt)),
  ])
  return { ...exposeItem(row, messages.find((message) => message.actor === 'human')?.body), messages, attachments }
}

export async function addHumanMessage(installationId: string, feedbackId: string, input: { clientMessageId: string; body: string; expectedRevision?: number }) {
  const current = await getFeedback(feedbackId, installationId)
  const duplicate = current.messages.find((message) => message.clientMessageId === input.clientMessageId)
  if (duplicate) return current
  if (input.expectedRevision != null && input.expectedRevision !== current.revision) throw new HttpError(409, 'revision_conflict', 'Feedback changed; reload the thread before replying')
  const nextStatus: FeedbackStatus = current.status === 'needs_user_answer' ? 'user_answered' : current.status
  await getDb().transaction(async (tx) => {
    await enforceQuota(tx, installationId, 'message')
    const updated = await tx.update(feedbackItems).set({ status: nextStatus, revision: current.revision + 1, updatedAt: new Date() }).where(and(eq(feedbackItems.id, feedbackId), eq(feedbackItems.revision, current.revision))).returning({ id: feedbackItems.id })
    if (updated.length === 0) throw new HttpError(409, 'revision_conflict', 'Feedback changed; reload the thread before replying')
    const messageId = randomUUID()
    await tx.insert(feedbackMessages).values({ id: messageId, feedbackId, clientMessageId: input.clientMessageId, actor: 'human', kind: current.status === 'needs_user_answer' ? 'answer' : 'comment', body: input.body })
    await tx.insert(feedbackEvents).values({ installationId, feedbackId, actor: 'human', eventType: current.status === 'needs_user_answer' ? 'feedback.answered' : 'message.created', payload: { messageId, status: nextStatus } })
  })
  return getFeedback(feedbackId, installationId)
}

export async function reopenFeedback(installationId: string, feedbackId: string, expectedRevision?: number) {
  const current = await getFeedback(feedbackId, installationId)
  if (!canTransition('human', current.status, 'reopened')) throw new HttpError(409, 'invalid_transition', `Cannot reopen feedback from ${current.status}`)
  if (expectedRevision != null && expectedRevision !== current.revision) throw new HttpError(409, 'revision_conflict', 'Feedback changed; reload before reopening')
  await getDb().transaction(async (tx) => {
    const updated = await tx.update(feedbackItems).set({ status: 'reopened', revision: current.revision + 1, updatedAt: new Date(), resolvedAt: null }).where(and(eq(feedbackItems.id, feedbackId), eq(feedbackItems.revision, current.revision))).returning({ id: feedbackItems.id })
    if (updated.length === 0) throw new HttpError(409, 'revision_conflict', 'Feedback changed; reload before reopening')
    await tx.insert(feedbackEvents).values({ installationId, feedbackId, actor: 'human', eventType: 'feedback.reopened', payload: { status: 'reopened' } })
  })
  return getFeedback(feedbackId, installationId)
}

export async function addAgentMessage(feedbackId: string, input: { clientMessageId: string; body: string; expectedRevision?: number; kind: 'comment' | 'question' }) {
  const current = await getFeedback(feedbackId)
  const duplicate = current.messages.find((message) => message.clientMessageId === input.clientMessageId)
  if (duplicate) return current
  if (input.expectedRevision != null && input.expectedRevision !== current.revision) throw new HttpError(409, 'revision_conflict', 'Feedback changed; reload before replying')
  const nextStatus: FeedbackStatus = input.kind === 'question' ? 'needs_user_answer' : current.status
  if (input.kind === 'question' && !canTransition('agent', current.status, nextStatus)) throw new HttpError(409, 'invalid_transition', `Cannot ask a question from ${current.status}`)
  const messageId = randomUUID()
  await getDb().transaction(async (tx) => {
    const updated = await tx.update(feedbackItems).set({ status: nextStatus, revision: current.revision + 1, updatedAt: new Date() }).where(and(eq(feedbackItems.id, feedbackId), eq(feedbackItems.revision, current.revision))).returning({ id: feedbackItems.id })
    if (updated.length === 0) throw new HttpError(409, 'revision_conflict', 'Feedback changed; reload before replying')
    await tx.insert(feedbackMessages).values({ id: messageId, feedbackId, clientMessageId: input.clientMessageId, actor: 'agent', kind: input.kind, body: input.body })
    await tx.insert(feedbackEvents).values({ installationId: current.installationId, feedbackId, actor: 'agent', eventType: input.kind === 'question' ? 'agent.question' : 'agent.message', payload: { messageId, kind: input.kind, body: input.body.slice(0, 300), status: nextStatus } })
  })
  return getFeedback(feedbackId)
}

export async function updateFeedbackStatus(feedbackId: string, input: { status: FeedbackStatus; expectedRevision?: number; summary?: string; duplicateOf?: string }) {
  const current = await getFeedback(feedbackId)
  if (input.expectedRevision != null && input.expectedRevision !== current.revision) throw new HttpError(409, 'revision_conflict', 'Feedback changed; reload before updating status')
  if (!canTransition('agent', current.status, input.status)) throw new HttpError(409, 'invalid_transition', `Cannot change ${current.status} to ${input.status}`)
  if (input.duplicateOf) await getFeedback(input.duplicateOf)
  const now = new Date()
  await getDb().transaction(async (tx) => {
    const updated = await tx.update(feedbackItems).set({
      status: input.status,
      revision: current.revision + 1,
      updatedAt: now,
      resolvedAt: ['resolved', 'dismissed', 'duplicate'].includes(input.status) ? now : null,
      resolutionSummary: input.summary ?? null,
      duplicateOf: input.duplicateOf ?? null,
    }).where(and(eq(feedbackItems.id, feedbackId), eq(feedbackItems.revision, current.revision))).returning({ id: feedbackItems.id })
    if (updated.length === 0) throw new HttpError(409, 'revision_conflict', 'Feedback changed; reload before updating status')
    let messageId: string | undefined
    if (input.summary) {
      messageId = randomUUID()
      await tx.insert(feedbackMessages).values({ id: messageId, feedbackId, clientMessageId: randomUUID(), actor: 'agent', kind: input.status === 'resolved' ? 'resolution' : 'status', body: input.summary })
    }
    await tx.insert(feedbackEvents).values({ installationId: current.installationId, feedbackId, actor: 'agent', eventType: 'feedback.status', payload: { messageId, status: input.status, summary: input.summary?.slice(0, 300) } })
  })
  return getFeedback(feedbackId)
}

export async function listEvents(installationId: string, after = 0, limit = 100) {
  return getDb().select().from(feedbackEvents).where(and(eq(feedbackEvents.installationId, installationId), gt(feedbackEvents.id, after))).orderBy(asc(feedbackEvents.id)).limit(limit)
}

export async function getAttachment(feedbackId: string, attachmentId: string, installationId?: string) {
  await getFeedback(feedbackId, installationId)
  const [attachment] = await getDb().select().from(feedbackAttachments).where(and(eq(feedbackAttachments.id, attachmentId), eq(feedbackAttachments.feedbackId, feedbackId))).limit(1)
  if (!attachment) throw new HttpError(404, 'not_found', 'Attachment was not found')
  return attachment
}
