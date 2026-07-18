import { defineMessages, useMessages } from '../../i18n';

const messages = defineMessages({
  quality: { clean: 'Clean', limited: 'Limited', ineligible: 'Not eligible as reference' },
  reasons: {
    'ai-control': 'AI controlled part of the lap',
    'coverage-low': 'route coverage is incomplete',
    incomplete: 'the lap did not reach a confirmed boundary',
    'lap-counter-jump': 'the lap counter skipped',
    'lap-invalidated': 'LMU marked the lap as not countable',
    'missing-sample': 'one or more samples were unavailable',
    pit: 'the car entered the pit lane',
    'position-discontinuity': 'position telemetry jumped',
    'remote-control': 'remote control was reported',
    'replay-control': 'replay control was reported',
    'sample-compacted': 'the live sample buffer was compacted',
    'sample-overflow': 'the safety sample limit was reached',
    'sequence-gap': 'bridge sequences were missing',
    'source-interrupted': 'the telemetry source was interrupted',
    'telemetry-gap': 'game-time samples contain a gap',
    'time-reset': 'game time moved backwards',
    'unknown-control': 'control ownership was unavailable',
  },
}, {
  quality: { clean: 'Sauber', limited: 'Eingeschränkt', ineligible: 'Nicht als Referenz geeignet' },
  reasons: {
    'ai-control': 'Die KI steuerte einen Teil der Runde',
    'coverage-low': 'die Streckenabdeckung ist unvollständig',
    incomplete: 'die Runde erreichte keine bestätigte Grenze',
    'lap-counter-jump': 'der Rundenzähler sprang',
    'lap-invalidated': 'LMU markierte die Runde als nicht zählbar',
    'missing-sample': 'ein oder mehrere Messpunkte waren nicht verfügbar',
    pit: 'das Auto fuhr in die Boxengasse',
    'position-discontinuity': 'die Positionstelemetrie sprang',
    'remote-control': 'Fernsteuerung wurde gemeldet',
    'replay-control': 'Replay-Steuerung wurde gemeldet',
    'sample-compacted': 'der Live-Messpuffer wurde verdichtet',
    'sample-overflow': 'Das Sicherheitslimit der Messpunkte wurde erreicht',
    'sequence-gap': 'Bridge-Sequenzen fehlten',
    'source-interrupted': 'die Telemetriequelle wurde unterbrochen',
    'telemetry-gap': 'die Spielzeitdaten enthalten eine Lücke',
    'time-reset': 'die Spielzeit sprang zurück',
    'unknown-control': 'die Steuerungszuordnung war nicht verfügbar',
  },
});

export function useLapQualityMessages() {
  return useMessages(messages);
}
