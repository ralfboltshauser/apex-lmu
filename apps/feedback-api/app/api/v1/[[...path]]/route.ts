import { ZodError, z } from 'zod'
import { bearerToken, validAdminToken } from '@/auth'
import { acceptedAttachmentTypes, AgentMessageSchema, CreateFeedbackSchema, CreateMessageSchema, FeedbackStatusSchema, ListQuerySchema, MAX_ATTACHMENT_BYTES, MAX_COMBINED_ATTACHMENT_BYTES, StatusMutationSchema } from '@/contracts'
import { HttpError } from '@/http-error'
import { addAgentMessage, addHumanMessage, authenticateInstallation, createFeedback, getAttachment, getFeedback, listEvents, listFeedback, registerInstallation, reopenFeedback, updateFeedbackStatus, type AttachmentInput } from '@/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ path?: string[] }> }

function json(data: unknown, status = 200) {
  return Response.json({ ok: status < 400, data }, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}

function failure(error: unknown) {
  if (error instanceof HttpError) return Response.json({ ok: false, error: { code: error.code, message: error.message } }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
  if (error instanceof ZodError) return Response.json({ ok: false, error: { code: 'invalid_request', message: 'Request validation failed', issues: z.treeifyError(error) } }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  console.error('feedback-api request failed', error)
  return Response.json({ ok: false, error: { code: 'internal_error', message: 'The feedback service could not complete the request' } }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
}

async function pathFor(context: RouteContext) {
  return (await context.params).path ?? []
}

async function installationFor(request: Request) {
  return authenticateInstallation(bearerToken(request))
}

function requireAdmin(request: Request) {
  if (!validAdminToken(bearerToken(request))) throw new HttpError(401, 'unauthorized', 'Admin authentication is required')
}

async function parseAttachments(form: FormData): Promise<AttachmentInput[]> {
  const dimensionsRaw = String(form.get('attachmentDimensions') || '{}')
  const dimensions = z.record(z.string(), z.object({ width: z.number().int().positive().max(32768), height: z.number().int().positive().max(32768) })).parse(JSON.parse(dimensionsRaw))
  const entries: Array<[string, AttachmentInput['kind']]> = [['selectedArea', 'selected-area'], ['fullWindow', 'full-window']]
  const result: AttachmentInput[] = []
  for (const [field, kind] of entries) {
    const value = form.get(field)
    if (!(value instanceof File) || value.size === 0) continue
    if (!acceptedAttachmentTypes.has(value.type) || value.size > MAX_ATTACHMENT_BYTES) throw new HttpError(413, 'attachment_invalid', 'A screenshot type or size is not accepted')
    const size = dimensions[field]
    if (!size) throw new HttpError(400, 'attachment_dimensions', 'Screenshot dimensions are required')
    result.push({ kind, mediaType: value.type, width: size.width, height: size.height, data: Buffer.from(await value.arrayBuffer()) })
  }
  if (result.reduce((sum, attachment) => sum + attachment.data.length, 0) > MAX_COMBINED_ATTACHMENT_BYTES) throw new HttpError(413, 'attachments_too_large', 'The combined screenshots are too large')
  return result
}

async function handleGet(request: Request, context: RouteContext) {
  const path = await pathFor(context)
  const url = new URL(request.url)
  if (path.join('/') === 'health') return json({ status: 'ready', schemaVersion: 1 })
  if (path[0] === 'events') {
    const installation = await installationFor(request)
    const query = ListQuerySchema.pick({ after: true, limit: true }).parse(Object.fromEntries(url.searchParams))
    return json({ events: await listEvents(installation.id, query.after ?? 0, query.limit), cursor: query.after ?? 0 })
  }
  if (path[0] === 'feedback') {
    const installation = await installationFor(request)
    if (path.length === 1) {
      const query = ListQuerySchema.parse(Object.fromEntries(url.searchParams))
      return json({ feedback: await listFeedback({ installationId: installation.id, status: query.status, limit: query.limit }) })
    }
    if (path.length === 4 && path[2] === 'attachments') {
      const attachment = await getAttachment(path[1], path[3], installation.id)
      return new Response(attachment.data, { headers: { 'Content-Type': attachment.mediaType, 'Content-Length': String(attachment.bytes), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
    }
    return json({ feedback: await getFeedback(path[1], installation.id) })
  }
  if (path[0] === 'admin') {
    requireAdmin(request)
    if (path[1] !== 'feedback') throw new HttpError(404, 'not_found', 'Admin route was not found')
    if (path.length === 2) {
      const query = ListQuerySchema.parse(Object.fromEntries(url.searchParams))
      return json({ feedback: await listFeedback({ status: query.status, limit: query.limit }) })
    }
    if (path.length === 5 && path[3] === 'attachments') {
      const attachment = await getAttachment(path[2], path[4])
      return new Response(attachment.data, { headers: { 'Content-Type': attachment.mediaType, 'Content-Length': String(attachment.bytes), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
    }
    return json({ feedback: await getFeedback(path[2]) })
  }
  throw new HttpError(404, 'not_found', 'Route was not found')
}

async function handlePost(request: Request, context: RouteContext) {
  const path = await pathFor(context)
  if (path.join('/') === 'installations') {
    const body = z.object({ appVersion: z.string().max(32).optional(), platform: z.string().max(32).optional() }).strict().parse(await request.json())
    return json(await registerInstallation(body.appVersion, body.platform), 201)
  }
  if (path[0] === 'feedback') {
    const installation = await installationFor(request)
    if (path.length === 1) {
      const form = await request.formData()
      const metadata = CreateFeedbackSchema.parse(JSON.parse(String(form.get('metadata') || '{}')))
      const attachments = await parseAttachments(form)
      return json({ feedback: await createFeedback(installation.id, metadata, attachments) }, 201)
    }
    if (path.length === 3 && path[2] === 'messages') return json({ feedback: await addHumanMessage(installation.id, path[1], CreateMessageSchema.parse(await request.json())) })
    if (path.length === 3 && path[2] === 'reopen') {
      const body = z.object({ expectedRevision: z.number().int().nonnegative().optional() }).parse(await request.json())
      return json({ feedback: await reopenFeedback(installation.id, path[1], body.expectedRevision) })
    }
  }
  if (path[0] === 'admin') {
    requireAdmin(request)
    if (path[1] !== 'feedback' || !path[2]) throw new HttpError(404, 'not_found', 'Admin route was not found')
    if (path.length === 4 && path[3] === 'messages') return json({ feedback: await addAgentMessage(path[2], AgentMessageSchema.parse(await request.json())) })
    if (path.length === 4 && path[3] === 'status') return json({ feedback: await updateFeedbackStatus(path[2], StatusMutationSchema.parse(await request.json())) })
  }
  throw new HttpError(404, 'not_found', 'Route was not found')
}

export async function GET(request: Request, context: RouteContext) {
  try { return await handleGet(request, context) } catch (error) { return failure(error) }
}

export async function POST(request: Request, context: RouteContext) {
  try { return await handlePost(request, context) } catch (error) { return failure(error) }
}
