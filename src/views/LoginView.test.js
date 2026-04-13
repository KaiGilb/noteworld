import { describe, test, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { axe } from 'vitest-axe'
import { toHaveNoViolations } from 'vitest-axe/matchers.js'
import LoginView from './LoginView.vue'

expect.extend({ toHaveNoViolations })

// Spec: F.NoteWorld — user must be able to initiate TwinPod authentication from the login screen

function makeAuthProvide({ loginFn = vi.fn(), loading = false, error = null } = {}) {
  return {
    auth: {
      login: loginFn,
      loading: ref(loading),
      error: ref(error)
    }
  }
}

describe('LoginView', () => {

  describe('rendering', () => {

    test('renders a Connect to TwinPod button', () => {
      const wrapper = mount(LoginView, {
        global: { provide: makeAuthProvide() }
      })
      expect(wrapper.find('button').text()).toContain('Connect to TwinPod')
    })

    test('button is enabled when not loading', () => {
      const wrapper = mount(LoginView, {
        global: { provide: makeAuthProvide({ loading: false }) }
      })
      expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    })

    test('button is disabled when loading', () => {
      const wrapper = mount(LoginView, {
        global: { provide: makeAuthProvide({ loading: true }) }
      })
      expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    })

    test('shows error message when error is set', () => {
      const wrapper = mount(LoginView, {
        global: { provide: makeAuthProvide({ error: { message: 'Invalid issuer' } }) }
      })
      expect(wrapper.text()).toContain('Invalid issuer')
    })

    test('hides error message when error is null', () => {
      const wrapper = mount(LoginView, {
        global: { provide: makeAuthProvide({ error: null }) }
      })
      expect(wrapper.find('p[style*="color"]').exists()).toBe(false)
    })

    // Gap: Accessibility Standard requires error messages to use role="alert" so screen readers
    // announce them immediately. No test verifies this attribute is present on the error element.
    test('error message has role="alert" for screen reader announcement', () => {
      const wrapper = mount(LoginView, {
        global: { provide: makeAuthProvide({ error: { message: 'Invalid issuer' } }) }
      })
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })

  })

  describe('behaviour', () => {

    // Spec: F.NoteWorld — clicking Connect must call login() with the OIDC issuer from env
    test('calls login with VITE_TWINPOD_URL when button is clicked', async () => {
      const loginFn = vi.fn()
      const wrapper = mount(LoginView, {
        global: { provide: makeAuthProvide({ loginFn }) }
      })
      await wrapper.find('button').trigger('click')
      expect(loginFn).toHaveBeenCalledOnce()
    })

    // --- Gap test written by QATester ---

    // Spec: F.NoteWorld — clicking Connect must pass the OIDC issuer URL (VITE_TWINPOD_URL) to login()
    // Gap: existing test verifies login is called once but never verifies the argument.
    // If connect() passes the wrong URL, the OIDC flow silently targets the wrong issuer.
    // import.meta.env.VITE_TWINPOD_URL is undefined in test env (jsdom) — we can verify
    // that login() is called with exactly that value (undefined in test env = consistent).
    test('calls login with the VITE_TWINPOD_URL env value as the oidcIssuer argument', async () => {
      const loginFn = vi.fn()
      const wrapper = mount(LoginView, {
        global: { provide: makeAuthProvide({ loginFn }) }
      })
      await wrapper.find('button').trigger('click')
      // In the Vite test environment, import.meta.env.VITE_TWINPOD_URL is not set —
      // the important thing is that connect() passes it through directly without modification.
      expect(loginFn).toHaveBeenCalledWith(import.meta.env.VITE_TWINPOD_URL)
    })

  })

  describe('accessibility', () => {

    // Spec: Accessibility — must meet WCAG 2.1 AA (meter: axe-core violations = 0)
    test('has no accessibility violations', async () => {
      const wrapper = mount(LoginView, {
        global: { provide: makeAuthProvide() },
        attachTo: document.body
      })
      const results = await axe(wrapper.element)
      expect(results).toHaveNoViolations()
      wrapper.unmount()
    })

  })

})
