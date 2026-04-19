// UNIT_TYPE=Config
//
// Vitest global setup: polyfills missing in this jsdom build.
//
// jsdom@24 in the current Vitest environment exposes `window.localStorage`
// and `window.sessionStorage` as plain empty objects rather than full
// Storage instances — `setItem` / `getItem` / `removeItem` are undefined.
// Multiple code paths touch Storage (useTwinPodNoteSave's fallback cache,
// App.vue's sessionStorage-backed deep-link preservation, twinpod-auth's
// OIDC state round-trip), so tests need a Map-backed stand-in to exercise
// them without blowing up at the first setItem call.
//
// This file is wired into vite.config.js via `test.setupFiles`.

function makeStorage() {
  const map = new Map()
  return {
    get length() { return map.size },
    key(i) { return Array.from(map.keys())[i] ?? null },
    getItem(key) { return map.has(key) ? map.get(key) : null },
    setItem(key, value) { map.set(String(key), String(value)) },
    removeItem(key) { map.delete(key) },
    clear() { map.clear() }
  }
}

if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
  Object.defineProperty(window, 'localStorage', {
    value: makeStorage(),
    configurable: true,
    writable: true
  })
}

if (typeof sessionStorage === 'undefined' || typeof sessionStorage.setItem !== 'function') {
  Object.defineProperty(window, 'sessionStorage', {
    value: makeStorage(),
    configurable: true,
    writable: true
  })
}
