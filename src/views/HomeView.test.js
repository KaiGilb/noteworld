// UNIT_TYPE=Widget

import { describe, test, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { axe } from 'vitest-axe'
import { toHaveNoViolations } from 'vitest-axe/matchers.js'

// Spec: F.NoteWorld — home screen must display the authenticated user's WebID and allow logout
// Spec: F.Create_Note — home screen must provide a New Note button

// Mock @kaigilb/noteworld-notes — HomeView calls useTwinPodNoteCreate internally.
// Tests inject controllable state via the mock; no real TwinPod calls are made.
const mockCreateNote = vi.fn()
const mockNoteLoading = ref(false)
const mockNoteError = ref(null)

vi.mock('@kaigilb/noteworld-notes', () => ({
  useTwinPodNoteCreate: () => ({
    loading: mockNoteLoading,
    error: mockNoteError,
    createNote: mockCreateNote
  })
}))

import HomeView from './HomeView.vue'

expect.extend({ toHaveNoViolations })

// Shared router — includes /app route for NoteEditorView navigation after note creation
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/login', component: { template: '<div />' } },
    { path: '/app', component: { template: '<div />' } }
  ]
})

function makeProvide({
  webId = 'https://pod.example.com/profile/card#me',
  logoutFn = vi.fn(),
  loading = false,
  error = null,
  twinpodFetch = vi.fn()
} = {}) {
  return {
    auth: {
      webId: ref(webId),
      logout: logoutFn,
      loading: ref(loading),
      error: ref(error)
    },
    twinpodFetch
  }
}

// Helper to find a button by its text content
function findButton(wrapper, text) {
  return wrapper.findAll('button').find(b => b.text().includes(text))
}

