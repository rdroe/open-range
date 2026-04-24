export const mulberry32 = (a: number) => {
  return () => {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const makeTag3 = (seed: number) => {
  const a = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let u = seed >>> 0
  let t = ''
  for (let i = 0; i < 3; i++) {
    t += a[u % 36]!
    u = (Math.imul(u, 0x1f) + 0x7e1 + i) >>> 0
  }
  return t
}

export const widthScale2to5 = (s0: number) => 2 + mulberry32(s0)() * 3

export const blockHeightForSeed = (s0: number) => {
  const r0 = mulberry32((s0 * 0x1f) >>> 0)()
  const r1 = mulberry32((s0 * 0x2d) >>> 0)()
  return 10 + Math.floor(r0 * 46) + Math.floor(r1 * 28)
}

/**
 * @param dataEpoch Optional salt (e.g. incremented on “wipe & regenerate”) so the same grid
 * coordinates can yield different mock layouts without changing domain bounds.
 */
export const cellKeySeed = (g: number, lane: number, k: number, dataEpoch = 0) => {
  const base =
    (Math.imul(g, 0x9e37) + Math.imul(lane, 0x1f) + k * 0x1d + 0x6d2b79f5) >>> 0
  return (base ^ (Math.imul(dataEpoch >>> 0, 0x9e3779b9) >>> 0)) >>> 0
}
