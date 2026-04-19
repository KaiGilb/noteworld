<script setup>
// UNIT_TYPE=Widget

/**
 * Login page for NoteWorld.
 * Shows a single "Connect to TwinPod" button that starts the Solid-OIDC flow.
 * The OIDC issuer is read from the VITE_TWINPOD_URL environment variable —
 * never hardcoded, per the app-structure standard.
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import { inject } from 'vue'

const { login, error, loading } = inject('auth')

// Spec: F.NoteWorld — user must be able to authenticate against TwinPod
function connect() {
  login(import.meta.env.VITE_TWINPOD_URL)
}
</script>

<template>
  <main style="display: flex; flex-direction: column; align-items: center; padding: 4rem 2rem; font-family: sans-serif;">
    <h1>NoteWorld</h1>
    <p>Connect your TwinPod to get started.</p>

    <button
      @click="connect"
      :disabled="loading"
      style="padding: 0.75rem 2rem; font-size: 1rem; cursor: pointer; margin-top: 1rem; min-height: 44px;"
    >
      Connect to TwinPod
    </button>

    <!-- Show auth errors if login setup fails before the redirect -->
    <p v-if="error" role="alert" style="color: #c00; margin-top: 1rem;">
      {{ error.message }}
    </p>
  </main>
</template>
