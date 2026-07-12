import { describe, expect, it } from 'vitest';
import {
  dispersionConfidence,
  sampleSizeConfidence,
  scoreConfidence,
} from './confidence';

describe('confidence scoring', () => {
  it('increases monotonically with sample size', () => {
    expect(sampleSizeConfidence(20)).toBeGreaterThan(sampleSizeConfidence(5));
    expect(sampleSizeConfidence(5)).toBeGreaterThan(sampleSizeConfidence(1));
  });

  it('falls as relative dispersion increases', () => {
    expect(dispersionConfidence(0.02)).toBeGreaterThan(dispersionConfidence(0.08));
    expect(dispersionConfidence(0.08)).toBeGreaterThan(dispersionConfidence(0.2));
  });

  it('does not hide a very weak input behind strong factors', () => {
    const allStrong = scoreConfidence([
      { id: 'a', score: 0.9 },
      { id: 'b', score: 0.9 },
    ]);
    const weakLink = scoreConfidence([
      { id: 'a', score: 0.9 },
      { id: 'b', score: 0.1 },
    ]);
    expect(weakLink.score).toBeLessThan(allStrong.score);
    expect(weakLink.limitingFactor?.id).toBe('b');
  });
});
