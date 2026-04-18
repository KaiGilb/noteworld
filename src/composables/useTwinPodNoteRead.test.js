// UNIT_TYPE=Hook
//
// Tests for useTwinPodNoteRead. The composable reads a note's current text
// from TwinPod by calling `window.solid.session.fetch` directly (NOT
// `ur.fetchAndSaveTurtle`) — see memory note `project_twinpod_read_pattern`:
// the TwinPod GET with the hypergraph header returns the full pod knowledge
// graph, so we use `session.fetch` to get the actual resource Turtle.
//
// The parsed Turtle is loaded into a temp rdflib graph, then queried for all
// statements with the configured text predicate. TwinPod preserves state
// history, so the CURRENT value is the last statement in serialisation order.
// Whitespace-only values fall back to a localStorage cache keyed by URI — that
// cache is how an optimistic-create new note still shows content after an
// immediate reload before the server has observed the first save.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// Hoisted mocks so `vi.mock` can reference them (factory runs before imports).
const { mockSessionFetch, mockGraph, mockParse, mockSym, mockStore } = vi.hoisted(() => {
  // Each call to `ur.$rdf.graph()` returns a fresh object that carries its own
  // `statementsMatching` spy — lets tests decide what a query returns per-run.
  const makeStore = () => ({
    statementsMatching: vi.fn().mockReturnValue([])
  })
  const store = { current: makeStore() }
  return {
    mockSessionFetch: vi.fn(),
    mockGraph: vi.fn(() => store.current),
    mockParse: vi.fn(),
    mockSym: vi.fn((val) => ({ value: val, termType: 'NamedNode' })),
    mockStore: store
  }
})

vi.mock('@kaigilb/twinpod-client', () => ({
  ur: {
    $rdf: {
      graph: (...args) => mockGraph(...args),
      parse: (...args) => mockParse(...args),
      sym: (...args) => mockSym(...args)
    }
  }
}))

import { useTwinPodNoteRead } from './useTwinPodNoteRead.js'

const POD = 'https://tst-first.demo.systemtwin.com'
const NOTE_URL = `${POD}/t/t_note_123_abcd`
const DEFAULT_PRED = 'http://schema.org/text'
const GMX_PRED = 'http://graphmetrix.com/node#m_text'

function makeStatement(value) {
  return { object: { value } }
}

// Minimal Response shim matching what the source reads: `ok`, `status`, `text()`.
function makeResponse({ ok = true, status = 200, turtle = '' } = {}) {
  return {
    ok,
    status,
    text: async () => turtle
  }
}

// Default: happy-path fetch returns empty turtle; tempGraph returns one
// statement with the configured text predicate (value = 'loaded text') and
// nothing for the GMX predicate.
function installDefaultHappyPath() {
  mockSessionFetch.mockReset()
  mockSessionFetch.mockResolvedValue(makeResponse({ turtle: '<>.' }))

  mockStore.current = {
    statementsMatching: vi.fn((_s, predObj) => {
      if (predObj?.value === DEFAULT_PRED) return [makeStatement('loaded text')]
      return []
    })
  }
}

beforeEach(() => {
  // Source calls window.solid.session.fetch — install a controllable stub.
  if (!globalThis.window) globalThis.window = {}
  window.solid = { session: { fetch: (...args) => mockSessionFetch(...args) } }

  // localStorage is available via jsdom; clear between tests so cache hits are
  // intentional per test.
  try { localStorage.clear() } catch { /* ignore */ }

  mockGraph.mockClear()
  mockParse.mockClear()
  mockSym.mockClear()
  installDefaultHappyPath()
})

afterEach(() => {
  delete window.solid
})

describe('useTwinPodNoteRead — initial state', () => {
  test('text starts null', () => {
    const { text } = useTwinPodNoteRead()
    expect(text.value).toBeNull()
  })
  test('loading starts false', () => {
    const { loading } = useTwinPodNoteRead()
    expect(loading.value).toBe(false)
  })
  test('error starts null', () => {
    const { error } = useTwinPodNoteRead()
    expect(error.value).toBeNull()
  })
})

