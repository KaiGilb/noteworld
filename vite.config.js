import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    preserveSymlinks: true,
    dedupe: ['@kaigilb/twinpod-client', 'rdflib'],
    alias: {
      '@kaigilb/noteworld-notes': '/Users/kaigilb/Developer/noteworld/packages/noteworld-notes/src/index.js'
    }
  },
  test: {
    environment: 'jsdom',
    // Exclude Playwright E2E tests — those are run separately via `npm run test:e2e`
    exclude: ['tests/e2e/**', 'node_modules/**'],
  }
})
