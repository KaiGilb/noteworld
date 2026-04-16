import { describe, test, expect, vi, beforeEach } from 'vitest'

const mockSearchAndGetURIs = vi.fn()
const mockMatch = vi.fn()

vi.mock('@kaigilb/twinpod-client', () => ({
  searchAndGetURIs: (...args) => mockSearchAndGetURIs(...args),
  rdfStore: { match: (...args) => mockMatch(...args) },
  NS: {
    RDF: (name) => `http://www.w3.org/1999/02/22-rdf-syntax-ns#${name}`,
    NEO: (name) => `https://neo.graphmetrix.net/node/${name}`
  }
}))

import { useTwinPodNoteSearch } from './useTwinPodNoteSearch.js'

const POD = 'https://tst-first.demo.systemtwin.com'
const fakeSolidFetch = vi.fn()

beforeEach(() => {
  mockSearchAndGetURIs.mockReset()
  mockMatch.mockReset()
  mockSearchAndGetURIs.mockResolvedValue({ response: '<turtle>', headers: [] })
  mockMatch.mockReturnValue([])
})

describe('useTwinPodNoteSearch — initial state', () => {
  test('notes starts empty', () => {
    const { notes } = useTwinPodNoteSearch(fakeSolidFetch)
    expect(notes.value).toEqual([])
  })
  test('loading starts false', () => {
    const { loading } = useTwinPodNoteSearch(fakeSolidFetch)
    expect(loading.value).toBe(false)
  })
  test('error starts null', () => {
    const { error } = useTwinPodNoteSearch(fakeSolidFetch)
    expect(error.value).toBeNull()
  })
})

describe('useTwinPodNoteSearch — success', () => {
  test('calls searchAndGetURIs with correct params', async () => {
    const { searchNotes } = useTwinPodNoteSearch(fakeSolidFetch)
    await searchNotes(POD)
    expect(mockSearchAndGetURIs).toHaveBeenCalledTimes(1)
    expect(mockSearchAndGetURIs.mock.calls[0][0]).toBe(fakeSolidFetch)
    expect(mockSearchAndGetURIs.mock.calls[0][1]).toBe(POD)
    expect(mockSearchAndGetURIs.mock.calls[0][2]).toBe('note')
    expect(mockSearchAndGetURIs.mock.calls[0][3]).toEqual({ force: false, lang: 'en', rows: 50, start: 0 })
  })

  test('accepts custom conceptName and lang', async () => {
    const { searchNotes } = useTwinPodNoteSearch(fakeSolidFetch, { conceptName: 'text', lang: 'de' })
    await searchNotes(POD)
    expect(mockSearchAndGetURIs.mock.calls[0][2]).toBe('text')
    expect(mockSearchAndGetURIs.mock.calls[0][3].lang).toBe('de')
  })

  test('extracts note URIs from rdfStore after search', async () => {
    mockMatch.mockReturnValue([
      { subject: { value: `${POD}/t/t_note_1` } },
      { subject: { value: `${POD}/t/t_note_2` } }
    ])
    const { searchNotes, notes } = useTwinPodNoteSearch(fakeSolidFetch)
    const result = await searchNotes(POD)
    expect(result).toEqual([
      { uri: `${POD}/t/t_note_1` },
      { uri: `${POD}/t/t_note_2` }
    ])
    expect(notes.value).toEqual(result)
  })

  test('passes force and rows through', async () => {
    const { searchNotes } = useTwinPodNoteSearch(fakeSolidFetch)
    await searchNotes(POD, { force: true, rows: 10 })
    expect(mockSearchAndGetURIs.mock.calls[0][3]).toEqual({ force: true, lang: 'en', rows: 10, start: 0 })
  })

  test('returns empty array when no notes match', async () => {
    mockMatch.mockReturnValue([])
    const { searchNotes, notes } = useTwinPodNoteSearch(fakeSolidFetch)
    const result = await searchNotes(POD)
    expect(result).toEqual([])
    expect(notes.value).toEqual([])
  })
})

describe('useTwinPodNoteSearch — input validation', () => {
  test('returns empty array and sets error when podRoot is empty', async () => {
    const { error, searchNotes } = useTwinPodNoteSearch(fakeSolidFetch)
    const result = await searchNotes('')
    expect(result).toEqual([])
    expect(error.value?.type).toBe('invalid-input')
    expect(mockSearchAndGetURIs).not.toHaveBeenCalled()
  })

  // Spec: F.Find_Note — podRoot null must be rejected (VATester gap)
  test('returns empty array and sets error when podRoot is null', async () => {
    const { error, searchNotes } = useTwinPodNoteSearch(fakeSolidFetch)
    const result = await searchNotes(null)
    expect(result).toEqual([])
    expect(error.value?.type).toBe('invalid-input')
    expect(mockSearchAndGetURIs).not.toHaveBeenCalled()
  })

  // Spec: F.Find_Note — podRoot undefined must be rejected (VATester gap)
  test('returns empty array and sets error when podRoot is undefined', async () => {
    const { error, searchNotes } = useTwinPodNoteSearch(fakeSolidFetch)
    const result = await searchNotes(undefined)
    expect(result).toEqual([])
    expect(error.value?.type).toBe('invalid-input')
    expect(mockSearchAndGetURIs).not.toHaveBeenCalled()
  })
})

