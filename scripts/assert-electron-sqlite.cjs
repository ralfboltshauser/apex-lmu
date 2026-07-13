const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { StatsDatabase } = require('../electron/stats-database.cjs')
const { version } = require('../package.json')

function frame(sequence, elapsedSeconds) {
  return {
    protocolVersion: 1,
    source: 'lmu-shared-memory',
    runId: 'electron-sqlite-smoke',
    type: 'telemetry',
    capturedAt: new Date(1_700_000_000_000 + elapsedSeconds * 1000).toISOString(),
    sequence,
    gameVersion: 130,
    playerTelemetryAvailable: true,
    session: { elapsedSeconds, track: 'Electron SQLite Circuit' },
    player: { controlOwner: 'local-player', speedKph: 100, name: 'Runtime Test Car', class: 'TEST' },
    opponents: [],
  }
}

async function main() {
  assert.equal(process.versions.electron?.length > 0, true, 'must run inside Electron')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-electron-sqlite-'))
  try {
    let database = await StatsDatabase.open({ userDataPath: root, appVersion: version })
    for (let index = 0; index <= 1800; index += 1) database.ingest(frame(index + 1, index * 0.02))
    database.close({ requireDurable: true })

    database = await StatsDatabase.open({ userDataPath: root, appVersion: version })
    assert.equal(database.getHealth().status, 'ready')
    assert.equal(database.getStats().totalDistanceMm, 1_000_000)
    const backup = await database.createBackup()
    const backupPath = path.join(root, 'data', 'backups', backup.file)
    assert.equal(crypto.createHash('sha256').update(await fs.readFile(backupPath)).digest('hex'), backup.sha256)
    database.close({ requireDurable: true })
    process.stdout.write(`Electron ${process.versions.electron} / Node ${process.versions.node}: SQLite lifetime ledger retained exactly 1,000,000 mm.\n`)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exitCode = 1
})
