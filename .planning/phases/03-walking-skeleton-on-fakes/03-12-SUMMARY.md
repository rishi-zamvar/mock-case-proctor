---
phase: 03-walking-skeleton-on-fakes
plan: 12
subsystem: e2e
tags: [playwright, e2e, resume, quarantine, barrier, ipc-tap, app-protocol, phase-gate]
requires:
  - phase: 03-11
    provides: tests/e2e/session.ts helpers, combined E2E cases root
  - phase: 03-10
    provides: window.__e2e.ipcLog tap, session resume/discard IPC
provides:
  - tests/e2e/resume.spec.ts (crash-resume, in-flight re-request, discard, quarantine)
  - tests/e2e/barrier.spec.ts (IPC-tap redaction on fixture + real case, app:// refusals)
  - Phase 3 gate green (unit, typecheck, lint, build, T1 E2E 3x, packaged smoke)
affects: [phase 4+ E2E specs]
tech-stack:
  added: []
  patterns:
    - "Crash tests: app.process().kill('SIGKILL'), relaunch with the same userData, no close on the killed app"
    - "Barrier failures report channel#index + field kind only, never brief text"
key-files:
  created:
    - tests/e2e/resume.spec.ts
    - tests/e2e/barrier.spec.ts
  modified: []
key-decisions:
  - "The in-flight test kills the app while the interviewer is still speaking. The runner saves the interviewer line only after every sentence is acked, so the disk shows a trailing candidate turn plus pending, and the test asserts that precondition explicitly"
  - "app:// refusals are checked in both the renderer (0 or 404) and main net.fetch (exactly 404), and no refused body may start with %PDF"
requirements-completed: [FLOW-07, BAR-01, BAR-02, QA-02]
duration: 22min
completed: 2026-11-03
---

# Phase 3 Plan 12: Resume, Quarantine and Barrier E2E + Phase Gate Summary

The T1 suite now proves crash recovery and the information barrier in the built app. After a SIGKILL mid-grilling, a relaunch offers Resume and continues with the exact saved transcript length through to review mode. A turn that was in flight at the crash is re-requested. Discard marks the session abandoned. Corrupt files are quarantined and the notice shows once. An IPC tap over full runs on fixture case 99 and real case 02 finds no interviewer content before review mode and does find the reveal after it. app:// serves only the interviewee PDF.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 Crash-resume, discard, quarantine E2E | 43fabc8 | 4/4 pass |
| 2 IPC-tap redaction + app:// refusal E2E | cb3144b | 3/3 pass, real-case test ran (not skipped) |
| 3 Phase gate | (no code changes) | all green on the first attempt |

## Verification (phase gate)
- `npm run lint`: 0 errors (15 pre-existing prettier warnings)
- `npm run typecheck`, `npm run build`: exit 0
- `npx vitest run`: 679 passed, 2 skipped (46 files)
- `npm run test:e2e` 3x in a row: **31 passed** each run. One T1 run takes about **140 s** (141 s, 141 s, 139 s wall, build included)
- `npm run test:packaged`: arm64 .app built, verify-package OK, @packaged smoke passed

## ROADMAP Phase 3 success criteria → tests
1. Library fields, configurable path, greyed + Retake: `flow.spec.ts` › `library lists every case with only candidate-safe fields`, `library path is configurable`, `completed case is greyed and Retake starts fresh`, `back to library from review mode shows the greyed card`
2. Full T1 walk + end early with a scorecard: `flow.spec.ts` › `full session walks every screen`, `ending early from grilling still produces a scorecard`
3. Kill/resume, atomic per-turn save, quarantine: `resume.spec.ts` › `crash mid-grilling resumes from the last saved turn`, `a turn in flight at the crash is re-requested on resume`, `discard abandons the interrupted session`, `corrupt session files are quarantined, not loaded`
4. IPC tap with zero leaks + app:// refusals: `barrier.spec.ts` › `IPC tap: no interviewer content before review mode (fixture case)`, `IPC tap on a real case`, `app:// serves only interviewee PDFs`
5. zod-validated session files: `flow.spec.ts` › `full session walks every screen` (SessionFileSchema via sessionFiles), plus the on-disk checks in resume.spec.ts

## Deviations from Plan

**1. The in-flight test waits for the interviewer to go idle before counting.** The first run counted the transcript before the grilling opener arrived. The test now waits for `speaking-ring` `data-speaking="false"` first, then polls for a count greater than the baseline rather than an exact +1. This was a wait-condition fix with no retries or sleeps, and the app code is unchanged.

**2. The in-flight test asserts its precondition.** It checks that the last saved line is the candidate's, so the test fails rather than passing vacuously if the reply ever lands before the kill.

No app bugs were exposed.

## Known Stubs
None.

## Self-Check: PASSED
