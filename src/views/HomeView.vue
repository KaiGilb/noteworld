<script setup>
// UNIT_TYPE=Widget

/**
 * Home page for NoteWorld — shown only when authenticated.
 * Displays the authenticated user's WebID, a Logout button, and a New Note button.
 *
 * New Note (F.Create_Note):
 *   Calls useTwinPodNoteCreate to POST a new empty LWS resource to TwinPod, then
 *   navigates to the editor at /app?app=NoteWorld&navigator=editor&target=<encoded URI>
 *   (URI State Standard — URI_STATE_01, URI_STATE_04).
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import { inject } from 'vue'
import { useRouter } from 'vue-router'
import { useTwinPodNoteCreate } from '@kaigilb/noteworld-notes'

const { webId, logout, loading, error } = inject('auth')

// twinpodFetch is the DPoP-bound authenticated fetch provided by App.vue.
// It is used by useTwinPodNoteCreate to POST to TwinPod.
const twinpodFetch = inject('twinpodFetch')

const router = useRouter()

// --- Logout ---

async function handleLogout() {
  await logout()
  // After local logout, go to the login screen
  router.push('/login')
}

// --- New Note (F.Create_Note) ---

const { loading: noteLoading, error: noteError, createNote } = useTwinPodNoteCreate(twinpodFetch)

// Spec: F.Create_Note — Success-Criteria: A new empty note is open and ready for text input
// Spec: V.Speed_Create_Note — Goal: 0.5s from click to editor open
async function handleNewNote() {
  // Notes container is at VITE_TWINPOD_URL/notes/ — the trailing slash is required by LWS (container URI)
  const containerUrl = import.meta.env.VITE_TWINPOD_URL + '/notes/'
  const uri = await createNote(containerUrl)

  if (uri) {
    // Navigate to the editor, encoding the note URI as a query param (URI State Standard)
    router.push({
      path: '/app',
      query: {
        app: 'NoteWorld',
        navigator: 'editor',
        // encodeURIComponent ensures the URI is treated as a single opaque value, not parsed as URL structure
        target: encodeURIComponent(uri)
      }
    })
  }
}
</script>

<template>
  <main style="padding: 2rem; font-family: sans-serif;">
    <h1>NoteWorld</h1>

    <p>
      Logged in as:<br />
      <strong>{{ webId }}</strong>
    </p>

    <!-- Spec: F.Create_Note — user can create a new note from the home screen -->
    <button
      @click="handleNewNote"
      :disabled="noteLoading"
      style="padding: 0.5rem 1.5rem; cursor: pointer; margin-right: 0.75rem;"
    >
      New Note
    </button>

    <button
      @click="handleLogout"
      :disabled="loading"
      style="padding: 0.5rem 1.5rem; cursor: pointer;"
    >
      Logout
    </button>

    <!-- Note creation status and errors -->
    <p v-if="noteLoading" role="status" style="color: #888; margin-top: 0.5rem;">Creating note…</p>
    <p v-if="noteError" role="alert" style="color: #c00; margin-top: 0.5rem;">{{ noteError.message }}</p>

    <!-- Logout status and errors -->
    <p v-if="loading" role="status" style="color: #888; margin-top: 0.5rem;">Logging out…</p>

    <!-- Show logout errors so the user knows the session was not terminated -->
    <p v-if="error" role="alert" style="color: #c00; margin-top: 0.5rem;">
      {{ error.message }}
    </p>
  </main>
</template>
