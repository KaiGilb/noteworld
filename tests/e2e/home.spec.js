// Spec: F.NoteWorld — home screen must display the authenticated user's WebID and allow logout
// Spec: F.Create_Note — home screen must provide a New Note button
// Spec: F.Find_Note — home screen must list existing notes from TwinPod search

import { test, expect, E2E_WEB_ID, TWINPOD_BASE } from './fixtures.js'
import AxeBuilder from '@axe-core/playwright'

test.describe('HomeView (authenticated)', () => {

  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/')
    await authedPage.waitForURL('/')
  })

  // Spec: F.NoteWorld — home screen must display the authenticated user's WebID
  test('displays the authenticated WebID', async ({ authedPage }) => {
    await expect(authedPage.getByText(E2E_WEB_ID)).toBeVisible()
  })

  // Spec: F.Create_Note — home screen must have a New Note button
  test('renders a New Note button', async ({ authedPage }) => {
    await expect(authedPage.getByRole('button', { name: /New Note/i })).toBeVisible()
  })

  test('renders a Logout button', async ({ authedPage }) => {
    await expect(authedPage.getByRole('button', { name: /Logout/i })).toBeVisible()
  })

  // Spec: MOBILE_03 — all interactive elements must have a minimum touch target of 44×44 px
  test('New Note button has a touch target height of at least 44px', async ({ authedPage }) => {
    const button = authedPage.getByRole('button', { name: /New Note/i })
    const box = await button.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
  })

  test('Logout button has a touch target height of at least 44px', async ({ authedPage }) => {
    const button = authedPage.getByRole('button', { name: /Logout/i })
    const box = await button.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
  })

  // Spec: Accessibility — must meet WCAG 2.1 AA (meter: axe-core violations = 0)
  // Wait for HomeView to fully render (New Note button visible) before
  // running axe — avoids scanning the "Connecting…" loading state which
  // has no landmark or heading and would produce false violations.
  test('has no accessibility violations', async ({ authedPage }) => {
    await expect(authedPage.getByRole('button', { name: /New Note/i })).toBeVisible()
    const results = await new AxeBuilder({ page: authedPage }).analyze()
    expect(results.violations).toEqual([])
  })

})

// --- Gap tests written by VATester (F.Find_Note QA round 2) ---

// Spec: F.Find_Note — empty note list shows "No notes yet" message
test.describe('HomeView — F.Find_Note empty state', () => {

  // authedPage fixture already mocks search to return empty Turtle
  test('shows "No notes yet" when search returns no notes', async ({ authedPage }) => {
    await authedPage.goto('/')
    await authedPage.waitForURL('/')
    await expect(authedPage.getByText(/No notes yet/i)).toBeVisible()
  })

})

// Spec: F.Find_Note — search error state is surfaced to the user
test.describe('HomeView — F.Find_Note search error', () => {

  test('shows search error when TwinPod search endpoint fails', async ({ mockTwinPod }) => {
    // Unroute the default empty search mock and replace with a failing one
    await mockTwinPod.page.unroute(`${TWINPOD_BASE}/search/**`)
    const SEARCH_CORS_HEADERS_ERR = {
      'Access-Control-Allow-Origin': 'http://localhost:5199',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'PUT, GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'accept, cache-control, content-type, link, authorization, if-none-match',
      'Access-Control-Expose-Headers': 'location, etag, link, wac-allow',
      'Access-Control-Max-Age': '86400'
    }
    await mockTwinPod.page.route(`${TWINPOD_BASE}/search/**`, async route => {
      const method = route.request().method()
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: SEARCH_CORS_HEADERS_ERR, body: '' })
      } else {
        await route.fulfill({ status: 500, headers: SEARCH_CORS_HEADERS_ERR, body: 'Internal Server Error' })
      }
    })
    await mockTwinPod.page.goto('/')
    await mockTwinPod.page.waitForURL('/')
    // The error message should be visible via role="alert"
    await expect(mockTwinPod.page.locator('[role="alert"]')).toBeVisible()
  })

})

// --- Gap tests written by VATester (F.Find_Note increment) ---

// Spec: F.Find_Note — home screen must show existing notes from TwinPod search and allow navigation

const NOTE_1_URI = `${TWINPOD_BASE}/t/t_note_1776287762997_2jw7`
const NOTE_2_URI = `${TWINPOD_BASE}/t/t_note_1776287763100_8kx2`
// searchAndGetURIs uses credentials: "include", so the CORS origin must be specific, not "*"
const SEARCH_CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:5199',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'PUT, GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'accept, cache-control, content-type, link, authorization, if-none-match',
  'Access-Control-Expose-Headers': 'location, etag, link, wac-allow',
  'Access-Control-Max-Age': '86400'
}
// Real pod format (verified 2026-04-19 against tst-ia2.demo.systemtwin.com):
// Notes are typed as sio:SIO_000110; the class carries neo:m_cid "a_paragraph"
// linking it to the Neo concept name. useTwinPodNoteSearch resolves notes via
// this two-step neo:m_cid → rdf:type lookup (not rdf:type neo:a_paragraph directly).
const SIO_PARAGRAPH = 'http://semanticscience.org/resource/SIO_000110'
const SEARCH_TURTLE = `
@prefix neo: <https://neo.graphmetrix.net/node/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix sio: <http://semanticscience.org/resource/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<${NOTE_1_URI}> a sio:SIO_000110 .
<${NOTE_2_URI}> a sio:SIO_000110 .
sio:SIO_000110 neo:m_cid "a_paragraph"^^xsd:string .
`

