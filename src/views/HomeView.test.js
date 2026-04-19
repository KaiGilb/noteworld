// UNIT_TYPE=Widget

import { describe, test, expect, vi } from 'vitest'
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

    test('renders note URI buttons when notes are present', () => {
      mockNotes.value = [
        { uri: 'https://pod.example.com/t/t_note_1' },
        { uri: 'https://pod.example.com/t/t_note_2' }
      ]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.text()).toContain('t_note_1')
      expect(wrapper.text()).toContain('t_note_2')
      mockNotes.value = []
    })

    test('note buttons have min-height 44px (MOBILE_03)', () => {
      mockNotes.value = [{ uri: 'https://pod.example.com/t/t_note_1' }]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const noteButton = wrapper.findAll('button').find(b => b.text().includes('t_note_1'))
      const style = noteButton.attributes('style') || ''
      const match = style.match(/min-height:\s*([\d.]+)(px|rem)/)
      expect(match).not.toBeNull()
      const pixels = match[2] === 'rem' ? parseFloat(match[1]) * 16 : parseFloat(match[1])
      expect(pixels).toBeGreaterThanOrEqual(44)
      mockNotes.value = []
    })

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
      const noteButton = wrapper.findAll('button').find(b => b.text().includes('t_note_1'))
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
      // Buttons in DOM order reflect sortedNotes order.
      const noteButtons = wrapper.findAll('button').filter(b =>
        b.text().includes('t_note_')
      )
      // First button must be the newest (timestamp 3000).
      expect(noteButtons[0].text()).toContain('t_note_3000')
      // Last button must be the oldest (timestamp 1000).
      expect(noteButtons[noteButtons.length - 1].text()).toContain('t_note_1000')
      mockNotes.value = []
    })

    // Notes without a t_note_{timestamp} pattern (e.g. legacy Graphmetrix nodes)
    // get timestamp 0 and must float to the bottom, below all standard notes.
    test('legacy notes with no timestamp pattern sort to the bottom', () => {
      mockNotes.value = [
        { uri: 'https://pod.example.com/t/t_note_5000_x' },
        { uri: 'https://pod.example.com/node/legacy-node-abc' },
        { uri: 'https://pod.example.com/t/t_note_1000_y' }
      ]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      const noteButtons = wrapper.findAll('button').filter(b =>
        b.text().includes('t_note_') || b.text().includes('legacy-node')
      )
      // Newest standard note first.
      expect(noteButtons[0].text()).toContain('t_note_5000')
      // Legacy node (timestamp 0) must be last.
      expect(noteButtons[noteButtons.length - 1].text()).toContain('legacy-node')
      mockNotes.value = []
    })

    // A single note must render without error (edge case for sort on length-1 array).
    test('renders correctly when there is only one note', () => {
      mockNotes.value = [{ uri: 'https://pod.example.com/t/t_note_9999_z' }]
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeProvide() }
      })
      expect(wrapper.text()).toContain('t_note_9999')
      mockNotes.value = []
    })

  })

})
