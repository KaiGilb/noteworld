// UNIT_TYPE=Hook

/**
 * Persists a note's text to its existing TwinPod resource using the Stack B
 * rdflib Turtle pipeline.
 *
 * Pipeline: build triples in a temp $rdf.graph() → storeToTurtle → modifyTurtle
 * → uploadTurtleToResource (PATCH text/turtle to the existing resource URI).
 *
 * Rebuilds the full note Turtle (rdf:type + predicate) and PATCHes it,
 * matching the Stack B creation pattern from useTwinPodNoteCreate.
 *
 * @param {Function} solidFetch - Authenticated Solid-style fetch.
 * @param {object} [options]
 * @param {string} [options.predicateUri='http://schema.org/text'] - Predicate for the note body.
 * @param {string} [options.typeUri='http://schema.org/Note'] - RDF type for the Note.
 *
 * @returns {{
 *   saving: import('vue').Ref<boolean>,
 *   saved:  import('vue').Ref<boolean>,
 *   error:  import('vue').Ref<{type: string, message: string, status?: number}|null>,
 *   saveNote: (noteResourceUrl: string, text: string) => Promise<boolean>
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

const DEFAULT_TEXT_PREDICATE = 'http://schema.org/text'
const DEFAULT_TYPE_URI = 'http://schema.org/Note'

export function useTwinPodNoteSave(solidFetch, { predicateUri = DEFAULT_TEXT_PREDICATE, typeUri = DEFAULT_TYPE_URI } = {}) {
  const saving = ref(false)
  const saved = ref(false)
  const error = ref(null)

  async function saveNote(noteResourceUrl, text) {
    if (!noteResourceUrl) {
      error.value = { type: 'invalid-input', message: 'noteResourceUrl is required' }
      return false
    }
    if (typeof text !== 'string') {
      error.value = { type: 'invalid-input', message: 'text must be a string' }
      return false
    }

    saving.value = true
    saved.value = false
    error.value = null

    try {
      // Step 1 — Blank node for the note subject
      const { node: noteBlank } = getBlankNode($rdf, 'Save: ' + noteResourceUrl)

      // Step 2 — Build triples in a temp store
      const tempStore = $rdf.graph()
      const add = (s, p, o) => tempStore.add(s, p, o, $rdf.defaultGraph())

      add(noteBlank, NS.RDF('type'), $rdf.sym(typeUri))
      add(noteBlank, $rdf.sym(predicateUri), $rdf.literal(text))

      // Step 3 — Serialize and clean
      let turtle = storeToTurtle($rdf, tempStore, '')
      turtle = modifyTurtle(turtle)

      // Step 4 — PATCH to TwinPod
      const result = await uploadTurtleToResource(solidFetch, noteResourceUrl, turtle, { returnResponse: true })

      if (!result.ok) {
        error.value = { type: 'http', status: result.status, message: `Save failed with HTTP ${result.status}` }
        return false
      }

      saved.value = true
      return true
    } catch (e) {
      error.value = { type: 'network', message: e?.message || String(e) }
      return false
    } finally {
      saving.value = false
    }
  }

  return { saving, saved, error, saveNote }
}
