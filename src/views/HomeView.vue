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

import { inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ur } from '@kaigilb/twinpod-client'
import { useTwinPodNoteCreate, useTwinPodNoteSearch, useTwinPodNotePreviews } from '@kaigilb/noteworld-notes'

const { webId, logout, loading, error } = inject('auth')
const router = useRouter()

// --- Pod discovery ---

// Resolved from the authenticated WebID on mount; all TwinPod calls wait for this.
const podRoot = ref(null)

// --- Logout ---

async function handleLogout() {
  await logout()
  router.push('/login')
}

// --- New Note (F.Create_Note) ---

const { loading: noteLoading, error: noteError, createNote } = useTwinPodNoteCreate()

async function handleNewNote() {
  if (!podRoot.value) return

  const uri = await createNote(podRoot.value)

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

const { notes, loading: searchLoading, error: searchError, searchNotes } = useTwinPodNoteSearch()
const { previews, loadPreviews } = useTwinPodNotePreviews()

onMounted(async () => {
  // Discover the user's actual pod root before any TwinPod calls.
  // ur.findPodRoots checks five predicates (pim:storage, foaf:member, etc.)
  // so it works for any pod URL, not just the one in .env.
  const roots = await ur.findPodRoots(webId.value)
  podRoot.value = roots[0] ?? null

  if (!podRoot.value) return

  const found = await searchNotes(podRoot.value)
  if (found.length > 0) loadPreviews(found.map(n => n.uri))
})

function noteDate(uri) {
  const match = uri.match(/t_note_(\d+)/)
  if (!match) return ''
  return new Date(Number(match[1])).toLocaleString()
}

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
      :disabled="noteLoading || !podRoot"
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
            style="text-align: left; cursor: pointer; padding: 0.75rem 1rem; width: 100%; border: 1px solid #ccc; background: #fafafa; font-size: 0.9rem; min-height: 44px;"
          >
            <span v-if="previews[note.uri]" style="display: block;">{{ previews[note.uri] }}</span>
            <span style="display: block; font-size: 0.75rem; color: #888;">{{ noteDate(note.uri) }}</span>
          </button>
        </li>
      </ul>
    </section>
  </main>
</template>
