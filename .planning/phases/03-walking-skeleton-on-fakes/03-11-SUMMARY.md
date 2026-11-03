---
phase: 03-walking-skeleton-on-fakes
plan: 11
subsystem: e2e
tags: [playwright, e2e, t1, fakes, lint]
requires:
  - phase: 03-10
    provides: composition root, session IPC, window.__e2e.say tap
provides:
  - combined E2E cases root (E2E_CASES_ROOT, E2E_REAL_LIBRARY) built in global setup
  - tests/e2e/session.ts helpers (launchLibrary, startCase, waitPhase, answer, driveToReviewMode, sessionFiles)
  - T1 flow suite tests/e2e/flow.spec.ts (8 tests)
affects: [03-12, later phase E2E specs]
tech-stack:
  added: []
  patterns:
    - "Cases root = real dirs holding symlinks (library skips symlinked dirs; no private data copied)"
    - "Flow assertions compare booleans/counts only; brief text never printed"
key-files:
  created:
    - tests/e2e/session.ts
    - tests/e2e/flow.spec.ts
  modified:
    - tests/e2e/global-setup.ts
    - src/main/e2e.test.ts
    - src/main/keys/keyStore.test.ts
    - src/main/keys/probe.test.ts
    - src/main/store/sessionSchema.test.ts
    - src/renderer/src/screens/Settings.test.tsx
    - tests/e2e/key.spec.ts
key-decisions:
  - "Greyed/Retake test relaunches on the full-session test's userData instead of sharing one app, so every test closes its app in finally"
requirements-completed: [QA-02, LIB-01, LIB-02, FLOW-08, REV-05]
duration: 15min
completed: 2026-11-03
---

# Phase 3 Plan 11: T1 Flow E2E Suite Summary

A Playwright T1 suite now drives the built app on fakes through library, start sheet, warm-up, skip, review, Ready, presentation, every grilling section, wrap-up, scoring, review mode and back to the library. It also covers greyed completion and Retake, ending early, the scaled review deadline and Space-to-talk, and it validates session.json on disk with SessionFileSchema.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 Cases root and session helpers | 783a5cf | shell spec 8/8 |
| 2 T1 flow specs | 165e0ec | flow 8/8 on the first run, no app bugs exposed |
| Lint cleanup (orchestrator instruction) | eaaaa03 | 19 errors cleared, `npm run lint` exits 0 (15 prettier warnings remain) |

## Verification
- `npx vitest run`: 679 passed, 2 skipped
- `npm run typecheck`, `npm run lint`, `npm run build`: all exit 0
- `npm run test:e2e`: 24/24 pass (8 flow + 16 Phase 1/03-10)
- Combined root has the 12 real cases plus 99 (E2E_REAL_LIBRARY=1). The temp root is removed at teardown.

## Deviations from Plan

**1. Added an 8th test, `back to library from review mode shows the greyed card`.** Test 4 relaunches on the finished profile rather than sharing the app with test 3, so the back-to-library click is covered in its own test.

**2. The card text check uses DOM order.** The plan listed `Case id + company + vertical + Level`, but the DOM renders `Case NN`, `Level X`, company, then vertical. The assertion follows the DOM.

**3. The timings check excludes `kind === 'score'`.** It compares interviewer-turn timings with the interviewer lines shown, and leaves out a grader timing if there is one.

**4. Orchestrator scope addition: fixed the 19 deferred lint errors.** I added explicit return types, replaced `any` in probe.test.ts with typed fetch params, and removed the unused `_k` param. Tests are unchanged in behaviour.

## Known Stubs
None.

## Self-Check: PASSED
