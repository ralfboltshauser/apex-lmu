const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs/promises')
const { safeInstallSetup } = require('./setup-manager.cjs')

async function createFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-setup-manager-'))
  const targetDirectory = path.join(root, 'Le Mans Ultimate', 'UserData', 'player', 'Settings', 'Le Mans')
  const sourceDirectory = path.join(root, 'downloads')
  const backupRoot = path.join(root, 'app-data')
  const sourcePath = path.join(sourceDirectory, 'race.svm')
  await fs.mkdir(targetDirectory, { recursive: true })
  await fs.mkdir(sourceDirectory, { recursive: true })
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return { root, targetDirectory, backupRoot, sourcePath }
}

test('installs a read-only source as a writable setup', async (t) => {
  const fixture = await createFixture(t)
  await fs.writeFile(fixture.sourcePath, 'new setup')
  await fs.chmod(fixture.sourcePath, 0o444)

  const result = await safeInstallSetup(fixture)

  assert.equal(await fs.readFile(result.destination, 'utf8'), 'new setup')
  assert.notEqual((await fs.stat(result.destination)).mode & 0o200, 0, 'installed setup must be owner-writable')
  assert.equal(result.backupPath, null)
})

test('replaces a read-only destination and retains its backup', async (t) => {
  const fixture = await createFixture(t)
  const destination = path.join(fixture.targetDirectory, path.basename(fixture.sourcePath))
  await fs.writeFile(fixture.sourcePath, 'replacement setup')
  await fs.chmod(fixture.sourcePath, 0o444)
  await fs.writeFile(destination, 'previous setup')
  await fs.chmod(destination, 0o444)

  const result = await safeInstallSetup(fixture)

  assert.equal(result.destination, destination)
  assert.equal(await fs.readFile(destination, 'utf8'), 'replacement setup')
  assert.notEqual((await fs.stat(destination)).mode & 0o200, 0, 'replacement must be owner-writable')
  assert.equal(await fs.readFile(result.backupPath, 'utf8'), 'previous setup')
  assert.deepEqual(await fs.readdir(fixture.targetDirectory), ['race.svm'])
})

test('restores the previous setup and mode if the replacement rename fails', async (t) => {
  const fixture = await createFixture(t)
  const destination = path.join(fixture.targetDirectory, path.basename(fixture.sourcePath))
  await fs.writeFile(fixture.sourcePath, 'replacement setup')
  await fs.writeFile(destination, 'previous setup')
  await fs.chmod(destination, 0o444)

  const rename = fs.rename.bind(fs)
  let injectedFailure = false
  t.mock.method(fs, 'rename', async (from, to) => {
    if (!injectedFailure && path.basename(from).includes('.apex-install-')) {
      injectedFailure = true
      const error = new Error('injected replacement failure')
      error.code = 'EPERM'
      throw error
    }
    return rename(from, to)
  })

  await assert.rejects(safeInstallSetup(fixture), { code: 'EPERM' })

  assert.equal(await fs.readFile(destination, 'utf8'), 'previous setup')
  assert.equal((await fs.stat(destination)).mode & 0o200, 0, 'original read-only mode must be restored')
  assert.deepEqual(await fs.readdir(fixture.targetDirectory), ['race.svm'])
  const backupFolders = await fs.readdir(path.join(fixture.backupRoot, 'setup-backups'))
  assert.equal(backupFolders.length, 1)
  assert.equal(
    await fs.readFile(path.join(fixture.backupRoot, 'setup-backups', backupFolders[0], 'race.svm'), 'utf8'),
    'previous setup',
  )
})
