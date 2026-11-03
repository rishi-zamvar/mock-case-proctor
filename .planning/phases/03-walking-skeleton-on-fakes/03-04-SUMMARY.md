---
phase: 03-walking-skeleton-on-fakes
plan: 04
subsystem: adapters
tags: [fakes, llm, stt, clock, tdd, QA-02]
requires: [03-01 ports (LlmPort, MakeLlm, SttPort, ClockPort), ScorecardSchema, SECTION_CATALOG]
provides: [createFakeLlm, FakeLlmOptions, createFakeStt, FakeStt, createScaledClock]
affects: [compose.ts / session runner (later wave-2/3 plans), Tier-1 E2E]
tech-stack:
  added: []
  patterns: [async-generator word streaming with abort check per chunk, single scaled clock for real + E2E]
key-files:
  created:
    - src/main/adapters/fakeLlm.ts
    - src/main/adapters/fakeLlm.test.ts
    - src/main/adapters/fakeStt.ts
    - src/main/adapters/fakeStt.test.ts
    - src/main/adapters/clock.ts
    - src/main/adapters/clock.test.ts
  modified: []
decisions:
  - "FakeLlm flag status: once a flag is 'hinted' it stays hinted even if later surfaced without a hint"
  - "streamTurn with kind 'grill' but no section falls back to the wrapup line (no control chunk)"
metrics:
  duration: 4min
  completed: 2026-11-03
  tasks: 2
  files: 6
---

# Phase 3 Plan 04: Fake Adapters (LLM, STT, Clock) Summary

Deterministic offline adapters: a word-streaming scripted FakeLlm (control payload per grill turn, warm-up completion, plan echo, schema-valid 18/30 scorecard built from the brief), a FakeStt with an E2E injection queue over canned answers, and one scaled clock (scale 1 = real, E2E_TIME_SCALE compresses).

## Tasks

| Task | Name | RED | GREEN |
| ---- | ---- | --- | ----- |
| 1 | FakeLlm | 316c658 | 4978f7a |
| 2 | FakeStt + scaled clock | c0e40d2 | 2351d3f |

Verification: `npx vitest run src/main/adapters` 22/22 pass; eslint clean; `tsc -p tsconfig.node.json` has no errors in adapter files; no `process.env`/`electron` in fakeLlm.ts; clock.ts uses `Date.now` only as the default param.

## Deviations from Plan

None. One in-task bug was caught by the RED test before the GREEN commit: `canned[i++ % n]` sat on the right of `??`, so injected calls didn't advance the index. Fixed by incrementing before the lookup.

## Known Stubs

None. These are fakes by design.

## Self-Check: PASSED
