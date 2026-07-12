const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const catalogPath = path.join(root, 'release-notes', 'catalog.json')
const packagePath = path.join(root, 'package.json')
const localeKeys = ['en', 'de']
const releaseKeys = ['version', 'releasedAt', ...localeKeys]
const localeShapeKeys = ['title', 'summary', 'highlights', 'knownLimitations']
const itemKeys = ['id', 'title', 'body']
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function fail(message) { throw new Error(`release notes: ${message}`) }

function exactKeys(value, expected, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${at} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.join('\0') !== wanted.join('\0')) fail(`${at} keys must be exactly ${wanted.join(', ')}`)
}

function text(value, at) {
  if (typeof value !== 'string' || !value.trim()) fail(`${at} must be non-empty text`)
  if (value !== value.trim()) fail(`${at} must not have surrounding whitespace`)
  if (/[<>]/.test(value) || /javascript\s*:/i.test(value)) fail(`${at} must not contain raw HTML or scriptable links`)
  return value
}

function parseSemver(value, at = 'version') {
  const match = typeof value === 'string' ? semverPattern.exec(value) : null
  if (!match) fail(`${at} must be strict major.minor.patch SemVer`)
  return match.slice(1).map(Number)
}

function compareSemver(left, right) {
  const a = parseSemver(left, `version ${left}`)
  const b = parseSemver(right, `version ${right}`)
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index]
  return 0
}

function validateItems(items, at) {
  if (!Array.isArray(items)) fail(`${at} must be an array`)
  const ids = new Set()
  return items.map((item, index) => {
    const itemAt = `${at}[${index}]`
    exactKeys(item, itemKeys, itemAt)
    const id = text(item.id, `${itemAt}.id`)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) fail(`${itemAt}.id must be a kebab-case identifier`)
    if (ids.has(id)) fail(`${at} contains duplicate id ${id}`)
    ids.add(id)
    return { id, title: text(item.title, `${itemAt}.title`), body: text(item.body, `${itemAt}.body`) }
  })
}

function validateLocale(value, at) {
  exactKeys(value, localeShapeKeys, at)
  const highlights = validateItems(value.highlights, `${at}.highlights`)
  if (highlights.length === 0) fail(`${at}.highlights must contain at least one item`)
  return {
    title: text(value.title, `${at}.title`),
    summary: text(value.summary, `${at}.summary`),
    highlights,
    knownLimitations: validateItems(value.knownLimitations, `${at}.knownLimitations`),
  }
}

function assertLocaleParity(release, version) {
  for (const list of ['highlights', 'knownLimitations']) {
    const expected = release.en[list].map((item) => item.id)
    const actual = release.de[list].map((item) => item.id)
    if (expected.join('\0') !== actual.join('\0')) fail(`${version} ${list} ids/order differ between en and de`)
  }
}

function validateCatalog(input, currentVersion) {
  exactKeys(input, ['schemaVersion', 'releases'], 'catalog')
  if (input.schemaVersion !== 1) fail(`unsupported schemaVersion ${String(input.schemaVersion)}`)
  if (!Array.isArray(input.releases) || input.releases.length === 0) fail('catalog.releases must be a non-empty array')
  parseSemver(currentVersion, 'package version')
  const versions = new Set()
  const releases = input.releases.map((entry, index) => {
    const at = `catalog.releases[${index}]`
    exactKeys(entry, releaseKeys, at)
    parseSemver(entry.version, `${at}.version`)
    if (versions.has(entry.version)) fail(`duplicate release ${entry.version}`)
    versions.add(entry.version)
    const parsedDate = datePattern.test(entry.releasedAt) ? new Date(`${entry.releasedAt}T00:00:00Z`) : null
    if (!parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== entry.releasedAt) fail(`${at}.releasedAt must be a real YYYY-MM-DD date`)
    const release = { version: entry.version, releasedAt: entry.releasedAt, en: validateLocale(entry.en, `${at}.en`), de: validateLocale(entry.de, `${at}.de`) }
    assertLocaleParity(release, entry.version)
    return release
  })
  for (let index = 1; index < releases.length; index += 1) {
    if (compareSemver(releases[index - 1].version, releases[index].version) <= 0) fail('catalog releases must be strictly newest-first')
  }
  if (!versions.has(currentVersion)) fail(`current package version ${currentVersion} has no catalog entry`)
  return Object.freeze({ schemaVersion: 1, releases: Object.freeze(releases) })
}

function loadCatalog(options = {}) {
  const sourcePath = options.catalogPath || catalogPath
  const manifestPath = options.packagePath || packagePath
  let raw
  let manifest
  try { raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) } catch (error) { fail(`cannot read ${sourcePath}: ${error.message}`) }
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch (error) { fail(`cannot read ${manifestPath}: ${error.message}`) }
  return validateCatalog(raw, manifest.version)
}

function renderLocale(release, locale) {
  const value = release[locale]
  const lines = [`## ${locale === 'en' ? 'English' : 'Deutsch'}`, '', `### ${value.title}`, '', value.summary, '']
  for (const item of value.highlights) lines.push(`- **${item.title}** — ${item.body}`)
  if (value.knownLimitations.length > 0) {
    lines.push('', locale === 'en' ? '#### Known limitations' : '#### Bekannte Einschränkungen', '')
    for (const item of value.knownLimitations) lines.push(`- **${item.title}** — ${item.body}`)
  }
  return lines.join('\n')
}

function renderReleaseMarkdown(catalog, version) {
  const release = catalog.releases.find((entry) => entry.version === version)
  if (!release) fail(`cannot render missing release ${version}`)
  return [`# Apex for LMU v${release.version}`, '', `Released ${release.releasedAt}`, '', renderLocale(release, 'en'), '', renderLocale(release, 'de'), ''].join('\n')
}

function renderChangelog(catalog) {
  const lines = ['# Changelog', '', 'This file is generated from `release-notes/catalog.json`. Do not edit it directly.', '']
  for (const release of catalog.releases) {
    lines.push(`## ${release.version} — ${release.releasedAt}`, '', `### English — ${release.en.title}`, '', release.en.summary, '')
    for (const item of release.en.highlights) lines.push(`- **${item.title}** — ${item.body}`)
    if (release.en.knownLimitations.length) {
      lines.push('', '**Known limitations**', '')
      for (const item of release.en.knownLimitations) lines.push(`- **${item.title}** — ${item.body}`)
    }
    lines.push('', `### Deutsch — ${release.de.title}`, '', release.de.summary, '')
    for (const item of release.de.highlights) lines.push(`- **${item.title}** — ${item.body}`)
    if (release.de.knownLimitations.length) {
      lines.push('', '**Bekannte Einschränkungen**', '')
      for (const item of release.de.knownLimitations) lines.push(`- **${item.title}** — ${item.body}`)
    }
    lines.push('')
  }
  return `${lines.join('\n').trim()}\n`
}

module.exports = { catalogPath, compareSemver, loadCatalog, renderChangelog, renderReleaseMarkdown, validateCatalog }
