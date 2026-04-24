<script setup>
// UNIT_TYPE=Widget

/**
 * Full-screen note editor for NoteWorld (Apple Notes-inspired UX).
 *
 * S.FullScreenNote (VDT 2026-04-18, note 14):
 *   - Fills the viewport (100dvh × 100vw, white background).
 *   - Apple system font stack.
 *   - Minimal chrome: just a `← Notes` back button + a fading save-status
 *     indicator. No page title, no Save button, no visible note URI.
 *
 * S.OptimisticCreate read-guard (VDT note 8):
 *   When the URL carries `?new=1`, the target resource is still being PUT in
 *   the background by `useTwinPodNoteCreate`, so we deliberately skip the
 *   initial `loadNote`. On the first successful save we `router.replace` to
 *   strip the flag so subsequent reloads follow the normal load path.
 *
 * Auto-save (S.OptimisticSave / VDT notes 9 + 10):
 *   Every edit schedules a debounced save 2s after the last keystroke. The
 *   `visibilitychange → hidden` event flushes synchronously so nothing is
 *   lost when the tab/window loses focus. Unmounting clears the debounce
 *   timer. `useTwinPodNoteSave` handles last-write-wins coalescing server-side.
 *   2s (not 1s) is deliberate: the real TwinPod server takes ~3s per write,
 *   so sub-2s debounce shows "Saving…" almost continuously while typing.
 *
 * URI state (URI State Standard — URI_STATE_01, URI_STATE_04):
 *   /app?app=NoteWorld&navigator=editor&target=<percent-encoded note URI>[&new=1]
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTwinPodNoteSave, useTwinPodNoteRead } from '@kaigilb/noteworld-notes'

const route = useRoute()
const router = useRouter()

// Debounce + status-fade tuning — kept as constants so tests can reason about
// them and a future UX tweak is a one-line change.
const SAVE_DEBOUNCE_MS = 2000
const STATUS_FADE_MS = 1500

// --- Route-derived state ---

const noteUri = computed(() => {
  const raw = route.query.target ?? null
  if (!raw) return null
  try { return decodeURIComponent(raw) } catch { return raw }
})

// `?new=1` tells us the create PUT is still in flight. Reading that resource
// now would 404 (or hit a stale hypergraph); the flag is stripped after the
// first successful save below.
const isNew = computed(() => route.query.new === '1')

// Plain-variable shadow of noteUri for use in onBeforeUnmount.
// Vue Router may tear down the route injection before onBeforeUnmount fires
// when the component is destroyed outside of normal navigation (e.g. direct
// wrapper.unmount() in tests, or some programmatic teardown paths), making
// noteUri.value null at that point. Tracking it here via watch ensures the
// most recent non-null URI is always available during unmount.
let lastKnownNoteUri = null
watch(noteUri, (val) => { if (val) lastKnownNoteUri = val }, { immediate: true })

// --- Note text + backing composables ---

const text = ref('')
const textareaEl = ref(null)
const { loading: readLoading, error: readError, loadNote } = useTwinPodNoteRead()
const { saving, saved, error: saveError, saveNote } = useTwinPodNoteSave()

// Set true for exactly one reactive tick after `loadNote` populates `text`
// so the watcher below doesn't treat the loaded content as a user edit and
// immediately echo it back as a save.
let suppressNextSave = false

async function loadCurrent() {
  if (!noteUri.value) return

  // S.OptimisticCreate: the create PUT is still in flight — textarea stays
  // empty so the user can start typing immediately. Just focus and return.
  if (isNew.value) {
    await nextTick()
    textareaEl.value?.focus()
    return
  }

  // Optimistic: show cached text immediately so the textarea isn't blank
  // during the TwinPod round-trip (~1-3s on the real pod). The preview
  // composable already fetched and cached the text when the home screen loaded,
  // so this is typically instant. The fresh server fetch settles behind the
  // scenes and only updates the textarea if the server value differs.
  try {
    const cached = localStorage.getItem('notetext:' + noteUri.value)
    if (cached) {
      suppressNextSave = true
      text.value = cached
    }
  } catch { /* ignore — localStorage unavailable in some browser contexts */ }

  // Focus before loadNote sets readLoading=true (which would disable the textarea).
  await nextTick()
  textareaEl.value?.focus()

  const value = await loadNote(noteUri.value)
  // Only assign if the value differs — avoids flicker when server matches cache,
  // and avoids leaving `suppressNextSave = true` when nothing actually changed
  // (which would swallow the user's first keystroke).
  if (value !== null && value !== text.value) {
    suppressNextSave = true
    text.value = value
  }
}

onMounted(loadCurrent)
watch(noteUri, loadCurrent)

// --- Auto-save (debounced) ---

let saveTimer = null

function scheduleSave() {
  if (!noteUri.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveNote(noteUri.value, text.value)
  }, SAVE_DEBOUNCE_MS)
}

function flushSave() {
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
  if (noteUri.value) saveNote(noteUri.value, text.value)
}

watch(text, () => {
  // Swallow the one change caused by loading server content into the textarea.
  if (suppressNextSave) { suppressNextSave = false; return }
  scheduleSave()
})

