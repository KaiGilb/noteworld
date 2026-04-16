// Spec: F.Create_Note — clicking New Note must create a TwinPod resource and open the editor
// Spec: V.Speed_Create_Note — Goal: 0.5s from click to editor open
// Contract (Stack B, verified 2026-04-16):
//   PUT {pod}/t/t_note_{ts}_{rand4}  (uploadTurtleToResource, method: PUT, Content-Type: text/turtle)
//   See: /Users/kaigilb/Vault_Ideas/9 - Standard/Reference_Code_TwinPod-Writes.md

import { test, expect, T_RESOURCE_PATTERN } from './fixtures.js'
import AxeBuilder from '@axe-core/playwright'

test.describe('F.Create_Note — New Note flow', () => {

  let captured

  test.beforeEach(async ({ mockTwinPod }) => {
    captured = await mockTwinPod.routeStackBCreate()
    await mockTwinPod.page.goto('/')
    await mockTwinPod.page.waitForURL('/')
  })

  test('navigates to /app after clicking New Note', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    expect(mockTwinPod.page.url()).toContain('/app')
  })

  test('editor URL contains navigator=editor', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const url = new URL(mockTwinPod.page.url())
    expect(url.searchParams.get('navigator')).toBe('editor')
  })

  test('editor URL contains a client-minted /t/ resource URI as target', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const url = new URL(mockTwinPod.page.url())
    const target = decodeURIComponent(url.searchParams.get('target'))
    expect(target).toMatch(T_RESOURCE_PATTERN)
  })

  test('PUTs the Turtle resource to /t/t_note_... with text/turtle content type', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    expect(captured.method).toBe('PUT')
    expect(captured.url).toMatch(T_RESOURCE_PATTERN)
    expect(captured.contentType).toMatch(/text\/turtle/)
    // The PUT URL must match the URI in the target query param
    const url = new URL(mockTwinPod.page.url())
    const target = decodeURIComponent(url.searchParams.get('target'))
    expect(captured.url).toBe(target)
  })

  test('editor shows a textarea pre-loaded with the note body', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    // After create, the editor read-backs the note; the mock returns schema:text " ".
    const textarea = mockTwinPod.page.getByRole('textbox', { name: /Note content/i })
    await expect(textarea).toBeVisible()
  })

  test('editor displays the new note URI', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const url = new URL(mockTwinPod.page.url())
    const target = decodeURIComponent(url.searchParams.get('target'))
    await expect(mockTwinPod.page.getByText(target)).toBeVisible()
  })

  // Spec: MOBILE_03 — Back button in editor must have a minimum touch target of 44x44 px
  test('Back button in editor has a touch target height of at least 44px', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const backButton = mockTwinPod.page.getByRole('button', { name: /Back/i })
    const box = await backButton.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
  })

  test('clicking Back navigates back to /', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    await mockTwinPod.page.getByRole('button', { name: /Back/i }).click()
    await mockTwinPod.page.waitForURL('/')
    expect(new URL(mockTwinPod.page.url()).pathname).toBe('/')
  })

  test('editor has no accessibility violations', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const results = await new AxeBuilder({ page: mockTwinPod.page }).analyze()
    expect(results.violations).toEqual([])
  })

  // Spec: V.Speed_Create_Note — Tolerable: 1.0s from click to editor open and ready
  test('editor is open and ready within 1000ms of clicking New Note', async ({ mockTwinPod }) => {
    const start = Date.now()
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const textarea = mockTwinPod.page.getByRole('textbox', { name: /Note content/i })
    await expect(textarea).toBeVisible()
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)
  })

})

// Spec: V.MobileUX — 375px viewport checks for the create-note flow.
test.describe('F.Create_Note — V.MobileUX 375px viewport', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test.beforeEach(async ({ mockTwinPod }) => {
    await mockTwinPod.routeStackBCreate()
    await mockTwinPod.page.goto('/')
    await mockTwinPod.page.waitForURL('/')
  })

  test('home page has no horizontal scroll at 375px', async ({ mockTwinPod }) => {
    const scrollWidth = await mockTwinPod.page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await mockTwinPod.page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  test('New Note button is at least 44x44 px on 375px viewport', async ({ mockTwinPod }) => {
    const button = mockTwinPod.page.getByRole('button', { name: /New Note/i })
    const box = await button.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  })

  test('can complete create-note flow on 375px viewport', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    await expect(mockTwinPod.page.getByRole('textbox', { name: /Note content/i })).toBeVisible()
  })

  test('editor has no horizontal scroll at 375px', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const scrollWidth = await mockTwinPod.page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await mockTwinPod.page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
})

test.describe('F.Create_Note — error states', () => {

  // Spec: ERROR_HANDLING_02 — Components must not silently fail
  test('shows error message when TwinPod returns 403 on the resource PUT', async ({ mockTwinPod }) => {
    await mockTwinPod.routeStackBCreateError(403)
    await mockTwinPod.page.goto('/')
    await mockTwinPod.page.waitForURL('/')
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForTimeout(500)
    expect(new URL(mockTwinPod.page.url()).pathname).toBe('/')
    await expect(mockTwinPod.page.locator('[role="alert"]')).toBeVisible()
  })

  test('shows error message when TwinPod returns 500 on the resource PUT', async ({ mockTwinPod }) => {
    await mockTwinPod.routeStackBCreateError(500)
    await mockTwinPod.page.goto('/')
    await mockTwinPod.page.waitForURL('/')
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForTimeout(500)
    expect(new URL(mockTwinPod.page.url()).pathname).toBe('/')
    await expect(mockTwinPod.page.locator('[role="alert"]')).toBeVisible()
  })

})
