import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock the Stack B pipeline: getBlankNode → storeToTurtle → modifyTurtle → uploadTurtleToResource
// vi.hoisted runs before vi.mock hoisting, so these are available in mock factories.
const { mockGraph, mock$rdf, mockNS, getBlankNode, storeToTurtle, modifyTurtle, uploadTurtleToResource } = vi.hoisted(() => {
  const mockGraph = { add: vi.fn() }
  return {
    mockGraph,
    mock$rdf: {
      graph: vi.fn(() => mockGraph),
      defaultGraph: vi.fn(() => ({})),
      sym: vi.fn((uri) => ({ value: uri, termType: 'NamedNode' })),
      literal: vi.fn((val) => ({ value: val, termType: 'Literal' })),
    },
    mockNS: {
      RDF: vi.fn((name) => `http://www.w3.org/1999/02/22-rdf-syntax-ns#${name}`),
      SCHEMA: vi.fn((name) => `http://schema.org/${name}`),
    },
    getBlankNode: vi.fn(() => ({ node: { value: '_:t1' }, existed: false })),
    storeToTurtle: vi.fn(() => '_:t1 a <http://schema.org/Note> .\n'),
    modifyTurtle: vi.fn((t) => t),
    uploadTurtleToResource: vi.fn(),
  }
})

vi.mock('@kaigilb/twinpod-client', () => ({
  $rdf: mock$rdf,
  NS: mockNS,
  getBlankNode: (...args) => getBlankNode(...args),
  storeToTurtle: (...args) => storeToTurtle(...args),
  modifyTurtle: (...args) => modifyTurtle(...args),
  uploadTurtleToResource: (...args) => uploadTurtleToResource(...args),
}))

import { useTwinPodNoteSave } from './useTwinPodNoteSave.js'

const POD = 'https://tst-first.demo.systemtwin.com'
const NOTE_URL = `${POD}/t/t_note_123_abcd`
const DEFAULT_PRED = 'http://schema.org/text'

const fakeSolidFetch = vi.fn()

beforeEach(() => {
  getBlankNode.mockReset()
  getBlankNode.mockReturnValue({ node: { value: '_:t1' }, existed: false })
  storeToTurtle.mockReset()
  storeToTurtle.mockReturnValue('_:t1 a <http://schema.org/Note> .\n')
  modifyTurtle.mockReset()
  modifyTurtle.mockImplementation((t) => t)
  uploadTurtleToResource.mockReset()
  uploadTurtleToResource.mockResolvedValue({ ok: true, status: 200, headers: null, locationUri: null, response: null })
  mockGraph.add.mockReset()
  mock$rdf.graph.mockReset()
  mock$rdf.graph.mockReturnValue(mockGraph)
  mock$rdf.sym.mockReset()
  mock$rdf.sym.mockImplementation((uri) => ({ value: uri, termType: 'NamedNode' }))
  mock$rdf.literal.mockReset()
  mock$rdf.literal.mockImplementation((val) => ({ value: val, termType: 'Literal' }))
  fakeSolidFetch.mockReset()
})

describe('useTwinPodNoteSave — initial state', () => {
  test('saving starts false', () => {
    const { saving } = useTwinPodNoteSave(fakeSolidFetch)
    expect(saving.value).toBe(false)
  })
  test('saved starts false', () => {
    const { saved } = useTwinPodNoteSave(fakeSolidFetch)
    expect(saved.value).toBe(false)
  })
  test('error starts null', () => {
    const { error } = useTwinPodNoteSave(fakeSolidFetch)
    expect(error.value).toBeNull()
  })
})

