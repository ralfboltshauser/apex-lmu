const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const MAX_LOG_BYTES = 5 * 1024 * 1024

function redact(value, home = os.homedir()) {
  if (value == null) return value
  let text = typeof value === 'string' ? value : JSON.stringify(value)
  if (home) text = text.split(home).join('<HOME>').split(home.replaceAll('\\', '/')).join('<HOME>')
  return text
    .replace(/(token|password|secret|authorization|cookie)(["'\s:=]+)([^\s,"'}]+)/gi, '$1$2<REDACTED>')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer <REDACTED>')
}

function serializeError(error) {
  if (!(error instanceof Error)) return { message: String(error) }
  return { name: error.name, message: error.message, code: error.code, stack: error.stack }
}

class DiagnosticsService {
  constructor({ app, runtime = {} }) {
    this.app = app
    this.fs = runtime.fs ?? fs
    this.fsp = runtime.fsp ?? fsp
    this.os = runtime.os ?? os
    this.now = runtime.now ?? (() => new Date())
    this.dir = path.join(app.getPath('userData'), 'diagnostics')
    this.logPath = path.join(this.dir, 'apex.log.jsonl')
    this.ready = this.fsp.mkdir(this.dir, { recursive: true })
  }

  async record(level, scope, event, message, details) {
    try {
      await this.ready
      try {
        const stat = await this.fsp.stat(this.logPath)
        if (stat.size >= MAX_LOG_BYTES) await this.fsp.rename(this.logPath, `${this.logPath}.1`).catch(() => {})
      } catch {}
      const entry = { timestamp: this.now().toISOString(), level, scope, event, message, ...(details ? { details } : {}) }
      await this.fsp.appendFile(this.logPath, `${redact(entry, this.os.homedir())}\n`, 'utf8')
    } catch (error) {
      console.error('Apex diagnostics write failed', error)
    }
  }

  async getReport({ bridgePath, selfTest } = {}) {
    await this.ready
    const checks = []
    const add = (id, status, title, summary, fixes = [], details = '') => checks.push({ id, status, title, summary, fixes, details: redact(details, this.os.homedir()) })
    add('platform', process.platform === 'win32' ? 'pass' : 'blocked', 'Windows runtime', process.platform === 'win32' ? 'Windows is supported.' : `${process.platform} can run the demo, but LMU live telemetry requires Windows.`, process.platform === 'win32' ? [] : ['Install Apex on the Windows PC that runs LMU.'])
    let writable = true
    try { const probe = path.join(this.dir, '.write-test'); await this.fsp.writeFile(probe, 'ok'); await this.fsp.unlink(probe) } catch (error) { writable = false; add('storage', 'fail', 'Diagnostic storage', 'Apex cannot write its local data folder.', ['Check that your Windows account can write to the Apex data folder.', 'Check antivirus ransomware protection, then retry.'], serializeError(error)) }
    if (writable) add('storage', 'pass', 'Diagnostic storage', 'Local logs and support bundles can be written.')
    if (bridgePath) {
      try { await this.fsp.access(bridgePath, fs.constants.R_OK); add('bridge', 'pass', 'Native telemetry bridge', 'The bundled bridge is present and readable.') }
      catch (error) { add('bridge', 'fail', 'Native telemetry bridge', 'The bundled bridge is missing or blocked.', ['Reinstall Apex from the official GitHub release.', 'Check Windows Security protection history for a quarantined bridge.', 'Do not download the bridge separately.'], serializeError(error)) }
    }
    if (selfTest) add('self-test', selfTest.ok ? 'pass' : 'fail', 'Bridge protocol self-test', selfTest.ok ? 'The bridge launched and returned valid correlated frames.' : 'The bridge could not complete its isolated test.', selfTest.ok ? [] : ['Close and reopen Apex.', 'Check Windows Security or antivirus history.', 'Export the support bundle if it still fails.'], selfTest.details || selfTest.reason || '')
    return { generatedAt: this.now().toISOString(), checks, logs: await this.readLogs() }
  }

  async readLogs() {
    await this.ready
    const files = [`${this.logPath}.1`, this.logPath]
    const parts = []
    for (const file of files) { try { parts.push(await this.fsp.readFile(file, 'utf8')) } catch {} }
    return parts.join('').split('\n').filter(Boolean).slice(-2000).join('\n')
  }

  async buildSupportBundle(extra = {}) {
    return {
      format: 'apex-support-bundle-v1',
      privacy: 'Contains Apex system metadata and diagnostic logs. It excludes telemetry frames, setup contents, account data, and secrets. Home-directory paths are replaced with <HOME>. Review before sharing.',
      generatedAt: this.now().toISOString(),
      app: { version: this.app.getVersion(), packaged: this.app.isPackaged },
      system: { platform: process.platform, arch: process.arch, release: this.os.release() },
      diagnostics: extra.report ?? null,
      analysis: extra.analysis ?? null,
      logs: await this.readLogs(),
    }
  }

  async buildSupportText(extra = {}) {
    return `${JSON.stringify(await this.buildSupportBundle(extra), null, 2)}\n`
  }
}

module.exports = { DiagnosticsService, redact, serializeError }
