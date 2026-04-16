// UNIT_TYPE=Hook

/**
 * Searches for notes in a TwinPod pod via the pod-local search API.
 *
 * Uses `searchAndGetURIs` from `@kaigilb/twinpod-client` (ported from
 * /Users/kaigilb/Developer/twin/src/app/twin/src/app/libs/util.js).
 * The search result Turtle is auto-parsed into `rdfStore` by the package;
 * this composable then extracts matching note URIs from the store.
 *
 * @param {Function} solidFetch - Authenticated Solid-style fetch.
 * @param {object} [options]
 * @param {string} [options.conceptName='note'] - Search term passed to the TwinPod search endpoint.
 * @param {string} [options.lang='en'] - Language for the search.
 *
 * @returns {{
 *   notes:   import('vue').Ref<Array<{ uri: string }>>,
 *   loading: import('vue').Ref<boolean>,
 *   error:   import('vue').Ref<{type: string, message: string}|null>,
 *   searchNotes: (podRoot: string, opts?: { force?: boolean, rows?: number }) => Promise<Array<{ uri: string }>>
 * }}
 */

import { ref } from 'vue'
import { searchAndGetURIs, rdfStore, NS } from '@kaigilb/twinpod-client'

export function useTwinPodNoteSearch(solidFetch, { conceptName = 'note', lang = 'en' } = {}) {
  const notes = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function searchNotes(podRoot, { force = false, rows = 50 } = {}) {
    if (!podRoot) {
      error.value = { type: 'invalid-input', message: 'podRoot is required' }
      return []
    }

    loading.value = true
    error.value = null

    try {
      const result = await searchAndGetURIs(solidFetch, podRoot, conceptName, {
        force,
        lang,
        rows,
        start: 0
      })

      if (result.error) {
        error.value = { type: 'search-error', message: 'Search returned an error' }
        notes.value = []
        return []
      }

      if (result.status && result.status >= 400) {
        error.value = { type: 'search-error', message: `Search failed with HTTP ${result.status}` }
        notes.value = []
        return []
      }

      // Extract note URIs from rdfStore — searchAndGetURIs auto-parsed the Turtle
      const noteUris = rdfStore
        .match(null, NS.RDF('type'), NS.NEO('a_note'))
        .map(st => ({ uri: st.subject.value }))

      notes.value = noteUris
      return noteUris
    } catch (e) {
      error.value = { type: 'network', message: e?.message || String(e) }
      notes.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  return { notes, loading, error, searchNotes }
}
