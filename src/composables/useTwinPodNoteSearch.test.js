// UNIT_TYPE=Hook
//
// Tests for useTwinPodNoteSearch (5.1.3 — type-driven, multi-concept search).
//
// Design under test:
//   - Fires one ur.searchAndGetURIs call per concept term in `concepts`
//     (default ['note', 'notes']) in parallel via Promise.allSettled.
//   - All responses parse into the shared ur.rdfStore. We then run ONE
//     type match across the union: schema:Note ∪ neo:a_note.
//   - Error ('search-error') is set only when EVERY concept query fails.
//   - Discovery is type-driven; there is NO container listing, NO URI-path
//     filter, NO assumption that notes live under `/t/`. Adding new pods
//     that label the concept differently (e.g. 'notes' plural on tst-ia2)
//     is handled by expanding `concepts`, not by crawling a container.

import { describe, test, expect, vi, beforeEach } from 'vitest'

const { mockSearchAndGetURIs, mockMatch, mockHyperFetch } = vi.hoisted(() => ({
  mockSearchAndGetURIs: vi.fn(),
  mockMatch: vi.fn(),
  // Included solely as a regression guard: if a future refactor silently
  // reintroduces a container listing via ur.hyperFetch, these tests must
  // detect it so we don't backslide into location-based discovery.
  mockHyperFetch: vi.fn()
}))

vi.mock('@kaigilb/twinpod-client', () => ({
  ur: {
    searchAndGetURIs: (...args) => mockSearchAndGetURIs(...args),
    rdfStore: { match: (...args) => mockMatch(...args) },
    hyperFetch: (...args) => mockHyperFetch(...args),
    NS: {
      RDF:    (name) => ({ value: `http://www.w3.org/1999/02/22-rdf-syntax-ns#${name}`, termType: 'NamedNode' }),
      NEO:    (name) => ({ value: `https://neo.graphmetrix.net/node/${name}`, termType: 'NamedNode' }),
      SCHEMA: (name) => ({ value: `http://schema.org/${name}`, termType: 'NamedNode' })
    }
  }
}))

// Type-aware shared-store mockMatch: routes hits to the right bucket based
// on the type object (3rd arg), so tests can assert schema:Note and
// neo:a_note contributions independently regardless of which concept query
// produced them (they all merge into the shared store anyway).
function setTypeHits({ schemaNote = [], neoANote = [] } = {}) {
  mockMatch.mockImplementation((_s, _p, object) => {
    if (object?.value === 'http://schema.org/Note') {
      return schemaNote.map(uri => ({ subject: { value: uri } }))
    }
    if (object?.value === 'https://neo.graphmetrix.net/node/a_note') {
      return neoANote.map(uri => ({ subject: { value: uri } }))
    }
    return []
  })
}

import { useTwinPodNoteSearch } from './useTwinPodNoteSearch.js'

const POD = 'https://tst-first.demo.systemtwin.com'

beforeEach(() => {
  mockSearchAndGetURIs.mockReset()
  mockMatch.mockReset()
  mockHyperFetch.mockReset()
  // Defaults: every concept query resolves successfully with no hits.
  mockSearchAndGetURIs.mockResolvedValue({ response: '<turtle>', headers: [] })
  mockMatch.mockReturnValue([])
})

// ---------------------------------------------------------------------------