describe('useTwinPodNoteSearch — error handling', () => {
  test('sets error on search API error response', async () => {
    mockSearchAndGetURIs.mockResolvedValue({ error: 'true' })
    const { error, searchNotes, notes } = useTwinPodNoteSearch(fakeSolidFetch)
    await searchNotes(POD)
    expect(error.value?.type).toBe('search-error')
    expect(notes.value).toEqual([])
  })

  test('sets error on network failure', async () => {
    mockSearchAndGetURIs.mockRejectedValue(new Error('Failed to fetch'))
    const { error, searchNotes } = useTwinPodNoteSearch(fakeSolidFetch)
    await searchNotes(POD)
    expect(error.value?.type).toBe('network')
  })

  test('loading is false after error', async () => {
    mockSearchAndGetURIs.mockRejectedValue(new Error('boom'))
    const { loading, searchNotes } = useTwinPodNoteSearch(fakeSolidFetch)
    await searchNotes(POD)
    expect(loading.value).toBe(false)
  })

  test('sets error when search endpoint returns HTTP 500', async () => {
    mockSearchAndGetURIs.mockResolvedValue({ response: 'Internal Server Error', headers: [], status: 500 })
    const { error, searchNotes, notes } = useTwinPodNoteSearch(fakeSolidFetch)
    await searchNotes(POD)
    expect(error.value?.type).toBe('search-error')
    expect(error.value?.message).toContain('500')
    expect(notes.value).toEqual([])
  })

  // Spec: F.Find_Note + TwinPod LWS — must handle 401 (not authenticated) explicitly
  test('sets error when search endpoint returns HTTP 401', async () => {
    mockSearchAndGetURIs.mockResolvedValue({ response: 'Unauthorized', headers: [], status: 401 })
    const { error, searchNotes, notes } = useTwinPodNoteSearch(fakeSolidFetch)
    await searchNotes(POD)
    expect(error.value?.type).toBe('search-error')
    expect(error.value?.message).toContain('401')
    expect(notes.value).toEqual([])
  })

  // Spec: F.Find_Note + TwinPod LWS — must handle 403 (no permission) explicitly
  test('sets error when search endpoint returns HTTP 403', async () => {
    mockSearchAndGetURIs.mockResolvedValue({ response: 'Forbidden', headers: [], status: 403 })
    const { error, searchNotes, notes } = useTwinPodNoteSearch(fakeSolidFetch)
    await searchNotes(POD)
    expect(error.value?.type).toBe('search-error')
    expect(error.value?.message).toContain('403')
    expect(notes.value).toEqual([])
  })

  // Spec: F.Find_Note + TwinPod LWS — must handle 404 (resource not found) explicitly
  test('sets error when search endpoint returns HTTP 404', async () => {
    mockSearchAndGetURIs.mockResolvedValue({ response: 'Not Found', headers: [], status: 404 })
    const { error, searchNotes, notes } = useTwinPodNoteSearch(fakeSolidFetch)
    await searchNotes(POD)
    expect(error.value?.type).toBe('search-error')
    expect(error.value?.message).toContain('404')
    expect(notes.value).toEqual([])
  })
})

// --- Gap tests written by VATester (F.Find_Note increment) ---

describe('useTwinPodNoteSearch — loading transition', () => {

  // Spec: F.Find_Note — composable must expose loading=true during an in-flight search
  test('loading is true while search is in progress', async () => {
    let resolveSearch
    mockSearchAndGetURIs.mockImplementation(() => new Promise(r => { resolveSearch = r }))
    const { loading, searchNotes } = useTwinPodNoteSearch(fakeSolidFetch)
    const promise = searchNotes(POD)
    // loading must be true while the promise is pending
    expect(loading.value).toBe(true)
    resolveSearch({ response: '<turtle>', headers: [] })
    await promise
    expect(loading.value).toBe(false)
  })
})

describe('useTwinPodNoteSearch — error clearing', () => {

  // Spec: F.Find_Note — a new search must clear any previous error before starting
  test('clears previous error when a new search starts', async () => {
    mockSearchAndGetURIs.mockRejectedValueOnce(new Error('first fail'))
    const { error, searchNotes } = useTwinPodNoteSearch(fakeSolidFetch)
    await searchNotes(POD)
    expect(error.value).not.toBeNull()

    // Second call succeeds — error must be cleared
    mockSearchAndGetURIs.mockResolvedValueOnce({ response: '<turtle>', headers: [] })
    mockMatch.mockReturnValue([])
    await searchNotes(POD)
    expect(error.value).toBeNull()
  })
})
