---
phase: 06-interviewer-agent
plan: 01
subsystem: domain/machine, ports, store, session runner
tags: [contracts, reducer, pushback, warmup-timer, schema]
requires: []
provides:
  - ProctorFacts, LlmUsage, OpeningPlan, widened TurnRequest/HistoryTurn/LlmChunk/extractPlan (ports)
  - InterviewControl flags_hinted/evidence/numbers_checked/pushback_done
  - InterviewState pushbackDone/grillStartedAt/warmupDeadline
  - pushbackStatus, WARMUP_MS, PUSHBACK_SECTION
  - OpeningPlanSchema (plain, reusable as zodOutputFormat schema)
affects: [06-02, 06-03, later phase 6 runner/adapter/prompt plans]
tech-stack:
  added: []
  patterns: [zod .default() for fields absent in old session files, compile-time type/schema guards]
key-files:
  created: []
  modified:
    - src/main/ports/index.ts
    - src/main/domain/machine/interviewMachine.ts
    - src/main/domain/machine/interviewMachine.test.ts
    - src/main/store/sessionSchema.ts
    - src/main/store/sessionSchema.test.ts
    - src/main/session/runner.ts
    - src/main/session/runner.test.ts
decisions:
  - "Owed pushback (valuation turn>=1, or anywhere in call) blocks a 'sufficient' control until the hard cap unless the same control reports pushback_done"
  - "Warm-up auto-ends after WARMUP_MS (10 min) via START_TIMER{id:'warmup'} -> WARMUP_DONE; runner stops timers on leaving warmup and re-arms on resume"
metrics:
  duration: ~10min
  completed: 2026-11-03
  tasks: 2
  files: 7
---

# Phase 6 Plan 01: Phase 6 contracts, pushback tracking and warm-up timer Summary

All Phase 6 port/reducer/schema contracts landed verbatim; the reducer now owns the one mandatory "convince me" pushback and a 10-minute warm-up timeout that the runner fires, cancels and re-arms on resume.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Widen port types, InterviewControl/InterviewState, persisted schemas | 84765e9 (RED), 679063d (GREEN) |
| 2 | Reducer pushback tracking + warm-up timer, runner timer plumbing | 0b083ad (RED), 5786978 (GREEN) |

## Verification

- `npx vitest run --project main`: 751 passed, 2 skipped
- `npm run typecheck:node`: clean (guards _is/_is2/_ic/_ic2/_op/_op2 hold)
- `npx eslint` on touched paths: clean

## Deviations from Plan

**1. [Rule 3 - Blocking] Runner timer id widened in Task 1**
- Widening the START_TIMER id union broke `armTimer(e.id, ...)` typecheck, so the `TimerId` widening and the `warmup -> WARMUP_DONE` dispatch moved into Task 1's commit (679063d). The stopTimers/resume logic stayed in Task 2.

**2. [Expected behaviour change] Existing section-advance tests**
- Three `turn caps and section advance` tests walked through valuation/call with a plain `sufficient`, which the owed pushback now (correctly) holds open. That describe block now starts from `{ ...toGrilling(), pushbackDone: true }`; no test removed, assertions unchanged.

## Known Stubs

None.

## Self-Check: PASSED
