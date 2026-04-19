// UNIT_TYPE=Widget

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { axe } from 'vitest-axe'
import { toHaveNoViolations } from 'vitest-axe/matchers.js'

// Mock @kaigilb/noteworld-notes — NoteEditorView calls useTwinPodNoteRead and
// useTwinPodNoteSave. Without this mock, the real composables import `ur` from
// @kaigilb/twinpod-client which requires VITE_HYPERGRAPH_CODE and inrupt
// localStorage access, neither available in jsdom.
//
// Tests control loadNote / saveNote / state refs via the module-scoped mocks
// exported below.

const mockReadLoading = ref(false)
const mockReadError = ref(null)
const mockLoadNote = vi.fn().mockResolvedValue(null)

const mockSaving = ref(false)
const mockSaved = ref(false)
const mockSaveError = ref(null)
const mockSaveNote = vi.fn().mockResolvedValue(true)

vi.mock('@kaigilb/noteworld-notes', () => ({
  useTwinPodNoteRead: () => ({
    loading: mockReadLoading,
    error: mockReadError,
    loadNote: mockLoadNote
  }),
  useTwinPodNoteSave: () => ({
    saving: mockSaving,
    saved: mockSaved,
    error: mockSaveError,
    saveNote: mockSaveNote
  })
}))

import NoteEditorView from './NoteEditorView.vue'

expect.extend({ toHaveNoViolations })

// Spec: F.Create_Note — Success-Criteria: A new empty note is open and ready for text input
// Spec: V.Speed_Create_Note — editor must be immediately usable after navigation (no async load)
// Spec: S.FullScreenNote (VDT 2026-04-18) — Apple-Notes-style chrome
// Spec: S.OptimisticCreate (VDT 2026-04-18, note 8) — skip initial load when ?new=1

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', component: NoteEditorView },
      { path: '/', component: { template: '<div />' } }
    ]
  })
}

const NOTE_URI = 'https://tst-first.demo.systemtwin.com/t/t_note_1234567890_abcd'

function resetMocks() {
  mockReadLoading.value = false
  mockReadError.value = null
  mockLoadNote.mockReset().mockResolvedValue(null)
  mockSaving.value = false
  mockSaved.value = false
  mockSaveError.value = null
  mockSaveNote.mockReset().mockResolvedValue(true)
}

