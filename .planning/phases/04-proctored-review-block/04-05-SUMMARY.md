---
phase: 04-proctored-review-block
plan: 05
subsystem: session-runner
tags: [runner, timers, power, media, menu]
requires: [04-01, 04-04]
provides:
  - Runner review + warning timers (Map keyed 'review' | 'warning'), one warning per session that survives a resume
  - deckPage intent saved in the session file
  - AwakePort hold/release around each session
  - index.ts wires createAwake(powerSaveBlocker), ensureMediaAccess, and a menu with no View menu
affects: [04-06 session screen, 04-07 E2E, Phase 5 spoken warning]
tech-stack:
  added: []
  patterns: [optional port dep (awake?) threaded through compose]
key-files:
  created:
    - .planning/phases/04-proctored-review-block/deferred-items.md
  modified:
    - src/main/session/runner.ts
    - src/main/session/runner.harness.ts
    - src/main/session/runner.test.ts
    - src/main/session/runner.resume.test.ts
    - src/main/compose.ts
    - src/main/compose.test.ts
    - src/main/index.ts
decisions:
  - "A fired timer removes itself from the timers Map so stopTimers() never cancels a stale entry"
  - "ensureMediaAccess runs after the key-store init and just before createWindow (non-blocking)"
metrics:
  duration: 2min
  completed: 2026-11-03
---

# Phase 4 Plan 05: Runner Warning, Deck Page, Awake Wiring Summary

The SessionRunner now keeps one timer for the review deadline and one for the warning. The warning fires `log.info('review warning')` exactly once at deadline minus 10 minutes, and a resume re-arms it or fires it straight away. The runner saves `deckPage` from the new intent. It also calls hold() on the display-sleep blocker at start and on resume, and calls release() when the session reaches reviewMode or is discarded. index.ts wires `createAwake(powerSaveBlocker, log)`, the non-blocking `ensureMediaAccess`, and an app/edit/window menu with no View menu, so the View menu's zoom shortcuts are gone.

## Tasks

| Task | Name | RED | GREEN |
| ---- | ---- | --- | ----- |
| 1 | Runner warning timer, deck page, awake | 4870b87 | eb86aea |
| 2 | Wire awake + media access into compose/index; drop View menu | eae7c1d | a15adf0 |

## Verification

- `npx vitest run --project main`: 662 passed, 2 skipped (43 files)
- `npm run typecheck:node`: passes
- All the plan's acceptance greps match (`new Map<'review' | 'warning'`, `log.info('review warning')`, hold/release twice each, no `cancelTimer`, `createAwake(powerSaveBlocker, log)`, `ensureMediaAccess({`, `Menu.setApplicationMenu`, no `viewMenu`, `awake: o.awake`)
- The setPermissionRequestHandler and setPermissionCheckHandler calls are unchanged

## Deviations from Plan

- [Rule 1 - Bug] A fired timer now deletes its own entry from the `timers` Map. Before this, `stopTimers()` would have called cancel on timers that had already fired. That was harmless but left stale entries.
- The harness `fakeAwake()` uses `vi.fn<() => void>()`, which keeps typecheck:node clean.

## Deferred Issues

- `npm run lint` shows 3 errors in 04-04's `src/main/power.test.ts` and `src/main/media.test.ts` (missing return types, an unused `_t`). They are out of scope and logged in deferred-items.md. The files this plan touched have 0 lint errors.

## Known Stubs

- runner.ts REVIEW_WARNING effect: `// Phase 5 speaks "Ten minutes left." here`. This is intentional; Phase 5 adds the speech.

## Self-Check: PASSED