describe('useTwinPodNoteRead — success', () => {
  // Spec: F.Edit_Note — loads resource via direct session.fetch with Accept + no-cache headers.
  // Memory (project_twinpod_read_pattern): bypasses TwinPod's hypergraph header path.
  test('calls window.solid.session.fetch with the resource URL', async () => {
    const { loadNote } = useTwinPodNoteRead()
    await loadNote(NOTE_URL)
    expect(mockSessionFetch).toHaveBeenCalledTimes(1)
    expect(mockSessionFetch.mock.calls[0][0]).toBe(NOTE_URL)
    const init = mockSessionFetch.mock.calls[0][1]
    expect(init.headers.Accept).toBe('text/turtle')
    expect(init.headers['Cache-Control']).toBe('max-age=0')
  })

  // Spec: F.Edit_Note — current text is the last statement in temporal serialisation order.
  test('returns the last statement value from the temp graph query', async () => {
    const { loadNote } = useTwinPodNoteRead()
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('loaded text')
  })

  // Spec: F.Edit_Note — predicateUri option overrides the default schema:text
  test('queries with a custom predicateUri when provided', async () => {
    mockStore.current = {
      statementsMatching: vi.fn((_s, predObj) => {
        if (predObj?.value === 'https://example.com/p') return [makeStatement('custom')]
        return []
      })
    }
    const { loadNote } = useTwinPodNoteRead({ predicateUri: 'https://example.com/p' })
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('custom')
    expect(mockSym).toHaveBeenCalledWith('https://example.com/p')
  })

  // Spec: F.Edit_Note — text ref reflects the loaded note content
  test('updates the text ref after success', async () => {
    const { text, loadNote } = useTwinPodNoteRead()
    await loadNote(NOTE_URL)
    expect(text.value).toBe('loaded text')
  })

  // Spec: F.Edit_Note — returns empty string when no text predicate exists on the resource
  test('returns empty string when no statements are found', async () => {
    mockStore.current = { statementsMatching: vi.fn().mockReturnValue([]) }
    const { loadNote, text } = useTwinPodNoteRead()
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('')
    expect(text.value).toBe('')
  })

  // Spec: F.Edit_Note — TwinPod state history: multiple values present, current is the last one
  test('returns the last value when multiple statements exist (TwinPod state history)', async () => {
    mockStore.current = {
      statementsMatching: vi.fn((_s, predObj) => {
        if (predObj?.value === DEFAULT_PRED) {
          return [makeStatement(' '), makeStatement('first edit'), makeStatement('latest edit')]
        }
        return []
      })
    }
    const { loadNote } = useTwinPodNoteRead()
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('latest edit')
  })

  // Legacy Graphmetrix predicate co-existence: statements for the GMX predicate
  // concat after the schema:text results; last overall wins.
  test('includes statements from the legacy GMX predicate when present', async () => {
    mockStore.current = {
      statementsMatching: vi.fn((_s, predObj) => {
        if (predObj?.value === DEFAULT_PRED) return [makeStatement('schema text')]
        if (predObj?.value === GMX_PRED) return [makeStatement('gmx text')]
        return []
      })
    }
    const { loadNote } = useTwinPodNoteRead()
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('gmx text')
  })
})

