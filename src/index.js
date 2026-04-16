// UNIT_TYPE=Feature

/**
 * @package @kaigilb/noteworld-notes
 * @description Vue composables for creating, saving, and reading notes in a TwinPod pod.
 *
 * Public API (4.x — Stack B / Solid container model):
 * - useTwinPodNoteCreate — creates a Solid resource under {podRoot}/t/ with schema:Note
 * - useTwinPodNoteSave   — persists note text (schema:text) to an existing note resource
 * - useTwinPodNoteRead   — reads note text from an existing note resource
 * - useTwinPodNoteSearch — searches for notes via the TwinPod pod-local search API
 *
 * All composables accept a `solidFetch` — build with `createSolidFetch({ fetch })` from
 * @kaigilb/twinpod-client, NOT the Neo-paginating `createHyperFetch`.
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

export { useTwinPodNoteCreate } from './composables/useTwinPodNoteCreate.js'
export { useTwinPodNoteSave } from './composables/useTwinPodNoteSave.js'
export { useTwinPodNoteRead } from './composables/useTwinPodNoteRead.js'
export { useTwinPodNoteSearch } from './composables/useTwinPodNoteSearch.js'
