// UNIT_TYPE=Hook
//
// Tests for useTwinPodNoteSearch. The composable lists notes by combining
// two sources (see source docblock):
//   1. LDP container listing of {podRoot}/t/ via direct window.solid.session.fetch
//      — fast, complete for /t/ legacy notes.
//   2. ur.searchAndGetURIs(..., 'note', ...) for neo:a_fragmented-document typed
//      resources in /node/ created via the native graph store.
// Results are deduplicated by URI.
//
// The tests below mock BOTH paths. The source swallows individual path errors
// to keep partial results — that tolerance is exercised.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockSessionFetch, mockSearchAndGetURIs, mockMatch, mockGraph, mockParse, mockSym, mockStore } = vi.hoisted(() => {
  const makeStore = () => ({
    statementsMatching: vi.fn().mockReturnValue([])
  })
  const store = { current: makeStore() }
  return {
    mockSessionFetch: vi.fn(),
    mockSearchAndGetURIs: vi.fn(),
    mockMatch: vi.fn(),
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
    },
    searchAndGetURIs: (...args) => mockSearchAndGetURIs(...args),
    rdfStore: { match: (...args) => mockMatch(...args) },
    NS: {
      RDF: (name) => ({ value: `http://www.w3.org/1999/02/22-rdf-syntax-ns#${name}`, termType: 'NamedNode' }),
      NEO: (name) => ({ value: `https://neo.graphmetrix.net/node/${name}`, termType: 'NamedNode' })
    }
  }
}))

import { useTwinPodNoteSearch } from './useTwinPodNoteSearch.js'

const POD = 'https://tst-first.demo.systemtwin.com'

function makeResponse({ ok = true, status = 200, turtle = '' } = {}) {
  return {
    ok,
    status,
    text: async () => turtle
  }
}

beforeEach(() => {
  if (!globalThis.window) globalThis.window = {}
  window.solid = { session: { fetch: (...args) => mockSessionFetch(...args) } }

  mockSessionFetch.mockReset()
  mockSearchAndGetURIs.mockReset()
  mockMatch.mockReset()
  mockGraph.mockClear()
  mockParse.mockClear()
  mockSym.mockClear()

  // Defaults: both sources return empty, success.
  mockSessionFetch.mockResolvedValue(makeResponse({ turtle: '' }))
  mockStore.current = { statementsMatching: vi.fn().mockReturnValue([]) }
  mockSearchAndGetURIs.mockResolvedValue({ response: '<turtle>', headers: [] })
  mockMatch.mockReturnValue([])
})

afterEach(() => {
  delete window.solid
})

describe('useTwinPodNoteSearch — initial state', () => {
  test('notes starts empty', () => {
    const { notes } = useTwinPodNoteSearch()
    expect(notes.value).toEqual([])
  })
  test('loading starts false', () => {
    const { loading } = useTwinPodNoteSearch()
    expect(loading.value).toBe(false)
  })
  test('error starts null', () => {
    const { error } = useTwinPodNoteSearch()
    expect(error.value).toBeNull()
  })
})

describe('useTwinPodNoteSearch — LDP container path', () => {
  // Spec: F.Find_Note — primary path reads the {podRoot}/t/ LDP container.
  test('fetches {podRoot}/t/ with Turtle accept header', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    const ldpCall = mockSessionFetch.mock.calls.find(c => c[0] === `${POD}/t/`)
    expect(ldpCall).toBeDefined()
    expect(ldpCall[1].headers.Accept).toBe('text/turtle')
  })

  // Spec: F.Find_Note — strips trailing slash from podRoot before composing /t/
  test('handles a podRoot with a trailing slash', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(`${POD}/`)
    const ldpCall = mockSessionFetch.mock.calls.find(c => c[0] === `${POD}/t/`)
    expect(ldpCall).toBeDefined()
  })

  // Spec: F.Find_Note — returns LDP-contained URIs that include the `t_note_` marker.
  test('extracts t_note_ URIs from the ldp:contains statements', async () => {
    mockStore.current = {
      statementsMatching: vi.fn().mockReturnValue([
        { object: { value: `${POD}/t/t_note_1` } },
        { object: { value: `${POD}/t/t_note_2` } },
        // Non-note sibling — must be filtered out
        { object: { value: `${POD}/t/other_resource` } }
      ])
    }
    const { searchNotes } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    const uris = result.map(r => r.uri)
    expect(uris).toContain(`${POD}/t/t_note_1`)
    expect(uris).toContain(`${POD}/t/t_note_2`)
    expect(uris).not.toContain(`${POD}/t/other_resource`)
  })

  // The LDP path is wrapped in its own try/catch so a transient pod error
  // doesn't block the secondary search path from contributing results.
  test('continues to secondary search when LDP listing rejects', async () => {
    mockSessionFetch.mockRejectedValue(new Error('pod down'))
    mockMatch.mockReturnValue([
      { subject: { value: `${POD}/node/t_note_from_search` } }
    ])
    const { searchNotes, error } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    expect(result.map(r => r.uri)).toContain(`${POD}/node/t_note_from_search`)
    // Top-level error stays null — partial results are fine.
    expect(error.value).toBeNull()
  })
})