describe('useTwinPodNoteRead — state history edge cases', () => {
  // TwinPod never overwrites: after many edits a note carries N historical values
  // in document order. The read path must always pick the LAST value.
  test('ignores the single-space placeholder when later edits exist', async () => {
    mockStore.current = {
      statementsMatching: vi.fn((_s, predObj) => {
        if (predObj?.value === DEFAULT_PRED) return [makeStatement(' '), makeStatement('real content')]
        return []
      })
    }
    const { loadNote } = useTwinPodNoteRead()
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('real content')
  })

  // Spec: F.Edit_Note — fresh note carries a ' ' placeholder. When the localStorage
  // cache is unavailable (opaque-origin jsdom throws SecurityError; the source's
  // try/catch swallows it) the placeholder is surfaced as-is so the editor gets
  // the raw value from TwinPod rather than silently losing it.
  test('returns the whitespace placeholder when localStorage fallback is unavailable', async () => {
    mockStore.current = {
      statementsMatching: vi.fn((_s, predObj) => {
        if (predObj?.value === DEFAULT_PRED) return [makeStatement(' ')]
        return []
      })
    }
    const { loadNote, text } = useTwinPodNoteRead()
    const value = await loadNote(NOTE_URL)
    expect(value).toBe(' ')
    expect(text.value).toBe(' ')
  })

  test('handles a long history without throwing (10 historical values)', async () => {
    const history = Array.from({ length: 10 }, (_, i) => makeStatement(`edit ${i}`))
    mockStore.current = {
      statementsMatching: vi.fn((_s, predObj) => {
        if (predObj?.value === DEFAULT_PRED) return history
        return []
      })
    }
    const { loadNote } = useTwinPodNoteRead()
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('edit 9')
  })

  // The source includes a localStorage fallback: when TwinPod returns only
  // whitespace (e.g. a brand-new note whose create PUT has not yet been
  // saved-over), the cached text written by useTwinPodNoteSave would be
  // served. This cannot be exercised in the package's jsdom test environment
  // (opaque origin → localStorage access throws SecurityError) so the cache
  // hit is verified end-to-end in the app's E2E suite instead.
})

describe('useTwinPodNoteRead — input validation', () => {
  test('returns null and sets error when noteResourceUrl is empty', async () => {
    const { error, loadNote } = useTwinPodNoteRead()
    const value = await loadNote('')
    expect(value).toBeNull()
    expect(error.value?.type).toBe('invalid-input')
    expect(mockSessionFetch).not.toHaveBeenCalled()
  })

  test('returns null and sets error when noteResourceUrl is null', async () => {
    const { error, loadNote } = useTwinPodNoteRead()
    const value = await loadNote(null)
    expect(value).toBeNull()
    expect(error.value?.type).toBe('invalid-input')
    expect(mockSessionFetch).not.toHaveBeenCalled()
  })
})

describe('useTwinPodNoteRead — not found', () => {
  test('sets error.type to not-found when session.fetch returns 404', async () => {
    mockSessionFetch.mockResolvedValueOnce(makeResponse({ ok: false, status: 404 }))
    const { error, loadNote } = useTwinPodNoteRead()
    const value = await loadNote(NOTE_URL)
    expect(value).toBeNull()
    expect(error.value?.type).toBe('not-found')
  })
})

describe('useTwinPodNoteRead — HTTP error', () => {
  test('sets error.type to http on non-ok non-404 response', async () => {
    mockSessionFetch.mockResolvedValueOnce(makeResponse({ ok: false, status: 403 }))
    const { error, loadNote } = useTwinPodNoteRead()
    await loadNote(NOTE_URL)
    expect(error.value?.type).toBe('http')
    expect(error.value?.status).toBe(403)
  })

  test('sets error.type to network when fetch rejects', async () => {
    mockSessionFetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    const { error, loadNote } = useTwinPodNoteRead()
    await loadNote(NOTE_URL)
    expect(error.value?.type).toBe('network')
  })

  test('loading is false after error', async () => {
    mockSessionFetch.mockRejectedValueOnce(new Error('boom'))
    const { loading, loadNote } = useTwinPodNoteRead()
    await loadNote(NOTE_URL)
    expect(loading.value).toBe(false)
  })
})

describe('useTwinPodNoteRead — loading transition', () => {
  test('loading is true while session.fetch is in progress', async () => {
    let resolveFetch
    mockSessionFetch.mockImplementationOnce(() => new Promise(r => {
      resolveFetch = () => r(makeResponse({ turtle: '<>.' }))
    }))
    const { loading, loadNote } = useTwinPodNoteRead()
    const promise = loadNote(NOTE_URL)
    expect(loading.value).toBe(true)
    resolveFetch()
    await promise
    expect(loading.value).toBe(false)
  })
})
