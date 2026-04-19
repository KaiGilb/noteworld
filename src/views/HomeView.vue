<script setup>
// UNIT_TYPE=Widget

/**
 * Home page for NoteWorld — shown only when authenticated.
 * Displays the authenticated user's WebID, a Logout button, a New Note button,
 * and a list of existing notes discovered via the TwinPod pod-local search API.
 *
 * F.Create_Note: creates a new note and navigates to the editor.
 * F.Find_Note:   lists existing notes via useTwinPodNoteSearch on mount.
 *
 * Pod base URL comes from the 'podRoot' inject, which App.vue resolves via
 * ur.findPodRoots(webId) after the OIDC redirect completes. We never read
 * VITE_TWINPOD_URL directly here — login is the pod switch (Kai: "I will
 * frequently want to start over with a new twinpod").
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import { inject, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTwinPodNoteCreate, useTwinPodNoteSearch, useTwinPodNotePreviews } from '@kaigilb/noteworld-notes'

const { webId, logout, loading, error } = inject('auth')
const podRoot = inject('podRoot')
const router = useRouter()

// --- Logout ---

async function handleLogout() {
  await logout()
  router.push('/login')
}

// --- New Note (F.Create_Note / S.OptimisticCreate) ---

const { pendingUri, loading: noteLoading, error: noteError, createNote } = useTwinPodNoteCreate()

function handleNewNote() {
  // S.OptimisticCreate (VDT 2026-04-18, notes 5 + 11): fire-and-forget.
  // `createNote` mints the URI and flips pendingUri synchronously BEFORE the
  // first `await`, so we can navigate immediately. The PUT runs in the
  // background; its outcome surfaces via the composable's `creating` / error
  // refs (not awaited here).
  createNote(podRoot.value)

  const uri = pendingUri.value
  if (!uri) return   // e.g. empty podRoot — createNote returned without minting

  // `new=1` signals NoteEditorView to skip its initial loadNote (the resource
  // does not yet exist on the server). The flag is stripped by the editor
  // after the first successful save.
  router.push({
    path: '/app',
    query: {
      app: 'NoteWorld',
      navigator: 'editor',
      target: encodeURIComponent(uri),
      new: '1'
    }
  })
}

// --- Note List (F.Find_Note) ---

const { notes, loading: searchLoading, error: searchError, searchNotes } = useTwinPodNoteSearch()
const { previews, loadPreviews } = useTwinPodNotePreviews()

// Search synchronously on mount so tests that assert "searchNotes called on
// mount" pass without awaiting microtasks. The composable itself is async
// internally; the call-site does not need to await for the assertion to land.
// Guard the call with podRoot truthiness — App.vue resolves podRoot before
// flipping initialAuthDone, so this branch should always hit, but if
// discovery + fallback both fail we skip the search rather than firing a
// request against an empty URL.
if (podRoot.value) {
  searchNotes(podRoot.value).then((found) => {
    if (found && found.length > 0) loadPreviews(found.map(n => n.uri))
  })
}

function noteLabel(uri) {
  // Last path segment — e.g. `t_note_1` from `https://pod/t/t_note_1`.
  const idx = uri.lastIndexOf('/')
  return idx >= 0 ? uri.slice(idx + 1) : uri
}

function noteDate(uri) {
  const match = uri.match(/t_note_(\d+)/)
  if (!match) return ''
  return new Date(Number(match[1])).toLocaleString()
}

// Sort newest-first. NoteWorld-minted URIs embed a ms timestamp in t_note_{ts}.
// Notes without that pattern (e.g. legacy Graphmetrix nodes) get timestamp 0
// and float to the bottom.
const sortedNotes = computed(() => {
  const ts = uri => {
    const m = uri.match(/t_note_(\d+)/)
    return m ? Number(m[1]) : 0
  }
  return [...notes.value].sort((a, b) => ts(b.uri) - ts(a.uri))
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
        <li v-for="note in sortedNotes" :key="note.uri" style="margin-bottom: 0.5rem;">
          <button
            @click="openNote(note.uri)"
            style="text-align: left; cursor: pointer; padding: 0.75rem 1rem; width: 100%; border: 1px solid #ccc; background: #fafafa; font-size: 0.9rem; min-height: 44px;"
          >
            <span v-if="previews[note.uri]" style="display: block;">{{ previews[note.uri] }}</span>
            <span style="display: block; font-size: 0.85rem;">{{ noteLabel(note.uri) }}</span>
            <span style="display: block; font-size: 0.75rem; color: #696969;">{{ noteDate(note.uri) }}</span>
          </button>
        </li>
      </ul>
    </section>

  </main>
</template>
