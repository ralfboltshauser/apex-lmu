import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../../i18n';
import { AnalyzeView } from '../../views/AnalyzeView';

function importState(patch: Partial<ApexAnalysisImportState> = {}): ApexAnalysisImportState {
  return {
    schemaVersion: 1, status: 'idle', fileName: null, bytesProcessed: 0, bytesTotal: 0,
    frames: 0, sessions: 0, laps: 0, importedSessions: 0, importedLaps: 0,
    duplicate: false, sessionIds: [], reason: null, ...patch,
  };
}

function lap(id: string, number: number, lapTimeMs: number | null, quality: ApexAnalysisLapQuality, referenceEligible: boolean, samplesAvailable = false): ApexAnalysisLapSummary {
  return { id, number, state: 'complete', quality, reasons: quality === 'limited' ? ['coverage-low'] : quality === 'ineligible' ? ['pit'] : [], lapTimeMs, timingSource: lapTimeMs === null ? 'unavailable' : 'official', coverage: quality === 'clean' ? 0.99 : quality === 'limited' ? 0.965 : 0.6, maximumGapM: 50, sampleCount: 100, samplesAvailable, replayable: true, referenceEligible, trackModelEligible: referenceEligible };
}

function sessionSummary(id: string, source: ApexAnalysisSessionSummary['source']): ApexAnalysisSessionSummary {
  const sessionLap = lap(`${id}-lap`, 1, 100_000, 'clean', true);
  return {
    schemaVersion: 1, qualityPolicyVersion: 'lap-quality-v2', revision: 1, id, source, state: 'finished',
    startedAt: '2026-07-16T19:00:00Z', endedAt: '2026-07-16T20:00:00Z',
    track: { name: `${id} circuit`, layout: '', lengthM: 1000 },
    car: { id: 7, name: `${id} car`, class: 'GT3' }, laps: [sessionLap], currentLapId: null,
    interruptionCount: 0, sourceSegmentCount: 1,
    ...(source === 'imported-recording' ? {
      importProvenance: { id: `recording-import-${id}`, recordingSha256: 'a'.repeat(64), recordingFormat: 'apex-lmu-raw-v1', processingVersion: 'apexrec-analysis-v3', importedAt: '2026-07-17T10:00:00Z', appVersion: '0.3.0', sessionCount: 1, lapCount: 1 },
    } : {}),
  };
}

