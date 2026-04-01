import { test, expect } from '@playwright/test'

test.describe('stream-range demo', () => {
  test('mounts alphadex and numeric dimensional examples', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#dimensional-example-alphadex')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('#dimensional-example-numeric')).toBeVisible()
    await expect(page.locator('#tickmark-container')).toBeVisible()
  })

  test('next button changes alphadex panel content', async ({ page }) => {
    await page.goto('/')
    const panel = page.locator('#dimensional-example-alphadex')
    const before = await panel.textContent()
    await panel.getByRole('button', { name: 'next' }).click()
    await expect(panel).not.toHaveText(before ?? '', { timeout: 10_000 })
  })
})
