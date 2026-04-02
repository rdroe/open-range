const LS_KEY = 'open-range:mockBrowserSessionId'

const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Random segment plus ISO timestamp with milliseconds (human-readable). */
export function generateBrowserSessionName(): string {
  let rand = ''
  for (let i = 0; i < 4; i++) {
    rand += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `${rand}-${new Date().toISOString()}`
}

/** One logical mock session per browser profile; shared across tabs/windows on this origin. */
export function getOrCreateBrowserSessionId(): string {
  try {
    const existing = localStorage.getItem(LS_KEY)
    if (existing) return existing
    const id = generateBrowserSessionName()
    localStorage.setItem(LS_KEY, id)
    return id
  } catch {
    return generateBrowserSessionName()
  }
}

/** Call before assigning a new id after `clearAll` so the next read creates a fresh name. */
export function clearBrowserSessionIdFromStorage(): void {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
