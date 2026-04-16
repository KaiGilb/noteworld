import { describe, test, expect, vi, beforeEach } from 'vitest'

const getSolidDataset = vi.fn()
const getThing = vi.fn()
const getStringNoLocaleAll = vi.fn()

vi.mock('@kaigilb/twinpod-client/write', () => ({
  getSolidDataset: (...args) => getSolidDataset(...args),
  getThing: (...args) => getThing(...args),
  getStringNoLocaleAll: (...args) => getStringNoLocaleAll(...args)
}))

import { useTwinPodNoteRead } from './useTwinPodNoteRead.js'

const POD = 'https://tst-first.demo.systemtwin.com'
const NOTE_URL = `${POD}/notes/t_note_123_abcd`
const THING_URL = `${NOTE_URL}#note`
const DEFAULT_PRED = 'http://schema.org/text'

const fakeSolidFetch = vi.fn()

beforeEach(() => {
  getSolidDataset.mockReset()
  getThing.mockReset()
  getStringNoLocaleAll.mockReset()
  getSolidDataset.mockResolvedValue({ __kind: 'dataset' })
  getThing.mockReturnValue({ __kind: 'thing', url: THING_URL })
  getStringNoLocaleAll.mockReturnValue(['loaded text'])
})

describe('useTwinPodNoteRead — initial state', () => {
  test('text starts null', () => {
    const { text } = useTwinPodNoteRead(fakeSolidFetch)
    expect(text.value).toBeNull()
  })
  test('loading starts false', () => {
    const { loading } = useTwinPodNoteRead(fakeSolidFetch)
    expect(loading.value).toBe(false)
  })
  test('error starts null', () => {
    const { error } = useTwinPodNoteRead(fakeSolidFetch)
    expect(error.value).toBeNull()
  })
})

describe('useTwinPodNoteRead — success', () => {
  test('fetches the dataset at the resource URL', async () => {
    const { loadNote } = useTwinPodNoteRead(fakeSolidFetch)
    await loadNote(NOTE_URL)
    expect(getSolidDataset).toHaveBeenCalledTimes(1)
    expect(getSolidDataset.mock.calls[0][0]).toBe(NOTE_URL)
    expect(getSolidDataset.mock.calls[0][1]).toEqual({ fetch: fakeSolidFetch })
  })

  test('retrieves the Thing at {noteUrl}#note', async () => {
    const { loadNote } = useTwinPodNoteRead(fakeSolidFetch)
    await loadNote(NOTE_URL)
    expect(getThing.mock.calls[0][1]).toBe(THING_URL)
  })

  test('returns the string value with default predicate', async () => {
    const { loadNote } = useTwinPodNoteRead(fakeSolidFetch)
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('loaded text')
    expect(getStringNoLocaleAll.mock.calls[0][1]).toBe(DEFAULT_PRED)
  })

  test('updates the text ref after success', async () => {
    const { text, loadNote } = useTwinPodNoteRead(fakeSolidFetch)
    await loadNote(NOTE_URL)
    expect(text.value).toBe('loaded text')
  })

  test('returns empty string when predicate is absent', async () => {
    getStringNoLocaleAll.mockReturnValueOnce([])
    const { loadNote, text } = useTwinPodNoteRead(fakeSolidFetch)
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('')
    expect(text.value).toBe('')
  })

  test('returns the last value when the predicate has multiple values (TwinPod state history)', async () => {
    getStringNoLocaleAll.mockReturnValueOnce([' ', 'first edit', 'latest edit'])
    const { loadNote } = useTwinPodNoteRead(fakeSolidFetch)
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('latest edit')
  })

  test('accepts a custom predicateUri', async () => {
    const { loadNote } = useTwinPodNoteRead(fakeSolidFetch, { predicateUri: 'https://example.com/p' })
    await loadNote(NOTE_URL)
    expect(getStringNoLocaleAll.mock.calls[0][1]).toBe('https://example.com/p')
  })
})

describe('useTwinPodNoteRead — state history edge cases (VATester gap)', () => {
  // TwinPod never overwrites: after many edits a note carries N historical values
  // in document order. The read path must always pick the LAST value regardless of
  // how many prior values exist, and must not be fooled by the single-space
  // placeholder that F.Create_Note writes at creation time.
  test('ignores the single-space placeholder when later edits exist', async () => {
    getStringNoLocaleAll.mockReturnValueOnce([' ', 'real content'])
    const { loadNote } = useTwinPodNoteRead(fakeSolidFetch)
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('real content')
  })

  test('returns the placeholder space when it is the only value on a fresh note', async () => {
    // A freshly-created note has only the ' ' placeholder — read must surface it
    // so the editor textarea doesn't show "null".
    getStringNoLocaleAll.mockReturnValueOnce([' '])
    const { loadNote, text } = useTwinPodNoteRead(fakeSolidFetch)
    const value = await loadNote(NOTE_URL)
    expect(value).toBe(' ')
    expect(text.value).toBe(' ')
  })

  test('handles a long history without throwing (10 historical values)', async () => {
    const history = Array.from({ length: 10 }, (_, i) => `edit ${i}`)
    getStringNoLocaleAll.mockReturnValueOnce(history)
    const { loadNote } = useTwinPodNoteRead(fakeSolidFetch)
    const value = await loadNote(NOTE_URL)
    expect(value).toBe('edit 9')
  })
})

describe('useTwinPodNoteRead — input validation', () => {
  test('returns null and sets error when noteResourceUrl is empty', async () => {
    const { error, loadNote } = useTwinPodNoteRead(fakeSolidFetch)
    const value = await loadNote('')
    expect(value).toBeNull()
    expect(error.value?.type).toBe('invalid-input')
    expect(getSolidDataset).not.toHaveBeenCalled()
  })
})

describe('useTwinPodNoteRead — not found', () => {
  test('sets error.type to not-found when the Thing is missing', async () => {
    getThing.mockReturnValueOnce(null)
    const { error, loadNote } = useTwinPodNoteRead(fakeSolidFetch)
    const value = await loadNote(NOTE_URL)
    expect(value).toBeNull()
    expect(error.value?.type).toBe('not-found')
  })
})

describe('useTwinPodNoteRead — HTTP error', () => {
  test('sets error.type to http on rejection with statusCode', async () => {
    const err = new Error('Not Found')
    err.statusCode = 404
    getSolidDataset.mockRejectedValueOnce(err)
    const { error, loadNote } = useTwinPodNoteRead(fakeSolidFetch)
    await loadNote(NOTE_URL)
    expect(error.value?.type).toBe('http')
    expect(error.value?.status).toBe(404)
  })

  test('sets error.type to network on rejection without statusCode', async () => {
    getSolidDataset.mockRejectedValueOnce(new Error('Failed to fetch'))
    const { error, loadNote } = useTwinPodNoteRead(fakeSolidFetch)
    await loadNote(NOTE_URL)
    expect(error.value?.type).toBe('network')
  })
})
