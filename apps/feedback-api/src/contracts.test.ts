import { describe, expect, it } from 'vitest'
import { CreateFeedbackSchema, StatusMutationSchema, canTransition } from './contracts'

const context = {
  view: 'home', appVersion: '0.2.3', language: 'en' as const, platform: 'win32', source: 'offline' as const,
  screen: { width: 1920, height: 1080, scaleFactor: 1 }, viewport: { width: 1512, height: 982 },
  element: { selector: '.hero', tagName: 'section', rect: { x: 10, y: 20, width: 100, height: 50 } }, redactionVersion: 1 as const,
}

describe('feedback contracts', () => {
  it('accepts a bounded client-created report', () => {
    expect(CreateFeedbackSchema.parse({ clientRequestId: crypto.randomUUID(), comment: 'The button is unclear.', context }).comment).toBe('The button is unclear.')
  })

  it('requires terminal summaries and duplicate targets', () => {
    expect(StatusMutationSchema.safeParse({ status: 'resolved' }).success).toBe(false)
    expect(StatusMutationSchema.safeParse({ status: 'duplicate', summary: 'same issue' }).success).toBe(false)
  })

  it('enforces actor-specific state transitions', () => {
    expect(canTransition('agent', 'new', 'acknowledged')).toBe(true)
    expect(canTransition('human', 'needs_user_answer', 'user_answered')).toBe(true)
    expect(canTransition('human', 'new', 'resolved')).toBe(false)
  })
})
