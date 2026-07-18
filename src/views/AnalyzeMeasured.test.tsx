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

    expect(container.textContent).toContain('Synchronized speed and brake trace')
    expect(container.textContent).toContain('250–400 m')
    expect(container.textContent).toContain('Peak pressure 80%')
    expect(container.querySelector('.measured-zone-list button')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelectorAll('.circuit-segment')).toHaveLength(1)
    expect(container.querySelector('.measured-trace polyline.speed')).not.toBeNull()

    await act(async () => (container.querySelector('.measured-zone-list button') as HTMLButtonElement).click())
    expect(container.querySelector('[data-testid="playback-value"]')?.textContent).toBe('300 m')
    expect(container.querySelector('[data-testid="telemetry-cursor"]')?.getAttribute('x1')).toBe('300')

    await act(async () => root.unmount())
    container.remove()
  })

  it('keeps completed laps selectable and defaults to the latest clean lap instead of the current partial lap', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const samples = route.map((sample) => ({ ...sample, throttle: 0.8, steering: 0, lapElapsedSeconds: sample.elapsedSeconds }))
    const laps: ApexAnalysisLapSummary[] = [
      { id: 'lap-1', number: 1, state: 'complete', quality: 'clean', reasons: [], lapTimeMs: 100_000, timingSource: 'official', coverage: 1, maximumGapM: 50, sampleCount: samples.length, samplesAvailable: true },
      { id: 'lap-2', number: 2, state: 'complete', quality: 'clean', reasons: [], lapTimeMs: 99_000, timingSource: 'official', coverage: 1, maximumGapM: 50, sampleCount: samples.length, samplesAvailable: true },
      { id: 'lap-3', number: 3, state: 'complete', quality: 'clean', reasons: [], lapTimeMs: 98_000, timingSource: 'official', coverage: 1, maximumGapM: 50, sampleCount: samples.length, samplesAvailable: true },
      { id: 'lap-4', number: 4, state: 'current', quality: 'ineligible', reasons: ['coverage-low', 'incomplete'], lapTimeMs: null, timingSource: 'unavailable', coverage: 0.25, maximumGapM: 750, sampleCount: 6, samplesAvailable: true },
    ]
    const session: ApexAnalysisSessionSummary = { schemaVersion: 1, qualityPolicyVersion: 'lap-quality-v2', revision: 10, id: 'session-1', source: 'live', state: 'active', startedAt: '2026-07-13T10:00:00Z', endedAt: null, track: { name: 'Measured Track', layout: '', lengthM: 1000 }, car: { id: 1, name: 'Measured Car', class: 'GT3' }, laps, currentLapId: 'lap-4', interruptionCount: 1, sourceSegmentCount: 2 }
    const originalDesktop = window.apexDesktop
    window.apexDesktop = { getAnalysisLap: async (_sessionId: string, lapId: string) => ({ schemaVersion: 1, session, lap: laps.find((lap) => lap.id === lapId)!, samples: lapId === 'lap-4' ? samples.slice(0, 6) : samples }), reportError: async () => ({ ok: true }) } as unknown as ApexDesktopApi
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<I18nProvider><AnalyzeView analysisSessions={[session]} /></I18nProvider>))
      await act(async () => { await Promise.resolve() })
      const lapSelect = container.querySelector('select[aria-label="Measured lap"]') as HTMLSelectElement
      expect(lapSelect.value).toBe('lap-3')
      expect(container.querySelector('select[aria-label="Playback speed"]')).not.toBeNull()
      expect(container.textContent).toContain('Lap 4 · Current partial lap · Not eligible as reference')
      expect(container.textContent).toContain('Selected lap 3')
      expect(container.querySelector('.measured-trace polyline.speed')).not.toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
      window.apexDesktop = originalDesktop
    }
  })
})
