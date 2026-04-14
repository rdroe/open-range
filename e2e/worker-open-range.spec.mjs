import { test, expect } from '@playwright/test'

test.describe('web worker (/worker-open-range.html)', () => {
  test('basicRange runs in a dedicated worker without page or console errors', async ({
    page,
  }) => {
    const consoleErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    const pageErrors = []
    page.on('pageerror', (err) => {
      pageErrors.push(err.message)
    })

    await page.goto('/worker-open-range.html')
    const status = page.getByTestId('e2e-worker-status')
    await expect(status).toHaveAttribute('data-worker-result', 'ok', {
      timeout: 15_000,
    })
    await expect(status).toHaveText('ok')

    expect(pageErrors, `page errors: ${pageErrors.join('; ')}`).toEqual([])
    expect(
      consoleErrors,
      `console errors: ${consoleErrors.join('; ')}`
    ).toEqual([])
  })
})