describe('useTwinPodNoteSearch — initial state', () => {
  test('notes starts empty', () => {
    expect(useTwinPodNoteSearch().notes.value).toEqual([])
  })
  test('loading starts false', () => {
    expect(useTwinPodNoteSearch().loading.value).toBe(false)
  })
  test('error starts null', () => {
    expect(useTwinPodNoteSearch().error.value).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('useTwinPodNoteSearch — concept queries fire in parallel', () => {
  // Spec: F.Find_Note — with default concepts ['note','notes'], we issue
  // one search call per term. Each populates ur.rdfStore.
  test('calls ur.searchAndGetURIs once per default concept term', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    expect(mockSearchAndGetURIs).toHaveBeenCalledTimes(2)
    const concepts = mockSearchAndGetURIs.mock.calls.map(call => call[1])
    expect(concepts).toEqual(expect.arrayContaining(['note', 'notes']))
  })

  test('passes podRoot and the full options payload to every call', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    for (const call of mockSearchAndGetURIs.mock.calls) {
      expect(call[0]).toBe(POD)
      expect(call[2]).toMatchObject({
        force: true, lang: 'en', rows: 100, start: 0
      })
    }
  })

  test('strips trailing slash from podRoot before use', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(`${POD}/`)
    for (const call of mockSearchAndGetURIs.mock.calls) {
      expect(call[0]).toBe(POD)
    }
  })
})

// ---------------------------------------------------------------------------

describe('useTwinPodNoteSearch — configurable concepts option', () => {
  // Spec: Rule_Code_twinpod-client-package — no hardcoded ontology. Callers
  // building other vocabularies (taskworld, ideaworld, etc.) must be able
  // to override the concept terms without forking this composable.

  test('accepts a custom concepts array and queries each term', async () => {
    const { searchNotes } = useTwinPodNoteSearch({ concepts: ['task', 'tasks'] })
    await searchNotes(POD)
    expect(mockSearchAndGetURIs).toHaveBeenCalledTimes(2)
    const concepts = mockSearchAndGetURIs.mock.calls.map(call => call[1])
    expect(concepts).toEqual(expect.arrayContaining(['task', 'tasks']))
  })

  test('falls back to default concepts when opts.concepts is missing', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    const concepts = mockSearchAndGetURIs.mock.calls.map(call => call[1])
    expect(concepts).toEqual(expect.arrayContaining(['note', 'notes']))
  })

  test('falls back to default concepts when opts.concepts is an empty array', async () => {
    const { searchNotes } = useTwinPodNoteSearch({ concepts: [] })
    await searchNotes(POD)
    expect(mockSearchAndGetURIs).toHaveBeenCalledTimes(2)
  })

  test('falls back to default concepts when opts.concepts is non-array', async () => {
    const { searchNotes } = useTwinPodNoteSearch({ concepts: 'note' })
    await searchNotes(POD)
    expect(mockSearchAndGetURIs).toHaveBeenCalledTimes(2)
  })

  test('a single-concept list issues exactly one search call', async () => {
    const { searchNotes } = useTwinPodNoteSearch({ concepts: ['note'] })
    await searchNotes(POD)
    expect(mockSearchAndGetURIs).toHaveBeenCalledTimes(1)
    expect(mockSearchAndGetURIs.mock.calls[0][1]).toBe('note')
  })
})

// ---------------------------------------------------------------------------

