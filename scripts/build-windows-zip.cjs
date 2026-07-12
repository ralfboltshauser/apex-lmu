const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const duckdbRoot = path.join(root, 'node_modules', '@duckdb')
const parkingRoot = path.join(root, '.packaging-cache')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const windowsBinding = path.join(duckdbRoot, 'node-bindings-win32-x64')
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

function ensureWindowsBinding() {
  if (fs.existsSync(path.join(windowsBinding, 'duckdb.node'))) return
  fs.mkdirSync(parkingRoot, { recursive: true })
  const packed = spawnSync(
    npm,
    ['pack', '@duckdb/node-bindings-win32-x64@1.5.4-r.1', '--pack-destination', parkingRoot, '--json'],
    { cwd: root, encoding: 'utf8' },
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

ensureWindowsBinding()
run(npm, ['run', 'build:bridge:win'])
run(npm, ['run', 'build'])

const parked = parkNonWindowsBindings()
try {
  run(npx, ['electron-builder', '--win', ...requestedTargets])
} finally {
  restoreBindings(parked)
}
