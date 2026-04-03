import { test, expect } from '@playwright/test'

test.describe('library harness (/library-harness.html)', () => {
  test('basicRange: nudge updates input and viewable readout', async ({ page }) => {
    await page.goto('/library-harness.html')
    const inputEl = page.getByTestId('e2e-basic-input-value')
    const viewEl = page.getByTestId('e2e-basic-viewable')
    await expect(inputEl).toHaveText('100', { timeout: 15_000 })
    await expect(viewEl).toContainText(',')
    await page.getByTestId('e2e-basic-nudge').click()
    await expect(inputEl).toHaveText('110', { timeout: 10_000 })
    await expect(viewEl).toHaveText('105, 115')
  })

  test('readableRange: set input updates conversion store display', async ({ page }) => {
    await page.goto('/library-harness.html')
    const readEl = page.getByTestId('e2e-readable-input')
    await expect(readEl).toHaveText('20', { timeout: 15_000 })
    await page.getByTestId('e2e-readable-set-42').click()
    await expect(readEl).toHaveText('42', { timeout: 10_000 })
  })

  test('ticks: viewable tick count and first label; pan changes labels', async ({ page }) => {
    await page.goto('/library-harness.html')
    const countEl = page.getByTestId('e2e-tick-viewable-count')
    const firstEl = page.getByTestId('e2e-tick-first-label')
    await expect(countEl).not.toHaveText('0', { timeout: 15_000 })
    const beforeFirst = await firstEl.textContent()
    expect(beforeFirst).toMatch(/^t\d+$/)
    await page.getByTestId('e2e-ticks-pan').click()
    await expect(firstEl).not.toHaveText(beforeFirst ?? '', { timeout: 10_000 })
    await expect(firstEl).toHaveText('t200')
  })
})
