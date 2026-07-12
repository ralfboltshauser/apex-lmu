const test = require('node:test')
const assert = require('node:assert/strict')
const { discoverLmu, inspectLmuPath, parseVdfValues } = require('./lmu-discovery.cjs')

function fakeFs(files) {
  return {
    async access(candidate) { if (!files.has(candidate)) { const error = new Error('missing'); error.code = 'ENOENT'; throw error } },
    async readFile(candidate) { if (!files.has(candidate)) { const error = new Error('missing'); error.code = 'ENOENT'; throw error }; return files.get(candidate) },
  }
}

test('parses escaped Steam VDF paths', () => {
  assert.deepEqual(parseVdfValues('"path" "D:\\\\SteamLibrary"\n"path" "E:\\\\Games"', 'path'), ['D:\\SteamLibrary', 'E:\\Games'])
})

test('discovers LMU by app manifest in a secondary Steam library', async () => {
  const files = new Map([
    ['C:\\Steam\\steamapps\\libraryfolders.vdf', '"path" "D:\\\\SteamLibrary"'],
    ['D:\\SteamLibrary\\steamapps\\appmanifest_2399420.acf', '"appid" "2399420"\n"installdir" "Le Mans Ultimate Custom"'],
    ['D:\\SteamLibrary\\steamapps\\common\\Le Mans Ultimate Custom', 'directory'],
    ['D:\\SteamLibrary\\steamapps\\common\\Le Mans Ultimate Custom\\Le Mans Ultimate.exe', 'exe'],
  ])
  const result = await discoverLmu({ platform: 'win32', env: {}, fsp: fakeFs(files), execFile: async () => ({ stdout: 'SteamPath REG_SZ C:\\Steam' }) })
  assert.equal(result.found?.candidate, 'D:\\SteamLibrary\\steamapps\\common\\Le Mans Ultimate Custom')
  assert.equal(result.found?.status, 'found')
  assert.equal(result.found?.sharedMemoryPath, null)
  assert.match(result.trace.join('\n'), /appmanifest_2399420/)
})

test('manual inspection explains a library folder instead of accepting it', async () => {
  const files = new Map([['D:\\SteamLibrary', 'directory']])
  const result = await inspectLmuPath('D:\\SteamLibrary', { fsp: fakeFs(files) })
  assert.equal(result.status, 'invalid')
  assert.match(result.fixes[0], /folder containing/)
  assert.equal(result.checks.find((check) => check.label === 'LMU executable').ok, false)
})
