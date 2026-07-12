const path = require('node:path')
const fs = require('node:fs/promises')

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`

async function inspectTelemetryDatabase(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (!['.duckdb', '.db'].includes(extension)) throw new Error('Choose an LMU DuckDB telemetry recording (.duckdb or .db).')
  const stat = await fs.stat(filePath)
  if (!stat.isFile()) throw new Error('The selected telemetry path is not a file.')

  const { DuckDBInstance } = await import('@duckdb/node-api')
  const instance = await DuckDBInstance.create(filePath, { access_mode: 'READ_ONLY' })
  const connection = await instance.connect()
  try {
    const tableReader = await connection.runAndReadAll(`
      select table_schema, table_name
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema not in ('information_schema', 'pg_catalog')
      order by table_schema, table_name
    `)
    const tables = []
    for (const row of tableReader.getRows()) {
      const schema = String(row[0])
      const name = String(row[1])
      const qualified = `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`
      const countReader = await connection.runAndReadAll(`select count(*)::varchar from ${qualified}`)
      const columnsReader = await connection.runAndReadAll(`
        select column_name, data_type
        from information_schema.columns
        where table_schema = $schema and table_name = $table
        order by ordinal_position
      `, { schema, table: name })
      tables.push({
        schema,
        name,
        rowCount: Number(countReader.getRows()[0]?.[0] ?? 0),
        columns: columnsReader.getRows().map((column) => ({ name: String(column[0]), type: String(column[1]) })),
      })
    }
    const tableNames = new Set(tables.map((table) => table.name.toLowerCase()))
    if (!tableNames.has('metadata') || !tableNames.has('channelslist')) {
      throw new Error('This DuckDB file does not expose the LMU metadata and channelsList tables. It was left untouched.')
    }
    const metadata = {}
    if (tableNames.has('metadata')) {
      const reader = await connection.runAndReadAll('select key::varchar, value::varchar from metadata')
      for (const row of reader.getRows()) metadata[String(row[0])] = String(row[1]).slice(0, 250_000)
    }
    let channels = []
    if (tableNames.has('channelslist')) {
      const reader = await connection.runAndReadAll('select channelName::varchar, frequency::double, unit::varchar from channelsList order by channelName')
      channels = reader.getRows().map((row) => ({ name: String(row[0]), frequencyHz: Number(row[1]), unit: String(row[2] ?? '') }))
    }
    let events = []
    if (tableNames.has('eventslist')) {
      const reader = await connection.runAndReadAll('select eventName::varchar, unit::varchar from eventsList order by eventName')
      events = reader.getRows().map((row) => ({ name: String(row[0]), unit: String(row[1] ?? '') }))
    }
    let lapEvents = []
    if (tableNames.has('lap')) {
      const reader = await connection.runAndReadAll('select ts::double, value::integer from "Lap" order by ts')
      lapEvents = reader.getRows().map((row) => ({ timestampSeconds: Number(row[0]), lap: Number(row[1]) }))
    }
    let lapTimes = []
    if (tableNames.has('lap time')) {
      const reader = await connection.runAndReadAll('select ts::double, value::double from "Lap Time" order by ts')
      lapTimes = reader.getRows().map((row) => ({ timestampSeconds: Number(row[0]), durationSeconds: Number(row[1]) })).filter((lap) => lap.durationSeconds > 0)
    }
    return { path: filePath, bytes: stat.size, tables, metadata, channels, events, lapEvents, lapTimes }
  } finally {
    connection.closeSync()
  }
}

module.exports = { inspectTelemetryDatabase }
