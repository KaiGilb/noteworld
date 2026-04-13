<script setup>
// UNIT_TYPE=Widget

/**
 * Note editor view for NoteWorld.
 * Opened after a note is created via useTwinPodNoteCreate.
 * Shows an empty textarea ready for the user to type.
 *
 * URI state (URI State Standard — URI_STATE_01, URI_STATE_04):
 *   /app?app=NoteWorld&navigator=editor&target=<percent-encoded note URI>
 *   target is stored pre-encoded; decodeURIComponent() recovers the plain note URI on read.
 *
 * This view covers F.Create_Note (success criteria: "A new empty note is open and ready
 * for text input") and V.Speed_Create_Note (the editor must be immediately usable after
 * navigation — no async loading needed for an empty new note).
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// Spec: URI_STATE_04 — TwinPod URIs in query params are percent-encoded with encodeURIComponent()
// on write (in HomeView's router.push). Vue Router stores the pre-encoded value and returns it
// as-is on read, so an explicit decodeURIComponent() is needed here to recover the plain URI.
const noteUri = computed(() => {
  const raw = route.query.target ?? null
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    // If the value is not valid percent-encoding, return it unchanged rather than throwing
    return raw
  }
})

// Navigate back to home, clearing editor state (URI_STATE_08 — stale params removed on nav change)
function goHome() {
  router.push({ path: '/' })
}
</script>

<template>
  <main style="padding: 2rem; font-family: sans-serif; max-width: 60rem;">
    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
      <button @click="goHome" style="cursor: pointer;">← Back</button>
      <h1 style="margin: 0;">New Note</h1>
    </div>

    <!-- Note URI shown for reference — helps user and aids debugging -->
    <p v-if="noteUri" style="font-size: 0.8rem; color: #888; margin-bottom: 1rem; word-break: break-all;">
      {{ noteUri }}
    </p>

    <!-- Spec: F.Create_Note — Success-Criteria: A new empty note is open and ready for text input -->
    <label for="note-content" style="display: block; font-weight: bold; margin-bottom: 0.5rem;">
      Note content
    </label>
    <textarea
      id="note-content"
      aria-label="Note content"
      style="width: 100%; min-height: 20rem; font-family: monospace; font-size: 1rem; padding: 0.75rem; box-sizing: border-box; resize: vertical;"
      placeholder="Start writing…"
    ></textarea>
  </main>
</template>
