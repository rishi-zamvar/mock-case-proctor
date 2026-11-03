---
phase: 01-scaffold-harness-key-onboarding
plan: 06
subsystem: main-process
tags: [electron, security, csp, ipc, safeStorage, e2e]
requires: [01-01, 01-02, 01-03]
provides: [applyE2ESwitches, registerIpc, createSafeStorageCipher, registerAppProtocol, secure composition root, built out/]
affects: [01-07]
tech-stack:
  added: []
  removed: ["@electron-toolkit/preload", "@electron-toolkit/utils"]
  patterns: [Electron-coupled branches tested through structural fakes, type-only electron imports outside index.ts]
key-files:
  created: [src/main/e2e.ts, src/main/e2e.test.ts, src/main/ipc.ts, src/main/ipc.test.ts, src/main/appProtocol.ts, src/main/keys/cipher.ts, resources/assets/.gitkeep]
  modified: [src/main/index.ts, electron.vite.config.ts, package.json, package-lock.json]
decisions:
  - "Build-time meta CSP omits frame-ancestors (ignored in meta and logs a console error); the app:// response header still sends the full CSP"
  - "corsEnabled not added to app:// privileges: smoke launch of out/ rendered with no CORS errors (Open Question 3 closed)"
metrics:
  duration: ~8 min
  completed: 2026-11-03
  tasks: 2
  files: 11
---

# Phase 1 Plan 06: Secure composition root Summary

Main process now composes the pure modules into a sandboxed, context-isolated window served from app://bundle with a CSP header on every response and a CSP meta in the built index.html, a three-channel zod-validated IPC router that refuses non-app senders, E2E fake-media switches, and KeyStore persisted through safeStorage's async API.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | applyE2ESwitches + registerIpc (TDD) | 9469b83 (RED), cb5f5f0 (GREEN) |
| 2 | Composition root, cipher, app:// handler, CSP plugin, drop toolkit | 8f59945 |

## Verification

- `npx vitest run`: 15 files, 117 tests green (16 new in e2e/ipc).
- `npm run build` (typecheck + electron-vite build) exits 0; `out/renderer/index.html` carries the CSP meta with `wasm-unsafe-eval`; `out/preload/index.js` requires only `electron`.
- Ad-hoc Playwright smoke of the built app with E2E=1 (scratchpad script, not committed; plan 01-07 owns E2E): loaded `app://bundle/index.html`, React mounted, `window.api.key.status()` returned `{hasKey:false, source:'none'}`, `typeof require === 'undefined'`, `window.__e2e` present, zero console errors.

## Deviations from Plan

**1. [Rule 1 - Bug] frame-ancestors removed from the meta CSP only**
- **Found during:** Task 2 smoke launch
- **Issue:** Chromium logs a console error: "frame-ancestors is ignored when delivered via a <meta> element". That would add noise to (or fail) console-error assertions in 01-07.
- **Fix:** `electron.vite.config.ts` builds `META_CSP` by filtering that one directive out of `CSP`. The app:// header still sends the full CSP constant, so nothing is weakened.
- **Commit:** 8f59945

## Known Stubs

None.

## Self-Check: PASSED
