---
phase: 07-voice-in-barge-in
plan: 07
subsystem: session
tags: [runner, barge-in, history, tdd]
requires: ["07-05", "07-06"]
provides:
  - "SessionRunner bargeIn intent: spoken-only transcript/timings/LLM history"
  - "ack(turnId, seq, spoken) honours spoken (undefined = spoken)"
affects: [07-08, 07-09, 07-10]
tech-stack:
  added: []
  patterns: ["module-level live-turn record (written + spoken seqs)", "aborted continuation guarded by inflight/live null"]
key-files:
  created:
    - src/main/session/runner.bargein.test.ts
  modified:
    - src/main/session/runner.ts
decisions:
  - "live sits alongside 07-06's liveLat (less code than merging); bargeIn clears liveLat for its turn"
  - "Barge-in timing entry carries startedAt/doneAt/interrupted/latency only (no firstText/usage: the turn never finished)"
  - "Barge-in in grilling on an 'interject' turn aborts the whole runLlm, so the grill reply is skipped and no AGENT_TURN_DONE is dispatched"
metrics:
  duration: 10min
  completed: 2026-11-03
---

# Phase 7 Plan 07: Runner barge-in Summary

A `bargeIn` while the interviewer speaks aborts the turn and tells the renderer to drop its audio. Only sentences acked `spoken !== false` are committed, to the transcript, to timings (`interrupted: true`) and to Claude via `llm.interrupted(spokenText)`. `pending` is cleared and saved. In grilling, the cut turn still counts as `AGENT_TURN_DONE` with control null, so sections advance at the hard cap.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 3152a05 | test(07-07): add failing tests for runner barge-in with truthful history |
| 1 GREEN | 045f801 | feat(07-07): runner barge-in commits only spoken sentences and keeps the interview moving |

## Verification

- `npx vitest run --project main src/main/session src/main/agent`: 18 files passed (1 skipped), 219 passed, 7 skipped.
- `npm run typecheck:node` passes. eslint and prettier are clean on both files.
- The end-to-end test runs through the real `createClaudeLlm` with the sse.harness fetch stub. The next grill request passes `checkConversation` with `[]`, the second-to-last message is `'<s0> [interrupted]'`, and the last is a user `<candidate_said>new answer` with no tool_result.
- The late-continuation guard does real work: putting back the old unconditional `speaking = false` fails that test.
- `grep "ignored until then" runner.ts` returns nothing.
- Per the parallel-execution constraint, E2E and the full build were not run.

## Deviations from Plan

None. The plan ran as written.

## Known Stubs

None.

## Self-Check: PASSED
