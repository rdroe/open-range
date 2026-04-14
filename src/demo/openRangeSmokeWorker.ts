/**
 * Playwright smoke test: run basicRange inside a real dedicated Web Worker (module).
 */
import { registerRange, store, updateRangeInputInner } from '../lib/basicRange'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const geo = {
  getViewableRange: async (input: number): Promise<[number, number]> => [
    input - 5,
    input + 5,
  ],
  getNextLeftRange: async (input: number): Promise<[number, number]> => [
    input - 20,
    input - 5,
  ],
  getNextRightRange: async (input: number): Promise<[number, number]> => [
    input + 5,
    input + 20,
  ],
}

const RANGE_ID = 'e2e-worker-smoke'

addEventListener('message', async (e: MessageEvent<{ type?: string }>) => {
  if (e.data?.type !== 'run') return
  try {
    registerRange(RANGE_ID, 100, geo, false)
    updateRangeInputInner(RANGE_ID, 110)
    await delay(500)
    const vr = store[RANGE_ID].viewableRange
    if (vr[0] === 105 && vr[1] === 115) {
      postMessage({ ok: true as const, viewableRange: vr })
    } else {
      postMessage({
        ok: false as const,
        error: `unexpected viewableRange ${JSON.stringify(vr)}`,
      })
    }
  } catch (err) {
    postMessage({
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    })
  }
})
