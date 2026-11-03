---
phase: 06-interviewer-agent
plan: 06
subsystem: agent
tags: [claude, anthropic-sdk, streaming, prompt-cache, tool-use, structured-output]
requires:
  - phase: 06-01..06-04
    provides: prompt.ts (buildSystem/proctorNote/warm-up), messages.ts, control.ts (INTERVIEW_CONTROL_TOOL/parseControl), extraction.ts, turnText.ts
provides:
  - createClaudeLlm(cfg): MakeLlm, the real LlmPort adapter
  - sse.harness.ts: test-only SSE fetch stub (sseEvents, sseFetch, jsonMessage)
affects: [06-07 compose/runner wiring, phase-7 barge-in, phase-8 grader]
tech-stack:
  added: []
  patterns:
    - "One closure per brief: frozen system, private grillMsgs/warmMsgs, pendingToolUseId; nothing at module scope"
    - "Tests drive the real SDK via new Anthropic({ fetch }) with a streaming SSE stub (per-event delay for abort)"
key-files:
  created:
    - src/main/agent/claudeLlm.ts
    - src/main/agent/claudeLlm.test.ts
    - src/main/agent/sse.harness.ts
  modified: []
key-decisions:
  - "History is appended only after a completed turn; aborted turns are forgotten (APIUserAbortError or signal.aborted -> quiet return)"
  - "Assistant turn with no usable blocks is stored as text-only FALLBACK_LINE so the conversation stays valid"
  - "extractPlan: abort -> { order: [] }, APIError (incl. connection) rethrows, any other parse/validation error -> log 'extraction unparsable' + { order: [] }"
  - "Resume seeding uses grilling-phase turns before the latest candidate turn, trailing candidate turns trimmed so roles alternate"
patterns-established:
  - "sse.harness.ts is the slow-chunk fetch stub research Pitfall 8 asked for"
requirements-completed: [INT-01, INT-06, INT-07, INT-08, FLOW-02, FLOW-05]
duration: ~15min
completed: 2026-11-03
---

# Phase 6 Plan 06: Claude LlmPort Adapter Summary

**`createClaudeLlm` streams grill/wrap-up turns through SDK 1.4.0 with a frozen cached prefix and a record-only `interview_control` read from `finalMessage()`. Warm-up runs as its own case-free conversation, extraction uses `messages.parse` + `zodOutputFormat`, and every behaviour is tested through the real SDK parser via a streaming SSE `fetch` stub.**

## Accomplishments
- Grill request: config model, `max_tokens` 1024, `effort: 'low'`, no `thinking`, `tool_choice: auto`, top-level `cache_control`. System and tools are byte-identical across turns (tested).
- tool_result-first user turns, raw assistant content (thinking + text + tool_use) kept verbatim, and `checkConversation` stays clean after a missing control, an abort or a resume.
- Anomalies are logged as codes only (`control missing`, `stop_reason max_tokens`, `no spoken text`, control anomalies). A test scans every log arg for candidate, proctor and reply text.
- Warm-up has no tools and no brief bytes, and never sets `warmupComplete`. `scoreSession` is the fake scorer until Phase 8.

## Task Commits
1. Task 1 RED: `b21e3a2` test, SSE harness + streamTurn tests
2. Task 1 GREEN: `3cc47ae` feat, streamTurn
3. Task 2 RED: `054313f` test, warm-up/extraction/score/isolation tests
4. Task 2 GREEN: `270c4b9` feat, warm-up, extraction, score stub

## Deviations from Plan
**1. [Rule 2 - Correctness] Empty assistant content guarded**
- **Found during:** Task 1
- **Issue:** A turn whose final message has no keepable blocks would push an empty assistant message and break the conversation.
- **Fix:** Store it as text-only `FALLBACK_LINE`, which is what was spoken anyway.
- **Files:** src/main/agent/claudeLlm.ts. **Commit:** 3cc47ae

**2. [Rule 3 - Blocking] Added `jsonMessage()` to sse.harness.ts** for the non-stream parse response (not in the plan's export list). `sseFetch` returns any single-element response starting with `{` as `application/json`.

## Verification
- `npx vitest run --project main`: 849 passed, 2 skipped. claudeLlm.test.ts has 17 tests.
- `npm run typecheck:node` is clean, and eslint is clean on the three files.
- The acceptance greps for `thinking:`, `type: 'tool'|'any'` and `^let ` all return nothing.

## Known Stubs
- `scoreSession` in src/main/agent/claudeLlm.ts delegates to `createFakeLlm()`. This is intentional per the plan; the Phase 8 grader replaces it.

## Self-Check: PASSED
- All 3 files exist. Commits b21e3a2, 3cc47ae, 054313f and 270c4b9 are present in `git log`.
