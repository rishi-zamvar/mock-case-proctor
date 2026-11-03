---
phase: 06-interviewer-agent
plan: 02
subsystem: agent
tags: [claude, history, tts-policy, injection]
requires: [leakGuard.normalizeForGuard]
provides: [turnText, messages]
affects: [06-06 adapter, runner emit path]
tech-stack:
  added: []
  patterns: [pure modules, SDK types only, violation codes without text]
key-files:
  created:
    - src/main/agent/turnText.ts
    - src/main/agent/turnText.test.ts
    - src/main/agent/messages.ts
    - src/main/agent/messages.test.ts
  modified: []
decisions:
  - "Turn filter checks banned phrase before the cap, so banned sentences never consume one of the 4 slots"
  - "seedFromHistory skips empty-text turns and joins same-speaker runs with a space; a leading interviewer turn gets a '(start)' user proctor message"
  - "checkConversation also flags empty_conversation and string-content empty_text"
requirements-completed: [INT-02, INT-07]
metrics:
  duration: 3min
  completed: 2026-11-03
---

# Phase 6 Plan 02: Turn Text Policy and Message Builder Summary

Pure spoken-turn filter (4-sentence cap, whole-token banned phrases, fixed interrupt/fallback/warm-up/sorry lines, tag-escaping `wrapCandidate`) plus a stateless Claude history builder (tool_result-first user turns, verbatim thinking/tool_use echo, text-only fallback, resume seeding, invariant checker).

## Tasks

| Task | Name | RED | GREEN |
| ---- | ---- | --- | ----- |
| 1 | turnText.ts | 747bd8a | 55216b1 |
| 2 | messages.ts | 3ab6fc0 | b3d5fdd |

## Verification

- `npx vitest run --project main src/main/agent`: 20 passed
- `npm run typecheck:node`: clean
- `npx eslint src/main/agent/{turnText,messages}*.ts`: clean

## Deviations from Plan

None - plan executed exactly as written. (Extra `empty_conversation` code in checkConversation for the zero-length case.)

## Known Stubs

None.

## Self-Check: PASSED