describe('useTwinPodNoteSearch — type filter (schema:Note ∪ neo:a_note)', () => {
  test('returns URIs of subjects typed schema:Note', async () => {
    setTypeHits({ schemaNote: [`${POD}/t/t_note_a`, `${POD}/t/t_note_b`] })
    const { searchNotes } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    expect(result.map(r => r.uri)).toEqual(
      expect.arrayContaining([`${POD}/t/t_note_a`, `${POD}/t/t_note_b`])
    )
  })

  test('returns URIs of subjects typed neo:a_note', async () => {
    setTypeHits({ neoANote: [`${POD}/node/neoA`, `${POD}/node/neoB`] })
    const { searchNotes } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    expect(result.map(r => r.uri)).toEqual(
      expect.arrayContaining([`${POD}/node/neoA`, `${POD}/node/neoB`])
    )
  })

  test('queries the store with both schema:Note and neo:a_note type predicates', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    const objectValues = mockMatch.mock.calls.map(call => call[2].value)
    expect(objectValues).toContain('http://schema.org/Note')
    expect(objectValues).toContain('https://neo.graphmetrix.net/node/a_note')
  })

  // Spec: F.Find_Note — the type match runs ONCE after all queries settle,
  // not once per query. All concepts feed the same shared store; one match
  // across it is both correct and cheaper.
  test('runs the type match exactly twice (schema + neo), regardless of concept count', async () => {
    const { searchNotes } = useTwinPodNoteSearch({ concepts: ['a', 'b', 'c', 'd'] })
    await searchNotes(POD)
    expect(mockMatch).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------

describe('useTwinPodNoteSearch — union and dedup', () => {
  // Spec: F.Find_Note — a note typed as both schema:Note and neo:a_note
  // (e.g. TwinPod reification alongside a schema:Note assertion) must
  // appear exactly once in the result.
  test('dedupes a URI that appears under both types', async () => {
    const shared = `${POD}/t/t_note_shared`
    setTypeHits({ schemaNote: [shared], neoANote: [shared] })
    const { searchNotes } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    expect(result.filter(r => r.uri === shared).length).toBe(1)
  })

  test('unions schema:Note and neo:a_note subjects', async () => {
    setTypeHits({
      schemaNote: [`${POD}/t/t_note_schema`],
      neoANote:   [`${POD}/node/neo`]
    })
    const { searchNotes } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    expect(result.map(r => r.uri).sort()).toEqual([
      `${POD}/node/neo`, `${POD}/t/t_note_schema`
    ])
  })

  test('returns empty array when no notes match either type', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    expect(await searchNotes(POD)).toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe('useTwinPodNoteSearch — partial failure tolerance', () => {
  // Spec: F.Find_Note — each concept query is attempted independently.
  // A failure in one (network blip, indexer 500, rejected promise) does
  // NOT poison the others; results from successful queries are kept.

  test('one query throws, the other succeeds — results are kept, no error set', async () => {
    mockSearchAndGetURIs
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ response: '<turtle>', headers: [] })
    setTypeHits({ schemaNote: [`${POD}/t/t_note_survivor`] })
    const { searchNotes, error } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    expect(result.map(r => r.uri)).toEqual([`${POD}/t/t_note_survivor`])
    expect(error.value).toBeNull()
  })

  test('one query returns status >= 400, the other succeeds — results are kept, no error set', async () => {
    mockSearchAndGetURIs
      .mockResolvedValueOnce({ status: 500, response: 'boom' })
      .mockResolvedValueOnce({ response: '<turtle>', headers: [] })
    setTypeHits({ schemaNote: [`${POD}/t/t_note_survivor`] })
    const { searchNotes, error } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    expect(result.map(r => r.uri)).toEqual([`${POD}/t/t_note_survivor`])
    expect(error.value).toBeNull()
  })

  test('one query returns error:true, the other succeeds — results are kept, no error set', async () => {
    mockSearchAndGetURIs
      .mockResolvedValueOnce({ error: 'index unavailable' })
      .mockResolvedValueOnce({ response: '<turtle>', headers: [] })
    setTypeHits({ schemaNote: [`${POD}/t/t_note_survivor`] })
    const { searchNotes, error } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    expect(result.map(r => r.uri)).toEqual([`${POD}/t/t_note_survivor`])
    expect(error.value).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('useTwinPodNoteSearch — error conditions', () => {
  // Spec: F.Find_Note — error is set ONLY when every concept query fails.
  test('sets search-error when ALL concept queries reject', async () => {
    mockSearchAndGetURIs
      .mockRejectedValueOnce(new Error('offline-a'))
      .mockRejectedValueOnce(new Error('offline-b'))
    const { searchNotes, error, notes } = useTwinPodNoteSearch()
    expect(await searchNotes(POD)).toEqual([])
    expect(error.value?.type).toBe('search-error')
    expect(notes.value).toEqual([])
  })

  test('sets search-error when ALL queries return HTTP >= 400', async () => {
    mockSearchAndGetURIs
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 503 })
    const { searchNotes, error } = useTwinPodNoteSearch()
    expect(await searchNotes(POD)).toEqual([])
    expect(error.value?.type).toBe('search-error')
  })

  test('sets search-error when ALL queries return error:true', async () => {
    mockSearchAndGetURIs
      .mockResolvedValueOnce({ error: 'boom-a' })
      .mockResolvedValueOnce({ error: 'boom-b' })
    const { searchNotes, error } = useTwinPodNoteSearch()
    expect(await searchNotes(POD)).toEqual([])
    expect(error.value?.type).toBe('search-error')
  })

  // Spec: F.Find_Note — an empty-body 200 is a legitimate "this pod has no
  // notes under this concept" reply, not an error. Seen against tst-ia2
  // where /search/note is 200 empty while /search/notes is populated.
  test('empty-body 200 is NOT treated as a failure', async () => {
    mockSearchAndGetURIs.mockResolvedValue({ response: '', status: 200, headers: [] })
    setTypeHits({ schemaNote: [`${POD}/t/t_note_a`] })
    const { searchNotes, error } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    expect(result.map(r => r.uri)).toEqual([`${POD}/t/t_note_a`])
    expect(error.value).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('useTwinPodNoteSearch — input validation', () => {
  test('sets invalid-input error and returns [] when podRoot is empty', async () => {
    const { error, searchNotes } = useTwinPodNoteSearch()
    expect(await searchNotes('')).toEqual([])
    expect(error.value?.type).toBe('invalid-input')
    expect(mockSearchAndGetURIs).not.toHaveBeenCalled()
    expect(mockHyperFetch).not.toHaveBeenCalled()
  })

  test('sets invalid-input error when podRoot is null', async () => {
    const { error, searchNotes } = useTwinPodNoteSearch()
    await searchNotes(null)
    expect(error.value?.type).toBe('invalid-input')
  })

  test('sets invalid-input error when podRoot is undefined', async () => {
    const { error, searchNotes } = useTwinPodNoteSearch()
    await searchNotes(undefined)
    expect(error.value?.type).toBe('invalid-input')
  })
})

// ---------------------------------------------------------------------------

describe('useTwinPodNoteSearch — loading transition', () => {
  test('loading is true while discovery is in progress', async () => {
    let resolveSearch
    mockSearchAndGetURIs.mockImplementation(() => new Promise(r => { resolveSearch = r }))
    const { loading, searchNotes } = useTwinPodNoteSearch({ concepts: ['note'] })
    const promise = searchNotes(POD)
    expect(loading.value).toBe(true)
    resolveSearch({ response: '', headers: [] })
    await promise
    expect(loading.value).toBe(false)
  })

  test('loading is false after discovery completes successfully', async () => {
    const { loading, searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    expect(loading.value).toBe(false)
  })
})

// ---------------------------------------------------------------------------

describe('useTwinPodNoteSearch — regression guards', () => {
  // Spec: F.Find_Note — discovery is about TYPES, not container locations.
  // This guard locks in the principle: the composable must NEVER call
  // hyperFetch against a container path to list its members. If a future
  // refactor reintroduces container crawling, this test fails loudly.
  test('NEVER lists a container via hyperFetch (type-driven, not location-driven)', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    expect(mockHyperFetch).not.toHaveBeenCalled()
  })

  // Spec: F.Find_Note — no URI-prefix filtering. A subject typed schema:Note
  // that lives under `/node/`, `/data/`, or any other path must still be
  // returned. Previous drafts filtered `/t/t_note_`; locking that out.
  test('returns notes regardless of URI path (no /t/ or /t_note_ filter)', async () => {
    setTypeHits({
      schemaNote: [
        `${POD}/data/somewhere/else/my_note`,
        `${POD}/node/neo_style_id`,
        `${POD}/t/t_note_classic`
      ]
    })
    const { searchNotes } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    const uris = result.map(r => r.uri)
    expect(uris).toContain(`${POD}/data/somewhere/else/my_note`)
    expect(uris).toContain(`${POD}/node/neo_style_id`)
    expect(uris).toContain(`${POD}/t/t_note_classic`)
  })

  // Spec: F.Find_Note — 5.0.0 regression matched on neo:a_fragmented-document
  // so "list my notes" returned zero notes against real pod content. Lock
  // the type filter against that value.
  test('never matches on neo:a_fragmented-document (5.0.0 regression type)', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    for (const call of mockMatch.mock.calls) {
      expect(call[2].value).not.toContain('a_fragmented-document')
    }
  })

  // Spec: F.Find_Note — 5.1.2 required schema:Note in the queried types.
  // Guard stays: if a future refactor drops schema:Note, every
  // NoteWorld-authored note vanishes.
  test('includes schema:Note in the queried types (5.1.2 guard)', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    const objectValues = mockMatch.mock.calls.map(call => call[2].value)
    expect(objectValues).toContain('http://schema.org/Note')
  })

  // Spec: F.Find_Note — 5.1.3 requires multi-concept querying to handle
  // per-pod ontology maps (tst-ia2 indexes under 'notes' plural; tst-first
  // under 'note' singular). Regressing to a single term would re-break
  // F.Find_Note on tst-ia2.
  test('queries BOTH "note" and "notes" by default (5.1.3 — per-pod ontology resilience)', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    const concepts = mockSearchAndGetURIs.mock.calls.map(call => call[1])
    expect(concepts).toContain('note')
    expect(concepts).toContain('notes')
  })
})

// ---------------------------------------------------------------------------

describe('useTwinPodNoteSearch — error clearing', () => {
  test('clears previous error when a new search starts', async () => {
    const { error, searchNotes } = useTwinPodNoteSearch()
    await searchNotes('')
    expect(error.value?.type).toBe('invalid-input')
    await searchNotes(POD)
    expect(error.value).toBeNull()
  })
})
