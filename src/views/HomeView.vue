<script setup>
// UNIT_TYPE=Widget

/**
 * Home page for NoteWorld — shown only when authenticated.
 * Displays the authenticated user's WebID, a Logout button, a New Note button,
 * and a list of existing notes discovered via the TwinPod pod-local search API.
 *
 * F.Create_Note: creates a new note and navigates to the editor.
 * F.Find_Note: lists existing notes via useTwinPodNoteSearch on mount.
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import { inject, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTwinPodNoteCreate, useTwinPodNoteSearch } from '@kaigilb/noteworld-notes'

const { webId, logout, loading, error } = inject('auth')
const solidFetch = inject('solidFetch')
const router = useRouter()

// --- Logout ---

async function handleLogout() {
  await logout()
  router.push('/login')
}

// --- New Note (F.Create_Note) ---

const { loading: noteLoading, error: noteError, createNote } = useTwinPodNoteCreate(solidFetch)

async function handleNewNote() {
  const uri = await createNote(import.meta.env.VITE_TWINPOD_URL)

  if (uri) {
    router.push({
      path: '/app',
      query: {
        app: 'NoteWorld',
        navigator: 'editor',
        target: encodeURIComponent(uri)
      }
    })
  }
}

// --- Note List (F.Find_Note) ---

const { notes, loading: searchLoading, error: searchError, searchNotes } = useTwinPodNoteSearch(solidFetch)

onMounted(() => {
  searchNotes(import.meta.env.VITE_TWINPOD_URL)
})

function openNote(uri) {
  router.push({
    path: '/app',
    query: {
      app: 'NoteWorld',
      navigator: 'editor',
      target: encodeURIComponent(uri)
    }
  })
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
      style="padding: 0.5rem 1.5rem; cursor: pointer; margin-right: 0.75rem; min-height: 44px;"
    >
      New Note
    </button>

    <button
      @click="handleLogout"
      :disabled="loading"
      style="padding: 0.5rem 1.5rem; cursor: pointer; min-height: 44px;"
    >
      Logout
    </button>

    <!-- Note creation status and errors -->
    <p v-if="noteLoading" role="status" style="color: #595959; margin-top: 0.5rem;">Creating note…</p>
    <p v-if="noteError" role="alert" style="color: #c00; margin-top: 0.5rem;">{{ noteError.message }}</p>

    <!-- Logout status and errors -->
    <p v-if="loading" role="status" style="color: #595959; margin-top: 0.5rem;">Logging out…</p>
    <p v-if="error" role="alert" style="color: #c00; margin-top: 0.5rem;">{{ error.message }}</p>

    <!-- Spec: F.Find_Note — list of existing notes -->
    <section style="margin-top: 2rem;" aria-label="Your notes">
      <h2>Your Notes</h2>

      <p v-if="searchLoading" role="status" style="color: #595959;">Loading notes…</p>
      <p v-if="searchError" role="alert" style="color: #c00;">{{ searchError.message }}</p>

      <p v-if="!searchLoading && !searchError && notes.length === 0" style="color: #595959;">
        No notes yet. Click "New Note" to get started.
      </p>

      <ul v-if="notes.length > 0" style="list-style: none; padding: 0; margin: 0;">
        <li v-for="note in notes" :key="note.uri" style="margin-bottom: 0.5rem;">
          <button
            @click="openNote(note.uri)"
            style="text-align: left; cursor: pointer; padding: 0.75rem 1rem; width: 100%; border: 1px solid #ccc; background: #fafafa; font-size: 0.9rem; word-break: break-all; min-height: 44px;"
          >
            {{ note.uri }}
          </button>
        </li>
      </ul>
    </section>
  </main>
</template>
