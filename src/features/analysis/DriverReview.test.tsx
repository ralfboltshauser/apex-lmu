import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '../../i18n';
import { AnalyzeView } from '../../views/AnalyzeView';
import { DriverReview, type DriverReviewLoadState } from './DriverReview';

function importState(): ApexAnalysisImportState {
  return {
    schemaVersion: 1, status: 'idle', fileName: null, bytesProcessed: 0, bytesTotal: 0,
    frames: 0, sessions: 0, laps: 0, importedSessions: 0, importedLaps: 0,
    duplicate: false, sessionIds: [], reason: null,
  };
}

function lap(id: string, number: number, lapTimeMs: number): ApexAnalysisLapSummary {
  return {
    id, number, state: 'complete', quality: 'clean', reasons: [], lapTimeMs,
    timingSource: 'official', coverage: 0.99, maximumGapM: 12, sampleCount: 101,
    samplesAvailable: true, replayable: true, referenceEligible: true, trackModelEligible: true,
  };
}

function session(): ApexAnalysisSessionSummary {
  const laps = [lap('lap-1', 1, 90_000), lap('lap-2', 2, 91_000), lap('lap-3', 3, 92_000), lap('lap-4', 4, 93_000)];
  return {
    schemaVersion: 1, qualityPolicyVersion: 'lap-quality-v2', revision: 1,
    id: 'review-session', source: 'imported-recording', state: 'finished',
    startedAt: '2026-07-16T19:00:00Z', endedAt: '2026-07-16T20:00:00Z',
    track: { name: 'Measured circuit', layout: 'Short', lengthM: 1000 },
    car: { id: 7, name: 'Measured car', class: 'GT3' }, laps, currentLapId: null,
    interruptionCount: 0, sourceSegmentCount: 1,
    importProvenance: {
      id: 'recording-import-review', recordingSha256: 'a'.repeat(64), recordingFormat: 'apex-lmu-raw-v1',
      processingVersion: 'apexrec-analysis-v3', importedAt: '2026-07-17T10:00:00Z', appVersion: '0.3.2', sessionCount: 1, lapCount: 4,
    },
  };
}

function samples(lapTimeMs: number, offset = 0): ApexAnalysisSample[] {
  return Array.from({ length: 101 }, (_, index) => {
    const distanceM = index * 10;
    const angle = distanceM / 1000 * Math.PI * 2;
    return {
      distanceM,
      distanceIndexM: distanceM,
      x: Math.cos(angle) * 100 + offset,
      z: Math.sin(angle) * 100,
      brake: distanceM >= 280 && distanceM <= 360 ? 0.65 : 0,
      throttle: distanceM >= 380 ? 0.9 : 0.2,
      steering: Math.sin(angle) * 0.2,
      speedKph: 185 - (distanceM >= 280 && distanceM <= 360 ? 55 : 0),
      elapsedSeconds: distanceM / 1000 * lapTimeMs / 1000,
      lapElapsedSeconds: distanceM / 1000 * lapTimeMs / 1000,
    };
  });
}

function payload(summary: ApexAnalysisSessionSummary, lapId: string, personalBest: ApexAnalysisLapPayload['personalBest'] = null): ApexAnalysisLapPayload {
  const lapSummary = summary.laps.find((value) => value.id === lapId)!;
  return {
    schemaVersion: 1,
    session: summary,
    lap: lapSummary,
    samples: samples(lapSummary.lapTimeMs ?? 90_000),
    trackModel: null,
    personalBest,
  };
}

