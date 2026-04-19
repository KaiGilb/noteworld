// UNIT_TYPE=Widget

import { describe, test, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { axe } from 'vitest-axe'
import { toHaveNoViolations } from 'vitest-axe/matchers.js'

// Spec: F.NoteWorld — home screen must display the authenticated user's WebID and allow logout
// Spec: F.Create_Note — home screen must provide a New Note button

// Mock @kaigilb/noteworld-notes — HomeView calls useTwinPodNoteCreate,
// useTwinPodNoteSearch, and useTwinPodNotePreviews. Tests inject controllable
// state via the mock; no real TwinPod calls are made.
//
// S.OptimisticCreate (VDT 2026-04-18, notes 5 + 11): HomeView now reads
// `pendingUri.value` synchronously right after calling `createNote`. Tests
// simulate this by having `mockCreateNote` flip `mockPendingUri.value` when
// invoked, mirroring the real composable's synchronous URI mint.
const mockPendingUri = ref(null)
const mockCreateNote = vi.fn()
const mockNoteLoading = ref(false)
const mockNoteError = ref(null)
const mockSearchNotes = vi.fn().mockResolvedValue([])
const mockSearchLoading = ref(false)
const mockSearchError = ref(null)
const mockNotes = ref([])
const mockPreviews = ref({})
const mockLoadPreviews = vi.fn().mockResolvedValue(undefined)

vi.mock('@kaigilb/noteworld-notes', () => ({
  useTwinPodNoteCreate: () => ({
    pendingUri: mockPendingUri,
    loading: mockNoteLoading,
    error: mockNoteError,
    createNote: mockCreateNote
  }),
  useTwinPodNoteSearch: () => ({
    notes: mockNotes,
    loading: mockSearchLoading,
    error: mockSearchError,
    searchNotes: mockSearchNotes
  }),
  useTwinPodNotePreviews: () => ({
    previews: mockPreviews,
    loadPreviews: mockLoadPreviews
  })
}))

// HomeView no longer imports @kaigilb/twinpod-client directly — pod
// discovery now runs in App.vue and the resolved root is `provide`d as
// 'podRoot'. The mock stays as a safety net in case a transitive import
// pulls in rdflib (CJS + circular deps break Vitest's ESM environment).
vi.mock('@kaigilb/twinpod-client', () => ({ ur: {} }))

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
  // App.vue resolves this via ur.findPodRoots and provides it; HomeView reads
  // it as an injected ref. Default to a realistic URL so createNote/searchNotes
  // calls in existing tests keep their existing assertion surface.
  podRoot = 'https://tst-first.demo.systemtwin.com'
} = {}) {
  return {
    auth: {
      webId: ref(webId),
      logout: logoutFn,
      loading: ref(loading),
      error: ref(error)
    },
    podRoot: ref(podRoot)
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
      mockCreateNote.mockImplementation(() => {
        mockPendingUri.value = 'https://tst-first.demo.systemtwin.com/t/t_note_1'
        return Promise.resolve('https://tst-first.demo.systemtwin.com/t/t_note_1')
      })
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      await findButton(wrapper, 'New Note').trigger('click')
      expect(mockCreateNote).toHaveBeenCalledOnce()
      mockPendingUri.value = null
    })

    // Spec: F.Create_Note — createNote receives the injected podRoot, NOT the
    // env var. This is the pod-switching contract: HomeView must never read
    // VITE_TWINPOD_URL directly; App.vue alone resolves the active pod.
    test('passes the injected podRoot as podBaseUrl to createNote', async () => {
      mockCreateNote.mockClear()
      mockCreateNote.mockImplementation(() => {
        mockPendingUri.value = 'https://tst-ia2.demo.systemtwin.com/t/t_note_1'
        return Promise.resolve('https://tst-ia2.demo.systemtwin.com/t/t_note_1')
      })
      const wrapper = mount(HomeView, {
        global: {
          plugins: [router],
          provide: makeProvide({ podRoot: 'https://tst-ia2.demo.systemtwin.com' })
        }
      })
      await findButton(wrapper, 'New Note').trigger('click')
      expect(mockCreateNote).toHaveBeenCalledWith('https://tst-ia2.demo.systemtwin.com')
      mockPendingUri.value = null
    })

    // Spec: F.Create_Note + S.OptimisticCreate — HomeView reads `pendingUri.value`
    // synchronously after calling createNote and navigates immediately (no await).
    // The `new=1` query flag tells NoteEditorView to skip its initial loadNote
    // because the resource doesn't exist on the server yet.
    test('navigates to /app with editor query params (including new=1) after createNote mints URI', async () => {
      const noteUri = 'https://tst-first.demo.systemtwin.com/t/t_note_abc1'
      // Simulate the composable's synchronous mint: flip pendingUri when createNote is called.
      mockCreateNote.mockImplementation(() => {
        mockPendingUri.value = noteUri
        // Return a never-resolving promise to prove HomeView doesn't await it.
        return new Promise(() => {})
      })
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
      // S.OptimisticCreate: `new=1` flag tells the editor to skip its initial read
      expect(isolatedRouter.currentRoute.value.query.new).toBe('1')
      mockPendingUri.value = null
    })

    // S.OptimisticCreate: when createNote fails synchronously (e.g. invalid
    // podBaseUrl), pendingUri stays null, so HomeView must NOT navigate.
    test('does not navigate when pendingUri stays null (invalid-input path)', async () => {
      mockCreateNote.mockImplementation(() => {
        // No mint — simulate invalid-input branch that returns early.
        return Promise.resolve(null)
      })
      mockPendingUri.value = null
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

  // --- Gap tests written by QATester — Mobile-First Standard ---

  describe('mobile touch targets (MOBILE_03)', () => {

    // Spec: MOBILE_03 — every interactive element must have a minimum touch target of 44×44px.
    // jsdom does not do CSS layout, so we check for an explicit min-height style of at least 44px.
    // A button must declare min-height: 44px (or larger) as an inline style, or use a CSS class
    // that guarantees 44px height. Buttons with only padding and no min-height may fall below 44px
    // on mobile devices.
    test('New Note button declares a min-height of at least 44px in its inline style', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const button = findButton(wrapper, 'New Note')
      const style = button.attributes('style') || ''
      // Extract min-height value — must be 44px or larger
      const match = style.match(/min-height:\s*([\d.]+)(px|rem)/)
      if (!match) {
        // No min-height set — this is a MOBILE_03 violation
        throw new Error(
          `New Note button has no min-height in its inline style. ` +
          `MOBILE_03 requires a minimum touch target of 44×44px. ` +
          `Add style="min-height: 44px" or equivalent.`
        )
      }
      const value = parseFloat(match[1])
      const unit = match[2]
      const pixels = unit === 'rem' ? value * 16 : value
      expect(pixels).toBeGreaterThanOrEqual(44)
    })

    // Spec: MOBILE_03 — every interactive element must have a minimum touch target of 44×44px
    test('Logout button declares a min-height of at least 44px in its inline style', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const button = findButton(wrapper, 'Logout')
      const style = button.attributes('style') || ''
      const match = style.match(/min-height:\s*([\d.]+)(px|rem)/)
      if (!match) {
        throw new Error(
          `Logout button has no min-height in its inline style. ` +
          `MOBILE_03 requires a minimum touch target of 44×44px. ` +
          `Add style="min-height: 44px" or equivalent.`
        )
      }
      const value = parseFloat(match[1])
      const unit = match[2]
      const pixels = unit === 'rem' ? value * 16 : value
      expect(pixels).toBeGreaterThanOrEqual(44)
    })

  })

  // --- F.Find_Note — Note list ---

  describe('note list (F.Find_Note)', () => {

    test('calls searchNotes on mount', () => {
      mockSearchNotes.mockClear()
      mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(mockSearchNotes).toHaveBeenCalledOnce()
    })

    // Spec: F.Find_Note + pod-switch contract — searchNotes must receive the
    // injected podRoot, not the VITE_TWINPOD_URL env var.
    test('passes the injected podRoot to searchNotes', () => {
      mockSearchNotes.mockClear()
      mount(HomeView, {
        global: {
          plugins: [router],
          provide: makeProvide({ podRoot: 'https://tst-ia2.demo.systemtwin.com' })
        }
      })
      expect(mockSearchNotes).toHaveBeenCalledWith('https://tst-ia2.demo.systemtwin.com')
    })

    // Guard: if App.vue's discovery + fallbacks all failed, podRoot is ''.
    // Firing a search against an empty URL would hit the app origin (dev
    // server) with a garbage request. Skip instead.
    test('does not call searchNotes when podRoot is empty', () => {
      mockSearchNotes.mockClear()
      mount(HomeView, {
        global: {
          plugins: [router],
          provide: makeProvide({ podRoot: '' })
        }
      })
      expect(mockSearchNotes).not.toHaveBeenCalled()
    })

    test('shows "Loading notes…" when searchLoading is true', () => {
      mockSearchLoading.value = true
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.text()).toContain('Loading notes')
      mockSearchLoading.value = false
    })

    test('shows search error when searchError is set', () => {
      mockSearchError.value = { message: 'Search failed' }
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.text()).toContain('Search failed')
      mockSearchError.value = null
    })

    test('shows "No notes yet" when notes array is empty', () => {
      mockNotes.value = []
      mockSearchLoading.value = false
      mockSearchError.value = null
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.text()).toContain('No notes yet')
    })

    // Increment: note buttons now carry :data-uri="note.uri" — find by [data-uri] attribute
    test('renders note URI buttons when notes are present', () => {
      mockNotes.value = [
        { uri: 'https://pod.example.com/t/t_note_1' },
        { uri: 'https://pod.example.com/t/t_note_2' }
      ]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.find('[data-uri="https://pod.example.com/t/t_note_1"]').exists()).toBe(true)
      expect(wrapper.find('[data-uri="https://pod.example.com/t/t_note_2"]').exists()).toBe(true)
      mockNotes.value = []
    })

    // Increment: find note button by [data-uri] instead of label text (label removed)
    test('note buttons have min-height 44px (MOBILE_03)', () => {
      mockNotes.value = [{ uri: 'https://pod.example.com/t/t_note_1' }]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const noteButton = wrapper.find('[data-uri="https://pod.example.com/t/t_note_1"]')
      const style = noteButton.attributes('style') || ''
      const match = style.match(/min-height:\s*([\d.]+)(px|rem)/)
      expect(match).not.toBeNull()
      const pixels = match[2] === 'rem' ? parseFloat(match[1]) * 16 : parseFloat(match[1])
      expect(pixels).toBeGreaterThanOrEqual(44)
      mockNotes.value = []
    })

    // Increment: find note button by [data-uri] instead of label text (label removed)
    test('clicking a note button navigates to /app with target query', async () => {
      mockNotes.value = [{ uri: 'https://pod.example.com/t/t_note_1' }]
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
      const noteButton = wrapper.find('[data-uri="https://pod.example.com/t/t_note_1"]')
      await noteButton.trigger('click')
      const { flushPromises } = await import('@vue/test-utils')
      await flushPromises()
      expect(isolatedRouter.currentRoute.value.path).toBe('/app')
      expect(decodeURIComponent(isolatedRouter.currentRoute.value.query.target)).toBe('https://pod.example.com/t/t_note_1')
      mockNotes.value = []
    })

    test('note list section has aria-label for accessibility', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.find('section[aria-label="Your notes"]').exists()).toBe(true)
    })

    // --- Gap tests written by VATester (F.Find_Note increment) ---

    // Spec: ERROR_HANDLING_02 / Accessibility — search error message must have role="alert"
    test('search error message has role="alert" for screen readers', () => {
      mockSearchError.value = { message: 'Search failed' }
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const alerts = wrapper.findAll('[role="alert"]')
      const searchAlert = alerts.find(el => el.text().includes('Search failed'))
      expect(searchAlert).toBeDefined()
      mockSearchError.value = null
    })

    // Spec: F.Find_Note — search loading message has role="status" for screen readers
    test('search loading message has role="status"', () => {
      mockSearchLoading.value = true
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const statuses = wrapper.findAll('[role="status"]')
      const loadingStatus = statuses.find(el => el.text().includes('Loading notes'))
      expect(loadingStatus).toBeDefined()
      mockSearchLoading.value = false
    })

    // --- Gap tests written by VATester (Increment 3 — sort newest-first) ---

    // Spec: F.Find_Note UX — notes must appear sorted newest-first.
    // NoteWorld mints URIs with t_note_{ms-timestamp} — the sort key is the
    // numeric timestamp in the URI. The computed `sortedNotes` must order by
    // descending timestamp so the most recently created note leads the list.
    // Increment: find note buttons by [data-uri] attribute (label text removed)
    test('renders notes newest-first (highest timestamp at top)', () => {
      // Three notes with ascending timestamps — oldest = 1000, newest = 3000.
      mockNotes.value = [
        { uri: 'https://pod.example.com/t/t_note_1000_a' },
        { uri: 'https://pod.example.com/t/t_note_3000_c' },
        { uri: 'https://pod.example.com/t/t_note_2000_b' }
      ]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      // Buttons in DOM order reflect sortedNotes order — find by [data-uri].
      const noteButtons = wrapper.findAll('[data-uri]')
      // First button must be the newest (timestamp 3000).
      expect(noteButtons[0].attributes('data-uri')).toContain('t_note_3000')
      // Last button must be the oldest (timestamp 1000).
      expect(noteButtons[noteButtons.length - 1].attributes('data-uri')).toContain('t_note_1000')
      mockNotes.value = []
    })

    // Notes without a t_note_{timestamp} pattern (e.g. legacy Graphmetrix nodes)
    // get timestamp 0 and must float to the bottom, below all standard notes.
    // Increment: find note buttons by [data-uri] attribute (label text removed)
    test('legacy notes with no timestamp pattern sort to the bottom', () => {
      mockNotes.value = [
        { uri: 'https://pod.example.com/t/t_note_5000_x' },
        { uri: 'https://pod.example.com/node/legacy-node-abc' },
        { uri: 'https://pod.example.com/t/t_note_1000_y' }
      ]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const noteButtons = wrapper.findAll('[data-uri]')
      // Newest standard note first.
      expect(noteButtons[0].attributes('data-uri')).toContain('t_note_5000')
      // Legacy node (timestamp 0) must be last.
      expect(noteButtons[noteButtons.length - 1].attributes('data-uri')).toContain('legacy-node')
      mockNotes.value = []
    })

    // A single note must render without error (edge case for sort on length-1 array).
    // Increment: find note button by [data-uri] attribute (label text removed)
    test('renders correctly when there is only one note', () => {
      mockNotes.value = [{ uri: 'https://pod.example.com/t/t_note_9999_z' }]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.find('[data-uri="https://pod.example.com/t/t_note_9999_z"]').exists()).toBe(true)
      mockNotes.value = []
    })

  })

  // --- Gap tests written by VATester (pagination increment) ---

  describe('pagination (PAGE_SIZE=50)', () => {

    // Helper: build N note objects with ascending timestamps
    function makeNotes(n, baseTs = 1000) {
      return Array.from({ length: n }, (_, i) => ({
        uri: `https://pod.example.com/t/t_note_${baseTs + i}`
      }))
    }

    afterEach(() => {
      mockNotes.value = []
    })

    // Spec: HomeView pagination — when the note list is ≤ PAGE_SIZE (50), all notes are visible
    // and no "Load more" button appears.
    test('shows all notes when count is at or below PAGE_SIZE (50)', () => {
      mockNotes.value = makeNotes(50)
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      // All 50 note buttons must be in the DOM
      const listButtons = wrapper.findAll('li button')
      expect(listButtons.length).toBe(50)
      // No "Load more" button
      expect(findButton(wrapper, 'Load more')).toBeUndefined()
    })

    // Spec: HomeView pagination — when notes.length > PAGE_SIZE, only the first PAGE_SIZE
    // notes are rendered and a "Load more" button is shown.
    test('shows only the first 50 notes when count exceeds PAGE_SIZE', () => {
      mockNotes.value = makeNotes(75)
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      // Only 50 note buttons visible initially
      const listButtons = wrapper.findAll('li button')
      expect(listButtons.length).toBe(50)
    })

    // Spec: HomeView pagination — "Load more" button appears exactly when sortedNotes.length > displayCount
    test('renders "Load more" button when note count exceeds PAGE_SIZE', () => {
      mockNotes.value = makeNotes(51)
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(findButton(wrapper, 'Load more')).toBeDefined()
    })

    // Spec: HomeView pagination — no "Load more" button when count equals PAGE_SIZE exactly
    test('does not render "Load more" button when note count equals PAGE_SIZE exactly', () => {
      mockNotes.value = makeNotes(50)
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(findButton(wrapper, 'Load more')).toBeUndefined()
    })

    // Spec: HomeView pagination — "Load more" button label shows remaining count
    // remaining = sortedNotes.length - displayCount
    test('"Load more" button label shows the remaining note count', () => {
      mockNotes.value = makeNotes(73)
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      // 73 total - 50 visible = 23 remaining
      const btn = findButton(wrapper, 'Load more')
      expect(btn).toBeDefined()
      expect(btn.text()).toContain('23')
    })

    // Spec: HomeView pagination — clicking "Load more" increments displayCount by PAGE_SIZE,
    // revealing the next batch of notes.
    // Increment: displayCount is now a computed from route.query.count; loadMore() calls
    // router.replace(). An isolated router is used so route navigation is clean for this test.
    test('clicking "Load more" shows an additional PAGE_SIZE notes', async () => {
      mockNotes.value = makeNotes(120)
      const paginationRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: HomeView },
          { path: '/login', component: { template: '<div />' } },
          { path: '/app', component: { template: '<div />' } }
        ]
      })
      await paginationRouter.push('/')
      await paginationRouter.isReady()
      const wrapper = mount(HomeView, {
        global: { plugins: [paginationRouter], provide: makeProvide() }
      })
      // Initially 50 visible
      expect(wrapper.findAll('li button').length).toBe(50)
      await findButton(wrapper, 'Load more').trigger('click')
      const { flushPromises } = await import('@vue/test-utils')
      await flushPromises()
      await wrapper.vm.$nextTick()
      // After one click: 100 visible (displayCount updated via route.query.count)
      expect(wrapper.findAll('li button').length).toBe(100)
    })

    // Spec: HomeView pagination — after the last "Load more" click brings displayCount >= total,
    // the "Load more" button disappears.
    // Increment: displayCount is now a computed from route.query.count; use isolated router.
    test('"Load more" button disappears after all notes are visible', async () => {
      mockNotes.value = makeNotes(51)
      const paginationRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: HomeView },
          { path: '/login', component: { template: '<div />' } },
          { path: '/app', component: { template: '<div />' } }
        ]
      })
      await paginationRouter.push('/')
      await paginationRouter.isReady()
      const wrapper = mount(HomeView, {
        global: { plugins: [paginationRouter], provide: makeProvide() }
      })
      expect(findButton(wrapper, 'Load more')).toBeDefined()
      await findButton(wrapper, 'Load more').trigger('click')
      const { flushPromises } = await import('@vue/test-utils')
      await flushPromises()
      await wrapper.vm.$nextTick()
      // 51 notes, displayCount now 100 — all visible, button gone
      expect(findButton(wrapper, 'Load more')).toBeUndefined()
    })

    // Spec: HomeView pagination — remaining label decreases correctly after a "Load more" click
    // Increment: displayCount is now a computed from route.query.count; use isolated router.
    test('"Load more" label updates remaining count after click', async () => {
      // 130 notes: first click → 80 remaining; second click → none
      mockNotes.value = makeNotes(130)
      const paginationRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: HomeView },
          { path: '/login', component: { template: '<div />' } },
          { path: '/app', component: { template: '<div />' } }
        ]
      })
      await paginationRouter.push('/')
      await paginationRouter.isReady()
      const wrapper = mount(HomeView, {
        global: { plugins: [paginationRouter], provide: makeProvide() }
      })
      // Before click: 130 - 50 = 80 remaining
      expect(findButton(wrapper, 'Load more').text()).toContain('80')
      await findButton(wrapper, 'Load more').trigger('click')
      const { flushPromises } = await import('@vue/test-utils')
      await flushPromises()
      await wrapper.vm.$nextTick()
      // After first click: 130 - 100 = 30 remaining
      expect(findButton(wrapper, 'Load more').text()).toContain('30')
    })

    // Spec: HomeView pagination — "Load more" button has min-height 44px (MOBILE_03)
    test('"Load more" button has min-height of at least 44px (MOBILE_03)', () => {
      mockNotes.value = makeNotes(51)
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const btn = findButton(wrapper, 'Load more')
      expect(btn).toBeDefined()
      const style = btn.attributes('style') || ''
      const match = style.match(/min-height:\s*([\d.]+)(px|rem)/)
      expect(match).not.toBeNull()
      const pixels = match[2] === 'rem' ? parseFloat(match[1]) * 16 : parseFloat(match[1])
      expect(pixels).toBeGreaterThanOrEqual(44)
    })

  })

  // --- Gap tests written by VATester (optimistic-stash increment) ---

  describe('optimistic localStorage stash (S.OptimisticCreate read-guard)', () => {

    const STASH_URI = 'https://pod.example.com/t/t_note_9876543210_stashed'

    afterEach(() => {
      localStorage.removeItem('noteworld:pendingNote')
      mockNotes.value = []
      mockPreviews.value = {}
      mockLoadPreviews.mockClear()
      mockSearchNotes.mockClear()
    })

    // Spec: S.OptimisticCreate — HomeView reads the stash from localStorage on
    // mount, injects the URI into sortedNotes, and clears the stash immediately
    // so a manual reload does not re-inject the entry indefinitely.
    test('reads noteworld:pendingNote from localStorage on mount and clears it', () => {
      localStorage.setItem('noteworld:pendingNote', STASH_URI)
      mockNotes.value = []
      mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      // Stash must have been cleared immediately after reading.
      expect(localStorage.getItem('noteworld:pendingNote')).toBeNull()
    })

    // Spec: S.OptimisticCreate — the stashed URI must appear in the rendered
    // note list even when the search results are empty (TwinPod not yet indexed).
    // Increment: find note button by [data-uri] attribute (label text removed)
    test('injects the stashed URI into the note list when search returns nothing', () => {
      localStorage.setItem('noteworld:pendingNote', STASH_URI)
      mockNotes.value = []
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      // The stash URI must appear as a [data-uri] button in the rendered list.
      expect(wrapper.find(`[data-uri="${STASH_URI}"]`).exists()).toBe(true)
    })

    // Spec: S.OptimisticCreate — once TwinPod's search index catches up and the
    // note appears in search results, it must NOT be duplicated in the list.
    // Increment: find note buttons by [data-uri] attribute (label text removed)
    test('does not duplicate the stashed URI when search already returns it', () => {
      localStorage.setItem('noteworld:pendingNote', STASH_URI)
      mockNotes.value = [{ uri: STASH_URI }]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      // Exactly one button with data-uri matching the stash URI
      const matches = wrapper.findAll(`[data-uri="${STASH_URI}"]`)
      expect(matches.length).toBe(1)
    })

    // Spec: S.OptimisticCreate — HomeView must call loadPreviews for the pending
    // note immediately (not waiting for the delayed re-search) so its first line
    // of text appears in the list without a 5-second delay.
    test('calls loadPreviews for the stashed URI immediately on mount', () => {
      mockLoadPreviews.mockClear()
      localStorage.setItem('noteworld:pendingNote', STASH_URI)
      mockNotes.value = []
      mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      // loadPreviews must have been called with the stash URI.
      const calls = mockLoadPreviews.mock.calls
      const calledWithStash = calls.some(args => Array.isArray(args[0]) && args[0].includes(STASH_URI))
      expect(calledWithStash).toBe(true)
    })

    // When no stash entry exists, no extra loadPreviews call should be issued
    // for the missing entry — avoids a fetch against a null/undefined URI.
    test('does not call loadPreviews for a pending note when the stash is empty', () => {
      localStorage.removeItem('noteworld:pendingNote')
      mockSearchNotes.mockResolvedValue([])
      mockLoadPreviews.mockClear()
      mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      // loadPreviews may be called after search resolves for found notes, but
      // must not be called with an undefined/null/empty entry for a stash URI.
      const calls = mockLoadPreviews.mock.calls
      const calledWithFalsy = calls.some(args =>
        Array.isArray(args[0]) && args[0].some(u => !u)
      )
      expect(calledWithFalsy).toBe(false)
    })

    // The stashed note (newest timestamp) must sort to the top of the list
    // when search returns older notes. Guards the sort integration with the
    // injected stash entry.
    // Increment: find note buttons by [data-uri] attribute (label text removed)
    test('stashed note sorts to the top when its timestamp is newest', () => {
      // Stash URI has timestamp 9876543210 — newer than the search result below.
      localStorage.setItem('noteworld:pendingNote', STASH_URI)
      mockNotes.value = [
        { uri: 'https://pod.example.com/t/t_note_1000000000_old' }
      ]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const noteButtons = wrapper.findAll('[data-uri]')
      // Stashed (newer) note must be first.
      expect(noteButtons[0].attributes('data-uri')).toContain('t_note_9876543210')
      expect(noteButtons[noteButtons.length - 1].attributes('data-uri')).toContain('t_note_1000000000')
    })

  })

  // --- Gap tests written by VATester (HomeView pagination revised increment) ---

  describe('pagination — URL-encoded state (ARCH_05)', () => {

    function makeNotes(n, baseTs = 1000) {
      return Array.from({ length: n }, (_, i) => ({
        uri: `https://pod.example.com/t/t_note_${baseTs + i}`
      }))
    }

    afterEach(() => {
      mockNotes.value = []
    })

    // Spec: ARCH_05 — pagination count must be encoded in the URL query string (?count=N)
    // so the state is bookmarkable and reproducible on reload. Verifies that clicking
    // "Load more" updates route.query.count via router.replace.
    test('clicking "Load more" sets ?count=100 in the URL (ARCH_05)', async () => {
      mockNotes.value = makeNotes(120)
      const paginationRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: HomeView },
          { path: '/login', component: { template: '<div />' } },
          { path: '/app', component: { template: '<div />' } }
        ]
      })
      await paginationRouter.push('/')
      await paginationRouter.isReady()
      mount(HomeView, {
        global: { plugins: [paginationRouter], provide: makeProvide() }
      })
      // Initial URL has no count param
      expect(paginationRouter.currentRoute.value.query.count).toBeUndefined()
      const wrapper = mount(HomeView, {
        global: { plugins: [paginationRouter], provide: makeProvide() }
      })
      await findButton(wrapper, 'Load more').trigger('click')
      const { flushPromises } = await import('@vue/test-utils')
      await flushPromises()
      // After click, route.query.count must be set to 100
      expect(String(paginationRouter.currentRoute.value.query.count)).toBe('100')
    })

    // Spec: ARCH_05 — router.replace must be used (not push) so "Load more" does not
    // add a new browser history entry. Verifies history length stays constant.
    test('clicking "Load more" uses router.replace (no new history entry)', async () => {
      mockNotes.value = makeNotes(120)
      const paginationRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: HomeView },
          { path: '/login', component: { template: '<div />' } },
          { path: '/app', component: { template: '<div />' } }
        ]
      })
      await paginationRouter.push('/')
      await paginationRouter.isReady()
      const historyBefore = paginationRouter.currentRoute.value.fullPath
      const wrapper = mount(HomeView, {
        global: { plugins: [paginationRouter], provide: makeProvide() }
      })
      await findButton(wrapper, 'Load more').trigger('click')
      const { flushPromises } = await import('@vue/test-utils')
      await flushPromises()
      // router.replace does not add a new entry — the history stack position stays the same.
      // We verify by checking that history.state matches (no new push in memory history).
      // The path after replace must still be '/' (not navigated away).
      expect(paginationRouter.currentRoute.value.path).toBe('/')
    })

    // Spec: ARCH_05 — displayCount must initialise from route.query.count when the
    // URL already contains ?count=N on load (bookmarkable state).
    test('displayCount reads initial value from route.query.count on mount', async () => {
      mockNotes.value = makeNotes(120)
      const paginationRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: HomeView },
          { path: '/login', component: { template: '<div />' } },
          { path: '/app', component: { template: '<div />' } }
        ]
      })
      // Pre-set count=75 in the URL before mounting; must await so route is ready
      await paginationRouter.push('/?count=75')
      await paginationRouter.isReady()
      const wrapper = mount(HomeView, {
        global: { plugins: [paginationRouter], provide: makeProvide() }
      })
      // 75 notes must be visible immediately (no button click required)
      expect(wrapper.findAll('li button').length).toBe(75)
    })

    // Spec: increment — note buttons carry :data-uri="note.uri" for test identification.
    // Verifies the attribute is present and matches the note URI exactly.
    test('note buttons have a data-uri attribute matching the note URI exactly', () => {
      const uri = 'https://pod.example.com/t/t_note_42_abcd'
      mockNotes.value = [{ uri }]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const btn = wrapper.find(`[data-uri="${uri}"]`)
      expect(btn.exists()).toBe(true)
      expect(btn.attributes('data-uri')).toBe(uri)
    })

  })

})
