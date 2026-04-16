# Changelog

## [3.0.0] - 2026-04-15
### Breaking changes
- `useTwinPodNoteCreate` now creates notes via `PATCH {podRoot}/node/Substance` with `Content-Type: application/sparql-update` and body `INSERT DATA { <client-minted-uri> a <neo:a_note> . }`.
- The URI is minted client-side (`{podRoot}/node/t_note_{timestamp}_{4-rand}`) because the TwinPod server returns `201 "Success"` with no `Location` header.
- Removed the `missing-location` error state; it is no longer meaningful.
### Rationale
- `@kaigilb/noteworld-notes@2.0.0` POSTed Turtle to `{podRoot}/node/` and read a `Location` header. That contract was wrong — the TwinPod server at `tst-first.demo.systemtwin.com` returns `404` on `OPTIONS /node/` (and `POST /node/`), so every real-pod call failed. All 2.0.0 tests passed only because they mocked the wrong response shape.
- The real contract was verified by a direct probe against the real pod on 2026-04-15. See `/Users/kaigilb/Vault_Ideas/9 - Standard/Reference_Code_TwinPod-Writes.md` for full details.

## [2.0.0] - 2026-04-14
### Breaking changes
- `useTwinPodNoteCreate` now accepts `hyperFetch` (from the app's `rdfStore.js`) instead of `twinpodFetch`
- `createNote(podBaseUrl)` now accepts the pod base URL without trailing slash instead of a container URL
- Composable now POSTs a complete Turtle document (`<> a neo:a_note .`) to `{podBaseUrl}/node/`
- All TwinPod communication is `text/turtle` — no plain text, no JSON-LD

## [1.0.0] - 2026-04-13
### Initial release
- `useTwinPodNoteCreate` composable — creates a new empty LWS resource in a TwinPod container and returns its URI