describe('HomeView', () => {

  describe('rendering', () => {

    test('displays the authenticated WebID', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide({ webId: 'https://pod.example.com/profile/card#me' }) }
      })
      expect(wrapper.text()).toContain('https://pod.example.com/profile/card#me')
    })

    // Spec: F.Create_Note — home screen must have a New Note button
    test('renders a New Note button', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(findButton(wrapper, 'New Note')).toBeDefined()
    })

    test('renders a Logout button', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(findButton(wrapper, 'Logout')).toBeDefined()
    })

    test('Logout button is enabled when auth is not loading', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide({ loading: false }) }
      })
      expect(findButton(wrapper, 'Logout').attributes('disabled')).toBeUndefined()
    })

    test('Logout button is disabled when auth is loading', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide({ loading: true }) }
      })
      expect(findButton(wrapper, 'Logout').attributes('disabled')).toBeDefined()
    })

    test('New Note button is enabled when noteLoading is false', () => {
      mockNoteLoading.value = false
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(findButton(wrapper, 'New Note').attributes('disabled')).toBeUndefined()
    })

    test('New Note button is disabled when noteLoading is true', () => {
      mockNoteLoading.value = true
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(findButton(wrapper, 'New Note').attributes('disabled')).toBeDefined()
      mockNoteLoading.value = false
    })

  })

  describe('logout behaviour', () => {

    // Spec: F.NoteWorld — clicking Logout must call logout() and redirect to /login
    test('calls logout when Logout button is clicked', async () => {
      const logoutFn = vi.fn().mockResolvedValue(undefined)
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide({ logoutFn }) }
      })
      await findButton(wrapper, 'Logout').trigger('click')
      expect(logoutFn).toHaveBeenCalledOnce()
    })

    // Spec: F.NoteWorld — clicking Logout must redirect to /login after the session is cleared
    test('redirects to /login after Logout button is clicked', async () => {
      const logoutFn = vi.fn().mockResolvedValue(undefined)
      const isolatedRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: HomeView },
          { path: '/login', component: { template: '<div />' } },
          { path: '/app', component: { template: '<div />' } }
        ]
      })
      await isolatedRouter.push('/')
      await isolatedRouter.isReady()
      const wrapper = mount(HomeView, {
        global: { plugins: [isolatedRouter], provide: makeProvide({ logoutFn }) }
      })
      await findButton(wrapper, 'Logout').trigger('click')
      const { flushPromises } = await import('@vue/test-utils')
      await flushPromises()
      expect(isolatedRouter.currentRoute.value.path).toBe('/login')
    })

  })

  describe('New Note behaviour', () => {

    // Spec: F.Create_Note — clicking New Note must call createNote with the TwinPod notes container URL
    test('calls createNote when New Note button is clicked', async () => {
      mockCreateNote.mockResolvedValue('https://tst-first.demo.systemtwin.com/notes/abc123')
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      await findButton(wrapper, 'New Note').trigger('click')
      expect(mockCreateNote).toHaveBeenCalledOnce()
    })

    test('passes the notes container URL to createNote', async () => {
      mockCreateNote.mockResolvedValue('https://tst-first.demo.systemtwin.com/notes/abc123')
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      await findButton(wrapper, 'New Note').trigger('click')
      // createNote is called with VITE_TWINPOD_URL + '/notes/'
      // In the test environment, import.meta.env.VITE_TWINPOD_URL is undefined —
      // the important thing is that '/notes/' is appended directly to the env value.
      const calledWith = mockCreateNote.mock.calls[0][0]
      expect(calledWith).toContain('/notes/')
    })

    // Spec: F.Create_Note — after note creation, navigate to editor with the note URI in query params
    test('navigates to /app with editor query params after note creation', async () => {
      const noteUri = 'https://tst-first.demo.systemtwin.com/notes/abc123'
      mockCreateNote.mockResolvedValue(noteUri)
      const isolatedRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: HomeView },
          { path: '/login', component: { template: '<div />' } },
          { path: '/app', component: { template: '<div />' } }
        ]
      })
      await isolatedRouter.push('/')
      await isolatedRouter.isReady()
      const wrapper = mount(HomeView, {
        global: { plugins: [isolatedRouter], provide: makeProvide() }
      })
      await findButton(wrapper, 'New Note').trigger('click')
      const { flushPromises } = await import('@vue/test-utils')
      await flushPromises()
      expect(isolatedRouter.currentRoute.value.path).toBe('/app')
      expect(isolatedRouter.currentRoute.value.query.navigator).toBe('editor')
      // target must be the encoded note URI
      expect(decodeURIComponent(isolatedRouter.currentRoute.value.query.target)).toBe(noteUri)
    })

    test('does not navigate when createNote returns null (on error)', async () => {
      mockCreateNote.mockResolvedValue(null)
      const isolatedRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: HomeView },
          { path: '/login', component: { template: '<div />' } },
          { path: '/app', component: { template: '<div />' } }
        ]
      })
      await isolatedRouter.push('/')
      await isolatedRouter.isReady()
      const wrapper = mount(HomeView, {
        global: { plugins: [isolatedRouter], provide: makeProvide() }
      })
      await findButton(wrapper, 'New Note').trigger('click')
      const { flushPromises } = await import('@vue/test-utils')
      await flushPromises()
      // Still at home — no navigation happened
      expect(isolatedRouter.currentRoute.value.path).toBe('/')
    })

  })

  describe('note creation loading indicator', () => {

    test('shows "Creating note…" message when noteLoading is true', () => {
      mockNoteLoading.value = true
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.text()).toContain('Creating note')
      mockNoteLoading.value = false
    })

    test('does not show "Creating note…" message when noteLoading is false', () => {
      mockNoteLoading.value = false
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.text()).not.toContain('Creating note')
    })

  })

  describe('note creation error state', () => {

    // Spec: ERROR_HANDLING_02 — Components must not silently fail; they should expose error states to the user
    test('shows note creation error message when noteError is set', () => {
      mockNoteError.value = { message: 'HTTP 403' }
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.text()).toContain('HTTP 403')
      mockNoteError.value = null
    })

    test('does not show note creation error message when noteError is null', () => {
      mockNoteError.value = null
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const alerts = wrapper.findAll('[role="alert"]')
      // No alert visible (no auth error and no note error)
      expect(alerts.length).toBe(0)
    })

    test('note creation error message has role="alert"', () => {
      mockNoteError.value = { message: 'HTTP 403' }
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      mockNoteError.value = null
    })

  })

  describe('logout loading indicator', () => {

    test('shows "Logging out…" message when loading is true', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide({ loading: true }) }
      })
      expect(wrapper.text()).toContain('Logging out')
    })

    test('does not show "Logging out…" message when loading is false', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide({ loading: false }) }
      })
      expect(wrapper.text()).not.toContain('Logging out')
    })

    test('loading status message has role="status" for screen readers', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide({ loading: true }) }
      })
      expect(wrapper.find('p[role="status"]').exists()).toBe(true)
    })

  })

  describe('accessibility', () => {

    // Spec: Accessibility — must meet WCAG 2.1 AA (meter: axe-core violations = 0)
    test('has no accessibility violations', async () => {
      mockNoteLoading.value = false
      mockNoteError.value = null
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() },
        attachTo: document.body
      })
      const results = await axe(wrapper.element)
      expect(results).toHaveNoViolations()
      wrapper.unmount()
    })

  })

  // --- Gap tests written by QATester (auth increment) ---

  describe('logout — error state', () => {

    // Spec: ERROR_HANDLING_02 — Components must not silently fail
    test('shows error message when logout fails', async () => {
      const wrapper = mount(HomeView, {
        global: {
          plugins: [router],
          provide: makeProvide({ error: { message: 'Logout failed' } })
        }
      })
      expect(wrapper.text()).toContain('Logout failed')
    })

    test('does not show logout error message when error is null', async () => {
      mockNoteError.value = null
      const wrapper = mount(HomeView, {
        global: {
          plugins: [router],
          provide: makeProvide({ error: null })
        }
      })
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    test('logout error message has role="alert" for screen reader announcement', async () => {
      const wrapper = mount(HomeView, {
        global: {
          plugins: [router],
          provide: makeProvide({ error: { message: 'Logout failed' } })
        }
      })
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })

  })

  describe('rendering — null webId', () => {

    test('renders without error when webId is null', () => {
      expect(() => {
        mount(HomeView, {
          global: { plugins: [router], provide: makeProvide({ webId: null }) }
        })
      }).not.toThrow()
    })

    test('renders the logged-in-as label even when webId is null', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide({ webId: null }) }
      })
      expect(wrapper.text()).toContain('Logged in as')
    })

  })

})
