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

import { useTwinPodNoteCreate } from './useTwinPodNoteCreate.js'

const POD = 'https://tst-first.demo.systemtwin.com'

const fakeSolidFetch = vi.fn()

beforeEach(() => {
  getBlankNode.mockReset()
  getBlankNode.mockReturnValue({ node: { value: '_:t1' }, existed: false })
  storeToTurtle.mockReset()
  storeToTurtle.mockReturnValue('_:t1 a <http://schema.org/Note> .\n')
  modifyTurtle.mockReset()
  modifyTurtle.mockImplementation((t) => t)
  uploadTurtleToResource.mockReset()
  uploadTurtleToResource.mockResolvedValue({ ok: true, status: 201, headers: null, locationUri: null, response: null })
  mockGraph.add.mockReset()
  mock$rdf.graph.mockReset()
  mock$rdf.graph.mockReturnValue(mockGraph)
  mock$rdf.sym.mockReset()
  mock$rdf.sym.mockImplementation((uri) => ({ value: uri, termType: 'NamedNode' }))
  mock$rdf.literal.mockReset()
  mock$rdf.literal.mockImplementation((val) => ({ value: val, termType: 'Literal' }))
  fakeSolidFetch.mockReset()
})

describe('useTwinPodNoteCreate — initial state', () => {
  test('noteUri starts as null', () => {
    const { noteUri } = useTwinPodNoteCreate(fakeSolidFetch)
    expect(noteUri.value).toBeNull()
  })
  test('loading starts as false', () => {
    const { loading } = useTwinPodNoteCreate(fakeSolidFetch)
    expect(loading.value).toBe(false)
  })
  test('error starts as null', () => {
    const { error } = useTwinPodNoteCreate(fakeSolidFetch)
    expect(error.value).toBeNull()
  })
})

describe('useTwinPodNoteCreate — success', () => {
  test('returns a resource URL under {podRoot}/t/', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    const url = await createNote(POD)
    expect(url).toMatch(new RegExp(`^${POD}/t/t_note_\\d+_[a-z0-9]{4}$`))
  })

  test('sets noteUri to the resource URL', async () => {
    const { noteUri, createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    const url = await createNote(POD)
    expect(noteUri.value).toBe(url)
  })

  test('loading is false after success', async () => {
    const { loading, createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote(POD)
    expect(loading.value).toBe(false)
  })

  test('error stays null after success', async () => {
    const { error, createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote(POD)
    expect(error.value).toBeNull()
  })
})

describe('useTwinPodNoteCreate — Stack B pipeline contract', () => {
  test('calls getBlankNode with $rdf and a label containing the resource ID', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote(POD)
    expect(getBlankNode).toHaveBeenCalledTimes(1)
    expect(getBlankNode.mock.calls[0][0]).toBe(mock$rdf)
    expect(getBlankNode.mock.calls[0][1]).toMatch(/^Note: t_note_\d+_[a-z0-9]{4}$/)
  })

  test('builds two triples in a temp store (rdf:type + schema:text)', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote(POD)
    expect(mock$rdf.graph).toHaveBeenCalledTimes(1)
    expect(mockGraph.add).toHaveBeenCalledTimes(2)
  })

  test('calls storeToTurtle with $rdf, the temp store, and empty base URL', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote(POD)
    expect(storeToTurtle).toHaveBeenCalledTimes(1)
    expect(storeToTurtle.mock.calls[0][0]).toBe(mock$rdf)
    expect(storeToTurtle.mock.calls[0][1]).toBe(mockGraph)
    expect(storeToTurtle.mock.calls[0][2]).toBe('')
  })

  test('calls modifyTurtle on the serialized output', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote(POD)
    expect(modifyTurtle).toHaveBeenCalledTimes(1)
    expect(modifyTurtle.mock.calls[0][0]).toBe(storeToTurtle.mock.results[0].value)
  })

  test('PUTs via uploadTurtleToResource with solidFetch, resource URL, and method: PUT', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    const url = await createNote(POD)
    expect(uploadTurtleToResource).toHaveBeenCalledTimes(1)
    expect(uploadTurtleToResource.mock.calls[0][0]).toBe(fakeSolidFetch)
    expect(uploadTurtleToResource.mock.calls[0][1]).toBe(url)
    expect(uploadTurtleToResource.mock.calls[0][3]).toEqual({ method: 'PUT', returnResponse: true })
  })

  test('handles a pod base URL with a trailing slash', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    const url = await createNote(POD + '/')
    expect(url).toMatch(new RegExp(`^${POD}/t/t_note_`))
  })
})

