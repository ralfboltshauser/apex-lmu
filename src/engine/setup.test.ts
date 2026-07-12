import { describe, expect, it } from 'vitest';
import { recommendSetupChanges } from './setup';

describe('setup recommendation rules', () => {
  it('uses phase-specific rules and filters an unsafe rearward brake-bias change', () => {
    const result = recommendSetupChanges({
      symptom: 'understeer',
      phase: 'entry',
      speedBand: 'medium',
      severity: 4,
      reportConfidence: 0.9,
      telemetry: { frontSlipExcess: 0.85, rearLocking: 0.8 },
    });
    expect(result.recommendations.some((item) => item.parameter === 'differential-coast-locking'))
      .toBe(true);
    expect(result.recommendations.some((item) => item.parameter === 'brake-bias')).toBe(false);
    expect(result.experiment[1]).toContain(result.recommendations[0].label);
  });

  it('selects an aero adjustment for fast mid-corner oversteer', () => {
    const result = recommendSetupChanges({
      symptom: 'oversteer', phase: 'mid', speedBand: 'fast',
      telemetry: { rearSlipExcess: 0.8 },
    });
    expect(result.recommendations[0].parameter).toBe('rear-wing');
    expect(result.recommendations[0].adjustment).toBe('increase');
  });

  it('respects car-specific available parameters', () => {
    const result = recommendSetupChanges({
      symptom: 'bottoming', phase: 'whole-corner', speedBand: 'mixed',
      telemetry: { bottomingEvents: 1 },
      availableParameters: ['rear-ride-height'],
    });
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].parameter).toBe('rear-ride-height');
  });

  it('marks telemetry-backed advice as more confident than feel-only advice', () => {
    const withEvidence = recommendSetupChanges({
      symptom: 'wheelspin', phase: 'exit', speedBand: 'slow',
      telemetry: { wheelspin: 0.9 },
    });
    const feelOnly = recommendSetupChanges({
      symptom: 'wheelspin', phase: 'exit', speedBand: 'slow',
    });
    expect(withEvidence.confidence.score).toBeGreaterThan(feelOnly.confidence.score);
  });
});
