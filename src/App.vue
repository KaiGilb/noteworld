<script setup>
// UNIT_TYPE=Widget

/**
 * Root component for NoteWorld.
 *
 * Responsibilities:
 * 1. Process the OIDC redirect on every page load (handleRedirect is a no-op
 *    when there is no incoming auth code in the URL).
 * 2. Redirect to /login when not authenticated; redirect to / when already
 *    authenticated and arriving at /login.
 * 3. Provide 'auth' and 'twinpodFetch' to all child views via inject so they
 *    never need to touch the session directly.
 *
 * session.fetch is the DPoP-aware replacement for window.fetch — it
 * automatically adds auth headers to every TwinPod request.
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import { provide, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTwinPodAuth } from '@kaigilb/twinpod-auth'

const router = useRouter()
const route = useRoute()

const { isLoggedIn, webId, loading, error, session, handleRedirect, login, logout } =
  useTwinPodAuth({ clientName: 'NoteWorld' })

// Provide session.fetch as 'twinpodFetch' for all composables that read/write TwinPod data.
// This is the DPoP-bound fetch — automatically adds auth headers when the session is active.
provide('twinpodFetch', (url, options) => session.fetch(url, options))

// Provide auth state and actions so views never need to call useTwinPodAuth separately.
// Using a single composable instance ensures there is only one set of reactive refs.
provide('auth', { isLoggedIn, webId, loading, error, login, logout })

// On every page load: complete any in-progress OIDC redirect, then route accordingly.
// restorePreviousSession (inside handleRedirect) also re-hydrates sessions from localStorage.
onMounted(async () => {
  await handleRedirect()

  if (isLoggedIn.value && route.path === '/login') {
    // Arrived at /login but already authenticated — skip the login screen
    router.push('/')
  } else if (!isLoggedIn.value && route.path !== '/login') {
    // Any protected route without a session → go to login
    router.push('/login')
  }
})
</script>

<template>
  <!-- Show a brief loading state while the OIDC redirect is being processed -->
  <div v-if="loading" style="padding: 2rem; font-family: sans-serif;">
    Connecting…
  </div>
  <RouterView v-else />
</template>
