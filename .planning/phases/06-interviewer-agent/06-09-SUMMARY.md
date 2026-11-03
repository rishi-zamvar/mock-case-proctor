---
phase: 06-interviewer-agent
plan: 09
subsystem: agent
tags: [claude, replay, fixtures, prompt-cache, integration-test]
requires:
  - phase: 06-06
    provides: createClaudeLlm adapter
provides:
  - claudeLlm.replay.test.ts (replay by default, RECORD=1 re-records)
  - tests/fixtures/claude/interviewer-grill/{0..3} and interviewer-warmup/{0,1} (recorded Opus 5.5, case_99 only)
affects: [06-10 phase gate, phase-7 barge-in, E2E replay scenarios]
tech-stack:
  added: []
  patterns:
    - "Layer 2 integration: real SDK + real adapter against tests/replay/server.ts; request-shape contract asserted from /__log"
key-files:
  created:
    - src/main/agent/claudeLlm.replay.test.ts
    - tests/fixtures/claude/interviewer-grill/
    - tests/fixtures/claude/interviewer-warmup/
  modified: []
key-decisions:
  - "Scripted opening/answers reference only the Fixturely (case_99) deck facts so recorded req.json carries no real-case content"
requirements-completed: [INT-01, INT-06, INT-07, FLOW-05]
duration: ~6min
completed: 2026-11-03
---

# Phase 6 Plan 09: Recorded Claude Fixtures + Replay Integration Summary

**Six real Opus 5.5 responses for case_99 now replay offline through the real SDK and `createClaudeLlm`. The recording shows prompt caching works: grill request 1 wrote 4525 cached tokens, request 2 read 4525 and request 3 read 5169. Every grill turn streamed text, then one valid `interview_control`, then stopped with `stop_reason: tool_use`.**

## Accomplishments
- `interviewer-grill`: extraction (`messages.parse`), then a framing turn, a turn with a deliberately wrong claim, and a strong answer. The test checks that extraction returns a non-empty order that is a subset of SECTION_IDS and a valid recommendation. For each grill turn it checks the order text, then control, then done; that exactly one control passes `InterviewControlSchema` with section `retention`; and that `cacheRead > 0` from request 2 onward.
- Checks against the replay server log: system and tools are byte-identical across the grill requests. `cache_control` sits on the last system block and at the top level. `effort` is low, `max_tokens` is 1024, `tool_choice` is auto and there is no `thinking` key. User turns start with a tool_result, and candidate speech is always inside `<candidate_said>`.
- `interviewer-warmup`: two turns with no `tools`, no company name and no `<evaluation_key>`, and `warmupComplete` is never set.
- Recording took one RECORD=1 run (6 API calls, about 25 s). The offline replay runs in about 300 ms.

## Task Commits
1. Task 1: `3a57fe4` test, replay test + recorded fixtures

## Verification
- `npx vitest run --project main src/main/agent/claudeLlm.replay.test.ts tests/config/fixture-hygiene.test.ts tests/config/secret-scan.test.ts tests/replay`: 18 passed, 1 skipped (the RECORD-only probe recorder).
- Running `grep` over the new fixtures for case_02, PawsHub, every case_01..12 company name, `sk-ant`, `x-api-key` and `authorization` finds nothing.
- eslint is clean after `--fix`.

## Deviations from Plan
None. The plan executed as written. The scripted candidate lines use the case_99 deck's own figures (Fixturely, 85% GRR / 104% NRR) rather than the generic wording.

## Known Stubs
None.

## Self-Check: PASSED
- src/main/agent/claudeLlm.replay.test.ts and all 12 fixture files exist. Commit 3a57fe4 is in `git log`.
