# @kaigilb/noteworld-notes

Vue composables for creating and managing notes in a TwinPod LWS pod.

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

### `useTwinPodNoteCreate(twinpodFetch)`

Creates a new empty note resource in a TwinPod LWS container.

```js
import { useTwinPodNoteCreate } from '@kaigilb/noteworld-notes'

const twinpodFetch = inject('twinpodFetch')

const {
  noteUri,      // Ref<string|null>  — URI of the newly created note; null before first successful create
  loading,      // Ref<boolean>      — true while the TwinPod POST is in progress
  error,        // Ref<{type, message, status?}|null>  — set when creation fails
  createNote    // (containerUrl: string) => Promise<string|null>
} = useTwinPodNoteCreate(twinpodFetch)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `twinpodFetch` | `Function` | Authenticated DPoP-bound fetch from `inject('twinpodFetch')` |

**`createNote(containerUrl)`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `containerUrl` | `string` | Absolute TwinPod container URI. Must end with `/`. |

Returns: `Promise<string|null>` — the new note's absolute URI, or `null` on failure.

**Error types:**

| type | Cause |
|------|-------|
| `invalid-input` | `containerUrl` was empty or missing |
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

const twinpodFetch = inject('twinpodFetch')
const router = useRouter()

const { loading, error, createNote } = useTwinPodNoteCreate(twinpodFetch)

async function handleNewNote() {
  const uri = await createNote(import.meta.env.VITE_TWINPOD_URL + '/notes/')
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
