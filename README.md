# @kaigilb/noteworld-notes

Vue composables for creating and managing notes in a TwinPod flat node store.

---

## Install

```bash
npm install @kaigilb/noteworld-notes
```

Requires a `.npmrc` pointing `@kaigilb` at GitHub Packages:

```
@kaigilb:registry=https://npm.pkg.github.com
```

---

## Public API

### `useTwinPodNoteCreate(hyperFetch)`

Creates a new note node in a TwinPod flat node store by POSTing a Turtle document to `{podBaseUrl}/node/`.

```js
import { useTwinPodNoteCreate } from '@kaigilb/noteworld-notes'

const hyperFetch = inject('hyperFetch')

const {
  noteUri,      // Ref<string|null>  — URI of the newly created note; null before first successful create
  loading,      // Ref<boolean>      — true while the TwinPod POST is in progress
  error,        // Ref<{type, message, status?}|null>  — set when creation fails
  createNote    // (podBaseUrl: string) => Promise<string|null>
} = useTwinPodNoteCreate(hyperFetch)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `hyperFetch` | `Function` | Authenticated TwinPod fetch from `inject('hyperFetch')`. Must be the hyperFetch instance from the app's `rdfStore.js`. |

**`createNote(podBaseUrl)`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `podBaseUrl` | `string` | TwinPod pod base URL without trailing slash. Example: `'https://tst-first.demo.systemtwin.com'` |

Returns: `Promise<string|null>` — the new note's absolute URI (e.g. `https://pod.../node/t_abc1`), or `null` on failure.

**Error types:**

| type | Cause |
|------|-------|
| `invalid-input` | `podBaseUrl` was empty, null, or missing |
| `http` | TwinPod returned a non-2xx response (includes `status` field) |
| `missing-location` | TwinPod responded 2xx but did not return a `Location` header |
| `network` | Fetch threw (network failure, DNS error, etc.) |

---

## Usage

```vue
<script setup>
import { inject } from 'vue'
import { useRouter } from 'vue-router'
import { useTwinPodNoteCreate } from '@kaigilb/noteworld-notes'

const hyperFetch = inject('hyperFetch')
const router = useRouter()

const { loading, error, createNote } = useTwinPodNoteCreate(hyperFetch)

async function handleNewNote() {
  const uri = await createNote(import.meta.env.VITE_TWINPOD_URL)
  if (uri) {
    router.push({
      path: '/app',
      query: {
        app: 'NoteWorld',
        navigator: 'editor',
        target: encodeURIComponent(uri)
      }
    })
  }
}
</script>
```

---

## Spec

`/Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md`
