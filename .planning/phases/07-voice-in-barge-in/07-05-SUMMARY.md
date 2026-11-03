---
phase: 07-voice-in-barge-in
plan: 05
subsystem: agent
tags: [barge-in, claude, history, vout-05]
requires: ["07-02 LlmPort.interrupted?"]
provides:
  - "createClaudeLlm(...)(brief).interrupted(spokenText)"
affects: [07-06, 07-08]
tech-stack:
  added: []
  patterns: ["closure `last` turn pointer rewritten on barge-in"]
key-files:
  created:
    - src/main/agent/claudeLlm.bargein.test.ts
  modified:
    - src/main/agent/claudeLlm.ts
decisions:
  - "interrupted() pushes user + text-only '[interrupted]' assistant for an aborted turn, and replaces the last assistant for a completed one; grill clears pendingToolUseId"
  - "Empty spoken text becomes '… [interrupted]' so the assistant block is never empty"
  - "remember() skipped when signal.aborted, so a late-completing aborted stream cannot duplicate the turn"
metrics:
  duration: 4min
  completed: 2026-11-03
---

# Phase 7 Plan 05: Claude barge-in history (interrupted hook) Summary

`interrupted(spoken)` on the Claude adapter rewrites the in-flight or last-remembered turn to the candidate's user turn plus a text-only `"<spoken> [interrupted]"` assistant. This works in both the aborted-mid-stream case and the completed-before-TTS case. The next request passes `checkConversation` and carries no orphan `tool_result`. The Phase-7 ponytail comment is gone.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 7e3ad15 | test(07-05): add failing barge-in history tests for claudeLlm.interrupted |
| 1 GREEN | ae31b82 | feat(07-05): claudeLlm.interrupted keeps only spoken text in barge-in history |

## Verification

- `npx vitest run --project main src/main/agent`: 100 passed, 7 skipped (live). This includes the existing test that checks an aborted turn is forgotten.
- `npm run typecheck:node`: no errors in `src/main/agent`. The remaining errors are in RED tests from parallel plans (`view.test.ts`, `schemas.voice.test.ts`), which this plan does not cover.
- eslint is clean on both files.

## Deviations from Plan

None. The plan was executed as written.

## Known Stubs

None.

## Self-Check: PASSED
