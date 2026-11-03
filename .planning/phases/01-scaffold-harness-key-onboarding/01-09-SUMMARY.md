---
phase: 01-scaffold-harness-key-onboarding
plan: 09
subsystem: phase-gate
tags: [packaging, codesign, entitlements, live-api, phase-gate, FND-01, FND-02, FND-04, KEY-01, KEY-02]
requires: [01-08 key E2E, 01-07 launch harness + replay server]
provides: [scripts/verify-package.sh, npm run verify:package, tests/e2e/packaged.spec.ts, tests/e2e/live.spec.ts, src/main/keys/probe.live.test.ts]
affects: [every later phase gate: test:packaged + test:live are the sign-off commands]
tech-stack:
  added: []
  patterns: [capture command output before grep -q under pipefail, LIVE-gated Vitest + @live Playwright at phase sign-off]
key-files:
  created: [scripts/verify-package.sh, tests/e2e/packaged.spec.ts, tests/e2e/live.spec.ts, src/main/keys/probe.live.test.ts, resources/assets/ASSETS.txt]
  modified: [package.json]
decisions:
  - "resources/assets keeps a non-dot placeholder (ASSETS.txt): electron-builder drops dotfiles, so a dir holding only .gitkeep is never packaged"
  - "test:live rebuilds out/ before the @live Playwright run so it never probes a stale build"
metrics:
  duration: 9min
  completed: 2026-11-03
  tasks: 3
  files: 6
---

# Phase 1 Plan 09: Phase gate (packaged smoke, live probe, push) Summary

The ad-hoc-signed arm64 `.app` builds and passes `verify:package`, which checks entitlements on the app and the Renderer helper, both usage strings, the arm64 binary and the unpacked assets. Under Playwright the packaged app reaches Home through the SDK. Rishi's real key probes as valid against the live API in Vitest and in the built app. The whole suite passes three runs in a row, and `main` is pushed to the private repo.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Package, verify signature/entitlements, packaged smoke | 4b25652 | scripts/verify-package.sh, tests/e2e/packaged.spec.ts, package.json, resources/assets/ASSETS.txt |
| 2 | Live real-API probe (Vitest + built app) | c62abce | src/main/keys/probe.live.test.ts, tests/e2e/live.spec.ts, package.json |
| 3 | Phase gate: suite x3, TDD audit, push | (git only) | - |

## Verification

- `npm run test:packaged`: prints `package OK`, and the @packaged test passes.
- `npm run test:live`: 121 Vitest tests pass (the live probe ran rather than being skipped; the 1 skip is the RECORD-only block), and the @live Playwright test passes. It made 3 real probe calls of max_tokens 1 each.
- `npm test` without LIVE: 120 passed, 2 skipped (probe.live is skipped, not failed).
- `npm run typecheck`: clean.
- `npm run test:e2e` three times in a row: 16/16, 16/16, 16/16. No flakes.
- `npx vitest run tests/config`: 12/12. `.env` is not tracked.
- `HEAD` equals `origin/main` (c62abce), and the repo visibility is `PRIVATE`.

## TDD order audit (QA-01)

Every module's `test(...)` RED commit lands before its `feat(...)` commit:
- log: e6d7044 → 384194e
- app protocol: 25aa552 → 367f9e9
- IPC schemas: 0cb6d94 → bd870e8
- dotenv: aedd613 → f760423
- probe: a288c0b → 6707d5f
- KeyStore: 6e95711 → b6607b8
- replay server: 059210b → 8428e7d
- Settings: b8aed63 → 4034968
- E2E switches + IPC router: 9469b83 → cb5f5f0

The fixture hygiene scan (8d3f817) is an extra guard test added after the replay server landed. It is not the module's RED commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] verify-package.sh returned false failures under pipefail**
- **Found during:** Task 1
- **Issue:** Under `set -o pipefail`, `codesign ... | grep -q` failed even though the signature was ad-hoc. `grep -q` exits early, codesign gets SIGPIPE, and the pipeline reports failure.
- **Fix:** The script now captures each command's output in a variable and greps it with a here-string.
- **Commit:** 4b25652

**2. [Rule 3 - Blocking] resources/assets was missing from the package**
- **Found during:** Task 1
- **Issue:** The directory held only `.gitkeep`, and electron-builder skips dotfiles, so `app.asar.unpacked/resources/assets` was never created.
- **Fix:** Renamed `.gitkeep` to `ASSETS.txt`, a one-line explanation of why the file exists.
- **Commit:** 4b25652

**3. [Rule 3 - Blocking] test:live could run a stale out/**
- **Fix:** Added `electron-vite build` before `playwright test --grep @live`.
- **Commit:** c62abce

## Note for Rishi

The first time you launch a freshly rebuilt packaged `.app` from Finder, macOS may show one Keychain "Safe Storage" prompt, because the ad-hoc signature changes with every build. Click **Always Allow**.

## Known Stubs

None.

## Self-Check: PASSED
