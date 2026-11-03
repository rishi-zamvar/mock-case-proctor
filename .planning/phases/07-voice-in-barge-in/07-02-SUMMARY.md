---
phase: 07-voice-in-barge-in
plan: 02
subsystem: stt
tags: [stt, whisper, vad-gate, hallucination-filter, chunking, ports]
requires: []
provides:
  - "voicedMs gate (FRAME/VOICED_RMS/MIN_VOICED_MS)"
  - "cleanTranscript / collapseRepeats / isHallucination"
  - "filteredStt(inner) SttPort wrapper"
  - "createAnswerAssembler chunk/finish/reset"
  - "SttResult, SttPort.transcribe(pcm, { prompt }), LlmPort.interrupted?"
affects: [07-04, 07-05, 07-06, 07-08]
tech-stack:
  added: []
  patterns: ["pure gate+filter around any SttPort", "per-idx arrival promises with timeout"]
key-files:
  created:
    - src/main/stt/gate.ts
    - src/main/stt/gate.test.ts
    - src/main/stt/clean.ts
    - src/main/stt/clean.test.ts
    - src/main/stt/filtered.ts
    - src/main/stt/filtered.test.ts
    - src/main/stt/answers.ts
    - src/main/stt/answers.test.ts
  modified:
    - src/main/ports/index.ts
decisions:
  - "Assembler ignores the text of chunks flagged noAnswer; answer is noAnswer when the joined text is empty"
  - "Exported AnswerAssembler type for wave-2 consumers"
  - "finish deletes the entry only if it is still the current one (reset-safe); late chunks after a timeout create a stray entry cleared by the next reset"
metrics:
  duration: 4min
  completed: 2026-11-03
---

# Phase 7 Plan 02: STT gate, cleaner, filtered wrapper and chunk assembler Summary

Pure pre-whisper voiced-frame gate (20 ms frames, RMS > 0.02, 400 ms minimum), whole-output hallucination filter plus 1..8-gram loop collapse, a `filteredStt(inner)` wrapper that composes them and logs voiced ms only, and a chunk assembler that starts transcription on arrival and joins in idx order with a 5 s arrival timeout. Ports widened with `SttResult`, `transcribe(pcm, { prompt })` and `LlmPort.interrupted?`.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 5f65419 | test(07-02): add failing tests for STT voiced gate and transcript cleaner |
| 1 GREEN | 541cb49 | feat(07-02): implement STT voiced-frame gate and hallucination/repeat cleaner |
| 2 RED | 449b680 | test(07-02): add failing tests for filteredStt wrapper and chunk answer assembler |
| 2 GREEN | 22a5910 | feat(07-02): add filteredStt wrapper, chunk answer assembler and widened STT/LLM ports |
| lint | b59fee0 | refactor(07-02): lint fixes (explicit return types, AnswerAssembler type, prettier) |

## Verification

- `npx vitest run --project main src/main/stt src/main/adapters/fakeStt.test.ts src/main/session`: 142 passed, 1 skipped (the skip is another plan's whisper int test).
- `npm run typecheck:node`: passes; FakeStt still assignable.
- eslint clean on this plan's files.

## Deviations from Plan

**1. [Rule 2 - Lint conformance] Added explicit return types and an exported `AnswerAssembler` type**
- Found during: Task 2 post-check (repo eslint requires explicit return types).
- Files: answers.ts, answers.test.ts, filtered.test.ts, gate.test.ts. Commit b59fee0.

Otherwise the plan ran as written.

## Known Stubs

None.

## Self-Check: PASSED
