import { defineConfig, devices } from '@playwright/test'

// Fixed port for E2E tests — avoids conflicts with manually-running dev servers on 5173–5175
const E2E_PORT = 5199

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  // Start a dedicated Vite dev server on port 5199 before running tests.
  // Separate port means E2E tests never conflict with a manually-running dev server.
  webServer: {
    command: `npm run dev -- --port ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: false
  }
})
