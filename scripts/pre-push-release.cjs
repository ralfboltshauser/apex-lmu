const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const zero = /^0+$/
const updates = fs.readFileSync(0, 'utf8').trim().split('\n').filter(Boolean).map((line) => {
  const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/)
  return { localRef, localSha, remoteRef, remoteSha }
})

function git(args, options = {}) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', ...options })
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim())
  return result.stdout.trim()
}

function runNpm(script) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(command, ['run', script], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status || 1)
}

function versionAt(revision) {
  return JSON.parse(git(['show', `${revision}:package.json`])).version
}

const desktopPrefixes = ['src/', 'electron/', 'bridge/', 'scripts/', 'assets/']
const desktopFiles = new Set(['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json'])
let needsRelease = false
let comparisonBase = null
let pushedHead = null

for (const update of updates) {
  if (zero.test(update.localSha)) continue
  pushedHead = update.localSha
  let base = update.remoteSha
  if (zero.test(base)) {
    try { base = git(['merge-base', update.localSha, 'origin/main']) } catch { base = `${update.localSha}^` }
  }
  const files = git(['diff', '--name-only', base, update.localSha]).split('\n').filter(Boolean)
  if (files.some((file) => desktopFiles.has(file) || desktopPrefixes.some((prefix) => file.startsWith(prefix)))) {
    needsRelease = true
    comparisonBase = base
    break
  }
}

if (!needsRelease) {
  console.log('pre-push: no desktop release files changed; package build skipped.')
  process.exit(0)
}

if (pushedHead !== git(['rev-parse', 'HEAD'])) {
  console.error('pre-push: the pushed desktop commit must be the currently checked-out HEAD.')
  process.exit(1)
}

const currentVersion = versionAt(pushedHead)
let previousVersion = null
try { previousVersion = versionAt(comparisonBase) } catch {}
if (previousVersion === currentVersion) {
  console.error(`pre-push: desktop files changed but package version is still ${currentVersion}.`)
  console.error('Run "npm version patch --no-git-tag-version", commit the version files, then push again.')
  process.exit(1)
}

const commonGitDirValue = git(['rev-parse', '--git-common-dir'])
const commonGitDir = path.isAbsolute(commonGitDirValue)
  ? commonGitDirValue
  : path.resolve(root, commonGitDirValue)
const markerDir = path.join(commonGitDir, 'apex-release-prepush')
const marker = path.join(markerDir, `${pushedHead}-${currentVersion}.done`)
const expected = [
  path.join(root, 'release', `Apex-for-LMU-Setup-${currentVersion}.exe`),
  path.join(root, 'release', `Apex-for-LMU-${currentVersion}-win.zip`),
  path.join(root, 'release', 'SHA256SUMS.txt'),
  path.join(root, 'release', 'latest.yml'),
]
if (fs.existsSync(marker) && expected.every(fs.existsSync)) {
  console.log(`pre-push: verified release ${currentVersion} already built for ${pushedHead.slice(0, 12)}.`)
  process.exit(0)
}

console.log(`pre-push: desktop changes detected (${previousVersion || 'new'} → ${currentVersion}).`)
console.log('pre-push: running all tests and building Windows installer, portable ZIP, updater metadata, and checksums…')
runNpm('test:all')
runNpm('build:desktop:win:all')
if (!expected.every(fs.existsSync)) {
  console.error('pre-push: release build completed without all expected public artifacts.')
  process.exit(1)
}
fs.mkdirSync(markerDir, { recursive: true })
fs.writeFileSync(marker, `${new Date().toISOString()}\n`)
console.log(`pre-push: release ${currentVersion} is verified and ready to push.`)
