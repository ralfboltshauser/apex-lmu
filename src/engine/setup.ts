import { clamp, round } from './common';
import { scoreConfidence, type ConfidenceScore } from './confidence';

export type SetupSymptom =
  | 'understeer'
  | 'oversteer'
  | 'braking-instability'
  | 'poor-traction'
  | 'wheelspin'
  | 'kerb-instability'
  | 'bottoming'
  | 'tyre-overheating';

export type CornerPhase = 'braking' | 'entry' | 'mid' | 'exit' | 'whole-corner';
export type SpeedBand = 'slow' | 'medium' | 'fast' | 'mixed';
export type Axle = 'front' | 'rear' | 'both' | 'unknown';

export type SetupParameter =
  | 'brake-bias'
  | 'front-anti-roll-bar'
  | 'rear-anti-roll-bar'
  | 'front-spring-rate'
  | 'rear-spring-rate'
  | 'front-ride-height'
  | 'rear-ride-height'
  | 'front-wing'
  | 'rear-wing'
  | 'differential-coast-locking'
  | 'differential-power-locking'
  | 'traction-control'
  | 'front-fast-bump'
  | 'rear-fast-bump'
  | 'front-fast-rebound'
  | 'rear-fast-rebound'
  | 'front-brake-duct'
  | 'rear-brake-duct';

export interface SetupTelemetryEvidence {
  /** All evidence channels are normalized 0..1 strengths. */
  readonly frontSlipExcess?: number;
  readonly rearSlipExcess?: number;
  readonly wheelspin?: number;
  readonly rearLocking?: number;
  readonly frontLocking?: number;
  readonly bottomingEvents?: number;
  readonly kerbVerticalImpact?: number;
  readonly frontTemperatureExcess?: number;
  readonly rearTemperatureExcess?: number;
}

export interface SetupSymptomReport {
  readonly symptom: SetupSymptom;
  readonly phase: CornerPhase;
  readonly speedBand: SpeedBand;
  readonly severity?: 1 | 2 | 3 | 4 | 5;
  readonly axle?: Axle;
  /** Confidence in the driver's report, e.g. after reproducing it for several laps. */
  readonly reportConfidence?: number;
  readonly telemetry?: SetupTelemetryEvidence;
  /** If provided, recommendations are limited to settings exposed by this car. */
  readonly availableParameters?: readonly SetupParameter[];
}

export type SetupAdjustment = 'increase' | 'decrease';
export type ChangeRisk = 'low' | 'medium' | 'high';

export interface SetupRecommendation {
  readonly parameter: SetupParameter;
  readonly adjustment: SetupAdjustment;
  readonly steps: 1 | 2;
  readonly label: string;
  readonly expectedEffect: string;
  readonly tradeoff: string;
  readonly why: string;
  readonly changeRisk: ChangeRisk;
  readonly confidence: ConfidenceScore;
  readonly rankScore: number;
}

export interface SetupRecommendationResult {
  readonly diagnosis: string;
  readonly recommendations: readonly SetupRecommendation[];
  readonly warnings: readonly string[];
  readonly experiment: readonly string[];
  readonly confidence: ConfidenceScore;
}

type EvidenceKey = keyof SetupTelemetryEvidence;

interface Rule {
  readonly symptoms: readonly SetupSymptom[];
  readonly phases?: readonly CornerPhase[];
  readonly speeds?: readonly SpeedBand[];
  readonly axles?: readonly Axle[];
  readonly parameter: SetupParameter;
  readonly adjustment: SetupAdjustment;
  readonly label: string;
  readonly expectedEffect: string;
  readonly tradeoff: string;
  readonly why: string;
  readonly risk: ChangeRisk;
  readonly basePriority: number;
  readonly evidence?: EvidenceKey;
  readonly rejectWhen?: { readonly key: EvidenceKey; readonly above: number };
}

