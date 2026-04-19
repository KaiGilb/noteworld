// UNIT_TYPE=Widget

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

// Spec: F.NoteWorld — unauthenticated users must be redirected to /login; authenticated users
// landing on /login must be redirected to /. OIDC redirect must be processed on every page load.

// Mock @kaigilb/twinpod-auth — App.vue calls useTwinPodAuth internally; we intercept it
// to inject controllable reactive state without needing a real Solid-OIDC session.
const mockHandleRedirect = vi.fn().mockResolvedValue(undefined)
const mockIsLoggedIn = ref(false)
const mockLogin = vi.fn()
const mockLogout = vi.fn()
const mockSession = { fetch: vi.fn() }
const mockWebId = ref(null)
const mockLoading = ref(false)
const mockError = ref(null)

vi.mock('@kaigilb/twinpod-auth', () => ({
  useTwinPodAuth: () => ({
    isLoggedIn: mockIsLoggedIn,
    webId: mockWebId,
    loading: mockLoading,
    error: mockError,
    session: mockSession,
    handleRedirect: mockHandleRedirect,
    login: mockLogin,
    logout: mockLogout
  })
}))

// Mock @kaigilb/twinpod-client — the package pulls in rdflib (a CJS package with circular deps
// that break Vitest's ESM environment). App.vue calls `ur.findPodRoots(webId)` after the
// OIDC redirect resolves, so the mock must expose that surface for every test, defaulting to
// a realistic pod root so the "logged-in → pushes to /" paths don't stall waiting on discovery.
const mockFindPodRoots = vi.fn().mockResolvedValue(['https://tst-first.demo.systemtwin.com'])
vi.mock('@kaigilb/twinpod-client', () => ({
  ur: {
    findPodRoots: (...args) => mockFindPodRoots(...args)
  }
}))

import App from './App.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/login', component: { template: '<div>Login</div>' } },
      { path: '/app', component: { template: '<div>App</div>' } }
    ]
  })
}