describe('useTwinPodNoteSearch — TwinPod search path', () => {
  // Spec: F.Find_Note — secondary path runs a TwinPod search for 'note'.
  test('calls ur.searchAndGetURIs with podRoot (no trailing slash), "note", and options', async () => {
    const { searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    expect(mockSearchAndGetURIs).toHaveBeenCalledTimes(1)
    expect(mockSearchAndGetURIs.mock.calls[0][0]).toBe(POD)
    expect(mockSearchAndGetURIs.mock.calls[0][1]).toBe('note')
    expect(mockSearchAndGetURIs.mock.calls[0][2]).toMatchObject({
      force: true, lang: 'en', rows: 100, start: 0
    })
  })

  // Spec: F.Find_Note — returns array of { uri } objects from rdfStore after search
  test('extracts subject URIs from ur.rdfStore.match results', async () => {
    mockMatch.mockReturnValue([
      { subject: { value: `${POD}/node/t_note_a` } },
      { subject: { value: `${POD}/node/t_note_b` } }
    ])
    const { searchNotes, notes } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    expect(result.map(r => r.uri)).toEqual(expect.arrayContaining([
      `${POD}/node/t_note_a`,
      `${POD}/node/t_note_b`
    ]))
    expect(notes.value).toEqual(result)
  })

  // Spec: F.Find_Note — a search-error response is swallowed (partial-results tolerance).
  test('ignores search-error response and still returns LDP results', async () => {
    mockSessionFetch.mockResolvedValueOnce(makeResponse({ turtle: '<>.' }))
    mockStore.current = {
      statementsMatching: vi.fn().mockReturnValue([
        { object: { value: `${POD}/t/t_note_1` } }
      ])
    }
    mockSearchAndGetURIs.mockResolvedValue({ error: 'something broke' })
    const { searchNotes, error } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    expect(result.map(r => r.uri)).toContain(`${POD}/t/t_note_1`)
    expect(error.value).toBeNull()
  })

  test('ignores HTTP-status-style search error (status >= 400)', async () => {
    mockSearchAndGetURIs.mockResolvedValue({ status: 500, response: 'boom' })
    const { searchNotes, error } = useTwinPodNoteSearch()
    await searchNotes(POD)
    // Secondary path swallows; overall call still succeeds.
    expect(error.value).toBeNull()
  })
})

describe('useTwinPodNoteSearch — deduplication', () => {
  // Spec: F.Find_Note — a URI returned by both the LDP listing and the search
  // path must appear only once in the output.
  test('deduplicates URIs that appear in both LDP and search results', async () => {
    const duplicate = `${POD}/t/t_note_shared`
    mockStore.current = {
      statementsMatching: vi.fn().mockReturnValue([
        { object: { value: duplicate } }
      ])
    }
    mockMatch.mockReturnValue([
      { subject: { value: duplicate } }
    ])
    const { searchNotes } = useTwinPodNoteSearch()
    const result = await searchNotes(POD)
    const matching = result.filter(r => r.uri === duplicate)
    expect(matching.length).toBe(1)
  })
})

describe('useTwinPodNoteSearch — input validation', () => {
  test('returns empty array and sets error when podRoot is empty', async () => {
    const { error, searchNotes } = useTwinPodNoteSearch()
    const result = await searchNotes('')
    expect(result).toEqual([])
    expect(error.value?.type).toBe('invalid-input')
    expect(mockSessionFetch).not.toHaveBeenCalled()
    expect(mockSearchAndGetURIs).not.toHaveBeenCalled()
  })

  test('returns empty array and sets error when podRoot is null', async () => {
    const { error, searchNotes } = useTwinPodNoteSearch()
    const result = await searchNotes(null)
    expect(result).toEqual([])
    expect(error.value?.type).toBe('invalid-input')
  })

  test('returns empty array and sets error when podRoot is undefined', async () => {
    const { error, searchNotes } = useTwinPodNoteSearch()
    const result = await searchNotes(undefined)
    expect(result).toEqual([])
    expect(error.value?.type).toBe('invalid-input')
  })
})

describe('useTwinPodNoteSearch — loading transition', () => {
  // Spec: F.Find_Note — loading ref is true during in-flight search, false after completion
  test('loading is true while LDP fetch is in progress', async () => {
    let resolveLdp
    mockSessionFetch.mockImplementationOnce(() => new Promise(r => {
      resolveLdp = () => r(makeResponse({ turtle: '' }))
    }))
    const { loading, searchNotes } = useTwinPodNoteSearch()
    const promise = searchNotes(POD)
    expect(loading.value).toBe(true)
    resolveLdp()
    await promise
    expect(loading.value).toBe(false)
  })

  test('loading is false after both paths have settled', async () => {
    const { loading, searchNotes } = useTwinPodNoteSearch()
    await searchNotes(POD)
    expect(loading.value).toBe(false)
  })
})

describe('useTwinPodNoteSearch — error clearing', () => {
  // Spec: F.Find_Note — error state clears when a new search begins.
  // (With both inner paths tolerated, error only becomes non-null from a top-level
  // catastrophic failure — which we simulate by making searchNotes itself throw
  // synchronously via a mock that fails before either path runs.)
  test('clears previous error when a new search starts', async () => {
    const { error, searchNotes } = useTwinPodNoteSearch()
    // First call with empty input sets invalid-input error.
    await searchNotes('')
    expect(error.value?.type).toBe('invalid-input')

    // Second call with a valid podRoot clears error (set to null before running).
    await searchNotes(POD)
    expect(error.value).toBeNull()
  })
})
