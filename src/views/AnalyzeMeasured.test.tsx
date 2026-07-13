import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { MeasuredTrackSnapshot } from '../engine'
import { I18nProvider } from '../i18n'
import { AnalyzeView } from './AnalyzeView'

const route = Array.from({ length: 21 }, (_, index) => ({ distanceM: index * 50, x: Math.cos(index / 20 * Math.PI * 2) * 100, z: Math.sin(index / 20 * Math.PI * 2) * 100, brake: index >= 5 && index <= 8 ? 0.8 : 0, speedKph: 250 - (index >= 5 && index <= 8 ? 100 : 0), elapsedSeconds: index }))
const measured: MeasuredTrackSnapshot = {
  sessionId: 'measured-1', trackName: 'Autódromo measured', layoutName: '', trackLengthM: 1000,
  route, coverage: 1, state: 'complete', completedLapCount: 1, selectedLapNumber: 3,
  selectedLap: route, geometryFingerprint: '1234abcd',
  brakeZones: [{ id: 'zone-1', startDistanceM: 250, peakDistanceM: 300, releaseDistanceM: 400, endDistanceM: 450, peakPressure: 0.8, durationSeconds: 2.1, entrySpeedKph: 250, minimumSpeedKph: 150, exitSpeedKph: 180, sampleCount: 4 }],
}

describe('measured analysis view', () => {
  it('links the reconstructed map, distance trace, and keyboard-selectable brake evidence', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<I18nProvider><AnalyzeView measuredTrack={measured} /></I18nProvider>))

    expect(container.textContent).toContain('Measured braking by lap distance')
    expect(container.textContent).toContain('250–400 m')
    expect(container.textContent).toContain('Peak pressure 80%')
    expect(container.querySelector('.measured-zone-list button')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelectorAll('.circuit-segment')).toHaveLength(1)
    expect(container.querySelector('.measured-trace polyline.speed')).not.toBeNull()

    await act(async () => root.unmount())
    container.remove()
  })
})
