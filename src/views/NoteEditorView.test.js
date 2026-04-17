// UNIT_TYPE=Widget

import { describe, test, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { axe } from 'vitest-axe'
import { toHaveNoViolations } from 'vitest-axe/matchers.js'

// Mock @kaigilb/noteworld-notes — NoteEditorView calls useTwinPodNoteRead and useTwinPodNoteSave.
// Without this mock, the real composables import ur from @kaigilb/twinpod-client which requires
// import.meta.env.VITE_HYPERGRAPH_CODE and inrupt localStorage access, both unavailable in jsdom.
// Refs are required (not plain objects) so v-if bindings evaluate correctly in templates.
vi.mock('@kaigilb/noteworld-notes', async () => {
  const { ref } = await import('vue')
  return {
    useTwinPodNoteRead: () => ({
      loading: ref(false),
      error: ref(null),
      loadNote: vi.fn().mockResolvedValue(null)
    }),
    useTwinPodNoteSave: () => ({
      saving: ref(false),
      saved: ref(false),
      error: ref(null),
      saveNote: vi.fn().mockResolvedValue(true)
    })
  }
})

import NoteEditorView from './NoteEditorView.vue'

expect.extend({ toHaveNoViolations })

// Spec: F.Create_Note — Success-Criteria: A new empty note is open and ready for text input
// Spec: V.Speed_Create_Note — editor must be immediately usable after navigation (no async load)

function makeRouter(query = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', component: NoteEditorView },
      { path: '/', component: { template: '<div />' } }
    ]
  })
  return router
}

const NOTE_URI = 'https://tst-first.demo.systemtwin.com/t/t_note_1234567890_abcd'

describe('NoteEditorView', () => {

  describe('rendering', () => {

    // Spec: F.Create_Note — "A new empty note is open and ready for text input"
    test('renders a textarea for note content', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      expect(wrapper.find('textarea').exists()).toBe(true)
    })

    test('textarea has a label associated via for/id', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      const label = wrapper.find('label[for="note-content"]')
      const textarea = wrapper.find('#note-content')
      expect(label.exists()).toBe(true)
      expect(textarea.exists()).toBe(true)
    })

    test('renders the Back button', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      expect(wrapper.find('button').exists()).toBe(true)
    })

    // Spec: URI_STATE_04 — the decoded note URI from route.query.target must be displayed
    test('displays the note URI from the target query param', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      expect(wrapper.text()).toContain(NOTE_URI)
    })

    test('does not show note URI when target query param is absent', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor' } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      // No URI text visible — the v-if on noteUri should hide it
      expect(wrapper.find('p').exists()).toBe(false)
    })

    test('textarea is empty on initial render (new note has no content)', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      expect(wrapper.find('textarea').element.value).toBe('')
    })

  })

  describe('navigation', () => {

    // Spec: URI_STATE_08 — navigating away from editor must clear editor state
    test('Back button navigates to /', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      await wrapper.find('button').trigger('click')
      const { flushPromises } = await import('@vue/test-utils')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/')
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

  // --- Gap tests written by QATester — WCAG 2.1 AA color contrast fix ---

  describe('color contrast (WCAG 2.1 AA)', () => {

    // Spec: WCAG 2.1 AA — normal text requires a minimum contrast ratio of 4.5:1 against background.
    // The note URI paragraph uses inline color: #595959 on a white (#ffffff) background.
    // #595959 has a relative luminance of ~0.0999, giving a contrast ratio of ~7.00:1 — passes AA.
    // axe-core cannot evaluate inline colors in jsdom (HTMLCanvasElement.getContext not implemented),
    // so this test explicitly computes the contrast ratio from the inline style color value.
    // jsdom normalises hex colors to rgb() — this test handles both forms.
    // If the color is changed to a lower-contrast value, this test will catch the regression.
    test('note URI paragraph uses a WCAG AA-compliant inline text color', async () => {
      const router = makeRouter()
      await router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(NOTE_URI) } })
      const wrapper = mount(NoteEditorView, { global: { plugins: [router] } })
      const para = wrapper.find('p')
      expect(para.exists()).toBe(true)
      const style = para.attributes('style') || ''

      // jsdom normalises #595959 → rgb(89, 89, 89); also handle raw hex
      let r, g, b
      const rgbMatch = style.match(/color:\s*rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/)
      const hexMatch = style.match(/color:\s*(#[0-9a-fA-F]{6})/)
      if (rgbMatch) {
        r = parseInt(rgbMatch[1])
        g = parseInt(rgbMatch[2])
        b = parseInt(rgbMatch[3])
      } else if (hexMatch) {
        const hex = hexMatch[1].slice(1)
        r = parseInt(hex.slice(0, 2), 16)
        g = parseInt(hex.slice(2, 4), 16)
        b = parseInt(hex.slice(4, 6), 16)
      } else {
        throw new Error('Could not parse a color value from the note URI paragraph inline style: ' + style)
      }

      // WCAG 2.1 relative luminance formula
      function sRGB(c) { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
      function luminance(rr, gg, bb) { return 0.2126 * sRGB(rr) + 0.7152 * sRGB(gg) + 0.0722 * sRGB(bb) }
      const textLum = luminance(r, g, b)
      // Background is white (#ffffff), luminance = 1.0
      const bgLum = 1.0
      const contrastRatio = (bgLum + 0.05) / (textLum + 0.05)

      // Spec: WCAG 2.1 AA — normal text (< 18px normal weight) requires >= 4.5:1
      // The URI text is 0.8rem (~12.8px), so 4.5:1 applies. #595959 gives 7.00:1.
      expect(contrastRatio).toBeGreaterThanOrEqual(4.5)
    })

  })

  // --- Gap tests written by QATester — Mobile-First Standard ---

  describe('mobile touch targets (MOBILE_03)', () => {

    // Spec: MOBILE_03 — every interactive element must have a minimum touch target of 44×44px.
    // jsdom does not do CSS layout, so we check for an explicit min-height inline style of at least 44px.
    test('Back button declares a min-height of at least 44px in its inline style', async () => {
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

})
