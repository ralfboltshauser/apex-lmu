const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { loadCatalog, renderChangelog, validateCatalog } = require('./release-notes.cjs')

const root = path.join(__dirname, '..')
const changelogPath = path.join(root, 'CHANGELOG.md')
const revision = process.env.APEX_RELEASE_NOTES_REVISION
function atRevision(file) {
  const result = spawnSync('git', ['show', `${revision}:${file}`], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error((result.stderr || `Cannot read ${file} at ${revision}`).trim())
  return result.stdout
}
const catalog = revision
  ? validateCatalog(JSON.parse(atRevision('release-notes/catalog.json')), JSON.parse(atRevision('package.json')).version)
  : loadCatalog()
const expected = renderChangelog(catalog)

if (process.argv.includes('--write')) {
  fs.writeFileSync(changelogPath, expected)
  console.log(`release notes: wrote ${path.relative(root, changelogPath)} from ${catalog.releases.length} bilingual entries.`)
  process.exit(0)
}

let actual = ''
try { actual = revision ? atRevision('CHANGELOG.md') : fs.readFileSync(changelogPath, 'utf8') } catch {}
if (actual !== expected) {
  console.error('release notes: CHANGELOG.md has drifted from release-notes/catalog.json.')
  console.error('Run "npm run release-notes:write" and commit the generated file.')
  process.exit(1)
}
console.log(`release notes: ${catalog.releases.length} bilingual entries valid; current version is covered${revision ? ` at ${revision.slice(0, 12)}` : ''}.`)
