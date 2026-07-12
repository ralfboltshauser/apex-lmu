const fs = require('node:fs/promises')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const APP_ID = '2399420'

function parseVdfValues(contents, key) {
  const values = []
  const pattern = new RegExp(`"${key}"\\s+"([^"]+)"`, 'gi')
  for (const match of contents.matchAll(pattern)) values.push(match[1].replaceAll('\\\\', '\\'))
  return values
}

function unique(items) { return [...new Set(items.filter(Boolean).map((item) => path.win32.normalize(item)))] }

async function exists(fsp, candidate) { try { await fsp.access(candidate); return true } catch { return false } }

async function inspectLmuPath(candidate, { fsp = fs, source = 'manual', manifestPath = null } = {}) {
  const root = path.win32.normalize(String(candidate || '').trim().replace(/^"|"$/g, ''))
  const result = { source, candidate: root, status: 'not-found', checks: [], fixes: [], technical: '' }
  if (!root) { result.fixes.push('Paste the LMU installation folder or choose it with Browse.'); return result }
  const rootExists = await exists(fsp, root)
  result.checks.push({ label: 'Installation folder exists', expected: root, ok: rootExists })
  if (!rootExists) { result.fixes.push('In Steam, open LMU → Properties → Installed Files → Browse, then select the folder that opens.'); return result }
  const executableNames = ['Le Mans Ultimate.exe', 'LMU.exe']
  const executable = (await Promise.all(executableNames.map(async (name) => ({ name, ok: await exists(fsp, path.win32.join(root, name)) })))).find((item) => item.ok)
  result.checks.push({ label: 'LMU executable', expected: executableNames.join(' or '), ok: Boolean(executable) })
  const sharedMemoryPath = path.win32.join(root, 'Support', 'SharedMemoryInterface')
  const sharedMemory = await exists(fsp, sharedMemoryPath)
  result.checks.push({ label: 'Shared-memory support folder', expected: sharedMemoryPath, ok: sharedMemory, optional: true })
  if (manifestPath) result.checks.push({ label: `Steam app manifest ${APP_ID}`, expected: manifestPath, ok: true })
  if (executable || manifestPath) {
    result.status = 'found'
    result.executable = executable ? path.win32.join(root, executable.name) : null
    result.sharedMemoryPath = sharedMemory ? sharedMemoryPath : null
    if (!sharedMemory) result.fixes.push('The game is installed, but this build does not expose the expected Support\\SharedMemoryInterface folder. Apex can still test its bridge; start LMU and enter a drivable session.')
  } else {
    result.status = 'invalid'
    result.fixes.push('Select the folder containing “Le Mans Ultimate.exe”, not the Steam library or steamapps folder.')
  }
  return result
}

async function registrySteamRoots(runtime = {}) {
  const run = runtime.execFile ?? execFileAsync
  const queries = [
    ['HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', '/v', 'InstallPath'],
  ]
  const roots = []
  for (const args of queries) {
    try {
      const { stdout } = await run('reg.exe', ['query', ...args], { windowsHide: true })
      const match = stdout.match(/REG_SZ\s+(.+)$/im)
      if (match) roots.push(match[1].trim())
    } catch {}
  }
  return roots
}

async function discoverLmu({ fsp = fs, env = process.env, platform = process.platform, execFile: run } = {}) {
  const trace = []
  if (platform !== 'win32') return { found: null, attempts: [], trace: ['LMU auto-discovery is available only on Windows.'] }
  const defaults = [env['ProgramFiles(x86)'] && path.win32.join(env['ProgramFiles(x86)'], 'Steam'), env.ProgramFiles && path.win32.join(env.ProgramFiles, 'Steam')]
  const registry = await registrySteamRoots({ execFile: run })
  const steamRoots = unique([...registry, ...defaults])
  trace.push(`Steam roots considered: ${steamRoots.length || 'none'}.`)
  const libraries = []
  for (const steamRoot of steamRoots) {
    libraries.push(steamRoot)
    const config = path.win32.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
    try {
      const contents = await fsp.readFile(config, 'utf8')
      const parsed = parseVdfValues(contents, 'path')
      libraries.push(...parsed)
      trace.push(`Read ${config}; found ${parsed.length} additional library path(s).`)
    } catch (error) { trace.push(`Could not read ${config}: ${error.code || error.message}.`) }
  }
  const attempts = []
  for (const library of unique(libraries)) {
    const manifest = path.win32.join(library, 'steamapps', `appmanifest_${APP_ID}.acf`)
    let installDir = 'Le Mans Ultimate'
    let hasManifest = false
    try {
      const contents = await fsp.readFile(manifest, 'utf8')
      installDir = parseVdfValues(contents, 'installdir')[0] || installDir
      hasManifest = true
      trace.push(`Found Steam app manifest ${manifest}; installdir=${installDir}.`)
    } catch (error) { trace.push(`No readable LMU manifest at ${manifest}: ${error.code || error.message}.`) }
    const candidate = path.win32.join(library, 'steamapps', 'common', installDir)
    const inspected = await inspectLmuPath(candidate, { fsp, source: hasManifest ? 'steam-manifest' : 'steam-library-fallback', manifestPath: hasManifest ? manifest : null })
    attempts.push(inspected)
    if (inspected.status === 'found') return { found: inspected, attempts, trace, expectations: discoveryExpectations() }
  }
  return { found: null, attempts, trace, expectations: discoveryExpectations() }
}

function discoveryExpectations() {
  return { appId: APP_ID, manifest: `steamapps\\appmanifest_${APP_ID}.acf`, installFolder: 'steamapps\\common\\<installdir>', executables: ['Le Mans Ultimate.exe', 'LMU.exe'] }
}

module.exports = { APP_ID, discoverLmu, inspectLmuPath, parseVdfValues, discoveryExpectations }
