const path = require('node:path')
const fs = require('node:fs/promises')
const { randomUUID } = require('node:crypto')

function writableMode(mode) {
  return (mode & 0o777) | 0o200
}

async function removeIfPresent(filePath) {
  try {
    await fs.unlink(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

async function safeInstallSetup({ sourcePath, targetDirectory, backupRoot }) {
  if (path.extname(sourcePath).toLowerCase() !== '.svm') throw new Error('LMU setup files must use the .svm extension.')
  const source = await fs.realpath(sourcePath)
  const target = await fs.realpath(targetDirectory)
  const normalized = target.replaceAll('\\', '/').toLowerCase()
  if (!normalized.includes('/userdata/player/settings/')) {
    throw new Error('Choose a track folder inside Le Mans Ultimate/UserData/player/Settings.')
  }
  const sourceStat = await fs.stat(source)
  if (!sourceStat.isFile() || sourceStat.size <= 0) throw new Error('The selected setup file is empty or unavailable.')
  const destination = path.join(target, path.basename(source))
  let backupPath = null
  let existing = null
  try {
    existing = await fs.stat(destination)
    if (existing.isFile()) {
      const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
      const backupDirectory = path.join(backupRoot, 'setup-backups', stamp)
      await fs.mkdir(backupDirectory, { recursive: true })
      backupPath = path.join(backupDirectory, path.basename(destination))
      await fs.copyFile(destination, backupPath)
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const token = `${process.pid}-${randomUUID()}`
  const temporary = path.join(target, `.${path.basename(destination)}.apex-install-${token}.tmp`)
  const rollback = path.join(target, `.${path.basename(destination)}.apex-rollback-${token}.tmp`)
  let temporaryExists = false
  let originalMoved = false
  let committed = false

  try {
    await fs.copyFile(source, temporary, fs.constants.COPYFILE_EXCL)
    temporaryExists = true
    // copyFile preserves a read-only source mode/attribute. The installed setup
    // must remain writable so the game and future installs can update it.
    await fs.chmod(temporary, writableMode(sourceStat.mode))

    if (existing?.isFile()) {
      // Windows refuses to rename or replace a read-only destination.
      try {
        await fs.chmod(destination, writableMode(existing.mode))
        await fs.rename(destination, rollback)
        originalMoved = true
      } catch (stageError) {
        try {
          await fs.chmod(destination, existing.mode & 0o777)
        } catch {
          // Preserve the staging failure; the destination itself was not moved.
        }
        throw stageError
      }
    }

    try {
      await fs.rename(temporary, destination)
      temporaryExists = false
      committed = true
    } catch (installError) {
      if (originalMoved) {
        try {
          await fs.rename(rollback, destination)
          originalMoved = false
          await fs.chmod(destination, existing.mode & 0o777)
        } catch (restoreError) {
          throw new AggregateError(
            [installError, restoreError],
            `Setup replacement failed and the previous setup could not be restored from ${rollback}.`,
          )
        }
      }
      throw installError
    }

  } finally {
    if (temporaryExists) {
      try {
        await removeIfPresent(temporary)
      } catch {
        // Do not hide the replacement error with a temporary-file cleanup error.
      }
    }
    if (committed && originalMoved) {
      try {
        // The durable backup above is retained. This same-directory rollback is
        // only needed until the replacement rename commits.
        await removeIfPresent(rollback)
        originalMoved = false
      } catch {
        // The install is already committed and the normal backup is available.
      }
    }
  }

  return { destination, backupPath, bytes: sourceStat.size }
}

module.exports = { safeInstallSetup }
