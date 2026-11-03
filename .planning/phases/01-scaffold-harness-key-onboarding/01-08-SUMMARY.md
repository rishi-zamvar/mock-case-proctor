---
phase: 01-scaffold-harness-key-onboarding
plan: 08
subsystem: key-onboarding-e2e
tags: [e2e, playwright, safeStorage, canary, KEY-01, KEY-02, KEY-03, KEY-04]
requires: [01-07 launch harness + replay server, 01-06 composition root, 01-03 KeyStore, 01-05 Settings DOM]
provides: [tests/e2e/key.spec.ts, tests/e2e/leak.spec.ts]
affects: []
tech-stack:
  added: []
  patterns: [relaunch-same-userData persistence proof, canary-key leak sweep across DOM/IPC/storage/console/stdio/disk]
key-files:
  created: [tests/e2e/key.spec.ts, tests/e2e/leak.spec.ts]
  modified: []
decisions:
  - "Real safeStorage + use-mock-keychain persists across relaunch with no dialog; the E2E_FAKE_CIPHER fallback was not needed, so src/main/keys/cipher.ts is unchanged"
metrics:
  duration: 4min
  completed: 2026-11-03
  tasks: 2
  files: 2
---

# Phase 1 Plan 08: Key onboarding and leak-canary E2E Summary

These E2E tests run the built Electron app against the replay server. They cover KEY-01, KEY-02 and KEY-04: paste and verify, invalid key, offline then Save anyway, auto-fill from env and from .env, a rejected env key, and Replace and Clear. Persistence across relaunch goes through the real safeStorage under the mock keychain. A KEY-03 canary test confirms the key reaches the API and appears on no surface the renderer or disk can see.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Onboarding E2E (7 tests) | a19c286 | tests/e2e/key.spec.ts |
| 2 | Key-leak canary E2E | 85126b5 | tests/e2e/leak.spec.ts |

## Verification

- `npm run test:e2e`: 16/16 passed (7 key, 1 leak, 8 shell)
- `npx vitest run`: 120 passed, 1 skipped
- `npm run typecheck`: exit 0
- Open Question 1 is resolved. The relaunch reaches Home in about 1 s with source `stored`, and the replay server gets 0 requests, so the stored key is not probed again and no keychain prompt appears.

## Deviations from Plan

None. The plan ran as written. The cipher fallback was not used.

## Known Stubs

None.

## Self-Check: PASSED