const RULES: readonly Rule[] = [
  {
    symptoms: ['understeer'], phases: ['braking', 'entry'],
    parameter: 'differential-coast-locking', adjustment: 'decrease',
    label: 'Reduce coast differential locking one step',
    expectedEffect: 'Allows more inside/outside rear-wheel speed difference off throttle, helping entry rotation.',
    tradeoff: 'Can make lift-off and trail-brake behaviour less stable.',
    why: 'Best matched to understeer that appears while decelerating or turning in.',
    risk: 'medium', basePriority: 0.86, evidence: 'frontSlipExcess',
  },
  {
    symptoms: ['understeer'], phases: ['braking', 'entry'],
    parameter: 'brake-bias', adjustment: 'decrease',
    label: 'Move brake bias rearward one step',
    expectedEffect: 'Adds rear braking contribution and can help the car rotate under trail braking.',
    tradeoff: 'Raises the risk of rear locking and braking instability.',
    why: 'Use only for repeatable entry understeer with rear-locking evidence absent.',
    risk: 'high', basePriority: 0.72, evidence: 'frontLocking',
    rejectWhen: { key: 'rearLocking', above: 0.25 },
  },
  {
    symptoms: ['understeer'], phases: ['entry', 'mid', 'whole-corner'], speeds: ['slow', 'medium', 'mixed'],
    parameter: 'front-anti-roll-bar', adjustment: 'decrease',
    label: 'Soften the front anti-roll bar one step',
    expectedEffect: 'Increases front mechanical independence and usually improves low-to-medium-speed front grip.',
    tradeoff: 'Can slow response and increase platform movement or kerb contact.',
    why: 'Mechanical balance is the more direct lever when the symptom is not aero-dominated.',
    risk: 'low', basePriority: 0.82, evidence: 'frontSlipExcess',
  },
  {
    symptoms: ['understeer'], phases: ['mid', 'whole-corner'], speeds: ['fast'],
    parameter: 'front-wing', adjustment: 'increase',
    label: 'Add one step of front wing',
    expectedEffect: 'Moves high-speed aero balance forward and increases front load.',
    tradeoff: 'May add drag and can create high-speed oversteer if taken too far.',
    why: 'A fast-corner-only balance problem is more likely aero-sensitive.',
    risk: 'medium', basePriority: 0.9, evidence: 'frontSlipExcess',
  },
  {
    symptoms: ['understeer'], phases: ['exit'],
    parameter: 'differential-power-locking', adjustment: 'decrease',
    label: 'Reduce power differential locking one step',
    expectedEffect: 'Lets the rear wheels differentiate more under power, which can reduce power-on push.',
    tradeoff: 'May increase inside-wheel spin and reduce traction on uneven exits.',
    why: 'This specifically targets understeer that begins as throttle is applied.',
    risk: 'medium', basePriority: 0.85, evidence: 'frontSlipExcess',
  },
  {
    symptoms: ['oversteer', 'braking-instability'], phases: ['braking', 'entry'],
    parameter: 'brake-bias', adjustment: 'increase',
    label: 'Move brake bias forward one step',
    expectedEffect: 'Reduces rear braking demand and stabilizes the car during deceleration.',
    tradeoff: 'Can increase front locking and entry understeer.',
    why: 'Forward bias is the safest first test when instability is tied to braking.',
    risk: 'medium', basePriority: 0.94, evidence: 'rearLocking',
  },
  {
    symptoms: ['oversteer', 'braking-instability'], phases: ['braking', 'entry'],
    parameter: 'differential-coast-locking', adjustment: 'increase',
    label: 'Increase coast differential locking one step',
    expectedEffect: 'Adds rear-axle stability off throttle and during trail braking.',
    tradeoff: 'Reduces entry rotation and may create understeer.',
    why: 'This is appropriate when the rear rotates too freely without throttle.',
    risk: 'medium', basePriority: 0.83, evidence: 'rearSlipExcess',
  },
  {
    symptoms: ['oversteer'], phases: ['entry', 'mid', 'exit', 'whole-corner'], speeds: ['slow', 'medium', 'mixed'],
    parameter: 'rear-anti-roll-bar', adjustment: 'decrease',
    label: 'Soften the rear anti-roll bar one step',
    expectedEffect: 'Improves rear mechanical grip and makes lateral load transfer less abrupt.',
    tradeoff: 'Can reduce rotation and make direction changes slower.',
    why: 'A broad low-to-medium-speed rear-grip problem points to mechanical balance.',
    risk: 'low', basePriority: 0.88, evidence: 'rearSlipExcess',
  },
  {
    symptoms: ['oversteer'], phases: ['mid', 'whole-corner'], speeds: ['fast'],
    parameter: 'rear-wing', adjustment: 'increase',
    label: 'Add one step of rear wing',
    expectedEffect: 'Moves high-speed aero balance rearward and increases rear stability.',
    tradeoff: 'Adds drag and can create high-speed understeer.',
    why: 'Fast-corner oversteer is more likely to respond to aero balance than soft-corner tuning.',
    risk: 'medium', basePriority: 0.91, evidence: 'rearSlipExcess',
  },
  {
    symptoms: ['poor-traction', 'wheelspin'], phases: ['exit', 'whole-corner'],
    parameter: 'rear-anti-roll-bar', adjustment: 'decrease',
    label: 'Soften the rear anti-roll bar one step',
    expectedEffect: 'Keeps the driven tyres more evenly loaded over cambers and bumps.',
    tradeoff: 'Reduces rotation and may soften transient response.',
    why: 'Mechanical rear compliance is a robust first lever for traction problems.',
    risk: 'low', basePriority: 0.9, evidence: 'wheelspin',
  },
  {
    symptoms: ['poor-traction', 'wheelspin'], phases: ['exit', 'whole-corner'],
    parameter: 'traction-control', adjustment: 'increase',
    label: 'Increase traction control one step',
    expectedEffect: 'Reduces the magnitude and duration of power wheelspin.',
    tradeoff: 'Can cut acceleration and mask an overly aggressive throttle application.',
    why: 'Use as a consistency control, then verify whether chassis changes are still needed.',
    risk: 'low', basePriority: 0.76, evidence: 'wheelspin',
  },
  {
    symptoms: ['kerb-instability'],
    parameter: 'front-fast-bump', adjustment: 'decrease',
    label: 'Soften front fast bump damping one step',
    expectedEffect: 'Lets the front suspension absorb sharp kerb inputs with less load spike.',
    tradeoff: 'Too little damping can allow repeated oscillation and poor platform control.',
    why: 'Fast damping acts on short, high-velocity kerb events.',
    risk: 'medium', basePriority: 0.85, evidence: 'kerbVerticalImpact',
  },
  {
    symptoms: ['kerb-instability'],
    parameter: 'rear-fast-bump', adjustment: 'decrease',
    label: 'Soften rear fast bump damping one step',
    expectedEffect: 'Reduces the rear load spike as it crosses a sharp kerb.',
    tradeoff: 'Too little damping can make the rear bounce after the initial impact.',
    why: 'Choose this first when the instability starts as the rear axle reaches the kerb.',
    risk: 'medium', basePriority: 0.82, evidence: 'kerbVerticalImpact',
  },
  {
    symptoms: ['bottoming'],
    parameter: 'front-ride-height', adjustment: 'increase',
    label: 'Raise front ride height one step',
    expectedEffect: 'Adds compression travel and reduces front-floor contact.',
    tradeoff: 'Changes aero balance, drag, and platform attitude.',
    why: 'Ride height directly restores missing travel; re-check aero balance afterward.',
    risk: 'medium', basePriority: 0.93, evidence: 'bottomingEvents',
  },
  {
    symptoms: ['bottoming'],
    parameter: 'rear-ride-height', adjustment: 'increase',
    label: 'Raise rear ride height one step',
    expectedEffect: 'Adds rear compression travel and can prevent floor contact.',
    tradeoff: 'Changes rake and may move aero balance forward.',
    why: 'Use when telemetry or replay locates the contact at the rear.',
    risk: 'medium', basePriority: 0.86, evidence: 'bottomingEvents',
  },
  {
    symptoms: ['bottoming'],
    parameter: 'front-spring-rate', adjustment: 'increase',
    label: 'Stiffen front springs one step',
    expectedEffect: 'Reduces compression under load when ride height cannot be raised further.',
    tradeoff: 'Costs mechanical grip over bumps and kerbs.',
    why: 'A secondary option after confirming that the car is genuinely using all travel.',
    risk: 'medium', basePriority: 0.65, evidence: 'bottomingEvents',
  },
  {
    symptoms: ['tyre-overheating'], axles: ['front', 'both'],
    parameter: 'front-brake-duct', adjustment: 'increase',
    label: 'Open front brake ducts one step',
    expectedEffect: 'Can reduce heat transferred from an overheated front brake assembly into the wheel.',
    tradeoff: 'Adds cooling drag and may make brakes too cold in lighter use.',
    why: 'Only useful when brake temperature is a credible contributor to front tyre heat.',
    risk: 'low', basePriority: 0.56, evidence: 'frontTemperatureExcess',
  },
  {
    symptoms: ['tyre-overheating'], axles: ['rear', 'both'],
    parameter: 'rear-brake-duct', adjustment: 'increase',
    label: 'Open rear brake ducts one step',
    expectedEffect: 'Can reduce heat transferred from an overheated rear brake assembly into the wheel.',
    tradeoff: 'Adds cooling drag and may make rear brakes too cold.',
    why: 'Only useful when brake temperature is a credible contributor to rear tyre heat.',
    risk: 'low', basePriority: 0.56, evidence: 'rearTemperatureExcess',
  },
];

