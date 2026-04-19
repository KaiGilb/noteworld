import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    watch: {
      ignored: ['!**/twinpod-client/src/**']
    }
  },
  resolve: {
    preserveSymlinks: true,
    // dedupe ensures a single instance of these packages even when they appear
    // in multiple symlinked node_modules trees (app + noteworld-notes + twinpod-client).
    // rdflib must be deduped — multiple rdflib instances break cross-store operations.
    // twinpod-client must be deduped — all ur.* calls must hit the same singleton `ur`
    // object; two instances means ur.rdfStore populated by search isn't visible to reads.
    //
    // IMPORTANT: twinpod-client is source-direct ("main": "./src/index.js") and is
    // pre-bundled by Vite at startup. If twinpod-client/src/** changes, Vite's cached
    // pre-bundle goes stale. Use `npm run dev:fresh` (vite --force) to force
    // re-optimization, or: rm -rf node_modules/.vite && npm run dev.
    dedupe: ['@kaigilb/twinpod-client', 'rdflib'],
    alias: {
      '@kaigilb/noteworld-notes': '/Users/kaigilb/Developer/noteworld/packages/noteworld-notes/src/index.js'
    }
  },
  test: {
    environment: 'jsdom',
    // Exclude Playwright E2E tests — those are run separately via `npm run test:e2e`
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // jsdom in this build ships a stub `window.localStorage` with no methods;
    // setupFiles installs a Map-backed polyfill before any test runs.
    setupFiles: ['./src/test-setup.js'],
  }
})
