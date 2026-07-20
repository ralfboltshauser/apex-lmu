import { defineMessages } from './index'

const en = {
  heading: { eyebrow: 'Local driving history', title: 'Your Garage', description: 'Cars and tracks Apex has measured while you controlled the car. Team, livery and number variants are grouped only when the model is known.' },
  summary: { total: 'Total tracked', since: 'Tracked since', drives: 'Tracked drives', models: 'Car models' },
  units: { kilometers: 'km' },
  state: {
    loading: 'Reading the local lifetime ledger…',
    desktopTitle: 'Garage is available in the desktop app', desktopCopy: 'The browser preview cannot read your private local ledger.',
    emptyTitle: 'Your Garage starts with the next eligible drive', emptyCopy: 'Apex has not committed any local-player driving distance yet. This is tracked-since history, not your complete LMU history.',
    futureTitle: 'This ledger belongs to a newer Apex version', futureCopy: 'Apex preserved it and did not attempt to interpret or change the newer schema.',
    errorTitle: 'Garage history needs attention', errorCopy: 'The existing lifetime ledger was preserved. Open Data & storage for its health and backup controls.',
    closedTitle: 'Garage history is currently closed', closedCopy: 'Restart Apex to reopen the local lifetime ledger.',
  },
  model: {
    recognized: 'Reviewed model match', unrecognized: 'Unrecognized LMU label', variants: '{count} recorded variants grouped',
    drives: '{count} tracked drives', tracks: '{count} tracks', lastDriven: 'Last driven {date}',
    showTracks: 'Show track history for {model}', hideTracks: 'Hide track history for {model}',
    track: 'Track', distance: 'Distance', activity: 'Activity', unattributed: 'Unattributed ledger adjustment',
    unattributedCopy: 'This correction has no source drive or track, so Apex keeps it out of every track total.',
  },
  limits: { models: '{count} additional models are retained locally but omitted from this bounded view.', tracks: '{count} additional tracks are retained locally but omitted from this model card.' },
  footer: { title: 'Measured locally, never reconstructed', copy: 'Only eligible official live shared-memory intervals count. Replay, imports, demo, self-test, AI and remote control do not add Garage distance.', catalog: 'Vehicle catalog v{version}', settings: 'Data & storage' },
} as const

const de = {
  heading: { eyebrow: 'Lokaler Fahrverlauf', title: 'Deine Garage', description: 'Autos und Strecken, die Apex gemessen hat, während du das Auto gesteuert hast. Team-, Lackierungs- und Startnummernvarianten werden nur bei bekanntem Modell gruppiert.' },
  summary: { total: 'Gesamt erfasst', since: 'Erfasst seit', drives: 'Erfasste Fahrten', models: 'Automodelle' },
  units: { kilometers: 'km' },
  state: {
    loading: 'Der lokale Gesamtverlauf wird gelesen …',
    desktopTitle: 'Die Garage ist in der Desktop-App verfügbar', desktopCopy: 'Die Browser-Vorschau kann deinen privaten lokalen Verlauf nicht lesen.',
    emptyTitle: 'Deine Garage beginnt mit der nächsten geeigneten Fahrt', emptyCopy: 'Apex hat noch keine Fahrstrecke mit lokaler Steuerung gespeichert. Dies ist ein Verlauf ab Erfassungsbeginn, nicht deine vollständige LMU-Historie.',
    futureTitle: 'Dieser Verlauf stammt aus einer neueren Apex-Version', futureCopy: 'Apex hat ihn erhalten und weder interpretiert noch verändert.',
    errorTitle: 'Der Garage-Verlauf benötigt Aufmerksamkeit', errorCopy: 'Der vorhandene Gesamtverlauf wurde erhalten. Öffne Daten & Speicher für Zustand und Sicherungen.',
    closedTitle: 'Der Garage-Verlauf ist derzeit geschlossen', closedCopy: 'Starte Apex neu, um den lokalen Gesamtverlauf wieder zu öffnen.',
  },
  model: {
    recognized: 'Geprüfte Modellzuordnung', unrecognized: 'Unbekannte LMU-Bezeichnung', variants: '{count} aufgezeichnete Varianten gruppiert',
    drives: '{count} erfasste Fahrten', tracks: '{count} Strecken', lastDriven: 'Zuletzt gefahren: {date}',
    showTracks: 'Streckenverlauf für {model} anzeigen', hideTracks: 'Streckenverlauf für {model} ausblenden',
    track: 'Strecke', distance: 'Distanz', activity: 'Aktivität', unattributed: 'Nicht zugeordnete Verlaufskorrektur',
    unattributedCopy: 'Diese Korrektur hat keine Ursprungsfahrt oder Strecke. Deshalb verteilt Apex sie nicht auf Streckensummen.',
  },
  limits: { models: '{count} weitere Modelle bleiben lokal erhalten, werden in dieser begrenzten Ansicht aber nicht gezeigt.', tracks: '{count} weitere Strecken bleiben lokal erhalten, werden in dieser Modellkarte aber nicht gezeigt.' },
  footer: { title: 'Lokal gemessen, nie rekonstruiert', copy: 'Nur geeignete offizielle Live-Intervalle aus dem Shared Memory zählen. Wiedergabe, Importe, Demo, Selbsttest, KI und Fernsteuerung fügen keine Garage-Distanz hinzu.', catalog: 'Fahrzeugkatalog v{version}', settings: 'Daten & Speicher' },
} as const

export const garageMessages = defineMessages(en, de)
