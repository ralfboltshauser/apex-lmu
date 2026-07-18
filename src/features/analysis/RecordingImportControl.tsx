import { FileUp, ShieldCheck, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, CardHeader, Progress } from '../../components/ui';
import { defineMessages, formatMessage, useI18n, useMessages } from '../../i18n';
import './analysis-memory.css';

const copy = defineMessages({
  eyebrow: 'Private race memory',
  title: 'Import a raw Apex recording',
  description: 'Rebuild sessions through the current decoder, verify every stored lap, then commit the result locally in one transaction.',
  import: 'Import .apexrec',
  cancel: 'Cancel import',
  private: 'No upload. The raw file stays authoritative, and its location is not saved. Analysis retains at most 40 sessions and 2 GiB of compressed lap traces, so an import can replace older retained sessions.',
  status: { idle: 'Ready', hashing: 'Checking file', importing: 'Decoding', cancelling: 'Cancelling', committing: 'Committing', complete: 'Complete', cancelled: 'Cancelled', error: 'Import failed' },
  hashing: '{done} of {total} checked',
  importing: '{frames} decoded frames · {sessions} sessions · {laps} laps assembled',
  committing: 'Strict replay passed. Verifying payloads and publishing the transaction…',
  complete: '{sessions} sessions and {laps} laps are available in Analysis.',
  duplicate: 'This exact recording and processing version were already imported. Nothing was duplicated.',
  cancelled: 'Staged data was discarded. Analysis history was not changed.',
  failed: 'The import was rejected and staged data was discarded.',
  reason: {
    'invalid-file': 'Choose a non-empty Apex .apexrec file.',
    'file-too-large': 'The recording exceeds the 8 GiB safety limit.',
    'file-changed': 'The recording changed during import. Stop recording it, then try again.',
    'storage-unavailable': 'Local analysis storage is unavailable.',
    'bridge-unavailable': 'The local recording decoder is unavailable.',
    busy: 'Another recording or replay is already using the decoder.',
    'strict-replay-failed': 'Strict replay did not complete or the recording failed validation.',
    'import-limit': 'The recording exceeds the local import safety limits.',
    'ingest-failed': 'A decoded frame could not be assembled safely.',
    'commit-failed': 'The verified staging database could not be committed.',
    'import-failed': 'The recording could not be imported.',
  },
}, {
  eyebrow: 'Privates Renngedächtnis',
  title: 'Apex-Rohaufzeichnung importieren',
  description: 'Rekonstruiere Sessions mit dem aktuellen Decoder, prüfe jede gespeicherte Runde und übernimm das Ergebnis anschließend lokal in einer einzigen Transaktion.',
  import: '.apexrec importieren',
  cancel: 'Import abbrechen',
  private: 'Kein Upload. Die Rohdatei bleibt maßgeblich; ihr Speicherort wird nicht gespeichert. Die Analyse behält höchstens 40 Sessions und 2 GiB komprimierte Rundendaten, daher kann ein Import ältere gespeicherte Sessions ersetzen.',
  status: { idle: 'Bereit', hashing: 'Datei wird geprüft', importing: 'Wird decodiert', cancelling: 'Wird abgebrochen', committing: 'Wird übernommen', complete: 'Fertig', cancelled: 'Abgebrochen', error: 'Import fehlgeschlagen' },
  hashing: '{done} von {total} geprüft',
  importing: '{frames} decodierte Frames · {sessions} Sessions · {laps} Runden zusammengesetzt',
  committing: 'Die strikte Wiedergabe war erfolgreich. Nutzdaten werden geprüft und die Transaktion wird veröffentlicht …',
  complete: '{sessions} Sessions und {laps} Runden sind in der Analyse verfügbar.',
  duplicate: 'Genau diese Aufzeichnung wurde mit dieser Verarbeitungsversion bereits importiert. Nichts wurde dupliziert.',
  cancelled: 'Die vorbereiteten Daten wurden verworfen. Der Analyseverlauf blieb unverändert.',
  failed: 'Der Import wurde abgelehnt und die vorbereiteten Daten wurden verworfen.',
  reason: {
    'invalid-file': 'Wähle eine nicht leere Apex-.apexrec-Datei.',
    'file-too-large': 'Die Aufzeichnung überschreitet das Sicherheitslimit von 8 GiB.',
    'file-changed': 'Die Aufzeichnung änderte sich während des Imports. Beende zuerst die Aufnahme und versuche es erneut.',
    'storage-unavailable': 'Der lokale Analysespeicher ist nicht verfügbar.',
    'bridge-unavailable': 'Der lokale Aufzeichnungsdecoder ist nicht verfügbar.',
    busy: 'Eine andere Aufzeichnung oder Wiedergabe verwendet bereits den Decoder.',
    'strict-replay-failed': 'Die strikte Wiedergabe wurde nicht abgeschlossen oder die Aufzeichnung bestand die Prüfung nicht.',
    'import-limit': 'Die Aufzeichnung überschreitet die lokalen Sicherheitslimits für den Import.',
    'ingest-failed': 'Ein decodierter Frame konnte nicht sicher zusammengesetzt werden.',
    'commit-failed': 'Die geprüfte Vorbereitungsdatenbank konnte nicht übernommen werden.',
    'import-failed': 'Die Aufzeichnung konnte nicht importiert werden.',
  },
});

