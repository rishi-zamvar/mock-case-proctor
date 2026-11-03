---
phase: 01-scaffold-harness-key-onboarding
plan: 02
subsystem: security-core
tags: [redaction, logger, app-protocol, path-safety, zod, ipc]
requires: [01-01]
provides:
  - src/main/log.ts (KEY_PATTERN, redact, format, createLogger, log)
  - src/main/protocol.ts (resolveSafePath, resolveAppRequest, isAppOrigin)
  - src/shared/schemas.ts (KeyStatusSchema, SaveResultSchema, SaveArgsSchema)
affects: [01-06]
tech-stack:
  added: []
  patterns: [pure electron-free modules, compile-time schema/contract equality guards]
key-files:
  created: [src/main/log.ts, src/main/log.test.ts, src/main/protocol.ts, src/main/protocol.test.ts, src/shared/schemas.ts, src/shared/schemas.test.ts]
  modified: []
key-decisions:
  - "resolveAppRequest checks the raw (pre-WHATWG) path too: URL parsing collapses %2e%2e and clamps at root, so traversal attempts are refused instead of silently clamped"
requirements-completed: [FND-05, KEY-03, QA-01]
duration: 2min
completed: 2026-11-03
---

# Phase 1 Plan 02: Pure Security Core Summary

Redacting main-process logger (masks `sk-ant-` keys in strings, objects, Error stacks, circular-safe), electron-free app:// path resolver + origin check proven against traversal/encoding/host tricks, and strict zod IPC schemas type-locked to `src/shared/ipc.ts`.

## Accomplishments

- 34 tests across 3 files (log 6, protocol 14, schemas 14); with tests/config: 46 pass
- None of the three modules imports `electron`; preload does not import schemas
- Own files pass tsc and eslint

## Task Commits

1. Task 1 RED `e6d7044`, GREEN `384194e` - logger
2. Task 2 RED `25aa552`, GREEN `367f9e9` - app:// resolver + origin check
3. Task 3 RED `0cb6d94`, GREEN `bd870e8` - strict zod schemas

## Deviations from Plan

**1. [Rule 1 - Bug] Plan's URL normalization assumption was wrong**
- **Found during:** Task 2
- **Issue:** Plan said WHATWG URL does not normalize `%2e%2e`. It does: `app://bundle/%2e%2e/main/index.js` yields pathname `/main/index.js`, which resolves inside root and the test expecting `null` failed.
- **Fix:** `resolveAppRequest` also runs `resolveSafePath` on the raw path portion of the URL string; any climb-out attempt returns null. The normalized path is still what gets returned.
- **Files modified:** src/main/protocol.ts
- **Commit:** 367f9e9

## Notes

- `npm run typecheck` currently fails only on `src/main/keys/keyStore.test.ts` (a parallel plan's RED test, module not yet written). Not in scope here.

## Self-Check: PASSED
