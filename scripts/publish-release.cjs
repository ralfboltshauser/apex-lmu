const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const { version } = require(path.join(root, 'package.json'))
const tag = `v${version}`
const files = [
  `Apex-for-LMU-Setup-${version}.exe`,
  `Apex-for-LMU-${version}-win.zip`,
  'latest.yml',
  'SHA256SUMS.txt',
].map((name) => path.join(root, 'release', name))

for (const file of files) if (!fs.existsSync(file)) throw new Error(`Missing release artifact: ${file}`)
const result = spawnSync('gh', ['release', 'create', tag, ...files, '--target', 'main', '--prerelease', '--title', `Apex for LMU ${tag}`, '--generate-notes'], { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status || 1)
