import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../i18n'
import { FuelCalculatorView, loadFuelCalculatorInputs } from './FuelCalculatorView'
import { StrategyView } from './StrategyView'

function installStorage(entries: Array<[string, string]> = []) {
  const values = new Map(entries)
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  return { values, storage }
}

async function replace(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('numeric view integration', () => {
  it('recovers malformed persisted fuel fields individually and preserves the source', () => {
    const raw = JSON.stringify({ raceKind: 'laps', durationMinutes: 90, totalLaps: 'broken', averageLapSeconds: 130, fuelPerLap: null, currentFuel: 50, tankCapacity: -1, reserve: 3, extraLap: 'yes' })
    const { values, storage } = installStorage([['apex:fuel-calculator', raw]])
    const loaded = loadFuelCalculatorInputs(storage)
    expect(loaded.inputs).toMatchObject({ raceKind: 'laps', durationMinutes: 90, totalLaps: 30, averageLapSeconds: 130, fuelPerLap: 3.4, currentFuel: 50, tankCapacity: 90, reserve: 3, extraLap: false })
    expect(loaded.recoveredFields).toEqual(['extraLap', 'totalLaps', 'fuelPerLap', 'tankCapacity'])
    expect(values.get('apex:fuel-calculator:recovered')).toBe(raw)
  })

  it.each([
    ['strategy', <StrategyView />, '.strategy-results'],
    ['fuel', <FuelCalculatorView live={null} />, '.fuel-results'],
  ])('keeps the last valid %s calculation when every editable numeric field is cleared', async (_name, view, resultSelector) => {
    installStorage([['apex:language', 'en']])
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider>{view}</I18nProvider>))
    const inputs = [...container.querySelectorAll<HTMLInputElement>('.number-input input:not(:disabled)')]
    expect(inputs.length).toBeGreaterThan(1)
    for (const input of inputs) await replace(input, '')
    expect(container.querySelector(resultSelector)).not.toBeNull()
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(inputs.length)
    await replace(inputs[0], inputs[0].inputMode === 'numeric' ? '120' : '120.0')
    inputs[0].dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(container.querySelector(resultSelector)).not.toBeNull()
    await act(async () => root.unmount()); container.remove()
  })
})
