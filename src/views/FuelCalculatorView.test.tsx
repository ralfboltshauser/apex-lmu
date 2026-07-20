import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../i18n'
import { FuelCalculatorView } from './FuelCalculatorView'

describe('fuel learning state', () => {
  it('keeps the long German automatic-learning explanation available', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const values = new Map([['apex:language', 'de']])
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } })
    const live = {
      sessionId: 'learning', trackName: 'Circuit de la Sarthe', carName: 'Porsche 963',
      fuelSamplesLiters: [], lapTimeSamplesSeconds: [], currentFuelLiters: 52.4,
      tankCapacityLiters: 90, completedLaps: 2, currentLapProgress: .5,
      totalLaps: null, durationSeconds: 7200, elapsedSeconds: 900,
    }
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><FuelCalculatorView live={live} /></I18nProvider>))
    await act(async () => container.querySelectorAll<HTMLButtonElement>('.segmented button')[0]!.click())

    expect(container.querySelector('.fuel-auto-card')?.textContent).toContain('Verbrauch wird gelernt')
    expect(container.querySelector('.fuel-auto-card')?.textContent).toContain('Fahre eine saubere Runde ohne Nachtanken')
    expect(container.querySelector('.fuel-auto-card')?.textContent).toContain('Werte stattdessen manuell eingeben')
    expect(container.querySelector('.fuel-calculator-layout')).toBeNull()

    await act(async () => root.unmount()); container.remove()
  })
})
