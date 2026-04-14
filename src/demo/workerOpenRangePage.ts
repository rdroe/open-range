/**
 * Boots a module worker that imports open-range and surfaces result for Playwright.
 */
const status = document.getElementById('e2e-worker-status')
if (!status) {
  throw new Error('e2e-worker-status missing')
}

const worker = new Worker(new URL('./openRangeSmokeWorker.ts', import.meta.url), {
  type: 'module',
})

worker.onmessage = (ev: MessageEvent<{ ok: boolean; error?: string }>) => {
  if (ev.data?.ok) {
    status.textContent = 'ok'
    status.setAttribute('data-worker-result', 'ok')
  } else {
    status.textContent = ev.data?.error ?? 'fail'
    status.setAttribute('data-worker-result', 'error')
  }
}

worker.onerror = (e) => {
  status.textContent = e.message
  status.setAttribute('data-worker-result', 'error')
}

worker.postMessage({ type: 'run' })