function review(patch: Partial<ApexDriverReview> = {}): ApexDriverReview {
  return {
    schemaVersion: 1,
    algorithmVersion: 'driver-review-v1',
    inputFingerprint: 'f'.repeat(64),
    status: { code: 'ready' },
    cohort: {
      decodedLapCount: 4,
      analyzedLapCount: 4,
      nonReferenceLapCount: 3,
      accounting: { totalLapCount: 4, strictEligibleTotal: 4, sampledLapCount: 4, strictExcludedTotal: 0, notDecodedDueToLimit: 0, exclusions: {} },
    },
    reference: { lapId: 'lap-1', lapNumber: 1, lapTimeMs: 90_000 },
    selectedComparison: null,
    hotspots: [{
      id: 'segment-002', startDistanceM: 256, endDistanceM: 512,
      representativeLapId: 'lap-2', representativeLapNumber: 2,
      medianLossMs: 240, minimumLossMs: 180, maximumLossMs: 330, madLossMs: 45,
      directionalAgreement: 1, comparedLapCount: 3,
      observations: [{ code: 'throttle-pickup-later', medianDelta: 32, unit: 'm', directionalAgreement: 1, comparedLapCount: 3 }],
      experiments: ['throttle-pickup-earlier-small-step'],
    }],
    strength: {
      code: 'smallest-median-relative-loss', segmentId: 'segment-004', startDistanceM: 768, endDistanceM: 1000,
      representativeLapId: 'lap-3', representativeLapNumber: 3, medianLossMs: 12,
      minimumLossMs: -20, maximumLossMs: 40, madLossMs: 10, comparedLapCount: 3,
    },
    variability: { code: 'pace-stable', medianLapTimeMs: 91_500, madLapTimeMs: 1_000, minimumLapTimeMs: 90_000, maximumLapTimeMs: 93_000, comparedLapCount: 4 },
    limitations: ['selected-lap-not-supplied'],
    ...patch,
  };
}

