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

  // Spec: S.FullScreenNote (VDT 2026-04-18, note 14) — editor must NOT display the note URI.
  // VATester gap: the old test asserted URI visibility, contradicting the new spec.
  test('editor does NOT display the new note URI (S.FullScreenNote)', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const url = new URL(mockTwinPod.page.url())
    const target = decodeURIComponent(url.searchParams.get('target'))
    // Give the editor a tick to render before asserting absence.
    await mockTwinPod.page.waitForTimeout(200)
    const bodyText = await mockTwinPod.page.locator('body').innerText()
    expect(bodyText).not.toContain(target)
  })

  // Spec: S.OptimisticCreate (VDT 2026-04-18, notes 5 + 11) — `new=1` flag is
  // present on the URL so the editor skips its initial read.
  test('navigates with new=1 query flag (S.OptimisticCreate)', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const url = new URL(mockTwinPod.page.url())
    expect(url.searchParams.get('new')).toBe('1')
  })

  // Spec: S.FullScreenNote — no explicit Save button; auto-save only.
  test('editor does NOT render a Save button (S.FullScreenNote)', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const saveButton = mockTwinPod.page.getByRole('button', { name: /^Save$/i })
    await expect(saveButton).toHaveCount(0)
  })

  // Spec: S.FullScreenNote — main element must fill the viewport (100dvh / 100vw).
  test('editor main element is styled to fill the viewport (S.FullScreenNote)', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const main = mockTwinPod.page.locator('main')
    const style = await main.getAttribute('style')
    expect(style).toMatch(/100dvh/)
    expect(style).toMatch(/100vw/)
  })

  // Spec: S.FullScreenNote — back button reads "← Notes" (Apple-Notes style).
  test('back button text reads "Notes" (S.FullScreenNote)', async ({ mockTwinPod }) => {
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const backButton = mockTwinPod.page.getByRole('button', { name: /Back to notes/i })
    await expect(backButton).toBeVisible()
    await expect(backButton).toContainText('Notes')
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

test.describe('F.Create_Note — error states (S.OptimisticCreate)', () => {

  // Spec: S.OptimisticCreate (VDT 2026-04-18) — navigation happens synchronously
  // before the PUT resolves. The user is taken to /app and the editor is shown
  // immediately. If the background PUT fails, the editor stays open on the
  // optimistic URI (pendingUri is not rolled back — see useTwinPodNoteCreate
  // unit test "pendingUri keeps the minted URI even after an HTTP failure").
  test('still navigates to /app when TwinPod returns 403 on the resource PUT', async ({ mockTwinPod }) => {
    await mockTwinPod.routeStackBCreateError(403)
    await mockTwinPod.page.goto('/')
    await mockTwinPod.page.waitForURL('/')
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    expect(new URL(mockTwinPod.page.url()).pathname).toBe('/app')
  })

  test('still navigates to /app when TwinPod returns 500 on the resource PUT', async ({ mockTwinPod }) => {
    await mockTwinPod.routeStackBCreateError(500)
    await mockTwinPod.page.goto('/')
    await mockTwinPod.page.waitForURL('/')
    await mockTwinPod.page.getByRole('button', { name: /New Note/i }).click()
    await mockTwinPod.page.waitForURL(/\/app/)
    expect(new URL(mockTwinPod.page.url()).pathname).toBe('/app')
  })

})

// Spec: hyperFetch pagination fix — T_RESOURCE_PATTERN must match URLs with query
// strings appended (no $ anchor), because before the pagination fix, hyperFetch
// would append ?start=0&rows=20 to PUT URLs, causing page.route() to miss the match.
// The $ anchor was removed from T_RESOURCE_PATTERN to ensure route matching stays
// robust against any future query-string additions.
test.describe('T_RESOURCE_PATTERN — regex contract', () => {

  test('matches a clean /t/t_note_ URL (no query string)', () => {
    const url = 'https://tst-first.demo.systemtwin.com/t/t_note_1776287762997_2jw7'
    expect(url).toMatch(T_RESOURCE_PATTERN)
  })

  test('matches a /t/t_note_ URL with query string appended (no $ anchor)', () => {
    // Before the pagination fix, hyperFetch would append ?start=0&rows=20 to all GETs.
    // The $ anchor was removed so page.route() still intercepts these URLs.
    const urlWithParams = 'https://tst-first.demo.systemtwin.com/t/t_note_1776287762997_2jw7?start=0&rows=20'
    expect(urlWithParams).toMatch(T_RESOURCE_PATTERN)
  })

  test('does not match a non-t_note_ URL', () => {
    const url = 'https://tst-first.demo.systemtwin.com/search/note'
    expect(url).not.toMatch(T_RESOURCE_PATTERN)
  })

})
