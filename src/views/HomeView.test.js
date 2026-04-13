import { describe, test, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { axe } from 'vitest-axe'
import { toHaveNoViolations } from 'vitest-axe/matchers.js'
import HomeView from './HomeView.vue'

expect.extend({ toHaveNoViolations })

// Spec: F.NoteWorld — home screen must display the authenticated user's WebID and allow logout

// Minimal router — HomeView calls useRouter().push() on logout
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/login', component: { template: '<div />' } }
  ]
})

function makeAuthProvide({ webId = 'https://pod.example.com/profile/card#me', logoutFn = vi.fn(), loading = false } = {}) {
  return {
    auth: {
      webId: ref(webId),
      logout: logoutFn,
      loading: ref(loading)
    }
  }
}

describe('HomeView', () => {

  describe('rendering', () => {

    test('displays the authenticated WebID', () => {
      const wrapper = mount(HomeView, {
        global: {
          plugins: [router],
          provide: makeAuthProvide({ webId: 'https://pod.example.com/profile/card#me' })
        }
      })
      expect(wrapper.text()).toContain('https://pod.example.com/profile/card#me')
    })

    test('renders a Logout button', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeAuthProvide() }
      })
      expect(wrapper.find('button').text()).toContain('Logout')
    })

    test('Logout button is enabled when not loading', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeAuthProvide({ loading: false }) }
      })
      expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    })

    test('Logout button is disabled when loading', () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeAuthProvide({ loading: true }) }
      })
      expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    })

  })

  describe('behaviour', () => {

    // Spec: F.NoteWorld — clicking Logout must call logout() and redirect to /login
    test('calls logout when Logout button is clicked', async () => {
      const logoutFn = vi.fn().mockResolvedValue(undefined)
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeAuthProvide({ logoutFn }) }
      })
      await wrapper.find('button').trigger('click')
      expect(logoutFn).toHaveBeenCalledOnce()
    })

  })

  describe('accessibility', () => {

    // Spec: Accessibility — must meet WCAG 2.1 AA (meter: axe-core violations = 0)
    test('has no accessibility violations', async () => {
      const wrapper = mount(HomeView, {
        global: { plugins: [router], provide: makeAuthProvide() },
        attachTo: document.body
      })
      const results = await axe(wrapper.element)
      expect(results).toHaveNoViolations()
      wrapper.unmount()
    })

  })

})
