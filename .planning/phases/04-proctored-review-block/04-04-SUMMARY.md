---
phase: 04-proctored-review-block
plan: 04
subsystem: main
tags: [electron, power, tcc, media-access]
requires: []
provides:
  - "createAwake(blocker, log) -> { hold(), release() } (src/main/power.ts)"
  - "ensureMediaAccess({ platform, e2e, prefs, log }) (src/main/media.ts)"
affects: [04-05, 04-07]
tech-stack:
  added: []
  patterns: ["Electron API injected as narrow structural type; module stays Electron-free"]
key-files:
  created: [src/main/power.ts, src/main/power.test.ts, src/main/media.ts, src/main/media.test.ts]
  modified: []
decisions:
  - "ensureMediaAccess wraps the status read and the ask in a single try per kind, so a throwing getMediaAccessStatus also reports 'error' rather than rejecting"
  - "ensureMediaAccess logs one 'media access' info line with the kind->status map (kinds and statuses only)"
metrics:
  duration: 2min
  completed: 2026-11-03
  tasks: 2
  files: 4
---

# Phase 4 Plan 04: Power and Media Access Helpers Summary

Two Electron-free main modules, ready for 04-05 to wire into index.ts:
- `createAwake` gives idempotent hold/release over an injected `prevent-display-sleep` blocker and logs the fixed lines `awake hold` and `awake release`.
- `ensureMediaAccess` asks for the microphone, then the camera, but only on macOS, outside E2E, and only when that kind's status is `not-determined`. It never rejects.

## Tasks

| Task | Name | RED | GREEN |
|------|------|-----|-------|
| 1 | createAwake display-sleep blocker | dfdb087 | 565e279 |
| 2 | ensureMediaAccess for macOS TCC | 4b6b81b | e32e1b8 |

## Verification

- `npx vitest run --project main`: 641 passed, 2 skipped
- `npm run typecheck:node` exits 0
- Neither module imports `electron`
- A throwaway type check (written, run, then deleted) confirmed that Electron's `PowerSaveBlocker` is assignable to `Blocker` and `SystemPreferences` is assignable to `MediaPrefs`, so 04-05 can pass them in directly.

## Deviations from Plan

None. The plan was executed as written.

## Known Stubs

None.

## Self-Check: PASSED
