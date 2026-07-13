import { comparisonDeltaTrace, deltaAtDistance, sampleLapAt } from './lap-playback'

const sample = (distanceM: number, lapElapsedSeconds: number, gear: number) => ({ distanceM, rawDistanceM: distanceM, distanceIndexM: distanceM, x: distanceM, y: 0, z: distanceM * 2, brake: distanceM / 100, throttle: 1 - distanceM / 100, gear, rpm: 5000 + distanceM, speedKph: 100 + distanceM, elapsedSeconds: 20 + lapElapsedSeconds, lapElapsedSeconds, countLapFlag: 2 })

describe('lap playback', () => {
  it('uses binary-search interpolation for continuous fields and step semantics for gear', () => {
    const result = sampleLapAt([sample(0, 0, 2), sample(100, 10, 4)], 'distance', 25)!
    expect(result.x).toBe(25)
    expect(result.z).toBe(50)
    expect(result.lapElapsedSeconds).toBe(2.5)
    expect(result.gear).toBe(2)
  })

  it('aligns comparison by monotonic distance rather than sample index', () => {
    const subject = [sample(0, 0, 1), sample(40, 5, 2), sample(100, 12, 4)]
    const reference = [sample(0, 0, 1), sample(100, 10, 4)]
    expect(deltaAtDistance(subject, reference, 100)).toBe(2)
    expect(comparisonDeltaTrace(subject, reference, 100, 25)).toHaveLength(5)
  })

  it('handles duplicate axis samples and clamps endpoints', () => {
    const samples = [sample(0, 0, 1), sample(0, 0.1, 1), sample(100, 10, 4)]
    expect(sampleLapAt(samples, 'distance', -1)?.x).toBe(0)
    expect(sampleLapAt(samples, 'distance', 200)?.x).toBe(100)
    expect(sampleLapAt(samples, 'distance', 50)?.x).toBeGreaterThan(0)
  })
})
