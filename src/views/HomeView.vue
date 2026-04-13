<!-- UNIT_TYPE=Widget -->

<!--
  Home page for NoteWorld — shown only when authenticated.
  Displays the authenticated user's WebID and a Logout button.
  This is the shell into which future NoteWorld features (Create Note, Find Note, etc.) will be added.
-->

<script setup>
import { inject } from 'vue'
import { useRouter } from 'vue-router'

const { webId, logout, loading } = inject('auth')
const router = useRouter()

async function handleLogout() {
  await logout()
  // After local logout, go to the login screen
  router.push('/login')
}
</script>

<template>
  <main style="padding: 2rem; font-family: sans-serif;">
    <h1>NoteWorld</h1>

    <p>
      Logged in as:<br />
      <strong>{{ webId }}</strong>
    </p>

    <button
      @click="handleLogout"
      :disabled="loading"
      style="padding: 0.5rem 1.5rem; cursor: pointer;"
    >
      Logout
    </button>

    <p v-if="loading" role="status" style="color: #888; margin-top: 0.5rem;">Logging out…</p>
  </main>
</template>
