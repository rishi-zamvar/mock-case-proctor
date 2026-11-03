---
phase: 07-voice-in-barge-in
plan: 06
subsystem: session
tags: [ipc, schemas, stt, latency, runner]
requires: ["07-02"]
provides:
  - "CH.sttChunk/sttStatus/speakStarted, SttMode, SttStatus, Api.stt, Api.speak.started"
  - "Intent answer {answerId?, chunks?} + bargeIn intent"
  - "SttChunkArgsSchema, StartedArgsSchema, SttStatusSchema"
  - "timings[].latency (real clock) + timings[].interrupted"
  - "ViewState.transcribing"
  - "latency.ts: stopToFirstAudio, median"
  - "SessionRunner.sttChunk / started, NO_ANSWER_LINE, STT_FAILED_LINE, RunnerDeps.realNow"
affects: [07-07, 07-08, 07-09, 07-10]
tech-stack:
  added: []
  patterns: ["latency on injected unscaled clock", "chunks bypass the runner queue"]
key-files:
  created:
    - src/shared/schemas.voice.test.ts
    - src/main/session/latency.ts
    - src/main/session/latency.test.ts
    - src/main/session/runner.stt.test.ts
  modified:
    - src/shared/ipc.ts
    - src/shared/schemas.ts
    - src/main/store/sessionSchema.ts
    - src/main/session/view.ts
    - src/main/session/view.test.ts
    - src/main/session/runner.ts
    - src/main/session/runner.harness.ts
decisions:
  - "canTalk is false while transcribing (one answer at a time)"
  - "A blank FakeStt answer now speaks NO_ANSWER_LINE (it used to be silent); the existing blank-text test still passes"
  - "liveLat is cleared when its turn's timing entry is written; a late started() is ignored"
  - "Harness: t.stt stays the default FakeStt (so inject still type-checks); t.transcribe spies on whichever stt the runner uses"
metrics:
  duration: 12min
  completed: 2026-11-03
---

# Phase 7 Plan 06: Phase 7 contracts + runner STT flow Summary

Fixed the Phase 7 IPC/zod/persistence contracts. The runner now sends real PCM chunks through the answer assembler, which is seeded with the case's `sttPrompt`. It shows a `transcribing` flag, speaks a re-prompt on no-answer and a failure line on STT error, and stamps stop through first audio on an unscaled `realNow` clock.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | f048dbf | test(07-06): add failing tests for Phase 7 IPC/persistence contracts and latency helpers |
| 1 GREEN | bc95cea | feat(07-06): Phase 7 IPC contracts, zod schemas, timings latency, view transcribing, latency helpers |
| 2 RED | c6d8282 | test(07-06): add failing tests for runner STT flow, no-answer, failure and latency stamps |
| 2 GREEN | 477eddf | feat(07-06): runner real answer flow with assembler, no-answer, STT failure and real-clock latency stamps |

## Verification

- `npx vitest run --project main`: 65 files passed, 943 tests passed, 10 skipped.
- `npm run typecheck:node` and the web tsconfig typecheck both pass. eslint is clean on this plan's files.
- `grep "Float32Array(0)" runner.ts` returns nothing. Every latency stamp uses `realNow()`.

## Deviations from Plan

**1. [Rule 2 - Correctness] `canTalk` is false while transcribing**
- The plan's behavior says "canTalk is true again" after a no-answer, which implies it was false during transcription. view.ts now computes `!speaking && !transcribing && TALK`, and a test in view.test.ts covers it.

**2. [Rule 3 - Blocking] Harness keeps `t.stt` typed as FakeStt**
- With a custom `stt`, `t.stt` would lose `inject` and break existing suites at the type level. The custom stt goes to the runner, and the `transcribe` spy wraps it.

Otherwise the plan ran as written.

## Known Stubs

None.

## Self-Check: PASSED