describe('App.vue — routing guard', () => {

  beforeEach(() => {
    mockHandleRedirect.mockClear()
    mockFindPodRoots.mockClear()
    mockFindPodRoots.mockResolvedValue(['https://tst-first.demo.systemtwin.com'])
    mockIsLoggedIn.value = false
    mockWebId.value = null
    mockLoading.value = false
    mockError.value = null
    sessionStorage.clear()
    try { localStorage.removeItem('noteworld:lastPodUrl') } catch { /* ignore */ }
  })

  // Spec: F.NoteWorld — any route visited without a session must redirect to /login
  // Gap: App.vue routing guard logic has no unit tests at all. The redirect on !isLoggedIn
  // is the primary authentication gate for the entire app.
  test('redirects unauthenticated user from / to /login', async () => {
    mockIsLoggedIn.value = false
    const router = makeRouter('/')
    await router.push('/')
    mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  // Spec: F.NoteWorld — authenticated users who arrive at /login must be sent to /
  test('redirects authenticated user from /login to /', async () => {
    mockIsLoggedIn.value = true
    const router = makeRouter('/login')
    await router.push('/login')
    mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })

  // Spec: F.NoteWorld — OIDC redirect must be processed on every page load
  // Gap: no test verifies handleRedirect is called on mount, which is essential for
  // completing the Solid-OIDC callback and restoring sessions across page refreshes.
  test('calls handleRedirect on mount', async () => {
    const router = makeRouter('/')
    await router.push('/')
    mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(mockHandleRedirect).toHaveBeenCalledOnce()
  })

  // Gap: no test verifies that an authenticated user visiting a non-login route stays there.
  test('authenticated user visiting / is not redirected', async () => {
    mockIsLoggedIn.value = true
    const router = makeRouter('/')
    await router.push('/')
    mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })

  // Gap: loading state during OIDC redirect — App renders "Connecting…" while loading;
  // no test verifies this element is shown when loading is true.
  test('shows Connecting… message while loading is true', async () => {
    mockLoading.value = true
    const router = makeRouter('/')
    await router.push('/')
    const wrapper = mount(App, { global: { plugins: [router] } })
    expect(wrapper.text()).toContain('Connecting')
  })

  // Gap: no test verifies the RouterView is hidden while loading (v-else means both
  // cannot appear simultaneously — if this breaks, the app flashes content before auth).
  test('does not render RouterView while loading is true', async () => {
    mockLoading.value = true
    const router = makeRouter('/')
    await router.push('/')
    const wrapper = mount(App, { global: { plugins: [router] } })
    expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(false)
  })

  // --- Gap tests written by QATester ---

  // Spec: F.NoteWorld — RouterView must render (not loading indicator) when OIDC redirect is complete
  // Gap: no test verifies the RouterView IS rendered when loading is false. The v-else branch has
  // a test for the truthy side but nothing proves the falsy side works correctly.
  test('renders RouterView when loading is false', async () => {
    mockLoading.value = false
    const router = makeRouter('/')
    await router.push('/')
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    // RouterView component should be present in the tree when not loading
    expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(true)
  })

  // Spec: F.NoteWorld — deep-link preservation. A user opening /app?target=<note> in a new
  // tab (or hard-refreshing on the editor) must land back at that URL after logging in,
  // not at / — losing the target would mean the intended note never opens.
  test('unauthenticated user on /app?target=... stashes fullPath and redirects to /login', async () => {
    mockIsLoggedIn.value = false
    const router = makeRouter()
    await router.push('/app?target=https%3A%2F%2Fpod.example%2Ft%2Ft_note_1')
    mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(sessionStorage.getItem('noteworld:postLoginRedirect'))
      .toBe('/app?target=https%3A%2F%2Fpod.example%2Ft%2Ft_note_1')
  })

  test('authenticated user with stashed redirect is pushed back to the stashed URL', async () => {
    mockIsLoggedIn.value = true
    sessionStorage.setItem('noteworld:postLoginRedirect', '/app?target=https%3A%2F%2Fpod.example%2Ft%2Ft_note_1')
    const router = makeRouter()
    await router.push('/')
    mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(router.currentRoute.value.fullPath)
      .toBe('/app?target=https%3A%2F%2Fpod.example%2Ft%2Ft_note_1')
    expect(sessionStorage.getItem('noteworld:postLoginRedirect')).toBeNull()
  })

  test('authenticated user on /app without stash stays on /app', async () => {
    mockIsLoggedIn.value = true
    const router = makeRouter()
    await router.push('/app?target=https%3A%2F%2Fpod.example%2Ft%2Ft_note_2')
    mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app')
  })

  // --- Gap tests written by VATester ---

  // Spec gap: when the browser lands on `/?code=...&iss=...` (the OIDC redirect return),
  // App.vue must NOT overwrite the stashed deep-link, because that stash holds the user's
  // original target URL from BEFORE the round-trip. Overwriting it would strand the user
  // at `/` instead of their note.
  test('OIDC return with ?code=... does not overwrite an existing stashed redirect', async () => {
    mockIsLoggedIn.value = false
    sessionStorage.setItem('noteworld:postLoginRedirect', '/app?target=https%3A%2F%2Fpod.example%2Ft%2Ft_note_9')
    const router = makeRouter()
    await router.push('/?code=abc123&iss=https%3A%2F%2Fissuer.example')
    mount(App, { global: { plugins: [router] } })
    await flushPromises()
    // The pre-OIDC stash must still be intact after the redirect callback runs.
    expect(sessionStorage.getItem('noteworld:postLoginRedirect'))
      .toBe('/app?target=https%3A%2F%2Fpod.example%2Ft%2Ft_note_9')
  })

  // Spec gap: stash must not be overwritten by an intermediate / visit when it already holds
  // a deep-link destination (the failing test above demonstrates this as a live bug).
  test('existing stashed deep-link is preserved when mounting on /', async () => {
    mockIsLoggedIn.value = false
    sessionStorage.setItem('noteworld:postLoginRedirect', '/app?target=https%3A%2F%2Fpod.example%2Ft%2Ft_note_77')
    const router = makeRouter()
    await router.push('/')
    mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(sessionStorage.getItem('noteworld:postLoginRedirect'))
      .toBe('/app?target=https%3A%2F%2Fpod.example%2Ft%2Ft_note_77')
  })

  // Spec gap: stashing should ignore /login itself (you cannot return to login).
  test('unauthenticated user on /login does not stash /login as redirect', async () => {
    mockIsLoggedIn.value = false
    const router = makeRouter()
    await router.push('/login')
    mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(sessionStorage.getItem('noteworld:postLoginRedirect')).toBeNull()
  })

  // --- Gap tests written by VATester (session bridge increment) ---

  // Spec: App.vue session bridge fix — when window.solid exists, App.vue must overwrite
  // window.solid.session with the useTwinPodAuth session so ur.hyperFetch (which reads
  // window.solid.session.fetch at call time) uses the authenticated fetch and not the
  // unauthenticated default installed by rdfStore.js on startup.
  test('sets window.solid.session to the auth session when window.solid exists', async () => {
    const fakeSolid = { session: null }
    Object.defineProperty(window, 'solid', { value: fakeSolid, configurable: true, writable: true })
    const router = makeRouter()
    await router.push('/')
    mount(App, { global: { plugins: [router] } })
    // The bridge runs synchronously in <script setup>, before any async work.
    expect(window.solid.session).toBe(mockSession)
    // Restore — prevent leaking into later tests.
    delete window.solid
  })

  // Guard: when window.solid does not exist the bridge must not throw. The package's
  // rdfStore.js installs window.solid on startup, but in test/SSR environments it may be
  // absent; App.vue guards with `if (window.solid)`.
  test('does not throw when window.solid is undefined', async () => {
    // Ensure window.solid is absent for this test.
    delete window.solid
    const router = makeRouter()
    await router.push('/')
    expect(() => mount(App, { global: { plugins: [router] } })).not.toThrow()
  })

  // --- Pod-root discovery (2026-04-18 pod-switch contract) ---
  //
  // Login is the pod switch: the user types a TwinPod URL on LoginView,
  // completes OIDC, and App.vue discovers the authoritative pod root via
  // `ur.findPodRoots(webId)`. The resolved root is `provide`d as 'podRoot'
  // so views don't read VITE_TWINPOD_URL directly.

  describe('pod-root discovery', () => {

    test('calls ur.findPodRoots with the WebID after login', async () => {
      mockIsLoggedIn.value = true
      mockWebId.value = 'https://pod.example.com/profile/card#me'
      const router = makeRouter()
      await router.push('/')
      mount(App, { global: { plugins: [router] } })
      await flushPromises()
      expect(mockFindPodRoots).toHaveBeenCalledWith('https://pod.example.com/profile/card#me')
    })

    test('does not call ur.findPodRoots when the user is not logged in', async () => {
      mockIsLoggedIn.value = false
      const router = makeRouter()
      await router.push('/login')
      mount(App, { global: { plugins: [router] } })
      await flushPromises()
      expect(mockFindPodRoots).not.toHaveBeenCalled()
    })

    // Spec: silently pick the first pod root when multiple are returned (Kai: "a").
    test('provides the first pod root (trailing slash stripped) as podRoot', async () => {
      mockIsLoggedIn.value = true
      mockWebId.value = 'https://pod.example.com/profile/card#me'
      mockFindPodRoots.mockResolvedValue([
        'https://tst-ia2.demo.systemtwin.com/',
        'https://other-pod.example.com/'
      ])
      let capturedPodRoot = null
      const probe = {
        template: '<div>probe</div>',
        inject: ['podRoot'],
        mounted() { capturedPodRoot = this.podRoot }
      }
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: probe },
          { path: '/login', component: { template: '<div />' } },
          { path: '/app', component: { template: '<div />' } }
        ]
      })
      await router.push('/')
      mount(App, { global: { plugins: [router] } })
      await flushPromises()
      expect(capturedPodRoot).toBe('https://tst-ia2.demo.systemtwin.com')
    })

    // Fallback: discovery returns empty → WebID origin.
    test('falls back to WebID origin when findPodRoots returns empty', async () => {
      mockIsLoggedIn.value = true
      mockWebId.value = 'https://pod.example.com/profile/card#me'
      mockFindPodRoots.mockResolvedValue([])
      let capturedPodRoot = null
      const probe = {
        template: '<div>probe</div>',
        inject: ['podRoot'],
        mounted() { capturedPodRoot = this.podRoot }
      }
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: probe },
          { path: '/login', component: { template: '<div />' } }
        ]
      })
      await router.push('/')
      mount(App, { global: { plugins: [router] } })
      await flushPromises()
      expect(capturedPodRoot).toBe('https://pod.example.com')
    })

    // Resilience: findPodRoots throws → WebID origin, no crash.
    test('does not throw when findPodRoots rejects; falls back to WebID origin', async () => {
      mockIsLoggedIn.value = true
      mockWebId.value = 'https://tst-ia2.demo.systemtwin.com/i'
      mockFindPodRoots.mockRejectedValue(new Error('network'))
      let capturedPodRoot = null
      const probe = {
        template: '<div>probe</div>',
        inject: ['podRoot'],
        mounted() { capturedPodRoot = this.podRoot }
      }
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: probe },
          { path: '/login', component: { template: '<div />' } }
        ]
      })
      await router.push('/')
      mount(App, { global: { plugins: [router] } })
      await flushPromises()
      expect(capturedPodRoot).toBe('https://tst-ia2.demo.systemtwin.com')
    })

  })

})
