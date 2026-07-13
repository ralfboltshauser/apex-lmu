const test = require('node:test')
const assert = require('node:assert/strict')
const { renderChangelog, renderReleaseMarkdown, validateCatalog } = require('./release-notes.cjs')

function item(id, title = 'Title', body = 'Body') { return { id, title, body } }
function locale() { return { title: 'Release', summary: 'Summary', highlights: [item('one')], knownLimitations: [item('limit')] } }
function entry(version = '1.0.0') { return { version, releasedAt: '2026-07-12', en: locale(), de: locale() } }
function catalog(...releases) { return { schemaVersion: 1, releases } }

test('validates a newest-first bilingual catalog and renders deterministically', () => {
  const value = validateCatalog(catalog(entry('1.1.0'), entry('1.0.0')), '1.1.0')
  assert.equal(value.releases.length, 2)
  assert.match(renderReleaseMarkdown(value, '1.1.0'), /## English[\s\S]*## Deutsch/)
  assert.equal(renderChangelog(value), renderChangelog(value))
})

test('rejects an absent current version', () => {
  assert.throws(() => validateCatalog(catalog(entry()), '1.0.1'), /current package version/)
})

test('rejects missing locale and unsupported fields', () => {
  const missing = entry(); delete missing.de
  assert.throws(() => validateCatalog(catalog(missing), '1.0.0'), /keys must be exactly/)
  const extra = entry(); extra.en.extra = 'no'
  assert.throws(() => validateCatalog(catalog(extra), '1.0.0'), /keys must be exactly/)
})

test('rejects mismatched ids and locale ordering', () => {
  const value = entry(); value.de.highlights = [item('two')]
  assert.throws(() => validateCatalog(catalog(value), '1.0.0'), /ids\/order differ/)
})

test('rejects duplicates, malformed SemVer, and wrong ordering', () => {
  assert.throws(() => validateCatalog(catalog(entry(), entry()), '1.0.0'), /duplicate release/)
  assert.throws(() => validateCatalog(catalog(entry('v1.0.0')), '1.0.0'), /strict major.minor.patch/)
  assert.throws(() => validateCatalog(catalog(entry('1.0.0'), entry('1.1.0')), '1.1.0'), /strictly newest-first/)
})

test('rejects empty text, raw HTML, scriptable links, and invalid dates', () => {
  const empty = entry(); empty.en.title = ' '
  assert.throws(() => validateCatalog(catalog(empty), '1.0.0'), /non-empty text/)
  const html = entry(); html.en.summary = '<b>unsafe</b>'
  assert.throws(() => validateCatalog(catalog(html), '1.0.0'), /raw HTML/)
  const script = entry(); script.en.summary = 'javascript:alert(1)'
  assert.throws(() => validateCatalog(catalog(script), '1.0.0'), /scriptable/)
  const date = entry(); date.releasedAt = 'not-a-date'
  assert.throws(() => validateCatalog(catalog(date), '1.0.0'), /real YYYY-MM-DD/)
  const impossibleDate = entry(); impossibleDate.releasedAt = '2026-02-31'
  assert.throws(() => validateCatalog(catalog(impossibleDate), '1.0.0'), /real YYYY-MM-DD/)
})