// --- Visibilitychange flush (VDT note 10) ---
//
// Browsers may terminate a hidden tab with in-flight work. If the user swipes
// away mid-edit we must send the pending save immediately rather than wait
// for the debounce timer — otherwise their last keystrokes disappear.

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') flushSave()
}

// --- Status indicator (fades out after save) ---

const statusText = ref('')
const statusVisible = ref(false)
let statusHideTimer = null

watch(saving, (isSaving) => {
  if (isSaving) {
    statusText.value = 'Saving…'
    statusVisible.value = true
    if (statusHideTimer) { clearTimeout(statusHideTimer); statusHideTimer = null }
  }
})

watch(saved, (didSave) => {
  if (!didSave) return
  statusText.value = 'Saved'
  statusVisible.value = true
  if (statusHideTimer) clearTimeout(statusHideTimer)
  statusHideTimer = setTimeout(() => { statusVisible.value = false }, STATUS_FADE_MS)

  // First successful save after an optimistic create: drop the `new` flag so
  // a reload (or a `noteUri` watch re-fire) goes through the normal read path.
  if (isNew.value) {
    const query = { ...route.query }
    delete query.new
    router.replace({ path: route.path, query })
  }
})

// --- Lifecycle wiring ---

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (statusHideTimer) { clearTimeout(statusHideTimer); statusHideTimer = null }
  document.removeEventListener('visibilitychange', onVisibilityChange)
  // Belt-and-suspenders stash: goHome() covers the ← Notes button path;
  // this covers browser-back and any other navigation away from the editor.
  // Uses lastKnownNoteUri (not noteUri.value) — the router binding may be
  // torn down before this hook fires in some environments. HomeView reads
  // and clears the stash on mount.
  if (lastKnownNoteUri) {
    try { localStorage.setItem('noteworld:pendingNote', lastKnownNoteUri) } catch { /* ignore */ }
    // Pre-seed the preview cache with the current textarea content so
    // useTwinPodNotePreviews can show the first line immediately — the PUT
    // that writes 'notetext:' completes ~3s after navigation, too late for
    // the initial render.
    if (text.value.trim()) {
      try { localStorage.setItem('notetext:' + lastKnownNoteUri, text.value) } catch { /* ignore */ }
    }
  }
})

// --- Navigation ---

function goHome() {
  // Flush any pending edit before leaving so the user never loses work by
  // tapping Back within the debounce window.
  flushSave()
  // Persist the note URI so HomeView can show it immediately even before
  // TwinPod's search index has caught up with the write.
  if (noteUri.value) {
    try { localStorage.setItem('noteworld:pendingNote', noteUri.value) } catch { /* ignore */ }
  }
  router.push({ path: '/' })
}
</script>

<template>
  <main
    class="editor-root"
    role="main"
    style="position: fixed; inset: 0; height: 100dvh; width: 100vw; background: var(--color-surface-white); display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;"
  >
    <header
      style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 1rem; border-bottom: 1px solid var(--color-border-subtle); flex-shrink: 0;"
    >
      <button
        @click="goHome"
        aria-label="Back to notes"
        style="cursor: pointer; min-height: 44px; padding: 0 0.75rem; background: transparent; border: none; color: var(--color-primary); font-size: 1rem; font-family: inherit;"
      >
        ← Notes
      </button>

      <!--
        Status indicator: role="status" + aria-live="polite" so screen readers
        announce "Saving…" / "Saved" without stealing focus. Opacity (not v-if)
        for the fade-out so the element stays in the DOM while fading.
      -->
      <span
        role="status"
        aria-live="polite"
        :style="{
          opacity: statusVisible ? 1 : 0,
          transition: 'opacity 0.4s ease-out',
          color: 'var(--color-text-muted)',
          fontSize: '0.875rem',
          minWidth: '4rem',
          textAlign: 'right'
        }"
      >
        {{ statusText }}
      </span>
    </header>

    <!-- Visually hidden label preserves the form-control / label association
         (WCAG 1.3.1) without adding chrome the Apple Notes UX doesn't have. -->
    <label
      for="note-content"
      style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;"
    >
      Note content
    </label>

    <textarea
      id="note-content"
      ref="textareaEl"
      v-model="text"
      aria-label="Note content"
      placeholder="Start writing…"
      style="flex: 1 1 auto; width: 100%; border: none; outline: none; resize: none; padding: 1rem; box-sizing: border-box; font-family: inherit; font-size: 1rem; line-height: 1.5; color: var(--color-text-primary); background: transparent;"
    ></textarea>

    <p
      v-if="readError && readError.type !== 'not-found'"
      role="alert"
      style="color: var(--color-error-dark); margin: 0; padding: 0.5rem 1rem; background: var(--color-error-light); border-top: 1px solid var(--color-connection-blocked-border);"
    >
      {{ readError.message }}
    </p>
    <p
      v-if="saveError"
      role="alert"
      style="color: var(--color-error-dark); margin: 0; padding: 0.5rem 1rem; background: var(--color-error-light); border-top: 1px solid var(--color-connection-blocked-border);"
    >
      {{ saveError.message }}
    </p>
  </main>
</template>
