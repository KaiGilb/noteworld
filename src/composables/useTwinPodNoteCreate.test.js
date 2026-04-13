// UNIT_TYPE=Hook

import { describe, test, expect, vi } from 'vitest'
import { useTwinPodNoteCreate } from './useTwinPodNoteCreate.js'

// Spec: F.Create_Note — Success-Criteria: A new empty note is open and ready for text input
// Spec: V.Speed_Create_Note — average time from initiating note creation to editor open must
//   reach Goal of 0.5s; composable must complete its TwinPod call and return without blocking

// Factory — creates a mock twinpodFetch that returns a successful POST response.
function makeFetch({ location = 'https://tst-first.demo.systemtwin.com/notes/abc123', status = 201, ok = true } = {}) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    headers: {
      get: (name) => name.toLowerCase() === 'location' ? location : null
    }
  })
}

// Container URL used across all tests.
const CONTAINER = 'https://tst-first.demo.systemtwin.com/notes/'

describe('useTwinPodNoteCreate', () => {

  describe('initial state', () => {

    test('noteUri starts as null', () => {
      const { noteUri } = useTwinPodNoteCreate(makeFetch())
      expect(noteUri.value).toBeNull()
    })

    test('loading starts as false', () => {
      const { loading } = useTwinPodNoteCreate(makeFetch())
      expect(loading.value).toBe(false)
    })

    test('error starts as null', () => {
      const { error } = useTwinPodNoteCreate(makeFetch())
      expect(error.value).toBeNull()
    })

  })

  describe('createNote — success', () => {

    // Spec: F.Create_Note — a new LWS resource must be created in TwinPod and its URI returned
    test('returns the note URI from the Location header', async () => {
      const fetch = makeFetch({ location: 'https://tst-first.demo.systemtwin.com/notes/abc123' })
      const { createNote } = useTwinPodNoteCreate(fetch)
      const uri = await createNote(CONTAINER)
      expect(uri).toBe('https://tst-first.demo.systemtwin.com/notes/abc123')
    })

    test('sets noteUri.value to the returned URI', async () => {
      const fetch = makeFetch({ location: 'https://tst-first.demo.systemtwin.com/notes/abc123' })
      const { createNote, noteUri } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(noteUri.value).toBe('https://tst-first.demo.systemtwin.com/notes/abc123')
    })

    test('resolves an absolute Location header directly', async () => {
      const fetch = makeFetch({ location: 'https://tst-first.demo.systemtwin.com/notes/xyz' })
      const { createNote } = useTwinPodNoteCreate(fetch)
      const uri = await createNote(CONTAINER)
      expect(uri).toBe('https://tst-first.demo.systemtwin.com/notes/xyz')
    })

    test('resolves a relative Location header against containerUrl', async () => {
      // Some LWS pods return a relative path in Location — must be made absolute
      const fetch = makeFetch({ location: '/notes/relative-slug' })
      const { createNote } = useTwinPodNoteCreate(fetch)
      const uri = await createNote(CONTAINER)
      expect(uri).toBe('https://tst-first.demo.systemtwin.com/notes/relative-slug')
    })

    test('POSTs to the containerUrl', async () => {
      const fetch = makeFetch()
      const { createNote } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(fetch).toHaveBeenCalledWith(CONTAINER, expect.objectContaining({ method: 'POST' }))
    })

    test('sends Content-Type: text/plain', async () => {
      const fetch = makeFetch()
      const { createNote } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(fetch).toHaveBeenCalledWith(
        CONTAINER,
        expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'text/plain' }) })
      )
    })

    test('sends an empty body', async () => {
      const fetch = makeFetch()
      const { createNote } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(fetch).toHaveBeenCalledWith(CONTAINER, expect.objectContaining({ body: '' }))
    })

    test('error remains null after a successful create', async () => {
      const { createNote, error } = useTwinPodNoteCreate(makeFetch())
      await createNote(CONTAINER)
      expect(error.value).toBeNull()
    })

  })

  describe('createNote — loading state', () => {

    test('loading is false after createNote completes successfully', async () => {
      const { createNote, loading } = useTwinPodNoteCreate(makeFetch())
      await createNote(CONTAINER)
      expect(loading.value).toBe(false)
    })

    test('loading is true while fetch is in progress', async () => {
      let capturedLoading
      const fetch = vi.fn().mockImplementation(async () => {
        capturedLoading = loading.value
        return { ok: true, status: 201, headers: { get: () => 'https://pod.example.com/notes/x' } }
      })
      const { createNote, loading } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(capturedLoading).toBe(true)
    })

    test('loading is false after createNote throws a network error', async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('Network failure'))
      const { createNote, loading } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(loading.value).toBe(false)
    })

    test('loading is false after createNote receives an HTTP error', async () => {
      const fetch = makeFetch({ ok: false, status: 500, location: null })
      const { createNote, loading } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(loading.value).toBe(false)
    })

  })

  describe('createNote — error handling', () => {

    test('sets error when containerUrl is missing', async () => {
      const { createNote, error } = useTwinPodNoteCreate(makeFetch())
      await createNote('')
      expect(error.value).toMatchObject({ type: 'invalid-input' })
    })

    test('returns null when containerUrl is missing', async () => {
      const { createNote } = useTwinPodNoteCreate(makeFetch())
      const uri = await createNote('')
      expect(uri).toBeNull()
    })

    test('sets error when response is 401 Unauthorized', async () => {
      const fetch = makeFetch({ ok: false, status: 401, location: null })
      const { createNote, error } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(error.value).toMatchObject({ type: 'http', status: 401 })
    })

    test('sets error when response is 403 Forbidden', async () => {
      const fetch = makeFetch({ ok: false, status: 403, location: null })
      const { createNote, error } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(error.value).toMatchObject({ type: 'http', status: 403 })
    })

    test('sets error when response is 500 Internal Server Error', async () => {
      const fetch = makeFetch({ ok: false, status: 500, location: null })
      const { createNote, error } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(error.value).toMatchObject({ type: 'http', status: 500 })
    })

    test('returns null when response is not ok', async () => {
      const fetch = makeFetch({ ok: false, status: 403, location: null })
      const { createNote } = useTwinPodNoteCreate(fetch)
      const uri = await createNote(CONTAINER)
      expect(uri).toBeNull()
    })

    test('sets error when Location header is missing from a successful response', async () => {
      // LWS pod returned 200/201 but forgot to include Location — a pod implementation bug
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: { get: () => null }
      })
      const { createNote, error } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(error.value).toMatchObject({ type: 'missing-location' })
    })

    test('returns null when Location header is missing', async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: { get: () => null }
      })
      const { createNote } = useTwinPodNoteCreate(fetch)
      const uri = await createNote(CONTAINER)
      expect(uri).toBeNull()
    })

    test('sets error when fetch throws a network error', async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
      const { createNote, error } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(error.value).toMatchObject({ type: 'network', message: 'Failed to fetch' })
    })

    test('returns null when fetch throws', async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
      const { createNote } = useTwinPodNoteCreate(fetch)
      const uri = await createNote(CONTAINER)
      expect(uri).toBeNull()
    })

    test('clears a previous error before a new createNote call', async () => {
      const { createNote, error } = useTwinPodNoteCreate(makeFetch())
      // Seed a prior error
      error.value = { type: 'network', message: 'old error' }
      await createNote(CONTAINER)
      expect(error.value).toBeNull()
    })

    test('noteUri remains null when createNote fails', async () => {
      const fetch = makeFetch({ ok: false, status: 403, location: null })
      const { createNote, noteUri } = useTwinPodNoteCreate(fetch)
      await createNote(CONTAINER)
      expect(noteUri.value).toBeNull()
    })

  })

  describe('createNote — speed', () => {

    // Spec: V.Speed_Create_Note — Goal: 0.5s from initiation to editor open.
    // This test measures composable overhead only (mock fetch = 0ms).
    // TwinPod network latency is the dominant factor in production and is not testable here.
    test('resolves quickly when fetch responds immediately (composable overhead < 50ms)', async () => {
      const { createNote } = useTwinPodNoteCreate(makeFetch())
      const start = Date.now()
      await createNote(CONTAINER)
      const elapsed = Date.now() - start
      // Composable logic itself must not introduce meaningful delay — 50ms is a conservative ceiling
      expect(elapsed).toBeLessThan(50)
    })

  })

})
