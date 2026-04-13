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

import App from './App.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/login', component: { template: '<div>Login</div>' } }
    ]
  })
}

describe('App.vue — routing guard', () => {

  beforeEach(() => {
    mockHandleRedirect.mockClear()
    mockIsLoggedIn.value = false
    mockWebId.value = null
    mockLoading.value = false
    mockError.value = null
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

})