function ruleMatches(rule: Rule, report: SetupSymptomReport): boolean {
  if (!rule.symptoms.includes(report.symptom)) return false;
  if (rule.phases && !rule.phases.includes(report.phase)) return false;
  if (rule.speeds && !rule.speeds.includes(report.speedBand)) return false;
  const axle = report.axle ?? 'unknown';
  if (rule.axles && !rule.axles.includes(axle)) return false;
  if (report.availableParameters && !report.availableParameters.includes(rule.parameter)) return false;
  if (rule.rejectWhen) {
    const value = report.telemetry?.[rule.rejectWhen.key];
    if (value !== undefined && value > rule.rejectWhen.above) return false;
  }
  return true;
}

function supportFor(rule: Rule, report: SetupSymptomReport): number {
  if (!rule.evidence) return 0.55;
  const value = report.telemetry?.[rule.evidence];
  return value === undefined ? 0.5 : clamp(value);
}

function diagnosisFor(report: SetupSymptomReport): string {
  const phase = report.phase === 'whole-corner' ? 'throughout the corner' : `during ${report.phase}`;
  const speed = report.speedBand === 'mixed' ? 'across mixed-speed corners' : `in ${report.speedBand}-speed corners`;
  return `${report.symptom.replaceAll('-', ' ')} ${phase}, ${speed}`;
}

