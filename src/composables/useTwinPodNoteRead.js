// UNIT_TYPE=Hook

/**
 * Reads a note's current text from its Solid resource on TwinPod.
 *
 * Contract: `getSolidDataset` → `getThing` → `getStringNoLocaleAll(schema:text)`
 * → take the last value (TwinPod serialises historical values in temporal order;
 * the current value is the last one). Returns an empty string if the predicate
 * is absent (freshly-created notes have `schema:text " "` set by useTwinPodNoteCreate).
 *
 * @param {Function} solidFetch - Authenticated Solid-style fetch.
 * @param {object} [options]
 * @param {string} [options.predicateUri] - Predicate to read. Defaults to
 *   `http://schema.org/text`.
 *
 * @returns {{
 *   text:    import('vue').Ref<string|null>,
 *   loading: import('vue').Ref<boolean>,
 *   error:   import('vue').Ref<{type: string, message: string, status?: number}|null>,
 *   loadNote: (noteResourceUrl: string) => Promise<string|null>
 * }}
 */

import { ref } from 'vue'
import {
  getSolidDataset,
  getThing,
  getStringNoLocaleAll
} from '@kaigilb/twinpod-client/write'

const DEFAULT_TEXT_PREDICATE = 'http://schema.org/text'

export function useTwinPodNoteRead(solidFetch, { predicateUri = DEFAULT_TEXT_PREDICATE } = {}) {
  const text = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function loadNote(noteResourceUrl) {
    if (!noteResourceUrl) {
      error.value = { type: 'invalid-input', message: 'noteResourceUrl is required' }
      return null
    }

    text.value = null
    loading.value = true
    error.value = null

    const thingUrl = `${noteResourceUrl}#note`
    const fetchOpts = { fetch: solidFetch }

    try {
      const dataset = await getSolidDataset(noteResourceUrl, fetchOpts)
      const thing = getThing(dataset, thingUrl)
      if (!thing) {
        error.value = { type: 'not-found', message: `Note thing ${thingUrl} missing` }
        return null
      }
      // TwinPod preserves state history by design — writes end the old state and
      // begin a new one rather than overwriting. The Solid projection surfaces
      // every historical value on the predicate, serialised in temporal order,
      // so the current value is the last one.
      const values = getStringNoLocaleAll(thing, predicateUri)
      const value = values.length > 0 ? values[values.length - 1] : ''
      text.value = value
      return value
    } catch (e) {
      if (e && typeof e.statusCode === 'number') {
        error.value = { type: 'http', status: e.statusCode, message: e.message }
      } else {
        error.value = { type: 'network', message: e?.message || String(e) }
      }
      return null
    } finally {
      loading.value = false
    }
  }

  return { text, loading, error, loadNote }
}
