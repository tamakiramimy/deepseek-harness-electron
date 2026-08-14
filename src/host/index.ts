const PROTOCOL_VERSION = 1

process.parentPort.on('message', (event) => {
  const message = event.data as { type?: unknown; protocolVersion?: unknown }
  if (message.type !== 'hello' || message.protocolVersion !== PROTOCOL_VERSION) return
  process.parentPort.postMessage({
    type: 'ready',
    protocolVersion: PROTOCOL_VERSION,
    detail: 'Desktop Host ready. DeepSeek Harness adapter has not been mounted yet.',
    startedAt: Date.now(),
  })
})
