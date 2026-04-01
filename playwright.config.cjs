const { defineConfig, devices } = require('@playwright/test')

/** Dedicated port so `yarn dev` (5173) and other locals do not collide with Playwright's webServer. */
const E2E_PORT = process.env.PLAYWRIGHT_E2E_PORT || '5320'
const baseURL = `http://127.0.0.1:${E2E_PORT}`

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Invoke Vite directly so port/host are not lost through nested yarn scripts.
    command: `yarn exec vite --port ${E2E_PORT} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
