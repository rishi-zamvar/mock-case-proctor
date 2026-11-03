---
phase: 06-interviewer-agent
plan: 05
subsystem: session-runner
tags: [proctor-facts, turn-filter, ttft, cache-usage, opening-plan]
requires: [06-01, 06-02]
provides: [buildTurnRequest, proctor-aware runner, per-turn firstSentenceAt + usage, openingPlan persistence]
affects: [src/main/session/runner.ts]
tech-stack:
  added: []
  patterns: [pure request builder shared by runner and live eval]
key-files:
  created:
    - src/main/session/turnRequest.ts
    - src/main/session/turnRequest.test.ts
    - src/main/session/runner.agent.test.ts
  modified:
    - src/main/session/runner.ts
decisions:
  - "Turn filter runs for every spoken turn (warmup included), before the leak guard; rejects log 'utterance dropped' + reason code only"
  - "Hint-without-permission is logged as an anomaly but the control is still applied (reducer stays owner of flow)"
metrics:
  duration: 6min
  completed: 2026-11-03
  tasks: 2
  files: 4
---

# Phase 6 Plan 05: Runner wiring for proctor facts, turn filter, timings Summary

Pure `buildTurnRequest` computes code-owned proctor facts (directive, caps, grill elapsed vs budget, pushback, lastAnswerLong, plan/done, surfaced flags, first-turn opening labels) and the runner now uses it for every grill/wrapup turn, drops sentences past 4 or with banned phrases before the leak guard, records `firstSentenceAt` + token usage per turn, and persists the extracted opening plan.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | buildTurnRequest pure builder | 6a3ce50 (RED), 2416604 (GREEN) |
| 2 | Runner wiring | 2683d03 (RED), 1e05419 (GREEN) |

## Verification

- `npx vitest run --project main src/main/session`: 6 files, 84 tests pass (existing runner suites unchanged)
- `npm run typecheck:node`: clean
- eslint on owned files: clean

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
