---
phase: 06-interviewer-agent
plan: 07
subsystem: session-runner
tags: [runner, interject, warmup, retry, flow]
requires: [06-01, 06-02, 06-05]
provides: [ANSWER_TICK producer, INTERRUPT_SUGGESTED handler, warmupClosingLine dep, one-retry error path]
affects: [06-08 compose (passes WARMUP_CLOSING_LINE)]
tech-stack:
  added: []
  patterns: [proctoring line via sayLine (no ack, no transcript), fixed-line stream through speakTurn]
key-files:
  created: [src/main/session/runner.flow6.test.ts]
  modified: [src/main/session/runner.ts, src/main/session/runner.harness.ts]
decisions:
  - "Interject is a real interviewer turn (transcript + timing kind 'interject') spoken through speakTurn, so it passes the turn filter and leak guard"
  - "Retry is silent beyond SORRY_LINE; only the second failure logs an error; extraction falls back to SECTION_PLAN_SET order [] (mergePlan default)"
  - "Interject counter and pending line reset per session in bind()"
metrics:
  duration: ~15 min
  completed: 2026-11-03
  tasks: 2
  files: 3
---

# Phase 6 Plan 07: Runner Flow (interject, presentation, closing line, retry) Summary

When a grilling answer runs past 90 s, the partner now cuts in with a line from INTERRUPT_LINES (one per long answer, picked in turn) before its next turn, and the proctor note sets `lastAnswerLong=true`. The presentation is never interrupted. Leaving warm-up by skip or by the timer speaks the closing line; ending the session from warm-up does not. A failed LLM call says "Sorry, give me a second." and retries once. If extraction fails twice, the session falls back to the default section order so it can't get stuck.

## Tasks

| Task | Commits |
|------|---------|
| 1. 90 s interject, uninterrupted presentation, warm-up closing line | b06433f (RED), 7b0be4f (GREEN) |
| 2. Sorry line, one retry, extraction fallback | 7aba832 (RED), 916ce20 (GREEN) |

## Deviations from Plan

**1. [Rule 3 - Blocking] Harness passthrough for warmupClosingLine.** `runner.harness.ts` (test-only, not listed in files_modified) gained a 2-line `warmupClosingLine` option so the shared `setup()` could pass it through. No other suite is affected. Commit b06433f.

**2. [Rule 2] Per-session reset.** `pendingInterject` and `interjectCount` are reset in `bind()`, so an interject queued in one session can't carry over to the next. Commit 7b0be4f.

## Verification

- `npx vitest run --project main src/main/session`: 97/97 passing (13 new in runner.flow6.test.ts)
- `npx eslint src/main/session/`: clean. `typecheck:node`: clean for this plan's files.
- The full `--project main` run has 7 failures, all in `src/main/agent/claudeLlm.test.ts`. That file belongs to parallel plan 06-06 (its RED stage was in progress), so it is out of scope here.
- The `ponytail: barge-in/interrupt lands in Phase 7` marker is gone.

## Known Stubs

None.

## Self-Check: PASSED