describe('useTwinPodNoteSave — Stack B pipeline contract', () => {
  test('calls getBlankNode with $rdf and a label containing the resource URL', async () => {
    const { saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    await saveNote(NOTE_URL, 'hello')
    expect(getBlankNode).toHaveBeenCalledTimes(1)
    expect(getBlankNode.mock.calls[0][0]).toBe(mock$rdf)
    expect(getBlankNode.mock.calls[0][1]).toBe('Save: ' + NOTE_URL)
  })

  test('builds two triples in a temp store (rdf:type + text)', async () => {
    const { saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    await saveNote(NOTE_URL, 'hello')
    expect(mock$rdf.graph).toHaveBeenCalledTimes(1)
    expect(mockGraph.add).toHaveBeenCalledTimes(2)
  })

  test('sets the text as a literal with the provided value', async () => {
    const { saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    await saveNote(NOTE_URL, 'hello world')
    expect(mock$rdf.literal).toHaveBeenCalledWith('hello world')
  })

  test('uses the default predicate (schema:text) for the text triple', async () => {
    const { saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    await saveNote(NOTE_URL, 'hello')
    expect(mock$rdf.sym).toHaveBeenCalledWith(DEFAULT_PRED)
  })

  test('uses a custom predicateUri when provided', async () => {
    const { saveNote } = useTwinPodNoteSave(fakeSolidFetch, { predicateUri: 'https://example.com/p' })
    await saveNote(NOTE_URL, 'x')
    expect(mock$rdf.sym).toHaveBeenCalledWith('https://example.com/p')
  })

  test('calls storeToTurtle with $rdf, the temp store, and empty base URL', async () => {
    const { saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    await saveNote(NOTE_URL, 'hello')
    expect(storeToTurtle).toHaveBeenCalledTimes(1)
    expect(storeToTurtle.mock.calls[0][0]).toBe(mock$rdf)
    expect(storeToTurtle.mock.calls[0][1]).toBe(mockGraph)
    expect(storeToTurtle.mock.calls[0][2]).toBe('')
  })

  test('calls modifyTurtle on the serialized output', async () => {
    const { saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    await saveNote(NOTE_URL, 'hello')
    expect(modifyTurtle).toHaveBeenCalledTimes(1)
  })

  test('PATCHes via uploadTurtleToResource with solidFetch and the note URL', async () => {
    const { saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    await saveNote(NOTE_URL, 'hello')
    expect(uploadTurtleToResource).toHaveBeenCalledTimes(1)
    expect(uploadTurtleToResource.mock.calls[0][0]).toBe(fakeSolidFetch)
    expect(uploadTurtleToResource.mock.calls[0][1]).toBe(NOTE_URL)
    expect(uploadTurtleToResource.mock.calls[0][3]).toEqual({ returnResponse: true })
  })
})

describe('useTwinPodNoteSave — success state', () => {
  test('returns true on success', async () => {
    const { saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    expect(await saveNote(NOTE_URL, 'hi')).toBe(true)
  })

  test('sets saved to true after success', async () => {
    const { saved, saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    await saveNote(NOTE_URL, 'hi')
    expect(saved.value).toBe(true)
  })

  test('leaves saving false after completion', async () => {
    const { saving, saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    await saveNote(NOTE_URL, 'hi')
    expect(saving.value).toBe(false)
  })

  test('saves empty string', async () => {
    const { saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    const ok = await saveNote(NOTE_URL, '')
    expect(ok).toBe(true)
    expect(mock$rdf.literal).toHaveBeenCalledWith('')
  })
})

describe('useTwinPodNoteSave — input validation', () => {
  test('returns false and sets error when noteResourceUrl is empty', async () => {
    const { error, saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    const ok = await saveNote('', 'hi')
    expect(ok).toBe(false)
    expect(error.value?.type).toBe('invalid-input')
    expect(uploadTurtleToResource).not.toHaveBeenCalled()
  })

  test('returns false when text is not a string', async () => {
    const { error, saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    const ok = await saveNote(NOTE_URL, 123)
    expect(ok).toBe(false)
    expect(error.value?.type).toBe('invalid-input')
  })

  // Spec: F.Save_Note — invalid-input must also cover null/undefined noteResourceUrl
  test('returns false when noteResourceUrl is null', async () => {
    const { error, saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    const ok = await saveNote(null, 'hi')
    expect(ok).toBe(false)
    expect(error.value?.type).toBe('invalid-input')
    expect(uploadTurtleToResource).not.toHaveBeenCalled()
  })

  test('returns false when noteResourceUrl is undefined', async () => {
    const { error, saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    const ok = await saveNote(undefined, 'hi')
    expect(ok).toBe(false)
    expect(error.value?.type).toBe('invalid-input')
    expect(uploadTurtleToResource).not.toHaveBeenCalled()
  })
})

describe('useTwinPodNoteSave — saved flag resets between calls', () => {
  test('saved flips back to false when a subsequent save fails', async () => {
    const { saved, saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    await saveNote(NOTE_URL, 'first')
    expect(saved.value).toBe(true)
    uploadTurtleToResource.mockResolvedValueOnce({ ok: false, status: 500 })
    await saveNote(NOTE_URL, 'second')
    expect(saved.value).toBe(false)
  })
})

describe('useTwinPodNoteSave — HTTP error', () => {
  test('returns false and sets error.type to http on failure', async () => {
    uploadTurtleToResource.mockResolvedValueOnce({ ok: false, status: 403 })
    const { error, saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    const ok = await saveNote(NOTE_URL, 'hi')
    expect(ok).toBe(false)
    expect(error.value?.type).toBe('http')
    expect(error.value?.status).toBe(403)
  })

  test('sets error.type to network when uploadTurtleToResource throws', async () => {
    uploadTurtleToResource.mockRejectedValueOnce(new Error('Failed to fetch'))
    const { error, saveNote } = useTwinPodNoteSave(fakeSolidFetch)
    await saveNote(NOTE_URL, 'hi')
    expect(error.value?.type).toBe('network')
  })
})
