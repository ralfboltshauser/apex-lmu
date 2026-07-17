import { compareReleaseVersions, pendingReleaseNotes, releaseCatalog } from './release-notes'

describe('bundled release-note catalog', () => {
  it('is newest-first, bilingual, and contains the package release history', () => {
    expect(releaseCatalog.releases[0].version).toBe('0.2.6')
    expect(releaseCatalog.releases.at(-1)?.version).toBe('0.1.0')
    expect(releaseCatalog.releases).toHaveLength(22)
    for (const release of releaseCatalog.releases) {
      expect(release.en.highlights.map((item) => item.id)).toEqual(release.de.highlights.map((item) => item.id))
      expect(release.en.knownLimitations.map((item) => item.id)).toEqual(release.de.knownLimitations.map((item) => item.id))
    }
  })

  it('shows only the current note when no acknowledgement state exists', () => {
    const pending = pendingReleaseNotes({ schemaVersion: 1, currentVersion: '0.2.0', firstSeenVersion: '0.2.0', lastAcknowledgedVersion: null })
    expect(pending.map((release) => release.version)).toEqual(['0.2.0'])
  })

  it('shows every skipped release newest-first', () => {
    const pending = pendingReleaseNotes({ schemaVersion: 1, currentVersion: '0.2.0', firstSeenVersion: '0.1.10', lastAcknowledgedVersion: '0.1.11' })
    expect(pending.map((release) => release.version)).toEqual(['0.2.0', '0.1.14', '0.1.13', '0.1.12'])
  })

  it('does not loop when a newer version was acknowledged before a downgrade', () => {
    expect(pendingReleaseNotes({ schemaVersion: 1, currentVersion: '0.1.12', firstSeenVersion: '0.1.10', lastAcknowledgedVersion: '0.2.0' })).toEqual([])
    expect(compareReleaseVersions('0.1.10', '0.1.9')).toBeGreaterThan(0)
  })
})
