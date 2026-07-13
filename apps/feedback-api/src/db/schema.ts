import { bigint, bigserial, customType, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { z } from 'zod'
import type { FeedbackContextSchema } from '../contracts'

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' })
export const feedbackStatus = pgEnum('feedback_status', ['new', 'acknowledged', 'investigating', 'needs_user_answer', 'user_answered', 'in_progress', 'resolved', 'dismissed', 'duplicate', 'reopened'])
export const feedbackActor = pgEnum('feedback_actor', ['human', 'agent', 'system'])
export const feedbackMessageKind = pgEnum('feedback_message_kind', ['comment', 'question', 'answer', 'status', 'resolution'])
export const feedbackAttachmentKind = pgEnum('feedback_attachment_kind', ['selected-area', 'full-window'])

export const installations = pgTable('feedback_installations', {
  id: uuid('id').primaryKey(),
  credentialDigest: text('credential_digest').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  lastAppVersion: text('last_app_version'),
  lastPlatform: text('last_platform'),
})

export const feedbackItems = pgTable('feedback_items', {
  id: uuid('id').primaryKey(),
  publicNumber: bigserial('public_number', { mode: 'number' }).notNull(),
  installationId: uuid('installation_id').notNull().references(() => installations.id, { onDelete: 'cascade' }),
  clientRequestId: uuid('client_request_id').notNull(),
  status: feedbackStatus('status').notNull().default('new'),
  revision: integer('revision').notNull().default(0),
  view: text('view').notNull(),
  appVersion: text('app_version').notNull(),
  language: text('language').notNull(),
  platform: text('platform').notNull(),
  context: jsonb('context').$type<z.infer<typeof FeedbackContextSchema>>().notNull(),
  resolutionSummary: text('resolution_summary'),
  duplicateOf: uuid('duplicate_of'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('feedback_items_installation_request_unique').on(table.installationId, table.clientRequestId),
  index('feedback_items_status_updated_idx').on(table.status, table.updatedAt),
  index('feedback_items_installation_updated_idx').on(table.installationId, table.updatedAt),
])

export const feedbackMessages = pgTable('feedback_messages', {
  id: uuid('id').primaryKey(),
  feedbackId: uuid('feedback_id').notNull().references(() => feedbackItems.id, { onDelete: 'cascade' }),
  clientMessageId: uuid('client_message_id').notNull(),
  actor: feedbackActor('actor').notNull(),
  kind: feedbackMessageKind('kind').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('feedback_messages_feedback_client_unique').on(table.feedbackId, table.clientMessageId),
  index('feedback_messages_feedback_created_idx').on(table.feedbackId, table.createdAt),
])

export const feedbackAttachments = pgTable('feedback_attachments', {
  id: uuid('id').primaryKey(),
  feedbackId: uuid('feedback_id').notNull().references(() => feedbackItems.id, { onDelete: 'cascade' }),
  kind: feedbackAttachmentKind('kind').notNull(),
  mediaType: text('media_type').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  sha256: text('sha256').notNull(),
  data: bytea('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('feedback_attachments_feedback_idx').on(table.feedbackId)])

export const feedbackEvents = pgTable('feedback_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  installationId: uuid('installation_id').notNull().references(() => installations.id, { onDelete: 'cascade' }),
  feedbackId: uuid('feedback_id').notNull().references(() => feedbackItems.id, { onDelete: 'cascade' }),
  actor: feedbackActor('actor').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('feedback_events_installation_cursor_idx').on(table.installationId, table.id),
  index('feedback_events_feedback_cursor_idx').on(table.feedbackId, table.id),
])

export const feedbackQuotas = pgTable('feedback_quotas', {
  installationId: uuid('installation_id').primaryKey().references(() => installations.id, { onDelete: 'cascade' }),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull().defaultNow(),
  feedbackCount: integer('feedback_count').notNull().default(0),
  messageCount: integer('message_count').notNull().default(0),
  attachmentBytes: bigint('attachment_bytes', { mode: 'number' }).notNull().default(0),
})
