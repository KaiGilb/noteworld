// UNIT_TYPE=Widget

import { describe, test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { axe } from 'vitest-axe'
import { toHaveNoViolations } from 'vitest-axe/matchers.js'
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

const NOTE_URI = 'https://tst-first.demo.systemtwin.com/notes/abc123'

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

})