const unavailableState: ApexAnalysisImportState = {
  schemaVersion: 1, status: 'idle', fileName: null, bytesProcessed: 0, bytesTotal: 0,
  frames: 0, sessions: 0, laps: 0, importedSessions: 0, importedLaps: 0,
  duplicate: false, sessionIds: [], reason: null,
};

function formatBytes(language: string, bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: exponent === 0 ? 0 : 1 }).format(bytes / 1024 ** exponent)} ${units[exponent]}`;
}

export interface RecordingImportController {
  readonly state: ApexAnalysisImportState;
  readonly available: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function useRecordingImport(): RecordingImportController {
  const [state, setState] = useState<ApexAnalysisImportState>(unavailableState);
  const available = Boolean(window.apexDesktop?.startAnalysisImport && window.apexDesktop?.getAnalysisImportState);

  useEffect(() => {
    if (!window.apexDesktop?.getAnalysisImportState) return;
    let cancelled = false;
    void window.apexDesktop.getAnalysisImportState()
      .then((next) => { if (!cancelled) setState(next); })
      .catch((error) => void window.apexDesktop?.reportError({ message: error instanceof Error ? error.message : String(error), context: 'analysis-import-state' }));
    const unsubscribe = window.apexDesktop.onAnalysisImportState?.((next) => { if (!cancelled) setState(next); }) ?? (() => {});
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  return useMemo(() => ({
    state,
    available,
    start: async () => {
      try {
        const result = await window.apexDesktop?.startAnalysisImport();
        if (result?.state) setState(result.state);
        else if (result && !result.ok && !result.canceled) setState((current) => ({ ...current, status: 'error', reason: result.reason || 'import-failed' }));
      } catch (error) {
        setState((current) => ({ ...current, status: 'error', reason: 'import-failed' }));
        void window.apexDesktop?.reportError({ message: error instanceof Error ? error.message : String(error), context: 'analysis-import-start' });
      }
    },
    stop: async () => {
      try { await window.apexDesktop?.stopAnalysisImport(); }
      catch (error) { void window.apexDesktop?.reportError({ message: error instanceof Error ? error.message : String(error), context: 'analysis-import-stop' }); }
    },
  }), [available, state]);
}

export function RecordingImportControl({ controller }: { controller: RecordingImportController }) {
  const m = useMessages(copy);
  const { language } = useI18n();
  const { state } = controller;
  const active = ['hashing', 'importing', 'cancelling', 'committing'].includes(state.status);
  const progress = state.status === 'hashing' && state.bytesTotal > 0 ? state.bytesProcessed / state.bytesTotal * 100 : null;
  const detail = state.status === 'hashing'
    ? formatMessage(m.hashing, { done: formatBytes(language, state.bytesProcessed), total: formatBytes(language, state.bytesTotal) })
    : state.status === 'importing' || state.status === 'cancelling'
      ? formatMessage(m.importing, { frames: state.frames.toLocaleString(language), sessions: state.sessions.toLocaleString(language), laps: state.laps.toLocaleString(language) })
      : state.status === 'committing'
        ? m.committing
        : state.status === 'complete'
          ? state.duplicate ? m.duplicate : formatMessage(m.complete, { sessions: state.sessions.toLocaleString(language), laps: state.laps.toLocaleString(language) })
          : state.status === 'cancelled'
            ? m.cancelled
            : state.status === 'error'
              ? state.reason && state.reason in m.reason ? m.reason[state.reason as keyof typeof m.reason] : m.failed
              : m.private;
  const tone = state.status === 'error' ? 'warning' : state.status === 'complete' ? 'positive' : active ? 'accent' : 'neutral';

  return <Card className={`recording-import-card is-${state.status}`} data-feedback-redact="local-file-name">
    <CardHeader
      eyebrow={m.eyebrow}
      title={m.title}
      description={m.description}
      action={<div className="recording-import-card__actions"><Badge tone={tone} dot={active}>{m.status[state.status]}</Badge>{active ? <Button variant="secondary" size="sm" icon={<Square size={12} />} onClick={() => void controller.stop()} disabled={state.status === 'cancelling' || state.status === 'committing'}>{m.cancel}</Button> : <Button size="sm" icon={<FileUp size={14} />} onClick={() => void controller.start()} disabled={!controller.available}>{m.import}</Button>}</div>}
    />
    <div className="recording-import-card__detail"><ShieldCheck size={15} /><span><strong>{detail}</strong>{state.fileName && <small>{state.fileName}</small>}</span></div>
    {progress !== null && <Progress value={progress} tone="accent" label={m.status.hashing} />}
  </Card>;
}