describe('NoteEditorView', () => {

  beforeEach(() => {
    resetMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('rendering', () => {

    // Spec: F.Create_Note — "A new empty note is open and ready for text input"
    test('renders a textarea for note content', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      expect(wrapper.find('textarea').exists()).toBe(true)
    })

    test('textarea has a visually-hidden label associated via for/id', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      const label = wrapper.find('label[for="note-content"]')
      const textarea = wrapper.find('#note-content')
      expect(label.exists()).toBe(true)
      expect(textarea.exists()).toBe(true)
    })

    test('renders the back button with Apple-Notes text "← Notes"', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      const button = wrapper.find('button')
      expect(button.exists()).toBe(true)
      // Spec: S.FullScreenNote (VDT note 14) — back button reads "← Notes"
      expect(button.text()).toContain('Notes')
    })

    // Spec: S.FullScreenNote (VDT note 14) — no visible note URI in the editor.
    // This inverts the prior F.Edit_Note behaviour where the URI was shown.
    test('does NOT display the note URI anywhere in the editor', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      expect(wrapper.text()).not.toContain(NOTE_URI)
    })

    // Spec: S.FullScreenNote — no explicit Save button; auto-save is the only save path.
    test('does NOT render an explicit Save button', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      const saveButton = wrapper.findAll('button').find(b => /^\s*Save\s*$/i.test(b.text()))
      expect(saveButton).toBeUndefined()
    })

    test('textarea is empty on initial render (new note has no content)', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      expect(wrapper.find('textarea').element.value).toBe('')
    })

    // Spec: S.FullScreenNote — main fills viewport (100dvh × 100vw, white bg).
    test('main element is styled to fill the viewport', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      const main = wrapper.find('main')
      const style = main.attributes('style') || ''
      expect(style).toMatch(/100dvh/)
      expect(style).toMatch(/100vw/)
    })

  })

  describe('S.OptimisticCreate — read-guard (VDT note 8)', () => {

    // When ?new=1 is present, the create PUT is still in flight; loadNote
    // must be skipped to avoid a 404.
    test('skips loadNote when the URL carries new=1', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()
      expect(mockLoadNote).not.toHaveBeenCalled()
    })

    // Existing notes (no new flag) follow the normal read path.
    test('calls loadNote when new=1 is absent', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()
      expect(mockLoadNote).toHaveBeenCalledWith(NOTE_URI)
    })

    // First successful save strips the `new=1` flag so a reload re-reads normally.
    test('strips new=1 from the URL after the first successful save', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()
      expect(router.currentRoute.value.query.new).toBe('1')
      // Simulate the save composable flipping `saved` true after PUT succeeds.
      mockSaved.value = true
      await flushPromises()
      expect(router.currentRoute.value.query.new).toBeUndefined()
      // Target must survive the replace.
      expect(decodeURIComponent(router.currentRoute.value.query.target)).toBe(NOTE_URI)
    })

  })

  describe('auto-save (V.Speed_Save_Note + VDT note 9)', () => {

    // Typing debounces for 2s (VDT 2026-04-18 note 9 — bumped from 1s because
    // the real TwinPod server takes ~3s per write; sub-2s debounce keeps the
    // "Saving…" indicator on continuously while typing), then fires a single
    // saveNote call.
    test('schedules saveNote ~2s after a keystroke', async () => {
      vi.useFakeTimers()
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      const textarea = wrapper.find('textarea')
      await textarea.setValue('hello')
      // Not yet — debounce still pending.
      expect(mockSaveNote).not.toHaveBeenCalled()

      vi.advanceTimersByTime(2000)
      expect(mockSaveNote).toHaveBeenCalledWith(NOTE_URI, 'hello')
      expect(mockSaveNote).toHaveBeenCalledTimes(1)
    })

    // --- Gap test written by VATester (5.1.1 debounce bump) ---
    //
    // Spec: V.Speed_Save_Note + VDT note 9 — debounce is 2000ms (bumped from
    // 1000ms in 5.1.1 so "Saving…" doesn't stay on continuously while typing
    // against the real ~3s-per-write server). Locking the "1999ms must NOT
    // fire" side of the boundary keeps a future contributor from silently
    // reverting the bump — shortening the debounce again would break
    // V.Speed_Save_Note flicker behaviour without breaking any existing
    // happy-path assertion.
    test('does NOT fire saveNote at 1999ms (regression guard for 2000ms debounce)', async () => {
      vi.useFakeTimers()
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('textarea').setValue('hello')
      vi.advanceTimersByTime(1999)
      expect(mockSaveNote).not.toHaveBeenCalled()

      // One more ms tips it over — confirms 2000 is the actual boundary.
      vi.advanceTimersByTime(1)
      expect(mockSaveNote).toHaveBeenCalledWith(NOTE_URI, 'hello')
    })

    // Rapid keystrokes collapse into a single save.
    test('coalesces rapid keystrokes into a single debounced save', async () => {
      vi.useFakeTimers()
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      const textarea = wrapper.find('textarea')
      // Three keystrokes 1000ms apart — each resets the 2000ms debounce.
      await textarea.setValue('a')
      vi.advanceTimersByTime(1000)
      await textarea.setValue('ab')
      vi.advanceTimersByTime(1000)
      await textarea.setValue('abc')
      vi.advanceTimersByTime(1000)
      // Each keystroke reset the timer; no save yet.
      expect(mockSaveNote).not.toHaveBeenCalled()

      vi.advanceTimersByTime(2000)
      expect(mockSaveNote).toHaveBeenCalledTimes(1)
      expect(mockSaveNote).toHaveBeenLastCalledWith(NOTE_URI, 'abc')
    })

    // Loading existing content into the textarea must NOT echo back as a save.
    test('does not auto-save the content returned by loadNote', async () => {
      vi.useFakeTimers()
      mockLoadNote.mockResolvedValue('existing server content')
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      mount(NoteEditorView, { global: { plugins: [router] } })
      // Resolve the loadNote promise.
      await vi.runAllTimersAsync()
      await flushPromises()
      vi.advanceTimersByTime(2000)
      await flushPromises()
      expect(mockSaveNote).not.toHaveBeenCalled()
    })

  })

  describe('visibilitychange flush (VDT note 10)', () => {

    // When the tab is hidden mid-debounce, flush synchronously so we don't
    // lose the user's last keystrokes.
    test('flushes a pending save immediately when the document becomes hidden', async () => {
      vi.useFakeTimers()
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('textarea').setValue('flush me')
      // Debounce not yet elapsed.
      expect(mockSaveNote).not.toHaveBeenCalled()

      // Simulate the browser switching the tab to hidden.
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))

      expect(mockSaveNote).toHaveBeenCalledWith(NOTE_URI, 'flush me')
      expect(mockSaveNote).toHaveBeenCalledTimes(1)

      // Restore so later tests aren't affected.
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    })

    test('does not fire a save when becoming hidden with no pending edit', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))

      expect(mockSaveNote).not.toHaveBeenCalled()

      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    })

  })

  describe('unmount cleanup', () => {

    // Unmounting must cancel the pending debounce — no save fires after leaving.
    test('clears the pending debounce on unmount', async () => {
      vi.useFakeTimers()
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('textarea').setValue('draft')
      wrapper.unmount()
      vi.advanceTimersByTime(5000)
      expect(mockSaveNote).not.toHaveBeenCalled()
    })

    // --- Gap tests written by VATester (belt-and-suspenders stash increment) ---

    // Spec: S.OptimisticCreate read-guard — onBeforeUnmount writes the note URI to
    // localStorage['noteworld:pendingNote'] as a belt-and-suspenders guard: goHome()
    // covers the ← Notes button path; unmount covers browser-back and any other
    // navigation away from the editor (Vue tears down the component via onBeforeUnmount
    // regardless of how navigation was triggered).
    test('onBeforeUnmount writes noteUri to localStorage[noteworld:pendingNote]', async () => {
      localStorage.removeItem('noteworld:pendingNote')
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      wrapper.unmount()

      expect(localStorage.getItem('noteworld:pendingNote')).toBe(NOTE_URI)
      localStorage.removeItem('noteworld:pendingNote')
    })

    // When noteUri is null (no target query param), onBeforeUnmount must NOT write to
    // localStorage — avoids inserting a null/empty entry that HomeView would fetch.
    test('onBeforeUnmount does NOT write to localStorage when noteUri is null', async () => {
      localStorage.removeItem('noteworld:pendingNote')
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      wrapper.unmount()

      expect(localStorage.getItem('noteworld:pendingNote')).toBeNull()
    })

    // Spec: S.OptimisticCreate / useTwinPodNotePreviews — onBeforeUnmount pre-seeds
    // localStorage['notetext:<noteUri>'] with the current textarea text so that
    // HomeView's useTwinPodNotePreviews can show the first line immediately when the
    // home list renders. The async PUT that writes 'notetext:' via the save composable
    // completes ~3s after navigation — too late for the initial home list render.
    test('onBeforeUnmount pre-seeds notetext:<noteUri> in localStorage when text is non-empty', async () => {
      localStorage.removeItem('notetext:' + NOTE_URI)
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      // Type some text into the textarea so text.value is non-empty.
      await wrapper.find('textarea').setValue('hello world')
      wrapper.unmount()

      expect(localStorage.getItem('notetext:' + NOTE_URI)).toBe('hello world')
      localStorage.removeItem('notetext:' + NOTE_URI)
    })

    // When the textarea is empty or whitespace-only, onBeforeUnmount must NOT write
    // notetext:<noteUri> — avoids overwriting a previously cached preview with an
    // empty string (which would blank out the list preview after an undo or clear).
    test('onBeforeUnmount does NOT write notetext:<noteUri> when text is empty', async () => {
      localStorage.removeItem('notetext:' + NOTE_URI)
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      // Textarea starts empty (new note, no loadNote content).
      wrapper.unmount()

      expect(localStorage.getItem('notetext:' + NOTE_URI)).toBeNull()
    })

    // Whitespace-only text must also not be written — `.trim()` guards this path.
    test('onBeforeUnmount does NOT write notetext:<noteUri> when text is whitespace-only', async () => {
      localStorage.removeItem('notetext:' + NOTE_URI)
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('textarea').setValue('   ')
      wrapper.unmount()

      expect(localStorage.getItem('notetext:' + NOTE_URI)).toBeNull()
      localStorage.removeItem('notetext:' + NOTE_URI)
    })

  })

  describe('status indicator', () => {

    // Spec: S.FullScreenNote — a fading save-status indicator, not a persistent one.
    test('exposes "Saving…" in a role=status element while saving is true', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      mockSaving.value = true
      await nextTick()
      const status = wrapper.find('[role="status"]')
      expect(status.exists()).toBe(true)
      expect(status.text()).toContain('Saving')
    })

    test('exposes "Saved" in a role=status element when saved flips true', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      mockSaved.value = true
      await nextTick()
      const status = wrapper.find('[role="status"]')
      expect(status.text()).toContain('Saved')
    })

  })

  describe('navigation', () => {

    // Spec: URI_STATE_08 — navigating away from editor must clear editor state
    test('back button navigates to /', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await wrapper.find('button').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/')
    })

    // --- Gap tests written by VATester (optimistic-stash increment) ---

    // Spec: S.OptimisticCreate read-guard — goHome() must write the note URI to
    // localStorage['noteworld:pendingNote'] so HomeView can inject it into the
    // list immediately even before TwinPod's search index catches up.
    test('goHome writes the note URI to localStorage[noteworld:pendingNote] before navigating', async () => {
      localStorage.removeItem('noteworld:pendingNote')
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('button').trigger('click')
      await flushPromises()

      expect(localStorage.getItem('noteworld:pendingNote')).toBe(NOTE_URI)
      localStorage.removeItem('noteworld:pendingNote')
    })

    // When noteUri is null (no target query param), goHome must NOT write to
    // localStorage — avoids inserting an empty or null entry that HomeView
    // would then try to load previews for.
    test('goHome does NOT write to localStorage when noteUri is null', async () => {
      localStorage.removeItem('noteworld:pendingNote')
      const router = makeRouter()
      // Navigate to /app without a target query param.
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('button').trigger('click')
      await flushPromises()

      expect(localStorage.getItem('noteworld:pendingNote')).toBeNull()
    })

    // Flushing on back prevents losing the last keystrokes if the user taps
    // Back inside the debounce window.
    test('back button flushes a pending save before navigating', async () => {
      vi.useFakeTimers()
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await flushPromises()

      await wrapper.find('textarea').setValue('unsaved')
      await wrapper.find('button').trigger('click')

      expect(mockSaveNote).toHaveBeenCalledWith(NOTE_URI, 'unsaved')
    })

  })

  describe('accessibility', () => {

    // Spec: Accessibility — must meet WCAG 2.1 AA (meter: axe-core violations = 0)
    test('has no accessibility violations', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, {
        global: { plugins: [router] },
        attachTo: document.body
      })
      const results = await axe(wrapper.element)
      expect(results).toHaveNoViolations()
      wrapper.unmount()
    })

  })

  // --- Mobile-First Standard ---

  describe('mobile touch targets (MOBILE_03)', () => {

    // Spec: MOBILE_03 — every interactive element must have a minimum touch target of 44×44px.
    // jsdom does not do CSS layout, so we check for an explicit min-height inline style of at least 44px.
    test('back button declares a min-height of at least 44px in its inline style', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      const button = wrapper.find('button')
      const style = button.attributes('style') || ''
      const match = style.match(/min-height:\s*([\d.]+)(px|rem)/)
      if (!match) {
        throw new Error(
          `Back button has no min-height in its inline style. ` +
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

  // --- Gap tests written by VATester (Increment 3) ---

  describe('autofocus — textarea is focused on note open', () => {

    // Spec: F.Edit_Note UX — textarea must receive focus when a note is opened
    // (new or existing) so the user can begin typing immediately without an
    // extra tap. This is an Increment 3 UX requirement.
    //
    // jsdom does not support the focus API the same way a real browser does
    // (document.activeElement stays body unless `attachTo: document.body` is used
    // and the element is actually interactive). We therefore test that the
    // component *calls* focus() on the textarea element via the ref, which is the
    // correct behavioural contract regardless of jsdom limitations.
    test('calls focus() on the textarea element after mount when new=1 (new note path)', async () => {
      const focusSpy = vi.fn()
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI), new: '1' } })
      const wrapper = mount(NoteEditorView, {
        global: { plugins: [router] },
        attachTo: document.body
      })
      // Patch the DOM element's focus after mounting.
      const textarea = wrapper.find('textarea').element
      textarea.focus = focusSpy
      // Trigger loadCurrent again now that the spy is in place.
      await flushPromises()
      // In the new=1 branch, loadCurrent calls nextTick then focus.
      await nextTick()
      // The component may have already called focus() before we could spy — verify
      // the textarea element is focused OR that focus was called. We check both
      // forms because jsdom's activeElement assignment varies by attach mode.
      const isFocused = document.activeElement === textarea || focusSpy.mock.calls.length > 0
      expect(isFocused).toBe(true)
      wrapper.unmount()
    })

    // Spec: F.Edit_Note UX — textarea receives focus on existing note open (non-new path).
    test('calls focus() on the textarea element after mount when new is absent (existing note path)', async () => {
      mockLoadNote.mockResolvedValue('some content')
      const focusSpy = vi.fn()
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, {
        global: { plugins: [router] },
        attachTo: document.body
      })
      const textarea = wrapper.find('textarea').element
      textarea.focus = focusSpy
      await flushPromises()
      await nextTick()
      const isFocused = document.activeElement === textarea || focusSpy.mock.calls.length > 0
      expect(isFocused).toBe(true)
      wrapper.unmount()
    })

  })

  describe('optimistic localStorage pre-load in editor', () => {

    // Spec: F.Edit_Note UX — editor must show cached text immediately (optimistic
    // pre-load from localStorage) so the textarea is not blank during the
    // TwinPod round-trip. The cache key is 'notetext:<noteUri>'.
    test('pre-fills textarea with localStorage text before loadNote resolves', async () => {
      // Put something in the cache before mounting.
      localStorage.setItem('notetext:' + NOTE_URI, 'cached preview text')

      // loadNote is intentionally slow (never-resolving) to isolate the optimistic
      // pre-load. If the editor only shows text after loadNote resolves, the
      // textarea would be empty during the check below.
      let releaseLoad
      mockLoadNote.mockImplementation(() => new Promise(r => { releaseLoad = r }))

      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] }, attachTo: document.body })

      // Give Vue one tick to run the onMounted → loadCurrent → localStorage.getItem path.
      await nextTick()

      // The textarea must already show the cached text, before loadNote settles.
      expect(wrapper.find('textarea').element.value).toBe('cached preview text')

      // Cleanup
      releaseLoad(null)
      await flushPromises()
      wrapper.unmount()
      localStorage.removeItem('notetext:' + NOTE_URI)
    })

    // When the server value differs from cache, the textarea must update.
    test('updates textarea with server value when loadNote returns different content', async () => {
      localStorage.setItem('notetext:' + NOTE_URI, 'old cached text')
      mockLoadNote.mockResolvedValue('fresh server text')

      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] }, attachTo: document.body })
      await flushPromises()

      expect(wrapper.find('textarea').element.value).toBe('fresh server text')
      wrapper.unmount()
      localStorage.removeItem('notetext:' + NOTE_URI)
    })

    // When cache and server agree, no flicker: textarea stays at the same value.
    test('does not trigger a save when loadNote returns the same text as the cache', async () => {
      vi.useFakeTimers()
      const SAME = 'matching text'
      localStorage.setItem('notetext:' + NOTE_URI, SAME)
      mockLoadNote.mockResolvedValue(SAME)

      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      mount(NoteEditorView, { global: { plugins: [router] } })
      await vi.runAllTimersAsync()
      await flushPromises()
      vi.advanceTimersByTime(2500)
      await flushPromises()

      expect(mockSaveNote).not.toHaveBeenCalled()
      localStorage.removeItem('notetext:' + NOTE_URI)
    })

    // When there is no cache entry the pre-load is skipped: textarea stays empty
    // until loadNote settles. Guards against a regression where a missing cache
    // entry causes a spurious empty-string pre-load that overwrites server content.
    test('leaves textarea empty when localStorage has no entry for the note URI', async () => {
      localStorage.removeItem('notetext:' + NOTE_URI)
      let releaseLoad
      mockLoadNote.mockImplementation(() => new Promise(r => { releaseLoad = r }))

      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await nextTick()

      expect(wrapper.find('textarea').element.value).toBe('')

      releaseLoad(null)
      await flushPromises()
      wrapper.unmount()
    })

  })

})
