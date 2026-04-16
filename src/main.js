// UNIT_TYPE=Feature

/**
 * NoteWorld app entry point.
 * Mounts the Vue app with Vue Router.
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'

createApp(App).use(store).use(router).mount('#app')
