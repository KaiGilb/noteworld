// UNIT_TYPE=Hook

/**
 * Lists notes in a TwinPod pod by RDF type, using pod-local concept search.
 *
 * Discovery is type-driven, not location-driven. We never list a container,
 * never filter by URI path, never assume notes live under `/t/` (or any
 * other path). A note is anything the pod's rdfStore types as either
 * `schema:Note` (what NoteWorld writes) or `neo:a_note` (Neo-shaped notes
 * from other tooling or TwinPod reifications).
 *
 * How notes get into the store:
 *   `ur.searchAndGetURIs(podRoot, concept, ...)` GETs
 *   `{podRoot}/search/{concept}?language=…&rows=…&start=…`, gets Turtle
 *   back, and parses it into the shared `ur.rdfStore`. We then run
 *   `rdfStore.match(null, rdf:type, <note-type>)` to pull the subjects we
 *   care about.
 *
 * Why multiple concept terms (5.1.3):
 *   TwinPod's search endpoint is a per-pod concept resolver backed by that
 *   pod's Neo ontology map. Concept names are not portable — the same
 *   logical "note" lands under different English labels on different pods.
 *   Observed 2026-04-18:
 *     - `tst-first.demo.systemtwin.com/search/note`  → 200, returns notes
 *     - `tst-ia2.demo.systemtwin.com/search/note`    → 200, empty body
 *     - `tst-ia2.demo.systemtwin.com/search/notes`   → 200, returns notes
 *   Rather than guess one, we query every term in `concepts` in parallel,
 *   let each result parse into the shared store, then run ONE type match
 *   across the union. Default `['note', 'notes']` covers the English
 *   singular/plural split. Callers that own their own ontology map can
 *   override via the `concepts` option.
 *
 * Why no container listing:
 *   Earlier iterations (5.0.0, 5.1.3-draft) paired search with an LDP
 *   listing of `{pod}/t/`. That violated "discovery is about types and
 *   attributes, not container locations":
 *     - Baked the current interim `/t/` ACL workaround into the package.
 *     - Filtered by URI prefix (`/t/t_note_`), excluding notes written
 *       by any tool that mints under a different path.
 *     - Required a second HTTP round-trip on every search.
 *   If search fails to surface a note that exists in the pod, the fix is
 *   to add the missing concept name to `concepts`, not to crawl a path.
 *
 * Error model:
 *   Each concept query is attempted independently (`Promise.allSettled`).
 *   A failure in one does not poison the others. `error` is set only if
 *   EVERY query fails. An empty-body 200 is legitimate (the pod genuinely
 *   has no notes under that concept), not an error.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.concepts=['note','notes']]
 *   Concept names to query against `{podRoot}/search/{concept}`. Queried in
 *   parallel; results unioned by RDF type. Callers building other vocab
 *   (e.g. `['task','tasks']`, `['idea','ideas']`) can override.
 *
 * @returns {{
 *   notes:   import('vue').Ref<Array<{ uri: string }>>,
 *   loading: import('vue').Ref<boolean>,
 *   error:   import('vue').Ref<{type: string, message: string}|null>,
 *   searchNotes: (podRoot: string) => Promise<Array<{ uri: string }>>
 * }}
 *
 * Error types: 'invalid-input', 'search-error', 'network'.
 */

import { ref } from 'vue'
import { ur } from '@kaigilb/twinpod-client'

const DEFAULT_CONCEPTS = ['note', 'notes']

export function useTwinPodNoteSearch(opts = {}) {
  const concepts = Array.isArray(opts.concepts) && opts.concepts.length > 0
    ? opts.concepts
    : DEFAULT_CONCEPTS

  const notes = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Treats a settled Promise result as "failed" if it rejected, or the
  // resolved value carries an error shape / HTTP >= 400. An empty 200
  // (no hits under that concept) is NOT a failure — it's just nothing.
  function isFailedResult(r) {
    if (r.status === 'rejected') return true
    const v = r.value
    if (v?.error) return true
    if (typeof v?.status === 'number' && v.status >= 400) return true
    return false
  }

  async function searchNotes(podRoot) {
    if (!podRoot) {
      error.value = { type: 'invalid-input', message: 'podRoot is required' }
      return []
    }

    loading.value = true
    error.value = null

    const root = podRoot.endsWith('/') ? podRoot.slice(0, -1) : podRoot

    try {
      // Fire one request per concept in parallel. Each call parses its
      // Turtle response into the shared `ur.rdfStore`; by the time all
      // settle, the store contains every note the pod surfaced under any
      // of our concept terms.
      const results = await Promise.allSettled(
        concepts.map(concept =>
          ur.searchAndGetURIs(root, concept, {
            force: true, lang: 'en', rows: 100, start: 0
          })
        )
      )

      // Only error if EVERY concept query failed. A partial success
      // (some concept returned notes, another 500'd) is still a success —
      // we keep what we got.
      if (results.every(isFailedResult)) {
        error.value = {
          type: 'search-error',
          message: 'All concept searches failed'
        }
        notes.value = []
        return []
      }

      // ONE type match across the store after all queries have populated
      // it. Matches EITHER `schema:Note` (what NoteWorld writes) OR
      // `neo:a_note` (Neo-shaped notes from other tooling). Restricting
      // to these two types keeps unrelated 'note'/'notes'-keyword hits
      // (e.g. a Person whose description mentions "notes") from leaking in.
      const schemaHits = ur.rdfStore
        .match(null, ur.NS.RDF('type'), ur.NS.SCHEMA('Note'))
        .map(st => st.subject.value)
      const neoHits = ur.rdfStore
        .match(null, ur.NS.RDF('type'), ur.NS.NEO('a_note'))
        .map(st => st.subject.value)

      // Union + dedup by URI. A note typed both ways (TwinPod reification
      // alongside a schema:Note assertion) must appear exactly once.
      const seen = new Set()
      const deduped = []
      for (const uri of [...schemaHits, ...neoHits]) {
        if (!seen.has(uri)) { seen.add(uri); deduped.push({ uri }) }
      }

      notes.value = deduped
      return deduped
    } catch (e) {
      // This catches anything thrown by `Promise.allSettled` or the type
      // match itself; per-query rejections are already absorbed as
      // 'rejected' settlements above.
      error.value = { type: 'network', message: e?.message || String(e) }
      notes.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  return { notes, loading, error, searchNotes }
}