function desktop(overrides: Partial<ApexDesktopApi> = {}): ApexDesktopApi {
  return {
    getAnalysisLap: async () => null,
    getDriverReview: async () => null,
    getAnalysisImportState: async () => importState(),
    onAnalysisImportState: () => () => {},
    startAnalysisImport: async () => ({ ok: false, canceled: true }),
    reportError: async () => ({ ok: true }),
    ...overrides,
  } as unknown as ApexDesktopApi;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('deterministic Driver debrief UI', () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let originalDesktop: ApexDesktopApi | undefined;
  let storage: Map<string, string>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    storage = new Map();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
      clear: () => storage.clear(),
    } });
    window.localStorage.setItem('apex:language', 'en');
    originalDesktop = window.apexDesktop;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    window.apexDesktop = originalDesktop;
    window.localStorage.removeItem('apex:language');
  });

  it('opens on Driver debrief and builds a stable session cohort without a selected lap', async () => {
    const calls: unknown[][] = [];
    let lapCalls = 0;
    window.apexDesktop = desktop({
      getDriverReview: async (...args: [string, string?]) => { calls.push(args); return review(); },
      getAnalysisLap: async (_sessionId, lapId) => { lapCalls += 1; return payload(session(), lapId); },
    });
    await act(async () => root!.render(<I18nProvider><AnalyzeView analysisSessions={[session()]} /></I18nProvider>));
    await settle();

    const debriefTab = container.querySelector('#measured-analysis-tab-debrief') as HTMLButtonElement;
    const evidenceTab = container.querySelector('#measured-analysis-tab-evidence') as HTMLButtonElement;
    expect(debriefTab.getAttribute('aria-selected')).toBe('true');
    expect(evidenceTab.getAttribute('aria-selected')).toBe('false');
    expect(container.querySelector('#measured-analysis-panel-debrief')).not.toBeNull();
    expect(container.textContent).toContain('Next focus');
    expect(container.textContent).toContain('100% of the 3 laps were slower here and showed this direction');
    expect(container.textContent).toContain('This is a repeated association, not a diagnosed cause.');
    expect(container.querySelector('.driver-review__strength-value strong')?.classList.contains('is-gain')).toBe(false);
    const selectedLedgerRow = container.querySelector('.session-debrief__ledger > button.is-selected');
    expect(selectedLedgerRow?.getAttribute('aria-selected')).toBe('true');
    expect(selectedLedgerRow?.hasAttribute('aria-pressed')).toBe(false);
    expect(calls).toEqual([['review-session']]);
    expect(lapCalls).toBe(0);

    await act(async () => debriefTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(evidenceTab.getAttribute('aria-selected')).toBe('true');
    expect((document.activeElement as HTMLElement).id).toBe('measured-analysis-tab-evidence');
    await act(async () => evidenceTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(debriefTab.getAttribute('aria-selected')).toBe('true');
    expect((document.activeElement as HTMLElement).id).toBe('measured-analysis-tab-debrief');
  });

  it('localizes rejected evidence and distinguishes insufficient from no repeated pattern', async () => {
    window.localStorage.setItem('apex:language', 'de');
    const noop = () => {};
    await act(async () => root!.render(<I18nProvider><DriverReview state={{ code: 'ready', review: review() }} onShowEvidence={noop} /></I18nProvider>));
    expect(container.textContent).toContain('Runden waren hier langsamer und zeigten diese Richtung');
    expect(container.textContent).toContain('Dies ist ein wiederkehrender Zusammenhang, keine festgestellte Ursache.');

    await act(async () => root!.render(<I18nProvider><DriverReview state={{ code: 'ready', review: review({ status: { code: 'invalid-input', reasonCode: 'lap-payload-malformed' }, reference: null, hotspots: [], strength: null, variability: null }) }} onShowEvidence={noop} /></I18nProvider>));
    expect(container.textContent).toContain('Belege haben die Prüfung nicht bestanden');
    expect(container.textContent).toContain('Online-/Offline-Modusfeld');

    const insufficient: DriverReviewLoadState = { code: 'ready', review: review({ status: { code: 'insufficient-evidence', reasonCode: 'reference-unavailable' }, reference: null, hotspots: [], strength: null, variability: null, limitations: ['fewer-than-three-comparisons'] }) };
    await act(async () => root!.render(<I18nProvider><DriverReview state={insufficient} onShowEvidence={noop} /></I18nProvider>));
    expect(container.textContent).toContain('Mehr streng geeignete Runden nötig');
    expect(container.textContent).toContain('Keine vollständige, offizielle und saubere Runde');

    await act(async () => root!.render(<I18nProvider><DriverReview state={{ code: 'ready', review: review({ hotspots: [], limitations: ['no-recurring-hotspots'] }) }} onShowEvidence={noop} /></I18nProvider>));
    expect(container.textContent).toContain('Kein wiederkehrender Schwerpunkt erfüllt die Grenze');
    expect(container.textContent).toContain('senkt die Beleggrenze nicht');

    await act(async () => root!.render(<I18nProvider><DriverReview state={{ code: 'unavailable' }} onShowEvidence={noop} /></I18nProvider>));
    expect(container.textContent).toContain('Auswertung zurückgehalten');
    expect(container.textContent).toContain('nicht verfügbar oder haben die Prüfung nicht bestanden');

    await act(async () => root!.render(<I18nProvider><DriverReview state={{ code: 'error' }} onShowEvidence={noop} /></I18nProvider>));
    expect(container.textContent).toContain('Auswertung konnte nicht geladen werden');
  });

  it('opens the exact representative/reference pair, focuses and seeks the reported range without using a global PB', async () => {
    const summary = session();
    const globalSession = { ...summary, id: 'other-session' };
    const globalLap = { ...summary.laps[0], id: 'global-pb', number: 99 };
    const globalPersonalBest: NonNullable<ApexAnalysisLapPayload['personalBest']> = {
      session: globalSession,
      lap: globalLap,
      samples: samples(80_000, 10_000),
    };
    const lapCalls: Array<[string, string]> = [];
    let reviewCalls = 0;
    window.apexDesktop = desktop({
      getDriverReview: async (...args: [string, string?]) => {
        reviewCalls += 1;
        expect(args).toEqual(['review-session']);
        return review();
      },
      getAnalysisLap: async (sessionId, lapId) => {
        lapCalls.push([sessionId, lapId]);
        return payload(summary, lapId, lapId === 'lap-2' ? globalPersonalBest : null);
      },
    });
    await act(async () => root!.render(<I18nProvider><AnalyzeView analysisSessions={[summary]} /></I18nProvider>));
    await settle();

    await act(async () => (container.querySelector('.driver-review__hotspot.is-primary .button') as HTMLButtonElement).click());
    await settle();
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });

    expect((container.querySelector('select[aria-label="Measured lap"]') as HTMLSelectElement).value).toBe('lap-2');
    expect(lapCalls).toContainEqual(['review-session', 'lap-2']);
    expect(lapCalls).toContainEqual(['review-session', 'lap-1']);
    expect(lapCalls).not.toContainEqual(['other-session', 'global-pb']);
    expect(reviewCalls).toBe(1);
    expect(container.querySelector('#measured-analysis-tab-evidence')?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(container.querySelector('.driver-review-evidence-heading h2'));
    expect(container.textContent).toContain('Lap 2 against session reference lap 1');
    expect(container.textContent).toContain('Session reference');
    expect(container.textContent).not.toContain('Personal best');
    expect(container.textContent).toContain('Synchronized speed, throttle and brake traces');
    expect(container.querySelector('.driver-review-evidence-status')?.getAttribute('role')).toBe('status');
    expect(container.querySelector('.driver-review-evidence-status')?.getAttribute('aria-live')).toBe('polite');

    const range = container.querySelector('[data-testid="driver-review-trace-range"]');
    expect(range?.getAttribute('data-range-start')).toBe('256');
    expect(range?.getAttribute('data-range-end')).toBe('512');
    expect(container.querySelector('[data-testid="playback-value"]')?.textContent).toBe('256 m');
    expect(container.querySelector('.circuit-segment-label')?.textContent).toContain('Zone 02 · 256–512 m');
    expect(container.querySelector('.measured-trace polyline.reference-speed')).not.toBeNull();
    expect(container.querySelector('.measured-trace polyline.reference-throttle')).not.toBeNull();
    expect(container.querySelector('.measured-trace polyline.reference-brake')).not.toBeNull();
    expect(container.querySelector('.measured-trace polyline.throttle')?.getAttribute('points'))
      .not.toBe(container.querySelector('.measured-trace polyline.brake')?.getAttribute('points'));
    expect(container.querySelector('.measured-trace polyline.reference-throttle')?.getAttribute('points'))
      .not.toBe(container.querySelector('.measured-trace polyline.reference-brake')?.getAttribute('points'));

    const debriefTab = container.querySelector('#measured-analysis-tab-debrief') as HTMLButtonElement;
    const evidenceTab = container.querySelector('#measured-analysis-tab-evidence') as HTMLButtonElement;
    await act(async () => {
      debriefTab.focus();
      debriefTab.click();
    });
    await act(async () => debriefTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    expect(evidenceTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(evidenceTab);
  });

  it('clears a focused evidence pair when completed-lap metadata changes the review input', async () => {
    const first = session();
    let activeSummary = first;
    let reviewCalls = 0;
    const lapCalls: Array<[string, string]> = [];
    window.apexDesktop = desktop({
      getDriverReview: async () => { reviewCalls += 1; return review(); },
      getAnalysisLap: async (sessionId, lapId) => {
        lapCalls.push([sessionId, lapId]);
        return payload(activeSummary, lapId);
      },
    });
    await act(async () => root!.render(<I18nProvider><AnalyzeView analysisSessions={[first]} /></I18nProvider>));
    await settle();
    await act(async () => (container.querySelector('.driver-review__hotspot.is-primary .button') as HTMLButtonElement).click());
    await settle();
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    const focusedHeading = container.querySelector('.driver-review-evidence-heading h2');
    expect(container.querySelector('.driver-review-evidence-heading')).not.toBeNull();
    expect(document.activeElement).toBe(focusedHeading);

    activeSummary = {
      ...first,
      revision: first.revision + 1,
      laps: [...first.laps, lap('lap-5', 5, 89_500)],
    };
    await act(async () => root!.render(<I18nProvider><AnalyzeView analysisSessions={[activeSummary]} /></I18nProvider>));
    await settle();

    expect(reviewCalls).toBe(2);
    expect(container.querySelector('.driver-review-evidence-heading')).toBeNull();
    const evidenceTab = container.querySelector('#measured-analysis-tab-evidence') as HTMLButtonElement;
    expect(evidenceTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(evidenceTab);
    expect(lapCalls.filter(([, lapId]) => lapId === 'lap-2')).toHaveLength(2);
  });

  it('does not substitute another reference when the same-session reference payload is missing', async () => {
    const summary = session();
    window.apexDesktop = desktop({
      getDriverReview: async () => review(),
      getAnalysisLap: async (_sessionId, lapId) => lapId === 'lap-1' ? null : payload(summary, lapId),
    });
    await act(async () => root!.render(<I18nProvider><AnalyzeView analysisSessions={[summary]} /></I18nProvider>));
    await settle();
    await act(async () => (container.querySelector('.driver-review__hotspot.is-primary .button') as HTMLButtonElement).click());
    await settle();

    expect(container.textContent).toContain('The same-session reference payload is unavailable.');
    expect(container.textContent).toContain('will not substitute a personal best from another session');
    expect(container.querySelector('.measured-trace polyline.reference-speed')).toBeNull();
    const delta = container.querySelector('.lap-playback-readout > span:last-child strong');
    expect(delta?.textContent).toBe('—');
    expect(delta?.className).toBe('');
  });
});
