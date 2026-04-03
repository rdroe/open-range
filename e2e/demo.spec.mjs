import { test, expect } from '@playwright/test'

/** @param {import('@playwright/test').Page} page */
const mockPanel = (page) => page.locator('#mock-data-demo-panel')

test.describe('open-range home (/)', () => {
  test('initial center input is 4 across mock, numeric, and home control', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('home-center-input')).toHaveValue('4', { timeout: 20_000 })
    await expect(page.getByTestId('mock-demo-center-input')).toHaveText('4')
    await expect(page.getByTestId('demo-numeric-center-input')).toHaveText('4')
    await expect(page.getByTestId('demo-alphadex-center-input')).toContainText('e')
  })

  test('Apply syncs all axes to a new numeric center', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mock-demo-center-input')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('home-center-input').fill('12.5')
    await page.getByTestId('home-apply-center').click()
    await expect(page.getByTestId('mock-demo-center-input')).toHaveText('12.5')
    await expect(page.getByTestId('demo-numeric-center-input')).toHaveText('12.5')
    await expect(page.getByTestId('demo-alphadex-center-input')).not.toContainText('e.0')
    await expect(page.getByTestId('demo-alphadex-center-input')).toContainText('m')
  })

  test('mock: zoom +1 increases zoom readout', async ({ page }) => {
    await page.goto('/')
    const zoomEl = page.getByTestId('mock-demo-zoom')
    await expect(zoomEl).toBeVisible({ timeout: 20_000 })
    const before = Number.parseFloat((await zoomEl.textContent()) ?? 'NaN')
    expect(before).toBeGreaterThan(0)
    await mockPanel(page).getByRole('button', { name: 'Zoom +1' }).click()
    const after = Number.parseFloat((await zoomEl.textContent()) ?? 'NaN')
    expect(after).toBeCloseTo(before + 1, 5)
  })

  test('mock: unit + increases unitSize readout', async ({ page }) => {
    await page.goto('/')
    const unitEl = page.getByTestId('mock-demo-unit-size')
    await expect(unitEl).toBeVisible({ timeout: 20_000 })
    const before = Number.parseFloat((await unitEl.textContent()) ?? 'NaN')
    await mockPanel(page).getByRole('button', { name: 'Unit +' }).click()
    const after = Number.parseFloat((await unitEl.textContent()) ?? 'NaN')
    expect(after).toBeCloseTo(before + 0.05, 5)
  })

  test('mock: tick grid +1 increases ticks-across readout', async ({ page }) => {
    await page.goto('/')
    const ticksAcross = page.getByTestId('mock-demo-ticks-across')
    await expect(ticksAcross).toBeVisible({ timeout: 20_000 })
    const before = await ticksAcross.textContent()
    await mockPanel(page).getByRole('button', { name: '+1', exact: true }).click()
    await expect(ticksAcross).not.toHaveText(before ?? '', { timeout: 10_000 })
  })

  test('mock: ← Prev changes center input', async ({ page }) => {
    await page.goto('/')
    const inputEl = page.getByTestId('mock-demo-center-input')
    await expect(inputEl).toHaveText('4', { timeout: 20_000 })
    await mockPanel(page).getByRole('button', { name: '← Prev' }).click()
    await expect(inputEl).not.toHaveText('4', { timeout: 10_000 })
    const v = Number.parseFloat((await inputEl.textContent()) ?? '')
    expect(Number.isFinite(v)).toBe(true)
  })

  test('mock: viewable range readout is two comma-separated numbers', async ({ page }) => {
    await page.goto('/')
    const view = page.getByTestId('mock-demo-viewable')
    await expect(view).toBeVisible({ timeout: 20_000 })
    const t = (await view.textContent()) ?? ''
    const parts = t.split(',').map((s) => s.trim())
    expect(parts.length).toBe(2)
    expect(Number.isFinite(Number.parseFloat(parts[0]))).toBe(true)
    expect(Number.isFinite(Number.parseFloat(parts[1]))).toBe(true)
  })

  test('alphadex panel: next changes letter readout', async ({ page }) => {
    await page.goto('/')
    const letter = page.getByTestId('demo-alphadex-center-input')
    await expect(letter).toBeVisible({ timeout: 20_000 })
    const before = await letter.textContent()
    await page.locator('#dimensional-example-alphadex').getByRole('button', { name: 'next' }).click()
    await expect(letter).not.toHaveText(before ?? '', { timeout: 10_000 })
  })

  test('numeric panel: tickmark container renders', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#tickmark-container')).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('mock-data-demo standalone page', () => {
  test('loads mock panel with deterministic center 4 and back link', async ({ page }) => {
    await page.goto('/mock-data-demo.html')
    await expect(page.getByTestId('mock-demo-center-input')).toHaveText('4', { timeout: 20_000 })
    await expect(page.getByRole('link', { name: /All demos \(home\)/ })).toBeVisible()
  })
})
