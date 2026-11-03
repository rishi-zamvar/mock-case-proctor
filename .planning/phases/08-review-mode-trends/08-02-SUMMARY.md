---
phase: 08-review-mode-trends
plan: 02
subsystem: review
tags: [review, checks, evidence, tdd, pure]
requires: [numbers.parseNumbers, numbers.matches, leakGuard.normalizeForGuard, shared/brevity.brevityBand]
provides: [brief.numberTokens, checks.numberChecks, checks.ledWithCall, checks.brevityRows, checks.flagMap, evidence.verifyQuotes, evidence.bandOf]
affects: [08-03 reviewer agent, 08 review mode checks card]
tech-stack:
  added: []
  patterns: [pure input->output tables, it.each BDD tables]
key-files:
  created:
    - src/main/review/checks.ts
    - src/main/review/checks.test.ts
    - src/main/review/evidence.ts
    - src/main/review/evidence.test.ts
  modified:
    - src/main/domain/cases/brief.ts
    - src/main/domain/cases/library.test.ts
decisions:
  - "numberChecks window excludes the mention's own text, so '3 times' does not self-trigger the multiple keyword"
  - "Unit compatibility reuses matches() (same value, tolerance 0) instead of re-implementing compatible()"
  - "flagMap: within one control entry, hinted wins over surfaced; status fixed at first appearance"
  - "Types imported from main modules (sessionSchema Turn, interviewMachine InterviewControl), never shared/ipc"
metrics:
  duration: 8min
  completed: 2026-11-03
  tasks: 2
  files: 6
---

# Phase 8 Plan 02: Deterministic review checks and evidence verification Summary

The review logic is pure code, with no LLM involved. It does four things:

- Checks each stated number against the case_99 tokens. A metric keyword within 6 words picks which tokens to compare, and a match is unit-aware at 2% tolerance. A number with no keyword nearby is 'unverifiable', never wrong.
- Checks whether the opening led with a call (within the first 20 words of the first sentence).
- Builds brevity rows and a flag map, where each flag's status is fixed the first time it appears.
- Verifies evidence quotes: a quote counts only if 3 or more normalised tokens appear contiguously in one line. Band mapping is also included.

## Tasks

| Task | Name | Commits |
|------|------|---------|
| 1 | numberTokens + numberChecks + ledWithCall + brevityRows + flagMap | b5dddcf (RED), 9cc0348 (GREEN) |
| 2 | verifyQuotes + bandOf | 64825fd (RED), f80074e (GREEN) |

## Verification

- `npx vitest run --project main src/main/review src/main/domain`: 366 passed.
- eslint on the new and changed files is clean (prettier warnings in the tests were auto-fixed). tsc reports no errors in the touched files.
- `grep "from '../../shared/ipc'" src/main/review/checks.ts` finds nothing.

## Deviations from Plan

None. The plan executed as written. Two additions:

- An extra "gross margin is 70%" row, which comes out unverifiable because case_99 has no margin token.
- A test asserting that `expected` is the closest aliased token.

## Known Stubs

None.

## Self-Check: PASSED
