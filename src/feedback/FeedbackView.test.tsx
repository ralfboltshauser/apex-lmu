import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../i18n'
import { FeedbackProvider } from './FeedbackProvider'
import { FeedbackView } from './FeedbackView'

const question: ApexFeedbackItem = {
  id: 'feedback-one', reference: 'APX-000001', status: 'needs_user_answer', revision: 1, firstMessage: 'The button is unclear', view: 'home', createdAt: '2026-07-13T10:00:00Z', updatedAt: '2026-07-13T10:01:00Z', syncState: 'synced', attachments: [],
  messages: [
    { id: 'human-one', actor: 'human', kind: 'comment', body: 'The button is unclear', createdAt: '2026-07-13T10:00:00Z' },
    { id: 'agent-one', actor: 'agent', kind: 'question', body: 'Which wording did you expect?', createdAt: '2026-07-13T10:01:00Z' },
  ],
}

function state(item = question): ApexFeedbackState {
  return { status: 'ready', pending: 0, unread: 1, needsAnswer: item.status === 'needs_user_answer' ? 1 : 0, items: [item] }
}

describe('feedback inbox', () => {
  it('opens a synchronized question and sends a revision-safe answer', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const originalDesktop = window.apexDesktop
    let replyInput: { id: string; body: string; revision: number } | null = null
    const answered: ApexFeedbackItem = { ...question, status: 'user_answered', revision: 2, updatedAt: '2026-07-13T10:02:00Z', messages: [...question.messages!, { id: 'answer-one', actor: 'human', kind: 'answer', body: 'I expected “Save layout”.', createdAt: '2026-07-13T10:02:00Z' }] }
    window.apexDesktop = {
      getFeedbackState: async () => state(), syncFeedback: async () => state(answered), getFeedback: async () => question,
      replyFeedback: async (id: string, body: string, revision: number) => { replyInput = { id, body, revision }; return answered },
      markFeedbackRead: async () => state(), consumeFeedbackThread: async () => null,
      onFeedbackChanged: () => () => {}, onFeedbackShortcut: () => () => {}, onOpenFeedbackThread: () => () => {},
    } as unknown as ApexDesktopApi
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<I18nProvider><FeedbackProvider view="feedback" source="offline" onOpenView={() => {}}><FeedbackView /></FeedbackProvider></I18nProvider>))
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
      expect(container.textContent).toContain('Which wording did you expect?')
      expect(container.textContent).toContain('Needs your answer')
      expect(container.querySelector('.feedback-inbox-layout')?.getAttribute('data-feedback-redact')).toBe('private-feedback-conversations')

      const textarea = container.querySelector('.feedback-reply textarea') as HTMLTextAreaElement
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
        setter.call(textarea, 'I expected “Save layout”.')
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => (container.querySelector('.feedback-reply .button') as HTMLButtonElement).click())
      expect(replyInput).toEqual({ id: 'feedback-one', body: 'I expected “Save layout”.', revision: 1 })
      expect(container.textContent).toContain('Answer sent')
    } finally {
      await act(async () => root.unmount())
      container.remove()
      window.apexDesktop = originalDesktop
    }
  })
})
