import { parentPort } from 'node:worker_threads';

parentPort.on('message', (message) => {
  if (message.operation === 'crash') {
    throw new Error('intentional worker crash');
  }
  const durationMs = Math.max(0, Number(message.payload?.durationMs || 0));
  const startedAt = Date.now();
  while (Date.now() - startedAt < durationMs) {
    // This deliberately models synchronous document work on an isolated lane.
  }
  parentPort.postMessage({ id: message.id, result: { durationMs } });
});
