export const demoSession = {
  track: 'Circuit de Spa-Francorchamps',
  layout: 'Grand Prix',
  car: 'Porsche 963',
  className: 'Hypercar',
  session: 'Race',
  weather: 'Dry',
  airTemp: 18.4,
  trackTemp: 27.1,
  currentLap: 18,
  totalLaps: 37,
  position: 4,
  classPosition: 3,
  bestLap: '2:03.684',
  lastLap: '2:04.218',
  referenceLap: '2:02.971',
  fuel: 44.8,
  virtualEnergy: 61.2,
  fuelPerLap: 3.46,
  energyPerLap: 4.61,
  lapsRemaining: 12.9,
  stintLap: 7,
  sessionRemaining: '39:18',
}

export const demoStandings = [
  { pos: 1, car: '51', driver: 'A. Pier Guidi', vehicle: 'Ferrari 499P', class: 'HYP', gap: 'Leader', interval: '', last: '2:04.091', tyre: 'M', pit: false },
  { pos: 2, car: '7', driver: 'K. Kobayashi', vehicle: 'Toyota GR010', class: 'HYP', gap: '+2.8', interval: '+2.8', last: '2:04.224', tyre: 'M', pit: false },
  { pos: 3, car: '6', driver: 'K. Estre', vehicle: 'Porsche 963', class: 'HYP', gap: '+6.1', interval: '+3.3', last: '2:03.991', tyre: 'M', pit: false, player: true },
  { pos: 4, car: '50', driver: 'M. Molina', vehicle: 'Ferrari 499P', class: 'HYP', gap: '+8.4', interval: '+2.3', last: '2:04.806', tyre: 'M', pit: false },
  { pos: 5, car: '8', driver: 'B. Hartley', vehicle: 'Toyota GR010', class: 'HYP', gap: '+13.2', interval: '+4.8', last: '2:05.101', tyre: 'H', pit: false },
  { pos: 12, car: '22', driver: 'O. Jarvis', vehicle: 'Oreca 07', class: 'LMP2', gap: '+1L', interval: '+18.6', last: '2:09.447', tyre: 'M', pit: false },
  { pos: 23, car: '92', driver: 'K. Estre', vehicle: 'Porsche 911 GT3 R', class: 'GT3', gap: '+4L', interval: '+7.2', last: '2:18.731', tyre: 'M', pit: true },
]

export const demoSessions = [
  { id: 'spa-race', date: 'Today, 20:41', track: 'Spa-Francorchamps', car: 'Porsche 963', type: 'Race', laps: 18, best: '2:03.684', consistency: 92, gain: -0.714 },
  { id: 'spa-practice', date: 'Today, 19:12', track: 'Spa-Francorchamps', car: 'Porsche 963', type: 'Practice', laps: 24, best: '2:03.921', consistency: 88, gain: -0.418 },
  { id: 'le-mans', date: 'Yesterday, 22:08', track: 'Le Mans', car: 'Porsche 963', type: 'Qualifying', laps: 12, best: '3:25.804', consistency: 84, gain: -1.121 },
  { id: 'imola', date: '09 Jul, 20:04', track: 'Imola', car: 'BMW M4 LMGT3', type: 'Race', laps: 31, best: '1:42.446', consistency: 94, gain: -0.236 },
]

export const demoInsights = [
  {
    id: 't5-exit',
    corner: 'T5 · Les Combes',
    severity: 'high',
    loss: 0.31,
    title: 'Protect the exit, not the entry',
    body: 'You carry 4 km/h more at turn-in, but delay full throttle by 23 m. A slightly later apex should recover about 0.22 s down the following straight.',
    confidence: 91,
    action: 'Brake 7 m earlier and release more gradually',
  },
  {
    id: 't11-brake',
    corner: 'T11 · Bruxelles',
    severity: 'medium',
    loss: 0.18,
    title: 'The time is in brake release',
    body: 'Your braking point matches the reference within 2 m. The front unloads abruptly because pressure falls from 42% to 0% in 0.28 seconds.',
    confidence: 87,
    action: 'Extend trail braking by roughly 0.35 s',
  },
  {
    id: 't17-good',
    corner: 'T17 · Blanchimont',
    severity: 'positive',
    loss: -0.09,
    title: 'Keep this approach',
    body: 'You use 0.8 m more road on entry and maintain 3 km/h more minimum speed without adding steering correction.',
    confidence: 96,
    action: 'Save as personal reference',
  },
]

export const demoSetups = [
  { id: 'safe-race', name: 'Endurance stable', author: 'Apex Community', version: 7, updated: '2h ago', rating: 4.9, votes: 218, tags: ['Race', 'Stable', 'Double stint'], installed: true },
  { id: 'esport-race', name: 'Low-drag race', author: 'Lena V.', version: 4, updated: 'Yesterday', rating: 4.8, votes: 141, tags: ['Race', 'Aggressive'], installed: false },
  { id: 'wet', name: 'Wet confidence', author: 'Northstar Racing', version: 2, updated: '3d ago', rating: 4.7, votes: 83, tags: ['Wet', 'Stable'], installed: false },
  { id: 'quali', name: 'Qualifying attack', author: 'Marco T.', version: 11, updated: '5h ago', rating: 4.9, votes: 305, tags: ['Qualifying', 'Aggressive'], installed: false },
]

export const lapTrace = Array.from({ length: 96 }, (_, index) => {
  const x = index / 95
  const wave = Math.sin(x * Math.PI * 10) * 18 + Math.sin(x * Math.PI * 3) * 23
  const speed = Math.max(68, Math.min(324, 218 + wave + Math.cos(x * Math.PI * 17) * 38))
  const brake = Math.max(0, Math.sin(x * Math.PI * 14 + 1.8) * 105 - 48)
  const throttle = Math.max(0, Math.min(100, 112 - brake * 1.35 + Math.sin(x * 32) * 6))
  const delta = Math.sin(x * Math.PI * 4.6) * 0.11 + x * 0.37
  return { x, speed, brake, throttle, delta }
})

export const referenceTrace = lapTrace.map((point, index) => ({
  ...point,
  speed: point.speed + Math.sin(index * 0.26) * 4 + 2.4,
  brake: Math.max(0, point.brake + Math.sin(index * 0.31) * 7),
  throttle: Math.min(100, point.throttle + Math.cos(index * 0.23) * 4),
  delta: point.delta - index / 95 * 0.43,
}))

export const setupDiff = [
  { group: 'Aerodynamics', property: 'Rear wing', current: '8', suggested: '9', direction: 'up' },
  { group: 'Mechanical grip', property: 'Front anti-roll bar', current: '5', suggested: '4', direction: 'down' },
  { group: 'Differential', property: 'Power ramp', current: '65°', suggested: '70°', direction: 'up' },
  { group: 'Alignment', property: 'Rear toe', current: '+0.10°', suggested: '+0.14°', direction: 'up' },
]