/**
 * Produces small, reversible experiments. It intentionally does not claim an
 * optimal setup: the same driver symptom can have several physical causes.
 */
export function recommendSetupChanges(
  report: SetupSymptomReport,
  limit = 4,
): SetupRecommendationResult {
  const severity = report.severity ?? 3;
  if (severity < 1 || severity > 5) throw new RangeError('severity must be in the range 1..5');
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError('limit must be a non-negative integer');
  }
  if (
    report.reportConfidence !== undefined
    && (!Number.isFinite(report.reportConfidence)
      || report.reportConfidence < 0
      || report.reportConfidence > 1)
  ) {
    throw new RangeError('reportConfidence must be in the range 0..1');
  }
  if (report.telemetry) {
    for (const [key, value] of Object.entries(report.telemetry)) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`telemetry.${key} must be in the range 0..1`);
      }
    }
  }
  const reportConfidence = clamp(report.reportConfidence ?? 0.7);
  const matching = RULES
    .filter((rule) => ruleMatches(rule, report))
    .map((rule): SetupRecommendation => {
      const support = supportFor(rule, report);
      const confidence = scoreConfidence([
        {
          id: 'driver-report',
          score: reportConfidence,
          weight: 1.1,
          explanation: 'Repeatability and certainty of the reported symptom.',
        },
        {
          id: 'telemetry-support',
          score: support,
          weight: 1.3,
          explanation: rule.evidence
            ? `Support from ${rule.evidence}.`
            : 'This rule has no direct telemetry confirmation.',
        },
        {
          id: 'rule-specificity',
          score: rule.phases || rule.speeds || rule.axles ? 0.82 : 0.62,
          explanation: 'Specific phase and speed matches are more reliable than generic rules.',
        },
      ]);
      const steps: 1 | 2 = severity >= 5 && rule.risk === 'low' && confidence.score >= 0.72 ? 2 : 1;
      return {
        parameter: rule.parameter,
        adjustment: rule.adjustment,
        steps,
        label: rule.label.replace('one step', steps === 2 ? 'two steps' : 'one step'),
        expectedEffect: rule.expectedEffect,
        tradeoff: rule.tradeoff,
        why: rule.why,
        changeRisk: rule.risk,
        confidence,
        rankScore: round(rule.basePriority * 0.55 + support * 0.3 + confidence.score * 0.15, 4),
      };
    })
    .sort((left, right) => right.rankScore - left.rankScore || left.parameter.localeCompare(right.parameter))
    .filter((recommendation, index, all) =>
      all.findIndex((candidate) => candidate.parameter === recommendation.parameter) === index,
    )
    .slice(0, Math.max(0, limit));

  const overallConfidence = scoreConfidence([
    { id: 'report', score: reportConfidence, weight: 1.1 },
    {
      id: 'telemetry',
      score: report.telemetry ? 0.8 : 0.4,
      explanation: report.telemetry ? 'Telemetry evidence was supplied.' : 'Diagnosis is based on feel alone.',
    },
    {
      id: 'rule-coverage',
      score: clamp(matching.length / 3),
      explanation: 'Number of applicable, reversible setup experiments.',
    },
  ]);
  const warnings = [
    'Change one setting at a time; otherwise the result cannot be attributed to a cause.',
    'Re-test with the same fuel, tyres, weather, and driving approach.',
    ...(matching.some((item) => item.changeRisk === 'high')
      ? ['A high-risk brake-balance suggestion is present; use one click and verify locking immediately.']
      : []),
    ...(report.symptom === 'tyre-overheating'
      ? ['Tyre heat often starts with driving, pressure, or alignment; brake-duct advice is conditional, not a complete diagnosis.']
      : []),
  ];
  const first = matching[0];
  const experiment = first
    ? [
      'Save the current setup as a baseline revision.',
      `Apply only: ${first.label}.`,
      'Run at least three representative laps after temperatures stabilize.',
      'Compare the same corners, inputs, balance evidence, lap time, and tyre state against baseline.',
      'Keep the change only if the target symptom improves without a larger tradeoff; otherwise roll back.',
    ]
    : [
      'Record a repeatable baseline with stable fuel, tyres, and weather.',
      'Collect telemetry or broaden the available setup parameters before making a recommendation.',
    ];

  return {
    diagnosis: diagnosisFor(report),
    recommendations: matching,
    warnings,
    experiment,
    confidence: overallConfidence,
  };
}
