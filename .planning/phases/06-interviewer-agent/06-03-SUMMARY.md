---
phase: 06-interviewer-agent
plan: 03
subsystem: agent (model-output trust boundary)
tags: [tool-schema, zod, extraction, INT-06, FLOW-05]
requires: [06-01 InterviewControl/OpeningPlan/OpeningPlanSchema]
provides:
  - INTERVIEW_CONTROL_TOOL (deep-frozen strict SDK Tool)
  - parseControl(input, {current, flagIds}) -> {control|null, anomalies}
  - EXTRACT_SYSTEM, toExtractResult(plan) -> {order, plan?}, re-export OpeningPlanSchema
affects: [06-06 Claude adapter]
tech-stack:
  added: []
  patterns: [raw strict zod schema -> mapper to reducer type, anomaly codes without model text]
key-files:
  created:
    - src/main/agent/control.ts
    - src/main/agent/control.test.ts
    - src/main/agent/extraction.ts
    - src/main/agent/extraction.test.ts
  modified: []
decisions:
  - "parseControl: reducer current section always wins over model section_id (anomaly section_mismatch); section_id used only when current is undefined"
  - "extraction.ts re-exports OpeningPlanSchema so 06-06 imports schema + mapper from one place; no duplicate schema"
metrics:
  duration: ~3min
  completed: 2026-11-03
  tasks: 2
  files: 4
---

# Phase 6 Plan 03: interview_control parser + opening-plan extraction Summary

Strict, frozen `interview_control` tool plus a zod parser that maps model input to the reducer's `InterviewControl` (missing/invalid -> null, unknown flags dropped, reducer section wins), and a pure extraction mapper that orders sections by what Rishi said and degrades to "all sections omitted" on failure.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | control.ts: strict tool schema + zod parse/map | 6542a97 (RED), c89f8ed (GREEN) |
| 2 | extraction.ts: order from considerations, safe fallback | cd4cbe8 (RED), 0db5587 (GREEN) |

## Verification

- `npx vitest run --project main src/main/agent/control.test.ts src/main/agent/extraction.test.ts`: 13 passed
- `npx eslint` on the 4 files: clean
- `npm run typecheck:node`: no errors in this plan's files. The one remaining error (`prompt.test.ts` missing `./prompt`) belongs to a parallel plan that is still in RED.

## Deviations from Plan

None. The plan was executed as written.

## Known Stubs

None.

## Self-Check: PASSED
