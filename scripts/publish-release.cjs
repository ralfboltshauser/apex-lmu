const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const { version } = require(path.join(root, 'package.json'))
const { loadCatalog, renderReleaseMarkdown } = require('./release-notes.cjs')
const tag = `v${version}`
const files = [
  `Apex-for-LMU-Setup-${version}.exe`,
  `Apex-for-LMU-${version}-win.zip`,
  'latest.yml',
  'SHA256SUMS.txt',
].map((name) => path.join(root, 'release', name))

for (const file of files) if (!fs.existsSync(file)) throw new Error(`Missing release artifact: ${file}`)
const catalog = loadCatalog()
const notesFile = path.join(root, 'release', `RELEASE_NOTES-${version}.md`)
fs.writeFileSync(notesFile, renderReleaseMarkdown(catalog, version))
const result = spawnSync('gh', ['release', 'create', tag, ...files, '--target', 'main', '--prerelease', '--title', `Apex for LMU ${tag}`, '--notes-file', notesFile], { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status || 1)
