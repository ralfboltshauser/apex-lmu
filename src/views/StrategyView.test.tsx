import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../i18n'
import { StrategyView } from './StrategyView'

function findInput(container: HTMLElement, label: string) {
  const field = [...container.querySelectorAll<HTMLLabelElement>('.number-input')]
    .find((candidate) => candidate.querySelector(':scope > span')?.textContent?.startsWith(label))
  const input = field?.querySelector('input')
  if (!input) throw new Error(`Missing numeric field: ${label}`)
  return input
}

async function commit(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
}

describe('trustworthy strategy view', () => {
  it('reproduces the issue inputs without presenting the contradictory fixed plan', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const storage = new Map([['apex:language', 'en']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><StrategyView /></I18nProvider>))

    await commit(findInput(container, 'Race duration'), '240')
    await commit(findInput(container, 'Expected fuel / lap'), '4')

    expect(container.querySelector('.strategy-verdict h2')?.textContent).toContain('6 stops · 7 stints')
    expect(container.querySelectorAll('.strategy-timeline__stints > div')).toHaveLength(7)
    expect(container.querySelectorAll('.pit-table > div:not(.pit-table__head)')).toHaveLength(6)
    expect(container.textContent).not.toContain('2:03:41')
    expect(container.textContent).not.toContain('P5')
    expect(container.textContent).not.toContain('model confidence')
    expect(container.textContent).toContain('Virtual Energy allocation')
    expect(container.textContent).toContain('Not modeled')

    await act(async () => root.unmount())
    container.remove()
  })

  it('updates the whole detail view from the selected calculated candidate', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const storage = new Map([['apex:language', 'en']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><StrategyView /></I18nProvider>))

    const candidates = [...container.querySelectorAll<HTMLButtonElement>('.scenario-card')]
    expect(candidates.length).toBeGreaterThan(1)
    const selectedStops = Number(candidates[1].querySelector('.scenario-card__top strong')?.textContent?.match(/\d+/)?.[0])
    await act(async () => candidates[1].click())

    expect(candidates[1].getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelectorAll('.pit-table > div:not(.pit-table__head)')).toHaveLength(selectedStops)
    expect(container.querySelectorAll('.strategy-timeline__stints > div')).toHaveLength(selectedStops + 1)

    await act(async () => root.unmount())
    container.remove()
  })
})
