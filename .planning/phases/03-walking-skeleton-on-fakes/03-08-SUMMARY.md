---
phase: 03-walking-skeleton-on-fakes
plan: 08
subsystem: session
tags: [runner, reducer, effects, speech-acks, leak-guard, persistence, crash-resume]
requires:
  - phase: 03-01
    provides: ports (LlmPort, SttPort, ClockPort, MakeLlm)
  - phase: 03-03
    provides: SessionStore + session.json schema (pending field)
  - phase: 03-04
    provides: FakeLlm, FakeStt, scaled clock
  - phase: 03-05
    provides: toViewState
provides:
  - createSessionRunner / SessionRunner / RunnerDeps (final speak/ack contract)
affects: [03-10 IPC wiring, 03-11/12 E2E, phases 5-7 adapters]
tech-stack:
  added: []
  patterns:
    - "Promise-chain queue serialises every dispatch/intent; LLM work is fire-and-forget after dispatch and finishes via its own enqueued job"
    - "Turn completes only after every seq is acked (or ackTimeoutMs)"
key-files:
  created:
    - src/main/session/runner.ts
    - src/main/session/runner.harness.ts
    - src/main/session/runner.test.ts
    - src/main/session/runner.resume.test.ts
  modified: []
key-decisions:
  - "LLM turn results (pending=null, speaking=false, result event) are applied inside one queued job, so no intent can slip between a turn and its AGENT_TURN_DONE"
  - "end intent is ignored in idle/scoring/reviewMode so it can never abort the score turn"
  - "Ack waits use real setTimeout (not ClockPort): ack timeout is wall time, unaffected by E2E_TIME_SCALE"
requirements-completed: [FLOW-07, FLOW-08, REV-05]
duration: 9min
completed: 2026-11-03
---

# Phase 3 Plan 08: Session Runner Summary

**SessionRunner executes the pure reducer's effects on fakes end to end: splitter → leak guard → speakable → acked speak:sentence, session.json saved after every turn, end-early still scored, and crash-resume re-requests the in-flight turn.**

## Accomplishments
- `createSessionRunner(d)` with start/intent/ack/current/resume/discard; no electron import, no process.env.
- Full START→reviewMode run on fakes: completed status, scorecard total 18, ordered transcript, one timing per interviewer turn, one control per grill turn.
- Resume: rehydrates state, re-arms or immediately fires the review deadline, re-requests `pending` or a derived turn (grilling/warm-up candidate last turn, empty warm-up).

## Task Commits
1. Task 1 RED `70d9208`, GREEN `894c002`
2. Task 2 RED `f0dd4f8`, GREEN `19b6666`

## Deviations from Plan

**1. [Rule 3 - Blocking] Added `src/main/session/runner.harness.ts`**
- Shared test harness (manual clock, setup, stub LLM helpers) so `runner.resume.test.ts` can reuse it without importing a test file (which would re-register suites). Test-only; not in the plan's file list.

**2. [Rule 1 - Bug] `end` ignored once scoring has started**
- Otherwise a second end would abort the score turn and the session would never reach reviewMode.

## Known Stubs
- `runner.ts` sends an empty `Float32Array` to STT (ponytail: Phase 7 sends real PCM).
- `INTERRUPT_SUGGESTED` ignored (Phase 7 barge-in). LLM failure only logs + keeps pending (user retry in Phase 6).

## Verification
- `npx vitest run src/main/session` 48/48 (stable over repeated runs); `--project main` 571 passed; `npm run typecheck:node` clean; eslint clean.

## Self-Check: PASSED
