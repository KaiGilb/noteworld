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
 * 3. Provide 'auth' to all child views via inject so they never need to call
 *    useTwinPodAuth separately.
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import { provide, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTwinPodAuth } from '@kaigilb/twinpod-auth'

const router = useRouter()
const route = useRoute()

const { isLoggedIn, webId, loading, error, session, handleRedirect, login, logout } =
  useTwinPodAuth({
    clientName: 'NoteWorld',
    // Dev mode only: Playwright E2E tests inject a mock session via page.addInitScript()
    // by setting window.__E2E_SESSION__ before the app loads. In production this is always
    // null because import.meta.env.DEV is false.
    _sessionOverride: import.meta.env.DEV ? (window.__E2E_SESSION__ ?? null) : null
  })

// Bridge: ur.hyperFetch reads window.solid.session at call time. rdfStore.js installs its
// own session on startup; overwrite it here so all ur.* calls use the auth session's fetch.
if (window.solid) window.solid.session = session

if (import.meta.env.DEV) {
  window.__session = session
}

// Provide auth state and actions so views never need to call useTwinPodAuth separately.
// Using a single composable instance ensures there is only one set of reactive refs.
provide('auth', { isLoggedIn, webId, loading, error, login, logout })

// On every page load: complete any in-progress OIDC redirect, then route accordingly.
// restorePreviousSession (inside handleRedirect) also re-hydrates sessions from localStorage.
//
// Deep-link preservation: when an unauthenticated user lands on a protected URL
// (e.g. /app?target=<note>), we stash the intended fullPath in sessionStorage
// before sending them through login. After handleRedirect completes successfully,
// we pop the stash and route back to the original URL so the note opens as requested.
const REDIRECT_KEY = 'noteworld:postLoginRedirect'
const initialAuthDone = ref(false)

onMounted(async () => {
  await router.isReady()

  // Stash the intended destination BEFORE handleRedirect. If the session is stale,
  // handleRedirect silently triggers a full-page OIDC round-trip that lands on
  // /?iss=...&code=..., discarding the original /app?target=... URL.
  //   - Skip /login (never stash the login screen).
  //   - Skip / (nothing to preserve — it's the default landing).
  //   - Skip when ?code= is present (we're mid-OIDC-return; must not overwrite the
  //     stash written before the round-trip).
  //   - Skip when a stash already exists (previous mount's stash wins).
  if (
    route.path !== '/login' &&
    route.path !== '/' &&
    !route.query.code &&
    !sessionStorage.getItem(REDIRECT_KEY)
  ) {
    sessionStorage.setItem(REDIRECT_KEY, route.fullPath)
  }

  await handleRedirect()
  initialAuthDone.value = true

  if (isLoggedIn.value) {
    const stashed = sessionStorage.getItem(REDIRECT_KEY)
    if (stashed && stashed !== '/login') {
      sessionStorage.removeItem(REDIRECT_KEY)
      router.push(stashed)
    } else if (route.path === '/login') {
      router.push('/')
    }
  } else if (route.path !== '/login') {
    router.push('/login')
  }
})
</script>

<template>
  <div v-if="loading || !initialAuthDone" style="padding: 2rem; font-family: sans-serif;">
    Connecting…
  </div>
  <RouterView v-else />
</template>
