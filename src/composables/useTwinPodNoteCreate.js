// UNIT_TYPE=Hook

/**
 * Creates a new note resource in a TwinPod LWS container.
 *
 * Uses HTTP POST per the LWS/Solid protocol to create an empty text resource in the
 * given container. The server assigns the new resource URI and returns it in the
 * Location response header.
 *
 * @param {Function} twinpodFetch - Authenticated fetch function from App.vue inject('twinpodFetch').
 *                                   Must be the DPoP-bound session.fetch wrapper.
 *
 * @returns {{
 *   noteUri: import('vue').Ref<string|null>,
 *   loading: import('vue').Ref<boolean>,
 *   error:   import('vue').Ref<{type: string, message: string, status?: number}|null>,
 *   createNote: (containerUrl: string) => Promise<string|null>
 * }}
 *
 * Preconditions: twinpodFetch must be an authenticated DPoP-bound fetch function.
 * Errors: exposes error.value with type 'network', 'http', 'missing-location', or 'invalid-input'.
 *
 * @example
 * const twinpodFetch = inject('twinpodFetch')
 * const { noteUri, loading, error, createNote } = useTwinPodNoteCreate(twinpodFetch)
 * const uri = await createNote('https://pod.example.com/notes/')
 * if (uri) router.push({ path: '/app', query: { app: 'NoteWorld', navigator: 'editor', target: encodeURIComponent(uri) } })
 */

import { ref } from 'vue'

export function useTwinPodNoteCreate(twinpodFetch) {

  // --- Reactive state ---

  const noteUri = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // --- createNote ---

  /**
   * Creates an empty LWS resource in the given container, intended to be typed as neo:a_note.
   *
   * NOTE: The neo:a_note type declaration (SIO_000614 pattern) is not written in this call.
   * The TwinPod RDF write API pattern (N3 Patch or PUT-to-meta) is documented as a placeholder
   * in the TwinPod/LWS Standard (Ontology Map Gap 3). The type declaration will be added in
   * a future increment once the write pattern is confirmed.
   *
   * @param {string} containerUrl - Absolute TwinPod container URI (must end with '/').
   *                                 Example: 'https://tst-first.demo.systemtwin.com/notes/'
   * @returns {Promise<string|null>} The new note's absolute URI on success, or null on failure.
   *                                  On failure, error.value is set with the reason.
   */
  async function createNote(containerUrl) {
    // Spec: F.Create_Note — Success-Criteria: A new empty note is open and ready for text input

    // --- Validate input ---

    if (!containerUrl) {
      error.value = { type: 'invalid-input', message: 'containerUrl is required' }
      return null
    }

    loading.value = true
    error.value = null

    try {

      // --- POST to LWS container ---

      // POST per LWS protocol (https://solidproject.org/TR/protocol).
      // Content-Type: text/plain creates a raw text resource for the note body.
      // The server assigns a URI for the new resource and returns it in the Location header.
      const response = await twinpodFetch(containerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: ''
      })

      // --- Handle HTTP errors ---

      if (!response.ok) {
        error.value = { type: 'http', status: response.status, message: `HTTP ${response.status}` }
        return null
      }

      // --- Extract new resource URI ---

      // LWS returns the new resource URI in the Location header after a successful POST.
      const location = response.headers.get('Location')

      if (!location) {
        // Some LWS implementations return a relative URI; others return an absolute URI.
        // If Location is missing entirely, the pod cannot be used for note creation.
        error.value = { type: 'missing-location', message: 'TwinPod did not return a Location header' }
        return null
      }

      // Location may be relative (e.g. '/notes/abc123') — resolve against containerUrl
      // to guarantee the stored value is always an absolute URI.
      const absoluteUri = new URL(location, containerUrl).href

      noteUri.value = absoluteUri
      return absoluteUri

    } catch (e) {
      error.value = { type: 'network', message: e.message }
      return null
    } finally {
      loading.value = false
    }
  }

  // --- Expose ---

  return { noteUri, loading, error, createNote }
}
