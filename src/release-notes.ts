import rawCatalog from '../release-notes/catalog.json'

export type ReleaseNoteItem = Readonly<{ id: string; title: string; body: string }>
export type LocalizedReleaseNote = Readonly<{
  title: string
  summary: string
  highlights: readonly ReleaseNoteItem[]
  knownLimitations: readonly ReleaseNoteItem[]
}>
export type ReleaseNote = Readonly<{
  version: string
  releasedAt: string
  en: LocalizedReleaseNote
  de: LocalizedReleaseNote
}>
type ReleaseCatalog = Readonly<{ schemaVersion: 1; releases: readonly ReleaseNote[] }>

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  return value
}

export const releaseCatalog = freeze(rawCatalog as ReleaseCatalog)

function parts(version: string) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version)
  return match ? match.slice(1).map(Number) : null
}

export function compareReleaseVersions(left: string, right: string) {
  const a = parts(left)
  const b = parts(right)
  if (!a || !b) throw new Error('Invalid release-note version')
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index]
  return 0
}

export function pendingReleaseNotes(state: ApexWhatsNewState): readonly ReleaseNote[] {
  const available = releaseCatalog.releases.filter((release) => compareReleaseVersions(release.version, state.currentVersion) <= 0)
  if (!state.lastAcknowledgedVersion) return available.filter((release) => release.version === state.currentVersion)
  return available.filter((release) => compareReleaseVersions(release.version, state.lastAcknowledgedVersion!) > 0)
}