test.describe('HomeView — F.Find_Note note list', () => {

  test.beforeEach(async ({ mockTwinPod }) => {
    // Unroute the default empty search mock so our note-returning mock is the only handler.
    await mockTwinPod.page.unroute(`${TWINPOD_BASE}/search/**`)

    // Mock search endpoint to return two notes.
    await mockTwinPod.page.route(`${TWINPOD_BASE}/search/**`, async route => {
      const method = route.request().method()
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: SEARCH_CORS_HEADERS, body: '' })
      } else {
        await route.fulfill({
          status: 200,
          headers: { ...SEARCH_CORS_HEADERS, 'Content-Type': 'text/turtle' },
          body: SEARCH_TURTLE
        })
      }
    })

    await mockTwinPod.page.goto('/')
    await mockTwinPod.page.waitForURL('/')
  })

  // Spec: F.Find_Note — The target note is located and presented to the user
  test('displays note URIs in the note list', async ({ mockTwinPod }) => {
    await expect(mockTwinPod.page.getByText('t_note_1776287762997_2jw7')).toBeVisible()
    await expect(mockTwinPod.page.getByText('t_note_1776287763100_8kx2')).toBeVisible()
  })

  // Spec: F.Find_Note — clicking a note navigates to the editor with the note URI
  test('clicking a note navigates to /app with target query param', async ({ mockTwinPod }) => {
    // Mock read-back for the note editor
    await mockTwinPod.page.route(`${NOTE_1_URI}**`, async route => {
      const method = route.request().method()
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: SEARCH_CORS_HEADERS, body: '' })
      } else {
        const turtle = `@prefix schema: <http://schema.org/> .\n@prefix neo: <https://neo.graphmetrix.net/node/> .\n<${NOTE_1_URI}#note> a neo:a_paragraph ; schema:text "Hello" .\n`
        await route.fulfill({
          status: 200,
          headers: { ...SEARCH_CORS_HEADERS, 'Content-Type': 'text/turtle' },
          body: turtle
        })
      }
    })

    await mockTwinPod.page.getByText('t_note_1776287762997_2jw7').click()
    await mockTwinPod.page.waitForURL(/\/app/)
    const url = new URL(mockTwinPod.page.url())
    expect(url.pathname).toBe('/app')
    expect(url.searchParams.get('navigator')).toBe('editor')
    expect(decodeURIComponent(url.searchParams.get('target'))).toBe(NOTE_1_URI)
  })

  // Spec: MOBILE_03 — note list buttons must have a minimum touch target of 44×44px
  test('note list buttons have a touch target height of at least 44px', async ({ mockTwinPod }) => {
    const noteButton = mockTwinPod.page.getByRole('button').filter({ hasText: 't_note_1776287762997_2jw7' })
    const box = await noteButton.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
  })

  // Spec: F.Find_Note — "Your Notes" heading is visible
  test('shows "Your Notes" heading', async ({ mockTwinPod }) => {
    await expect(mockTwinPod.page.getByRole('heading', { name: /Your Notes/i })).toBeVisible()
  })

  // Spec: Accessibility — page with notes rendered must meet WCAG 2.1 AA (VATester gap)
  test('has no accessibility violations with notes rendered', async ({ mockTwinPod }) => {
    // Wait for the note list to be rendered before running axe
    await expect(mockTwinPod.page.getByText('t_note_1776287762997_2jw7')).toBeVisible()
    const results = await new AxeBuilder({ page: mockTwinPod.page }).analyze()
    expect(results.violations).toEqual([])
  })

})

// --- Gap tests written by VATester (F.Find_Note QA round 3 — V.MobileUX 375px) ---

// Spec: V.MobileUX — F.Find_Note must be completable on a 375px viewport with no horizontal scroll
test.describe('HomeView — F.Find_Note V.MobileUX 375px viewport', () => {

  test.use({ viewport: { width: 375, height: 667 } })

  test.beforeEach(async ({ mockTwinPod }) => {
    // Unroute the default empty search mock and provide notes
    await mockTwinPod.page.unroute(`${TWINPOD_BASE}/search/**`)
    await mockTwinPod.page.route(`${TWINPOD_BASE}/search/**`, async route => {
      const method = route.request().method()
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: SEARCH_CORS_HEADERS, body: '' })
      } else {
        await route.fulfill({
          status: 200,
          headers: { ...SEARCH_CORS_HEADERS, 'Content-Type': 'text/turtle' },
          body: SEARCH_TURTLE
        })
      }
    })
    await mockTwinPod.page.goto('/')
    await mockTwinPod.page.waitForURL('/')
  })

  // Spec: V.MobileUX — note list must render without horizontal scroll at 375px
  test('note list page has no horizontal scroll at 375px', async ({ mockTwinPod }) => {
    await expect(mockTwinPod.page.getByText('t_note_1776287762997_2jw7')).toBeVisible()
    const scrollWidth = await mockTwinPod.page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await mockTwinPod.page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  // Spec: V.MobileUX + MOBILE_03 — note list buttons must be at least 44x44 on 375px viewport
  test('note list buttons have at least 44px touch target on 375px viewport', async ({ mockTwinPod }) => {
    const noteButton = mockTwinPod.page.getByRole('button').filter({ hasText: 't_note_1776287762997_2jw7' })
    await expect(noteButton).toBeVisible()
    const box = await noteButton.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
  })

})