describe('Private Race Memory UI', () => {
  it('uses limited official laps for pace while keeping PB reference eligibility explicit', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const laps = [
      lap('lap-1', 1, 100_000, 'clean', true, true),
      lap('lap-2', 2, 101_000, 'limited', false),
      lap('lap-3', 3, 99_000, 'limited', false),
      lap('lap-4', 4, 80_000, 'ineligible', false),
    ];
    const session: ApexAnalysisSessionSummary = {
      schemaVersion: 1, qualityPolicyVersion: 'lap-quality-v2', revision: 1, id: 'imported-session', source: 'imported-recording', state: 'finished',
      startedAt: '2026-07-16T19:00:00Z', endedAt: '2026-07-16T20:00:00Z', track: { name: 'Measured circuit', layout: '', lengthM: 1000 },
      car: { id: 7, name: 'Measured car', class: 'GT3' }, laps, currentLapId: null, interruptionCount: 0, sourceSegmentCount: 1,
      importProvenance: { id: 'recording-import-a', recordingSha256: 'a'.repeat(64), recordingFormat: 'apex-lmu-raw-v1', processingVersion: 'apexrec-analysis-v3', importedAt: '2026-07-17T10:00:00Z', appVersion: '0.3.0', sessionCount: 1, lapCount: 4 },
    };
    const originalDesktop = window.apexDesktop;
    window.apexDesktop = {
      getAnalysisLap: async () => null,
      getAnalysisImportState: async () => importState(),
      onAnalysisImportState: () => () => {},
      startAnalysisImport: async () => ({ ok: false, canceled: true }),
      reportError: async () => ({ ok: true }),
    } as unknown as ApexDesktopApi;
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<I18nProvider><AnalyzeView analysisSessions={[session]} /></I18nProvider>));
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain('Imported raw recording');
      expect(container.textContent).toContain('1:39.000');
      expect(container.textContent).toContain('3 pace-eligible laps');
      expect(container.textContent).toContain('2 limited');
      expect(container.textContent).toContain('1 clean trace references available');
      expect(container.textContent).toContain('Official pace only');
      expect(container.textContent).toContain('route coverage is incomplete');
      expect(container.textContent).toContain('1:20.000');
      expect(container.textContent).toContain('Excluded from pace');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      window.apexDesktop = originalDesktop;
    }
  });

  it('does not claim official pace exists when every measured lap is untimed', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const session: ApexAnalysisSessionSummary = {
      schemaVersion: 1, qualityPolicyVersion: 'lap-quality-v2', revision: 1, id: 'untimed-session', source: 'imported-recording', state: 'finished',
      startedAt: '2026-07-16T19:00:00Z', endedAt: '2026-07-16T20:00:00Z', track: { name: 'Measured circuit', layout: '', lengthM: 1000 },
      car: { id: 7, name: 'Measured car', class: 'GT3' }, laps: [lap('untimed-lap', 1, null, 'limited', false)], currentLapId: null, interruptionCount: 0, sourceSegmentCount: 1,
      importProvenance: { id: 'recording-import-untimed', recordingSha256: 'b'.repeat(64), recordingFormat: 'apex-lmu-raw-v1', processingVersion: 'apexrec-analysis-v3', importedAt: '2026-07-17T10:00:00Z', appVersion: '0.3.0', sessionCount: 1, lapCount: 1 },
    };
    const originalDesktop = window.apexDesktop;
    window.apexDesktop = {
      getAnalysisLap: async () => null,
      getAnalysisImportState: async () => importState(),
      onAnalysisImportState: () => () => {},
      startAnalysisImport: async () => ({ ok: false, canceled: true }),
      reportError: async () => ({ ok: true }),
    } as unknown as ApexDesktopApi;
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<I18nProvider><AnalyzeView analysisSessions={[session]} /></I18nProvider>));
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain('No eligible official pace yet');
      expect(container.textContent).toContain('No official pace or clean trace reference is available yet.');
      expect(container.textContent).not.toContain('Official pace is available');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      window.apexDesktop = originalDesktop;
    }
  });

  it('keeps an overflow lap in the evidence ledger without loading or claiming exact replay', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const overflowLap: ApexAnalysisLapSummary = {
      ...lap('overflow-lap', 1, 90_000, 'ineligible', false, true),
      reasons: ['sample-overflow'],
      sampleCount: 16_384,
      replayable: false,
      trackModelEligible: false,
    };
    const session: ApexAnalysisSessionSummary = {
      ...sessionSummary('overflow-session', 'imported-recording'),
      laps: [overflowLap],
      importProvenance: {
        id: 'recording-import-overflow', recordingSha256: 'c'.repeat(64), recordingFormat: 'apex-lmu-raw-v1',
        processingVersion: 'apexrec-analysis-v3', importedAt: '2026-07-17T10:00:00Z', appVersion: '0.3.0', sessionCount: 1, lapCount: 1,
      },
    };
    let loads = 0;
    const originalDesktop = window.apexDesktop;
    window.apexDesktop = {
      getAnalysisLap: async () => { loads += 1; return null; },
      getAnalysisImportState: async () => importState(),
      onAnalysisImportState: () => () => {},
      startAnalysisImport: async () => ({ ok: false, canceled: true }),
      reportError: async () => ({ ok: true }),
    } as unknown as ApexDesktopApi;
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<I18nProvider><AnalyzeView analysisSessions={[session]} /></I18nProvider>));
      await act(async () => { await Promise.resolve(); });
      expect(loads).toBe(0);
      expect(container.textContent).toContain('the safety sample limit was reached');
      expect(container.textContent).toContain('not complete enough for exact replay');
      expect(container.textContent).not.toContain('Exact recorded position');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      window.apexDesktop = originalDesktop;
    }
  });

  it('reports hash progress and strict completion without exposing an absolute path', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let listener: ((state: ApexAnalysisImportState) => void) | null = null;
    let starts = 0;
    const originalDesktop = window.apexDesktop;
    window.apexDesktop = {
      getAnalysisImportState: async () => importState({ status: 'hashing', fileName: 'private.apexrec', bytesProcessed: 512, bytesTotal: 1024 }),
      onAnalysisImportState: (callback: (state: ApexAnalysisImportState) => void) => { listener = callback; return () => { listener = null; }; },
      startAnalysisImport: async () => { starts += 1; return { ok: false, canceled: true }; },
      stopAnalysisImport: async () => ({ ok: true }),
      reportError: async () => ({ ok: true }),
    } as unknown as ApexDesktopApi;
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<I18nProvider><AnalyzeView /></I18nProvider>));
      await act(async () => { await Promise.resolve(); });
      expect(container.textContent).toContain('Find the time. Understand why.');
      expect(container.textContent).toContain('Generated example session');
      expect(container.textContent).toContain('Checking file');
      expect(container.textContent).toContain('private.apexrec');
      expect(container.textContent).not.toContain('/home/ralf/private.apexrec');
      expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');

      await act(async () => listener?.(importState({ status: 'complete', fileName: 'private.apexrec', frames: 422_467, sessions: 10, laps: 56, importedSessions: 10, importedLaps: 56, sessionIds: ['session-1'] })));
      expect(container.textContent).toContain('10 sessions and 56 laps are available in Analysis.');
      await act(async () => (container.querySelector('.recording-import-card .button') as HTMLButtonElement).click());
      expect(starts).toBe(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      window.apexDesktop = originalDesktop;
    }
  });

  it('focuses a newly imported session once without overriding later user selection', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const imported = { ...sessionSummary('imported-session', 'imported-recording'), track: { name: 'Same circuit', layout: '', lengthM: 1000 }, car: { id: 7, name: 'Same car', class: 'GT3' } };
    const existing = { ...sessionSummary('existing-session', 'live'), startedAt: '2026-07-15T18:00:00Z', track: { name: 'Same circuit', layout: '', lengthM: 1000 }, car: { id: 7, name: 'Same car', class: 'GT3' } };
    const originalDesktop = window.apexDesktop;
    window.apexDesktop = {
      getAnalysisLap: async () => null,
      getAnalysisImportState: async () => importState({ status: 'complete', sessionIds: [imported.id] }),
      onAnalysisImportState: () => () => {},
      startAnalysisImport: async () => ({ ok: false, canceled: true }),
      reportError: async () => ({ ok: true }),
    } as unknown as ApexDesktopApi;
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<I18nProvider><AnalyzeView analysisSessions={[existing, imported]} /></I18nProvider>);
        await Promise.resolve();
      });
      const selector = container.querySelector('select[aria-label="Measured session"]') as HTMLSelectElement;
      expect(selector.value).toBe(imported.id);
      expect(selector.options[0].text).not.toBe(selector.options[1].text);

      await act(async () => {
        selector.value = existing.id;
        selector.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve();
      });
      expect(selector.value).toBe(existing.id);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      window.apexDesktop = originalDesktop;
    }
  });
});
