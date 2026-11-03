---
phase: 03-walking-skeleton-on-fakes
plan: 03
subsystem: store
tags: [persistence, zod, atomic-write, quarantine, library]
requires: ["03-01 SessionFileSchema", "03-01 LibraryViewSchema"]
provides: ["createSessionStore", "SessionStore"]
affects: ["library IPC", "crash-resume", "session orchestrator"]
tech-stack:
  added: []
  patterns: ["sync tmp+fsync+rename atomic write", "schema-gated load with quarantine", "optional fs override as test seam"]
key-files:
  created: [src/main/store/sessionStore.ts, src/main/store/sessionStore.test.ts]
  modified: []
decisions:
  - "fs seam is Partial<typeof node:fs> merged over node:fs, so tests can spy read calls too (path-traversal test)"
  - "quarantine failures are logged (id + message) and swallowed so list() never throws"
metrics:
  duration: ~6min
  completed: 2026-11-03
requirements: [REV-05, FLOW-07, LIB-02]
---

# Phase 3 Plan 03: Session Store Summary

File-backed SessionStore: zod-gated save via session.json.tmp + fsync + rename, corrupt/invalid files moved to `_quarantine/<id>-<ts>.json` and counted once, and a libraryView derived fresh from session files (latest completed score per case, newest active session as resumable).

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Atomic save, validated load, quarantine | 88de147 (RED), a3704f8 (GREEN) |
| 2 | libraryView: completion + resumable | 069cbd5 (RED), 416a898 (GREEN) |

19 tests in sessionStore.test.ts; `npx vitest run src/main/store` 31/31 green; `typecheck:node` clean.

## Deviations from Plan

- fs override widened from the five write functions to `Partial<typeof fs>` so the `load('../x')` test can prove no fs read happens. Same seam, no extra code.

## Deferred

- `src/main/store/sessionSchema.test.ts:10` (03-01) fails eslint explicit-function-return-type. Not this plan's file.

## Known Stubs

None.

## Self-Check: PASSED