describe('useTwinPodNoteCreate — custom typeUri', () => {
  test('uses a custom typeUri when provided', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch, {
      typeUri: 'https://example.com/my/Note'
    })
    await createNote(POD)
    expect(mock$rdf.sym).toHaveBeenCalledWith('https://example.com/my/Note')
  })

  test('defaults typeUri to schema:Note when options are omitted', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote(POD)
    expect(mock$rdf.sym).toHaveBeenCalledWith('http://schema.org/Note')
  })
})

describe('useTwinPodNoteCreate — input validation', () => {
  test('returns null when podBaseUrl is empty', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    const url = await createNote('')
    expect(url).toBeNull()
    expect(uploadTurtleToResource).not.toHaveBeenCalled()
  })

  test('sets error.type to invalid-input when podBaseUrl is empty', async () => {
    const { error, createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote('')
    expect(error.value?.type).toBe('invalid-input')
  })

  // Spec: F.Create_Note — invalid-input must also cover null/undefined podBaseUrl
  test('returns null when podBaseUrl is null', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    const url = await createNote(null)
    expect(url).toBeNull()
    expect(uploadTurtleToResource).not.toHaveBeenCalled()
  })

  test('returns null when podBaseUrl is undefined', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    const url = await createNote(undefined)
    expect(url).toBeNull()
    expect(uploadTurtleToResource).not.toHaveBeenCalled()
  })
})

describe('useTwinPodNoteCreate — HTTP error', () => {
  test('returns null when uploadTurtleToResource returns ok: false', async () => {
    uploadTurtleToResource.mockResolvedValueOnce({ ok: false, status: 403 })
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    const url = await createNote(POD)
    expect(url).toBeNull()
  })

  test('sets error.type to http with status on failure', async () => {
    uploadTurtleToResource.mockResolvedValueOnce({ ok: false, status: 403 })
    const { error, createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote(POD)
    expect(error.value?.type).toBe('http')
    expect(error.value?.status).toBe(403)
  })

  test('noteUri stays null after HTTP failure', async () => {
    uploadTurtleToResource.mockResolvedValueOnce({ ok: false, status: 500 })
    const { noteUri, createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote(POD)
    expect(noteUri.value).toBeNull()
  })
})

describe('useTwinPodNoteCreate — network error', () => {
  test('sets error.type to network when uploadTurtleToResource throws', async () => {
    uploadTurtleToResource.mockRejectedValueOnce(new Error('Failed to fetch'))
    const { error, createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote(POD)
    expect(error.value?.type).toBe('network')
    expect(error.value?.message).toBe('Failed to fetch')
  })
})

describe('useTwinPodNoteCreate — initial placeholder text', () => {
  // Neo 422s on empty literals — initial text must be ' ' (single space)
  test('schema:text is set to a non-empty placeholder (single space)', async () => {
    const { createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    await createNote(POD)
    expect(mock$rdf.literal).toHaveBeenCalledWith(' ')
  })
})

describe('useTwinPodNoteCreate — stale value after failure', () => {
  test('noteUri is null after a failed create following a success', async () => {
    const { noteUri, createNote } = useTwinPodNoteCreate(fakeSolidFetch)
    const first = await createNote(POD)
    expect(noteUri.value).toBe(first)
    uploadTurtleToResource.mockResolvedValueOnce({ ok: false, status: 500 })
    await createNote(POD)
    expect(noteUri.value).toBeNull()
  })
})
