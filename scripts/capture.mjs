import fs from 'node:fs/promises'

const [, , output = 'artifacts/capture.png', expression = 'void 0'] = process.argv
const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
const target = targets.find((candidate) => candidate.type === 'page')
if (!target) throw new Error('No Chrome page target found on port 9222')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) reject(new Error(message.error.message))
  else resolve(message.result)
})

function send(method, params = {}) {
  const id = ++nextId
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

await send('Emulation.setDeviceMetricsOverride', { width: 1512, height: 982, deviceScaleFactor: 1, mobile: false })
await send('Runtime.evaluate', { expression, awaitPromise: true })
await new Promise((resolve) => setTimeout(resolve, 700))
const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await fs.writeFile(output, Buffer.from(result.data, 'base64'))
socket.close()
