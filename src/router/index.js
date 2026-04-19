// UNIT_TYPE=Feature

/**
 * NoteWorld router.
 * Routes:
 *   /       → HomeView        (requires authentication)
 *   /login  → LoginView       (public)
 *   /app    → NoteEditorView  (requires authentication; all editor state in query params)
 *
 * The /app route follows the URI State Standard (URI_STATE_01): all app state is encoded
 * in query parameters. Example editor URL:
 *   /app?app=NoteWorld&navigator=editor&target=<percent-encoded note URI>
 *
 * @see Spec: /Users/kaigilb/Vault_Ideas/5 - Project/NoteWorld/NoteWorld.md
 */

import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import HomeView from '../views/HomeView.vue'
import NoteEditorView from '../views/NoteEditorView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', component: LoginView },
    { path: '/', component: HomeView },
    // /app handles all editor state via query params (URI State Standard)
    { path: '/app', component: NoteEditorView }
  ]
})

export default router
