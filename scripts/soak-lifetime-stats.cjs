const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { StatsDatabase } = require('../electron/stats-database.cjs')
const { version } = require('../package.json')

const durationSeconds = 2 * 60 * 60
const frequencyHz = 50
const speedKph = 100
const expectedDistanceMm = 200_000_000

function frame(sequence, elapsedSeconds) {
  return {
    source: 'lmu-shared-memory',
    runId: 'two-hour-soak',
    type: 'telemetry',
    capturedAt: new Date(1_700_000_000_000 + elapsedSeconds * 1000).toISOString(),
    sequence,
    gameVersion: 130,
    playerTelemetryAvailable: true,
    session: { elapsedSeconds, track: 'Two-hour Soak Circuit' },
    player: { controlOwner: 'local-player', speedKph, name: 'Soak Test Car', class: 'TEST' },
    opponents: [],
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-stats-soak-'))
  const started = process.hrtime.bigint()
  try {
    let database = await StatsDatabase.open({ userDataPath: root, appVersion: version })
    const totalFrames = durationSeconds * frequencyHz + 1
    for (let index = 0; index < totalFrames; index += 1) {
      database.ingest(frame(index + 1, index / frequencyHz))
      if (index > 0 && index % 50_000 === 0) database.getStats()
    }
    database.close({ requireDurable: true })
    database = await StatsDatabase.open({ userDataPath: root, appVersion: version })
    const stats = database.getStats()
    assert.equal(stats.totalDistanceMm, expectedDistanceMm)
    assert.equal(stats.vehicles[0].sessions, 1)
    const chunks = database.database.prepare('SELECT COUNT(*) AS count FROM distance_chunks').get().count
    const databaseBytes = (await fs.stat(path.join(root, 'data', 'apex.sqlite3'))).size
    assert.equal(chunks, 120)
    assert.ok(databaseBytes < 1_000_000, `two-hour database unexpectedly grew to ${databaseBytes} bytes`)
    database.close({ requireDurable: true })
    const seconds = Number(process.hrtime.bigint() - started) / 1e9
    process.stdout.write(`Two simulated hours / ${totalFrames.toLocaleString('en')} frames retained exactly ${expectedDistanceMm.toLocaleString('en')} mm in ${chunks.toLocaleString('en')} immutable chunks (${databaseBytes.toLocaleString('en')} bytes, ${seconds.toFixed(2)} s).\n`)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exitCode = 1
})
