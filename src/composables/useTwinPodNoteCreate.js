// UNIT_TYPE=Hook

/**
 * Creates a new note on TwinPod using the Stack B rdflib Turtle pipeline.
 *
 * Pipeline: build triples in a temp $rdf.graph() → storeToTurtle → modifyTurtle
 * → uploadTurtleToResource (PUT text/turtle to create the target resource).
 *
 * The resource URI is client-minted as `{podRoot}/t/t_note_{ts}_{rand4}`.
 * A blank node subject (`_:tN`) carries `rdf:type schema:Note` and
 * `schema:text " "` (single-space placeholder — empty literals cause Neo
 * shape-validation 422s; the body is replaced by the save composable).
 *
 * @param {Function} solidFetch - Authenticated Solid-style fetch (no Neo pagination).
 *   Built via `createSolidFetch({ fetch: session.fetch.bind(session) })` in the app.
 * @param {object} [options]
 * @param {string} [options.typeUri='http://schema.org/Note'] - RDF type for the Note.
 *
 * @returns {{
 *   noteUri: import('vue').Ref<string|null>,  // the resource URL
 *   loading: import('vue').Ref<boolean>,
 *   error:   import('vue').Ref<{type: string, message: string, status?: number}|null>,
 *   createNote: (podBaseUrl: string) => Promise<string|null>
 * }}
 *
 * Error types: 'invalid-input', 'http', 'network'.
 */

import { ref } from 'vue'
import {
  $rdf, NS,
  getBlankNode,
  storeToTurtle,
  modifyTurtle,
  uploadTurtleToResource
} from '@kaigilb/twinpod-client'

const DEFAULT_TYPE_URI = 'http://schema.org/Note'
const INITIAL_TEXT = ' '

function mintResourceId() {
  const rand = Math.random().toString(36).slice(2, 6)
  return `t_note_${Date.now()}_${rand}`
}

export function useTwinPodNoteCreate(solidFetch, { typeUri = DEFAULT_TYPE_URI } = {}) {
  const noteUri = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function createNote(podBaseUrl) {
    if (!podBaseUrl) {
      error.value = { type: 'invalid-input', message: 'podBaseUrl is required' }
      return null
    }

    noteUri.value = null
    loading.value = true
    error.value = null

    const root = podBaseUrl.endsWith('/') ? podBaseUrl.slice(0, -1) : podBaseUrl
    const resourceId = mintResourceId()
    const resourceUrl = `${root}/t/${resourceId}`

    try {
      // Step 1 — Blank node for the note subject
      const { node: noteBlank } = getBlankNode($rdf, 'Note: ' + resourceId)

      // Step 2 — Build triples in a temp store
      const tempStore = $rdf.graph()
      const add = (s, p, o) => tempStore.add(s, p, o, $rdf.defaultGraph())

      add(noteBlank, NS.RDF('type'), $rdf.sym(typeUri))
      add(noteBlank, NS.SCHEMA('text'), $rdf.literal(INITIAL_TEXT))

      // Step 3 — Serialize and clean
      let turtle = storeToTurtle($rdf, tempStore, '')
      turtle = modifyTurtle(turtle)

      // Step 4 — PUT to TwinPod (PUT creates new resources; PATCH modifies existing)
      const result = await uploadTurtleToResource(solidFetch, resourceUrl, turtle, { method: 'PUT', returnResponse: true })

      if (!result.ok) {
        error.value = { type: 'http', status: result.status, message: `Create failed with HTTP ${result.status}` }
        return null
      }

      noteUri.value = resourceUrl
      return resourceUrl
    } catch (e) {
      error.value = { type: 'network', message: e?.message || String(e) }
      return null
    } finally {
      loading.value = false
    }
  }

  return { noteUri, loading, error, createNote }
}
