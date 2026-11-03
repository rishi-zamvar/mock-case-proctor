---
phase: 02-core-domain-logic
plan: 03
subsystem: interview-flow
tags: [state-machine, reducer, tdd, sections]
requires: []
provides:
  - "sections.ts: SECTION_IDS, SECTION_CATALOG, SectionId, RubricDimension, mergePlan, turnCaps"
  - "interviewMachine.ts: reduce, initialState, DEFAULT_CONFIG and the InterviewState/InterviewEvent/Effect/InterviewControl/Phase/MachineConfig types"
affects: [phase-03-ipc-glue, phase-06-interviewer-agent, phase-08-grading]
tech-stack:
  added: []
  patterns: ["pure reducer (state, event) -> { state, effects }, with time passed in as event data", "JSON-only state (arrays, no Set/Map)"]
key-files:
  created:
    - src/main/domain/machine/sections.ts
    - src/main/domain/machine/sections.test.ts
    - src/main/domain/machine/interviewMachine.ts
    - src/main/domain/machine/interviewMachine.test.ts
  modified: []
decisions:
  - "END_REQUESTED is also honoured in warmup (the plan listed only review through wrapup). It is ignored in idle, scoring and reviewMode."
  - "AGENT_TURN_DONE emits only PERSIST (plus wrapup on the last section). The next grill request comes from ANSWER_FINAL, carrying the current section and hintAllowed."
  - "reviewDeadline is set when review is entered (now + reviewMs), so it comes from START when warm-up is off or placed after review, and from WARMUP_DONE when warm-up comes first."
  - "'call' is never put in omitted, per the plan's mergePlan table."
metrics:
  duration: 5min
  completed: 2026-11-03
  tasks: 2
  files: 4
requirements: [FLOW-01, FLOW-06]
---

# Phase 2 Plan 03: Section Catalog and Interview Reducer Summary

The interview flow is now owned by code. A pure reducer drives the run idle → warmup → review → presentation → extraction → grilling → wrapup → scoring → reviewMode. It sets the 45-minute review deadline from event time and gives each section a soft cap (clamped to 3-6) and a hard cap (soft + 2). It ignores 'sufficient' on a section's first turn, falls back to plan order when the model asks for an invalid next section, and always runs 'call' last. It allows a hint only after 2 failed probes, and suggests one interrupt per grilling answer once that answer passes 90 s.

## Tasks

| Task | Name | RED | GREEN |
|------|------|-----|-------|
| 1 | sections.ts catalog, mergePlan, turnCaps | f13f488 | d70ba5b |
| 2 | interviewMachine.ts reducer | b10e8f0 | e117ec7 |

## Verification

- `npx vitest run src/main/domain/machine`: 57/57 tests pass (17 in sections, 40 in the reducer)
- `npx eslint src/main/domain/machine`: exits 0
- No `Date.now`, `new Date(`, `new Set`, `new Map` or `electron` import in either source file
- The state survives a JSON round trip, and reduce runs on deep-frozen input without throwing

## Deviations from Plan

The only change was ESLint housekeeping in the GREEN commit: return types were added to the test helpers and prettier reformatted the files. One small choice was made beyond the plan: END_REQUESTED is also accepted during warmup (see decisions).

## Known Stubs

None.

## Self-Check: PASSED
