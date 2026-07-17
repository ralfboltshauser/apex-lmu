#!/usr/bin/env node

const fs = require('node:fs')

function fail(message) {
  process.stderr.write(`Bridge self-test assertion failed: ${message}\n`)
  process.exitCode = 1
}

function readInput(inputPath) {
  if (!inputPath || inputPath === '-') return fs.readFileSync(0, 'utf8')
  return fs.readFileSync(inputPath, 'utf8')
}

function main() {
  const [, , inputPath = '-', expectedFramesArgument, expectedRunID] = process.argv
  const lines = readInput(inputPath).split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 3) return fail(`expected start, telemetry, and completion messages; got ${lines.length} lines`)

  const messages = []
  for (const [index, line] of lines.entries()) {
    try {
      messages.push(JSON.parse(line))
    } catch (error) {
      return fail(`line ${index + 1} is not JSON: ${error.message}`)
    }
  }

  const first = messages[0]
  const complete = messages.at(-1)
  const telemetry = messages.slice(1, -1)
  const expectedFrames = expectedFramesArgument === undefined
    ? complete.frames
    : Number.parseInt(expectedFramesArgument, 10)

  if (first.type !== 'status' || first.state !== 'self-test-starting') return fail('first message is not self-test-starting')
  if (complete.type !== 'status' || complete.state !== 'self-test-complete') return fail('last message is not self-test-complete')
  if (!Number.isInteger(expectedFrames) || expectedFrames < 1) return fail(`invalid expected frame count: ${expectedFramesArgument ?? complete.frames}`)
  if (telemetry.length !== expectedFrames) return fail(`telemetry frame count is ${telemetry.length}, expected ${expectedFrames}`)
  if (complete.frames !== expectedFrames) return fail(`completion reports ${complete.frames} frames, expected ${expectedFrames}`)

  const runID = expectedRunID ?? first.runId
  if (typeof runID !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(runID)) return fail(`invalid runId ${JSON.stringify(runID)}`)
  for (const [index, message] of messages.entries()) {
    if (message.protocolVersion !== 2) return fail(`message ${index + 1} has protocolVersion ${message.protocolVersion}`)
    if (message.source !== 'self-test') return fail(`message ${index + 1} has source ${JSON.stringify(message.source)}`)
    if (message.fixture !== 'bridge-contract-v1') return fail(`message ${index + 1} has fixture ${JSON.stringify(message.fixture)}`)
    if (message.runId !== runID) return fail(`message ${index + 1} has runId ${JSON.stringify(message.runId)}, expected ${JSON.stringify(runID)}`)
  }

  for (const [index, frame] of telemetry.entries()) {
    if (frame.type !== 'telemetry') return fail(`message ${index + 2} is not telemetry`)
    if (frame.sequence !== index + 1) return fail(`frame ${index + 1} has sequence ${frame.sequence}`)
    if (!Number.isFinite(Date.parse(frame.capturedAt))) return fail(`frame ${index + 1} has invalid capturedAt`)
    if (index > 0 && Date.parse(frame.capturedAt) <= Date.parse(telemetry[index - 1].capturedAt)) {
      return fail(`frame ${index + 1} timestamp is not strictly increasing`)
    }
    if (frame.player?.driver !== 'Apex Self-Test') return fail(`frame ${index + 1} is missing the fixture player`)
    if (frame.player?.wheels?.length !== 4) return fail(`frame ${index + 1} does not contain four wheels`)
    if (frame.opponents?.length !== 2) return fail(`frame ${index + 1} does not contain two opponents`)
  }

  const fixture = telemetry[0]
  if (fixture.session?.trackLengthM !== 13626) return fail('fixture track length changed')
  if (fixture.player?.wheels?.[0]?.pressurePsi !== 24) return fail('fixture front-left pressure changed')
  if (fixture.player?.wheels?.[0]?.wearRemaining !== 0.87) return fail('fixture front-left wear changed')
  if (fixture.opponents?.[1]?.class !== 'LMP2' || fixture.opponents?.[1]?.pitState !== 3) {
    return fail('fixture multiclass pit state changed')
  }

  process.stdout.write(`Bridge self-test OK: ${expectedFrames} frames, run ${runID}, protocol v2\n`)
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
