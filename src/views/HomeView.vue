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

import { inject, computed, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTwinPodNoteCreate, useTwinPodNoteSearch, useTwinPodNotePreviews } from '@kaigilb/noteworld-notes'

const { webId, logout, loading, error } = inject('auth')
const podRoot = inject('podRoot')
const router = useRouter()
const route = useRoute()

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

// S.OptimisticCreate read-guard: NoteEditorView.goHome() stashes the new
// note URI in localStorage so it can appear in the list immediately — even
// before TwinPod's search index has caught up with the PUT. We clear the
// stash right away so a manual reload does not re-inject the entry
// indefinitely (once indexing settles the search result takes over via dedup
// in sortedNotes below).
const pendingNoteUri = ref(null)
try {
  const stored = localStorage.getItem('noteworld:pendingNote')
  if (stored) {
    pendingNoteUri.value = stored
    localStorage.removeItem('noteworld:pendingNote')
  }
} catch { /* ignore — localStorage unavailable in some browser contexts */ }

// Search synchronously on mount so tests that assert "searchNotes called on
// mount" pass without awaiting microtasks. The composable itself is async
// internally; the call-site does not need to await for the assertion to land.
// Guard the call with podRoot truthiness — App.vue resolves podRoot before
// flipping initialAuthDone, so this branch should always hit, but if
// discovery + fallback both fail we skip the search rather than firing a
// request against an empty URL.
function runSearch() {
  if (!podRoot.value) return
  searchNotes(podRoot.value).then((found) => {
    if (found && found.length > 0) loadPreviews(found.map(n => n.uri))
  })
}

runSearch()

// Kick off a preview fetch for the pending note immediately so its first line
// of text is visible in the list without waiting for the delayed re-search.
if (pendingNoteUri.value) loadPreviews([pendingNoteUri.value])

// TwinPod indexes a newly PUT note within a few seconds of the write landing.
// The first search fires before indexing settles; the delayed re-search surfaces
// the new note without requiring the user to navigate away and back again.
const rescanTimer = setTimeout(runSearch, 5000)
onUnmounted(() => clearTimeout(rescanTimer))

function noteDate(uri) {
  const match = uri.match(/t_note_(\d+)/)
  if (!match) return ''
  return new Date(Number(match[1])).toLocaleString()
}

// Sort newest-first. NoteWorld-minted URIs embed a ms timestamp in t_note_{ts}.
// Notes without that pattern (e.g. legacy Graphmetrix nodes) get timestamp 0
// and float to the bottom.
// If a pending note exists (optimistic create — not yet indexed by TwinPod's
// search) it is injected at the top provided the search hasn't already
// returned it.
const sortedNotes = computed(() => {
  const ts = uri => {
    const m = uri.match(/t_note_(\d+)/)
    return m ? Number(m[1]) : 0
  }
  const all = [...notes.value]
  if (pendingNoteUri.value && !all.some(n => n.uri === pendingNoteUri.value)) {
    all.push({ uri: pendingNoteUri.value })
  }
  return all.sort((a, b) => ts(b.uri) - ts(a.uri))
})

// Pagination — keep the list responsive for large vaults (ARCH_05).
// The visible count is URL-encoded (?count=N) so browser back/forward
// preserves scroll position. router.replace is used (not push) so each
// "Load more" click does not add a new history entry.
const PAGE_SIZE = 50
const displayCount = computed(() => {
  const n = Number(route.query.count)
  return Number.isFinite(n) && n > 0 ? n : PAGE_SIZE
})
const visibleNotes = computed(() => sortedNotes.value.slice(0, displayCount.value))

function loadMore() {
  router.replace({ path: route.path, query: { ...route.query, count: displayCount.value + PAGE_SIZE } })
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

      <p v-if="!searchLoading && !searchError && sortedNotes.length === 0" style="color: #595959;">
        No notes yet. Click "New Note" to get started.
      </p>

      <ul v-if="sortedNotes.length > 0" style="list-style: none; padding: 0; margin: 0;">
        <li v-for="note in visibleNotes" :key="note.uri" style="margin-bottom: 0.5rem;">
          <button
            @click="openNote(note.uri)"
            :data-uri="note.uri"
            style="text-align: left; cursor: pointer; padding: 0.75rem 1rem; width: 100%; border: 1px solid #ccc; background: #fafafa; font-size: 0.9rem; min-height: 44px;"
          >
            <span v-if="previews[note.uri]" style="display: block;">{{ previews[note.uri] }}</span>
            <span style="display: block; font-size: 0.75rem; color: #696969;">{{ noteDate(note.uri) }}</span>
          </button>
        </li>
      </ul>

      <button
        v-if="sortedNotes.length > displayCount"
        @click="loadMore"
        style="margin-top: 0.75rem; width: 100%; padding: 0.75rem; cursor: pointer; border: 1px solid #ccc; background: transparent; font-size: 0.9rem; min-height: 44px; color: #1a73e8;"
      >
        Load more ({{ sortedNotes.length - displayCount }} remaining)
      </button>
    </section>

  </main>
</template>
