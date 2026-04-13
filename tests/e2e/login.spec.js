import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Spec: F.NoteWorld — user must be able to see and interact with the TwinPod login screen

test.describe('Login page', () => {

  test.beforeEach(async ({ page }) => {
    // unauthenticated visit — app redirects to /login automatically
    await page.goto('/')
    await page.waitForURL('/login')
  })

  // Spec: F.NoteWorld — login page must render with a Connect to TwinPod button
  test('shows the Connect to TwinPod button', async ({ page }) => {
    const button = page.getByRole('button', { name: /Connect to TwinPod/i })
    await expect(button).toBeVisible()
  })

  test('button is enabled when page first loads', async ({ page }) => {
    const button = page.getByRole('button', { name: /Connect to TwinPod/i })
    await expect(button).toBeEnabled()
  })

  // Spec: Accessibility — login page must meet WCAG 2.1 AA (meter: axe-core violations = 0)
  test('has no accessibility violations', async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

})

test.describe('Unauthenticated redirect', () => {

  // Spec: F.NoteWorld — any route visited without a session must redirect to /login
  test('redirects from / to /login when not authenticated', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL('/login')
    expect(page.url()).toContain('/login')
  })

})
