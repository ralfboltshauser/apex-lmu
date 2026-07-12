const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')

class LmuBridgeManager {
  constructor({ app, broadcast, runtime = {} }) {
    this.app = app
    this.broadcast = broadcast
    this.platform = runtime.platform ?? process.platform
    this.spawnProcess = runtime.spawn ?? spawn
    this.fileExists = runtime.fileExists ?? fs.existsSync
    this.makeRunId = runtime.randomUUID ?? randomUUID
    this.makeLineReader = runtime.createInterface ?? createInterface
    this.schedule = runtime.setTimeout ?? setTimeout
    this.cancelSchedule = runtime.clearTimeout ?? clearTimeout
    this.process = null
    this.selfTestProcess = null
    this.selfTestRunId = null
    this.restartTimer = null
    this.requested = false
  }

  getBinaryPath() {
    if (this.app.isPackaged) return path.join(process.resourcesPath, 'bridge', 'apex-lmu-bridge.exe')
    return path.join(__dirname, '..', 'bridge', 'bin', 'apex-lmu-bridge.exe')
  }

  start() {
    this.requested = true
    if (this.platform !== 'win32') {
      this.broadcast(this.statusMessage('live', null, 'unsupported', 'LMU live telemetry is available on Windows.'))
      return { ok: false, reason: 'unsupported-platform' }
    }
    if (this.process) return { ok: true, alreadyRunning: true }
    const binary = this.getBinaryPath()
    if (!this.fileExists(binary)) {
      this.broadcast(this.statusMessage('live', null, 'missing', 'The LMU telemetry bridge is not installed.'))
      return { ok: false, reason: 'missing-bridge', path: binary }
    }
    const child = this.spawnProcess(binary, ['--hz=50', `--parent-pid=${process.pid}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.process = child
    this.attachProcess(child, {
      mode: 'live',
      runId: null,
      onExit: (code) => {
        if (this.process === child) this.process = null
        this.broadcast(this.statusMessage('live', null, 'stopped', `LMU bridge exited (${code ?? 'signal'}).`))
        if (this.requested) this.restartTimer = this.schedule(() => this.start(), 1500)
      },
    })
    return { ok: true }
  }

  runSelfTest() {
    const runId = this.makeRunId()
    if (this.platform !== 'win32') {
      this.broadcast(this.statusMessage('self-test', runId, 'unsupported', 'The native bridge self-test requires Windows.'))
      return { ok: false, reason: 'unsupported-platform', runId }
    }
    if (this.selfTestProcess) {
      return { ok: false, reason: 'self-test-running', runId: this.selfTestRunId }
    }
    const binary = this.getBinaryPath()
    if (!this.fileExists(binary)) {
      this.broadcast(this.statusMessage('self-test', runId, 'missing', 'The LMU telemetry bridge is not installed.'))
      return { ok: false, reason: 'missing-bridge', path: binary, runId }
    }

    let child
    try {
      child = this.spawnProcess(
        binary,
        ['--self-test', '--frames=8', `--run-id=${runId}`],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.broadcast(this.statusMessage('self-test', runId, 'error', message))
      return { ok: false, reason: 'spawn-failed', runId }
    }
    this.selfTestProcess = child
    this.selfTestRunId = runId
    this.attachProcess(child, {
      mode: 'self-test',
      runId,
      onExit: (code) => {
        if (this.selfTestProcess === child) {
          this.selfTestProcess = null
          this.selfTestRunId = null
        }
        if (code !== 0) {
          this.broadcast(this.statusMessage('self-test', runId, 'error', `Bridge self-test exited (${code ?? 'signal'}).`))
        }
      },
    })
    return { ok: true, runId }
  }

  stop() {
    this.requested = false
    if (this.restartTimer) this.cancelSchedule(this.restartTimer)
    this.restartTimer = null
    if (this.process) this.process.kill()
    if (this.selfTestProcess) this.selfTestProcess.kill()
    this.process = null
    this.selfTestProcess = null
    this.selfTestRunId = null
    return { ok: true }
  }

  attachProcess(child, { mode, runId, onExit }) {
    const lines = this.makeLineReader({ input: child.stdout, crlfDelay: Infinity })
    lines.on('line', (line) => {
      try {
        const parsed = JSON.parse(line)
        if (mode === 'self-test' && (parsed.source !== 'self-test' || parsed.runId !== runId)) {
          this.broadcast(this.statusMessage('self-test', runId, 'error', 'Bridge self-test emitted an uncorrelated frame.'))
          return
        }
        this.broadcast(parsed)
      } catch {
        this.broadcast(this.statusMessage(mode, runId, 'error', 'LMU bridge emitted an invalid frame.'))
      }
    })
    child.stderr.on('data', (chunk) => {
      this.broadcast({
        protocolVersion: 1,
        source: mode === 'self-test' ? 'self-test' : 'lmu-shared-memory',
        ...(runId ? { runId } : {}),
        type: 'diagnostic',
        level: 'error',
        message: String(chunk).trim(),
      })
    })
    child.once('error', (error) => {
      if (mode === 'self-test' && this.selfTestProcess === child) {
        this.selfTestProcess = null
        this.selfTestRunId = null
      }
      this.broadcast(this.statusMessage(mode, runId, 'error', error.message))
    })
    child.once('exit', onExit)
  }

  statusMessage(mode, runId, state, message) {
    return {
      protocolVersion: 1,
      source: mode === 'self-test' ? 'self-test' : 'lmu-shared-memory',
      ...(runId ? { runId } : {}),
      type: 'status',
      state,
      message,
    }
  }
}

module.exports = { LmuBridgeManager }
