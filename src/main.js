// UNIT_TYPE=Feature

/**
 * NoteWorld app entry point.
 * Mounts the Vue app with Vue Router.
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import './assets/design-tokens.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'

// DEV-ONLY DEBUG HANDLE — temporary (remove before next commit).
// Exposes the TwinPod client namespace on `window` so we can probe
// rdfStore contents from the DevTools console while diagnosing
// F.Find_Note on tst-ia2. Safe because Vite strips in production
// builds via import.meta.env.DEV guard.
if (import.meta.env.DEV) {
  import('@kaigilb/twinpod-client').then(mod => { window.ur = mod.ur })
}

createApp(App).use(store).use(router).mount('#app')
