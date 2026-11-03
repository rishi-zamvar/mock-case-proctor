---
phase: 02-core-domain-logic
plan: 02
subsystem: case-library
tags: [case-loader, information-barrier, leak-guard, stt, tdd]
requires: [02-01, 02-05]
provides: [CaseCard, CaseCardSchema, InterviewerBrief, buildBrief, listCases, loadCase, DEFAULT_LIBRARY_ROOT, intervieweePdfPath, sttPrompt, FINANCE_VOCAB]
affects: [03]
tech-stack:
  added: []
  patterns: ["explicit-literal CaseCard + strict zod parse", "every brief subtree through resolveDeep"]
key-files:
  created:
    - src/main/domain/cases/brief.ts
    - src/main/domain/cases/library.ts
    - src/main/domain/cases/sttPrompt.ts
    - src/main/domain/cases/library.test.ts
    - src/main/domain/cases/library.real.test.ts
    - src/main/domain/cases/sttPrompt.test.ts
  modified:
    - src/shared/ipc.ts
    - src/shared/schemas.ts
    - src/shared/schemas.test.ts
decisions:
  - "Real leak test uses the first 10-word ideal-answer window with no 8-gram deck overlap (not blindly the first 10 words)"
  - "Leftover checks in loader tests walk string leaves (resolveDeep), not JSON.stringify"
  - "listCases skips case dirs with no _work/data JSON; loadCase throws 'case NN not found'"
metrics:
  duration: 4min
  completed: 2026-11-03
  tasks: 3
  files: 9
---

# Phase 2 Plan 02: Case loader, interviewer brief, CaseCard contract Summary

Main-only `InterviewerBrief` built from the RESEARCH Field Map (every subtree resolved, `s10_calibration` skipped), a 7-field `CaseCard` locked by type + `.strict()` zod, `listCases`/`loadCase` over the library root, and a deduped Whisper vocab prompt; all 12 real cases load clean and the leak guard blocks each case's own ideal answer.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 RED | 226447b | failing CaseCard schema tests |
| 1 GREEN | 7565bf1 | CaseCard type (ipc.ts) + CaseCardSchema with two-way compile guards |
| 2 RED | 94a4caf | failing loader + STT prompt tests (fixture) |
| 2 GREEN | d18bae5 | brief.ts, library.ts, sttPrompt.ts |
| 3 | c54f2b8 | real-library integration: 12 cases + leak guard (25 tests, ran, not skipped) |

## Verification

- `npx vitest run`: 423 passed, 2 skipped (pre-existing live-key gate)
- `npm run typecheck`: green (the `@ts-expect-error` on an extra CaseCard field is load-bearing)
- eslint clean; no `...data`, no `s10_calibration`, no electron/child_process in non-test `src/main/domain/cases`
- `git ls-files | grep -c lead_edge` = 0; fixture not ignored

## Deviations from Plan

**1. [Wave-1 note] Leftover check walks string leaves** instead of `JSON.stringify(brief)` vs LEFTOVER_RE (compact JSON false-positives), in both fixture and real tests.

**2. [Plan-checker advisory] Ideal-answer probe window** picks the first 10-word window with no 8-gram deck overlap rather than the literal first 10 words.

## Known Stubs

None.

## Self-Check: PASSED
