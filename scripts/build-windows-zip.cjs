const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const releaseRoot = path.join(root, 'release')
const duckdbRoot = path.join(root, 'node_modules', '@duckdb')
const parkingRoot = path.join(root, '.packaging-cache')
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('This packaging helper must be launched through an npm script')
const windowsBinding = path.join(duckdbRoot, 'node-bindings-win32-x64')
const { version } = require(path.join(root, 'package.json'))
const targets = process.argv.slice(2)
const requestedTargets = targets.length > 0 ? targets : ['zip']
for (const target of requestedTargets) {
  if (!['zip', 'nsis'].includes(target)) throw new Error(`Unsupported Windows target: ${target}`)
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
}

function spawnNpm(args, options = {}) {
  return spawnSync(process.execPath, [npmCli, ...args], { cwd: root, ...options })
}

function runNpm(args) {
  const result = spawnNpm(args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} exited with ${result.status}`)
}

function ensureWindowsBinding() {
  if (fs.existsSync(path.join(windowsBinding, 'duckdb.node'))) return
  fs.mkdirSync(parkingRoot, { recursive: true })
  const packed = spawnNpm(
    ['pack', '@duckdb/node-bindings-win32-x64@1.5.4-r.1', '--pack-destination', parkingRoot, '--json'],
    { encoding: 'utf8' },
  )
  if (packed.error) throw packed.error
  if (packed.status !== 0) throw new Error(packed.stderr || `npm pack exited with ${packed.status}`)
  const packageInfo = JSON.parse(packed.stdout)
  const archive = path.join(parkingRoot, packageInfo[0].filename)
  fs.mkdirSync(windowsBinding, { recursive: true })
  try {
    run('tar', ['-xzf', archive, '-C', windowsBinding, '--strip-components=1'])
  } finally {
    fs.rmSync(archive, { force: true })
  }
}

function parkNonWindowsBindings() {
  if (!fs.existsSync(duckdbRoot)) return []
  fs.mkdirSync(parkingRoot, { recursive: true })
  const parked = []
  for (const name of fs.readdirSync(duckdbRoot)) {
    if (!name.startsWith('node-bindings-') || name.startsWith('node-bindings-win32-')) continue
    const source = path.join(duckdbRoot, name)
    const destination = path.join(parkingRoot, name)
    fs.rmSync(destination, { recursive: true, force: true })
    fs.renameSync(source, destination)
    parked.push({ source, destination })
  }
  return parked
}

function restoreBindings(parked) {
  for (const { source, destination } of parked) {
    if (fs.existsSync(destination)) fs.renameSync(destination, source)
  }
  if (fs.existsSync(parkingRoot) && fs.readdirSync(parkingRoot).length === 0) fs.rmdirSync(parkingRoot)
}

const publicArtifacts = {
  nsis: {
    source: `Apex for LMU Setup ${version}.exe`,
    destination: `Apex-for-LMU-Setup-${version}.exe`,
  },
  zip: {
    source: `Apex for LMU-${version}-win.zip`,
    destination: `Apex-for-LMU-${version}-win.zip`,
  },
}

function stagePublicArtifacts() {
  for (const target of requestedTargets) {
    const artifact = publicArtifacts[target]
    const source = path.join(releaseRoot, artifact.source)
    const destination = path.join(releaseRoot, artifact.destination)
    if (!fs.existsSync(source)) throw new Error(`Expected ${target} artifact was not produced: ${source}`)
    fs.copyFileSync(source, destination)
  }

  const available = requestedTargets
    .map((target) => publicArtifacts[target].destination)
    .sort()
  const checksums = available.map((filename) => {
    const contents = fs.readFileSync(path.join(releaseRoot, filename))
    return `${crypto.createHash('sha256').update(contents).digest('hex')}  ${filename}`
  })
  fs.writeFileSync(path.join(releaseRoot, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`)
}

ensureWindowsBinding()
runNpm(['run', 'build:bridge:win'])
runNpm(['run', 'build'])

const parked = parkNonWindowsBindings()
try {
  runNpm(['exec', '--', 'electron-builder', '--win', ...requestedTargets, '--publish', 'never'])
  stagePublicArtifacts()
} finally {
  restoreBindings(parked)
}
