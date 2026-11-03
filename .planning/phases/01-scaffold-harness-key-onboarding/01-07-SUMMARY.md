---
phase: 01-scaffold-harness-key-onboarding
plan: 07
subsystem: test-harness
tags: [playwright, electron, e2e, keymgr, fixtures, csp, fake-mic]
requires: [01-04, 01-05, 01-06]
provides:
  - tests/e2e/launch.ts launch() / ROOT (minimal-env Electron launch of out/, replay-wired)
  - tests/e2e/global-setup.ts (tone.wav via say+afconvert, replay server, REPLAY_URL)
  - playwright.config.ts (workers 1)
  - recorded probe-ok (200) and probe-401 (401) Claude fixtures
  - keymgr mock-case-proctor entry + gitignored .env symlink
affects: [01-08, 01-09]
tech-stack:
  added: []
  patterns: [E2E env built explicitly (never spread process.env), cross-origin app:// checked via main net.fetch]
key-files:
  created: [playwright.config.ts, tests/e2e/global-setup.ts, tests/e2e/launch.ts, tests/e2e/shell.spec.ts, tests/replay/record.test.ts, src/main/appProtocol.test.ts, tests/fixtures/claude/probe-ok/0.req.json, tests/fixtures/claude/probe-ok/0.res.json, tests/fixtures/claude/probe-401/0.req.json, tests/fixtures/claude/probe-401/0.res.json]
  modified: [src/main/appProtocol.ts]
key-decisions:
  - "app://evil is unreadable from the renderer (no corsEnabled, by design); E2E proves 404 through main net.fetch on the same handler and asserts the renderer fetch is blocked"
  - "Meta CSP E2E assertion compares against CSP minus frame-ancestors (01-06 decision); header compares against the full constant"
  - "Probe keeps thinking:{type:'disabled'}: real API returned 200 with it"
requirements-completed: [FND-01, FND-03, FND-05, KEY-02, KEY-03]
duration: ~10min
completed: 2026-11-03
---

# Phase 1 Plan 07: keymgr, real fixtures, Playwright shell E2E Summary

Project registered in keymgr with a gitignored `.env` symlink, real probe-ok/probe-401 fixtures recorded once through the RECORD proxy (key-free), and an 8-test Playwright `_electron` suite proving the built app is sandboxed, CSP-locked, app://-safe, replay-wired and fed by a non-silent fake mic.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | keymgr + .env symlink + record probe fixtures | fd8bea1 |
| 2 | Playwright config, global setup, launch helper, shell E2E | 0eea023 (RED), 215bbc0 (fix), 5d3ad5e |

## Verification

- `npx vitest run`: 17 files, 120 passed, 1 skipped (RECORD-only block).
- `npm run typecheck`: clean. eslint clean on new files.
- `npm run test:e2e`: 8/8 passed (~7 s). Fake mic peak > 0.1.
- Fixtures: probe-ok status 200, probe-401 status 401, req body model `claude-haiku-5-5`, max_tokens 1; no authorization/x-api-key/key value in any fixture.
- `.env` is a symlink, gitignored, not tracked, has one ANTHROPIC_API_KEY line (value never printed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] app:// handler threw on missing files**
- **Found during:** Task 2 (app:// refusal test)
- **Issue:** `app://bundle/%2e%2e/main/index.js` is normalised by Chromium to `app://bundle/main/index.js`, which resolves inside the bundle root but does not exist; `net.fetch` rejects and the request failed with ERR_UNEXPECTED instead of 404.
- **Fix:** catch the `net.fetch` rejection and return 404. Unit test `src/main/appProtocol.test.ts` added first (RED 0eea023).
- **Files modified:** src/main/appProtocol.ts
- **Commit:** 215bbc0

**2. [Rule 1 - Test correctness] app://evil and meta CSP assertions adjusted**
- `app://evil` is cross-origin and the scheme has no `corsEnabled`, so a renderer fetch can never read a status. The test asserts the renderer fetch is blocked and that main's `net.fetch` (same handler) gets 404. Enabling CORS to make the renderer read it would weaken the lockdown, so it was not done.
- The meta CSP omits `frame-ancestors` per the 01-06 decision; the test compares the meta against that derivation and the header against the full `CSP`.

**3. [Rule 3 - Blocking] Types for E2E spec**
- `src/preload/index.d.ts` is shadowed by `index.ts` in the node tsconfig, so the spec imports it type-only for `window.api` / `window.__e2e`. `getLastWebPreferences` is missing from electron.d.ts; cast locally.

## Known Stubs

None.

## Self-Check: PASSED
