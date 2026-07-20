import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../i18n'
import { StrategyView } from './StrategyView'
import type { LiveFuelEstimate } from '../core'

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

  const live = (patch: Partial<LiveFuelEstimate> = {}): LiveFuelEstimate => ({
    sessionId: 'live-strategy', trackName: 'Circuit de la Sarthe', carName: 'Porsche 963',
    fuelSamplesLiters: [3.5, 3.6, 3.4], lapTimeSamplesSeconds: [220, 221, 219],
    currentFuelLiters: 24, tankCapacityLiters: 75, completedLaps: 10, currentLapProgress: 0.25,
    totalLaps: 30, durationSeconds: null, elapsedSeconds: 2_450,
    modelRevision: 4, modelEvent: 'clean-lap', lastAcceptedLap: 10,
    sessionFuelSampleCount: 2, sessionLapTimeSampleCount: 2, calibrationExclusion: null,
    ...patch,
  })

  it('explicitly adopts a measured fixed-lap session without claiming race detection', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const storage = new Map([['apex:language', 'en'], ['apex:strategy-mode', 'live']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><StrategyView live={live()} /></I18nProvider>))

    expect(container.querySelector('.view--strategy')?.getAttribute('data-feedback-redact')).toBe('measured-fuel-model')
    expect(container.textContent).toContain('Live fuel plan')
    expect(container.textContent).toContain('Session type: unknown')
    expect(container.textContent).toContain('2 this session · 1 from local profile')
    expect(container.textContent).toContain('Automatic race detection')
    expect(container.querySelectorAll('.pit-table > div:not(.pit-table__head)')).toHaveLength(Number(container.querySelector('.strategy-verdict h2')?.textContent?.match(/^\d+/)?.[0]))

    await act(async () => root.unmount()); container.remove()
  })

  it('updates current fuel without replanning until the model revision changes', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const storage = new Map([['apex:language', 'en'], ['apex:strategy-mode', 'live']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><StrategyView live={live()} /></I18nProvider>))
    const originalPlan = container.querySelector('.plan-card')?.textContent

    await act(async () => root.render(<I18nProvider><StrategyView live={live({ currentFuelLiters: 20 })} /></I18nProvider>))
    expect(container.querySelector('.strategy-live-metrics')?.textContent).toContain('20.0 L')
    expect(container.querySelector('.plan-card')?.textContent).toBe(originalPlan)

    await commit(findInput(container, 'Finish reserve'), '1')
    expect(container.querySelector('.strategy-live-metrics > div:nth-child(4) strong')?.textContent).toBe('15')

    await act(async () => root.render(<I18nProvider><StrategyView live={live({ currentFuelLiters: 20, fuelSamplesLiters: [3.5, 3.6, 3.4, 2.8], modelRevision: 5, lastAcceptedLap: 11, sessionFuelSampleCount: 3 })} /></I18nProvider>))
    expect(container.querySelector('.strategy-change-card')?.textContent).toContain('Conservative consumption changed after 4 clean samples.')
    expect(container.querySelector('.strategy-change-card')?.textContent).toContain('Model revision 5')

    await act(async () => root.unmount()); container.remove()
  })

  it('keeps exact missing facts unavailable and retains a stale plan during AI control', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const storage = new Map([['apex:language', 'en'], ['apex:strategy-mode', 'live']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><StrategyView live={live({ fuelSamplesLiters: [], lapTimeSamplesSeconds: [], totalLaps: null, durationSeconds: null })} /></I18nProvider>))
    expect(container.textContent).toContain('At least one eligible clean fuel lap')
    expect(container.textContent).toContain('A scheduled lap count or duration')
    expect(container.querySelector('.strategy-candidates')).toBeNull()

    await act(async () => root.render(<I18nProvider><StrategyView live={live({ calibrationExclusion: 'non-local-control', modelRevision: 5 })} /></I18nProvider>))
    expect(container.textContent).toContain('Learning paused')
    expect(container.textContent).toContain('this lap cannot revise the model')
    expect(container.querySelector('.strategy-candidates')).not.toBeNull()

    await act(async () => root.unmount()); container.remove()
  })

  it('does not claim that live facts were adopted without a connected session', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const storage = new Map([['apex:language', 'en'], ['apex:strategy-mode', 'live']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><StrategyView live={null} /></I18nProvider>))

    expect(container.textContent).toContain('Waiting for an official live LMU session')
    expect(container.textContent).not.toContain('Explicitly adopted from official LMU shared memory')
    expect(container.textContent).toContain('An official live LMU session')

    await act(async () => root.unmount()); container.remove()
  })
})
