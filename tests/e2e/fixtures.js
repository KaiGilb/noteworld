/**
 * Playwright fixtures for NoteWorld E2E tests.
 *
 * Provides two fixtures:
 *   - authedPage: a page with a mock Solid session pre-injected (isLoggedIn = true).
 *     The mock is set on window.__E2E_SESSION__ via page.addInitScript() before the
 *     app loads. App.vue reads this in dev mode and passes it to useTwinPodAuth as
 *     _sessionOverride.
 *
 *   - mockTwinPod: wraps authedPage and intercepts TwinPod Stack B writes via
 *     page.route(). Stack B create contract (verified 2026-04-16):
 *       PUT {podRoot}/t/t_note_{ts}_{rand4}  — uploadTurtleToResource (text/turtle, method: PUT)
 *     See: /Users/kaigilb/Vault_Ideas/9 - Standard/Reference_Code_TwinPod-Writes.md
 */

import { test as base, expect } from '@playwright/test'

export const E2E_WEB_ID = 'https://tst-first.demo.systemtwin.com/profile/card#me'
export const TWINPOD_BASE = 'https://tst-first.demo.systemtwin.com'
export const T_CONTAINER_URL = `${TWINPOD_BASE}/t/`
// Matches {pod}/t/t_note_{timestamp}_{4-rand-lowercase-alnum}
export const T_RESOURCE_PATTERN = /^https:\/\/tst-first\.demo\.systemtwin\.com\/t\/t_note_\d+_[a-z0-9]{4}$/

const E2E_SESSION_SCRIPT = `
  window.__E2E_SESSION__ = {
    info: {
      isLoggedIn: true,
      webId: '${E2E_WEB_ID}'
    },
    fetch: window.fetch.bind(window),
    handleIncomingRedirect: async () => {},
    login: async () => {},
    logout: async () => {
      window.__E2E_SESSION__.info.isLoggedIn = false
      window.__E2E_SESSION__.info.webId = null
    }
  }
`

// CORS headers for TwinPod resource endpoints — must use specific origin +
// credentials: true because uploadTurtleToResource uses credentials: "include".
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:5199',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'PATCH, PUT, GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'accept, cache-control, content-type, link, authorization, if-none-match',
  'Access-Control-Expose-Headers': 'location, etag, link, wac-allow',
  'Access-Control-Max-Age': '86400'
}

// CORS headers for the search endpoint — must use specific origin + credentials: true
// because searchAndGetURIs uses credentials: "include" in its fetch options.
// Using wildcard "*" with credentials causes the browser to block the response.
const SEARCH_CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:5199',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'PATCH, PUT, GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'accept, cache-control, content-type, link, authorization, if-none-match',
  'Access-Control-Expose-Headers': 'location, etag, link, wac-allow',
  'Access-Control-Max-Age': '86400'
}

// Route interceptor for the pod-local search endpoint — HomeView fires search on mount.
// Returns empty Turtle so the note list renders "No notes yet" without a network error.
async function routeSearchEmpty(page) {
  await page.route(`${TWINPOD_BASE}/search/**`, async route => {
    const method = route.request().method()
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: SEARCH_CORS_HEADERS, body: '' })
    } else {
      await route.fulfill({
        status: 200,
        headers: { ...SEARCH_CORS_HEADERS, 'Content-Type': 'text/turtle' },
        body: ''
      })
    }
  })
}

export const test = base.extend({

  authedPage: async ({ page }, use) => {
    await page.addInitScript(E2E_SESSION_SCRIPT)
    await routeSearchEmpty(page)
    await use(page)
  },

  mockTwinPod: async ({ page }, use) => {
    await page.addInitScript(E2E_SESSION_SCRIPT)
    await routeSearchEmpty(page)

    const helpers = {
      page,

      /**
       * Mock a successful Stack B create flow.
       *   - PUT {pod}/t/t_note_{...} → 201 with Location; OPTIONS → 204
       *   - GET {pod}/t/t_note_{...} (read-back from useTwinPodNoteRead) → 200 empty turtle
       *     with a single schema:Note Thing so the editor can render an empty body.
       *
       * Captures the resource PUT so tests can assert on URL, method, and content type.
       */
      async routeStackBCreate() {
        const captured = { method: null, url: null, contentType: null, body: null }

        // Resource PUT (create) + read-back GET on /t/t_note_*.
        await page.route(T_RESOURCE_PATTERN, async route => {
          const req = route.request()
          const method = req.method()
          const url = req.url()
          if (method === 'OPTIONS') {
            await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
            return
          }
          if (method === 'PUT') {
            captured.method = 'PUT'
            captured.url = url
            captured.contentType = req.headers()['content-type']
            captured.body = req.postData()
            await route.fulfill({
              status: 201,
              headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain', Location: url },
              body: 'Created'
            })
            return
          }
          if (method === 'GET' || method === 'HEAD') {
            // Empty note stub — single Thing at {url}#note with schema:text " ".
            const turtle = `@prefix schema: <http://schema.org/> .\n<${url}#note> a schema:Note ; schema:text " " .\n`
            await route.fulfill({
              status: 200,
              headers: { ...CORS_HEADERS, 'Content-Type': 'text/turtle' },
              body: turtle
            })
            return
          }
          await route.continue()
        })

        return captured
      },

      /**
       * Mock a failing Stack B create: the resource PUT fails with the given status.
       */
      async routeStackBCreateError(status) {
        await page.route(T_RESOURCE_PATTERN, async route => {
          const req = route.request()
          const method = req.method()
          if (method === 'OPTIONS') {
            await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' })
          } else {
            await route.fulfill({
              status,
              headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
              body: 'Error'
            })
          }
        })
      }
    }

    await use(helpers)
  }

})

export { expect }
