import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../../i18n'
import { CircuitTrackMap } from './CircuitTrackMap'

describe('measured circuit map safety', () => {
  it('never substitutes the demo circuit for missing measured points', async () => {
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><CircuitTrackMap points={[]} circuitName="Measured track" emptyMessage="Learning measured route" /></I18nProvider>))

    expect(container.textContent).toContain('Learning measured route')
    expect(container.querySelector('.circuit-track-line')).toBeNull()
    expect(container.querySelector('svg')).toBeNull()

    await act(async () => root.unmount())
    container.remove()
  })

  it('places a car from measured world coordinates in the route coordinate system', async () => {
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><CircuitTrackMap points={[{ x: 0, y: 0, distanceM: 0 }, { x: 100, y: 0, distanceM: 500 }, { x: 100, y: 100, distanceM: 1000 }]} trackLengthM={1000} closed={false} cars={[{ id: 'player', number: 7, distanceM: 750, position: { x: 100, y: 50 }, selected: true }]} /></I18nProvider>))

    expect(container.querySelector('.circuit-track-line')?.getAttribute('d')).not.toContain('Z')
    expect(container.querySelector('.circuit-car')?.getAttribute('transform')).toMatch(/^translate\([\d.]+ [\d.]+\)$/)
    expect(container.querySelector('.circuit-car')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.circuit-car')?.hasAttribute('aria-label')).toBe(false)

    await act(async () => root.unmount())
    container.remove()
  })
})
