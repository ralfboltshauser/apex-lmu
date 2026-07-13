import { z } from 'zod'

export const feedbackStatuses = [
  'new',
  'acknowledged',
  'investigating',
  'needs_user_answer',
  'user_answered',
  'in_progress',
  'resolved',
  'dismissed',
  'duplicate',
  'reopened',
] as const

export const FeedbackStatusSchema = z.enum(feedbackStatuses)
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>

export const FeedbackContextSchema = z.object({
  view: z.string().min(1).max(64),
  appVersion: z.string().min(1).max(32),
  language: z.enum(['en', 'de']),
  platform: z.string().min(1).max(32),
  source: z.enum(['live', 'demo', 'offline']).optional(),
  screen: z.object({ width: z.number().int().positive().max(32768), height: z.number().int().positive().max(32768), scaleFactor: z.number().positive().max(8) }),
  viewport: z.object({ width: z.number().int().positive().max(32768), height: z.number().int().positive().max(32768) }),
  element: z.object({
    feedbackId: z.string().max(160).optional(),
    selector: z.string().min(1).max(2048),
    tagName: z.string().min(1).max(64),
    role: z.string().max(128).optional(),
    accessibleName: z.string().max(512).optional(),
    cssClasses: z.string().max(2048).optional(),
    selectedText: z.string().max(4096).optional(),
    nearbyText: z.string().max(4096).optional(),
    rect: z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() }),
  }),
  redactionVersion: z.literal(1),
}).strict()

export const CreateFeedbackSchema = z.object({
  clientRequestId: z.uuid(),
  comment: z.string().trim().min(1).max(10_000),
  context: FeedbackContextSchema,
}).strict()

export const CreateMessageSchema = z.object({
  clientMessageId: z.uuid(),
  body: z.string().trim().min(1).max(10_000),
  expectedRevision: z.number().int().nonnegative().optional(),
}).strict()

export const AgentMessageSchema = CreateMessageSchema.extend({
  kind: z.enum(['comment', 'question']),
})

export const StatusMutationSchema = z.object({
  status: FeedbackStatusSchema,
  expectedRevision: z.number().int().nonnegative().optional(),
  summary: z.string().trim().min(1).max(10_000).optional(),
  duplicateOf: z.uuid().optional(),
}).strict().superRefine((value, context) => {
  if ((value.status === 'resolved' || value.status === 'dismissed') && !value.summary) context.addIssue({ code: 'custom', path: ['summary'], message: 'A summary is required for terminal status changes' })
  if (value.status === 'duplicate' && !value.duplicateOf) context.addIssue({ code: 'custom', path: ['duplicateOf'], message: 'A duplicate target is required' })
})

export const ListQuerySchema = z.object({
  status: FeedbackStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  after: z.coerce.number().int().nonnegative().optional(),
})

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024
export const MAX_COMBINED_ATTACHMENT_BYTES = 3 * 1024 * 1024
export const acceptedAttachmentTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function canTransition(actor: 'human' | 'agent', from: FeedbackStatus, to: FeedbackStatus): boolean {
  if (from === to) return true
  if (actor === 'human') {
    if (from === 'needs_user_answer' && to === 'user_answered') return true
    if (['resolved', 'dismissed', 'duplicate'].includes(from) && to === 'reopened') return true
    return ['dismissed'].includes(to) && !['resolved', 'duplicate'].includes(from)
  }
  if (to === 'needs_user_answer') return !['resolved', 'dismissed', 'duplicate'].includes(from)
  if (['resolved', 'dismissed', 'duplicate'].includes(to)) return !['resolved', 'dismissed', 'duplicate'].includes(from)
  const flow: Record<FeedbackStatus, FeedbackStatus[]> = {
    new: ['acknowledged', 'investigating', 'in_progress'],
    acknowledged: ['investigating', 'in_progress'],
    investigating: ['in_progress'],
    needs_user_answer: ['investigating'],
    user_answered: ['acknowledged', 'investigating', 'in_progress'],
    in_progress: ['investigating'],
    reopened: ['acknowledged', 'investigating', 'in_progress'],
    resolved: ['reopened'], dismissed: ['reopened'], duplicate: ['reopened'],
  }
  return flow[from]?.includes(to) ?? false
}
