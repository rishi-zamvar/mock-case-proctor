---
phase: 08-review-mode-trends
plan: 06
subsystem: session
tags: [runner, scoring, retry, review, tdd]
requires: [08-01 ScoreInput.at/openingPlan, ViewState.scoringFailed, Intent retryScore]
provides: [RunnerDeps.onScored, silent score retry, scoringFailed view, retryScore handling, Session score-retry UI]
affects: [08-09 compose (wires onScored to trends recompute)]
tech-stack:
  added: []
  patterns: [runner-local scoringFailed flag reset in bind, passed via toViewState extras]
key-files:
  created:
    - src/main/session/runner.score.test.ts
  modified:
    - src/main/session/runner.ts
    - src/main/session/runner.harness.ts
    - src/renderer/src/screens/Session.tsx
    - src/renderer/src/screens/Session.module.css
    - src/renderer/src/screens/Session.test.tsx
decisions:
  - "onScored fires inside the finishing queue job, after the store.save + SCORED dispatch, only when next is SCORED"
  - "retryScore is accepted only when phase is scoring, scoringFailed is set and nothing is inflight; it re-runs runLlm({kind:'score'}) at attempt 0, so a retry also gets one silent retry"
metrics:
  duration: 2min
  completed: 2026-11-03
  tasks: 2
  files: 6
---

# Phase 8 Plan 06: Scoring flow resilience Summary

When scoring fails, the runner now retries once without speaking, then shows "Scoring failed" with a "Retry scoring" button. The transcript stays on disk throughout. Once a scorecard is saved, the runner calls `onScored(sessionId)` so trends can recompute.

## Tasks

| Task | Name | RED | GREEN |
|------|------|-----|-------|
| 1 | Runner: silent retry, scoringFailed, retryScore, onScored | 913f2db | 458d1a9 (+ 2e26930 prettier) |
| 2 | Session "Scoring failed — retry" | 0203c14 | 1be831a |

## Verification

- `npx vitest run --project main src/main/session`: 140 passed across 11 files, including the 5 new score tests.
- `npx vitest run --project renderer Session.test.tsx`: 30 passed.
- `grep onScored runner.ts` finds 2 matches (the type and the call). `score-retry` is in Session.tsx.
- `typecheck:node` shows no errors in my files. The only errors are in the in-flight parallel plans' tests: `review/scorecard.test.ts`, `review/trends.test.ts` and `sessionStore.test.ts listSummaries`. They are out of scope.

## Deviations from Plan

**1. [Rule 3 - Blocking] runner.harness.ts gained an `onScored` option**
- This is a test-only seam, needed so the tests can observe the hook. The harness was not in files_modified.

**2. ScoreInput already carried `openingPlan`/`at`**
- 08-01 added them. Task 1's test asserts them, so that first test passed in RED by design.

## Known Stubs

None.

## Self-Check: PASSED
