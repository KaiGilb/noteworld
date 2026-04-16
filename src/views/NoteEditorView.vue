<script setup>
// UNIT_TYPE=Widget

/**
 * Note editor view for NoteWorld.
 *
 * Loads existing note text on mount via useTwinPodNoteRead, and saves edits back
 * via useTwinPodNoteSave. Both composables use Stack B (rdflib Turtle pipeline)
 * against {podRoot}/t/t_note_{ts}_{rand4}.
 *
 * URI state (URI State Standard — URI_STATE_01, URI_STATE_04):
 *   /app?app=NoteWorld&navigator=editor&target=<percent-encoded note URI>
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import { ref, computed, inject, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTwinPodNoteSave, useTwinPodNoteRead } from '@kaigilb/noteworld-notes'

const route = useRoute()
const router = useRouter()
const solidFetch = inject('solidFetch')

const noteUri = computed(() => {
  const raw = route.query.target ?? null
  if (!raw) return null
  try { return decodeURIComponent(raw) } catch { return raw }
})

const text = ref('')

const { loading: readLoading, error: readError, loadNote } = useTwinPodNoteRead(solidFetch)
const { saving, saved, error: saveError, saveNote } = useTwinPodNoteSave(solidFetch)

async function loadCurrent() {
  if (!noteUri.value) return
  const value = await loadNote(noteUri.value)
  if (value !== null) text.value = value
}

onMounted(loadCurrent)
watch(noteUri, loadCurrent)

async function handleSave() {
  if (!noteUri.value) return
  await saveNote(noteUri.value, text.value)
}

function goHome() {
  router.push({ path: '/' })
}
</script>

<template>
  <main style="padding: 2rem; font-family: sans-serif; max-width: 60rem;">
    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
      <button @click="goHome" style="cursor: pointer; min-height: 44px; padding: 0 0.75rem;">← Back</button>
      <h1 style="margin: 0;">Note</h1>
    </div>

    <p v-if="noteUri" style="font-size: 0.8rem; color: #595959; margin-bottom: 1rem; word-break: break-all;">
      {{ noteUri }}
    </p>

    <label for="note-content" style="display: block; font-weight: bold; margin-bottom: 0.5rem;">
      Note content
    </label>
    <textarea
      id="note-content"
      v-model="text"
      aria-label="Note content"
      :disabled="readLoading"
      style="width: 100%; min-height: 20rem; font-family: monospace; font-size: 1rem; padding: 0.75rem; box-sizing: border-box; resize: vertical;"
      placeholder="Start writing…"
    ></textarea>

    <div style="margin-top: 1rem; display: flex; align-items: center; gap: 1rem;">
      <button
        @click="handleSave"
        :disabled="saving || readLoading || !noteUri"
        style="padding: 0.5rem 1.5rem; cursor: pointer; min-height: 44px;"
      >
        Save
      </button>
      <span v-if="readLoading" role="status" style="color: #888;">Loading…</span>
      <span v-else-if="saving" role="status" style="color: #888;">Saving…</span>
      <span v-else-if="saved" role="status" style="color: #060;">Saved</span>
    </div>

    <p v-if="readError" role="alert" style="color: #c00; margin-top: 0.5rem;">{{ readError.message }}</p>
    <p v-if="saveError" role="alert" style="color: #c00; margin-top: 0.5rem;">{{ saveError.message }}</p>
  </main>
</template>
