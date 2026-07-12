import { defineMessages } from './index'

const en = {
  circuit: {
    defaultTitle: 'Circuit map', trackPosition: 'Track position', lap: 'Lap',
    liveMap: '{circuit} live track map', carsShown: '{count} cars shown', highlighting: ', highlighting {segment}',
    car: 'Car {number}', carPosition: '{car}, {percent} percent around the lap', carsOnCircuit: 'Cars on circuit', lapProgress: '{car}: {percent}% lap progress',
  },
  telemetry: {
    defaultTitle: 'Telemetry', receiving: 'Receiving live data', live: 'Live', channels: 'Telemetry channels', lineChart: '{title} line chart', samples: '{series}: {count} samples', samplesIn: '{series}: {count} samples in {unit}', empty: 'No telemetry samples available.',
  },
  tyres: {
    defaultTitle: 'Tyres & brakes', defaultEyebrow: 'Car state', noData: 'No data', brakeTemperature: 'Brake temperature', average: 'avg', pressure: 'Pressure', brake: 'Brake', carcass: 'Tyre carcass temperatures', remaining: 'Tyre remaining', legend: 'Temperature status legend', cold: 'Cold', window: 'Window', hot: 'Hot', front: 'Front', tyreAndBrake: '{position} tyre and brake',
    positions: { frontLeft: 'Front left', frontRight: 'Front right', rearLeft: 'Rear left', rearRight: 'Rear right' },
    status: { cold: 'cold', optimal: 'optimal', warm: 'warm', hot: 'hot', critical: 'critical', unknown: 'unknown' },
  },
  strategy: {
    defaultTitle: 'Stint strategy', defaultEyebrow: 'Race plan', raceProgress: 'Race progress', now: 'Now', remaining: 'Remaining', laps: 'laps', reserve: 'Reserve', start: 'START', pitWindowRange: 'Pit window, laps {from} to {to}', eventLap: '{event}, lap {lap}', pitWindow: 'Pit window', plannedStints: 'Planned stints', tyre: 'Tyre', fuel: 'Fuel', target: 'Target', onTrack: 'On track', events: 'Strategy events', eventOnLap: '{event} on lap {lap}',
  },
} as const

const de = {
  circuit: {
    defaultTitle: 'Streckenkarte', trackPosition: 'Streckenposition', lap: 'Runde',
    liveMap: 'Live-Streckenkarte für {circuit}', carsShown: '{count} Autos angezeigt', highlighting: ', Abschnitt {segment} hervorgehoben',
    car: 'Auto {number}', carPosition: '{car}, {percent} Prozent der Runde', carsOnCircuit: 'Autos auf der Strecke', lapProgress: '{car}: {percent}% Rundenfortschritt',
  },
  telemetry: {
    defaultTitle: 'Telemetrie', receiving: 'Live-Daten werden empfangen', live: 'Live', channels: 'Telemetriekanäle', lineChart: 'Liniendiagramm: {title}', samples: '{series}: {count} Messwerte', samplesIn: '{series}: {count} Messwerte in {unit}', empty: 'Keine Telemetriedaten verfügbar.',
  },
  tyres: {
    defaultTitle: 'Reifen & Bremsen', defaultEyebrow: 'Fahrzeugzustand', noData: 'Keine Daten', brakeTemperature: 'Bremstemperatur', average: 'Ø', pressure: 'Druck', brake: 'Bremse', carcass: 'Temperaturen der Reifenkarkasse', remaining: 'Restprofil', legend: 'Legende für Temperaturstatus', cold: 'Kalt', window: 'Fenster', hot: 'Heiß', front: 'Vorne', tyreAndBrake: '{position}: Reifen und Bremse',
    positions: { frontLeft: 'Vorne links', frontRight: 'Vorne rechts', rearLeft: 'Hinten links', rearRight: 'Hinten rechts' },
    status: { cold: 'kalt', optimal: 'optimal', warm: 'warm', hot: 'heiß', critical: 'kritisch', unknown: 'unbekannt' },
  },
  strategy: {
    defaultTitle: 'Stintstrategie', defaultEyebrow: 'Rennplan', raceProgress: 'Rennfortschritt', now: 'Jetzt', remaining: 'Verbleibend', laps: 'Runden', reserve: 'Reserve', start: 'START', pitWindowRange: 'Boxenfenster, Runden {from} bis {to}', eventLap: '{event}, Runde {lap}', pitWindow: 'Boxenfenster', plannedStints: 'Geplante Stints', tyre: 'Reifen', fuel: 'Kraftstoff', target: 'Ziel', onTrack: 'Auf Kurs', events: 'Strategieereignisse', eventOnLap: '{event} in Runde {lap}',
  },
} as const

export const visualMessages = defineMessages(en, de)
