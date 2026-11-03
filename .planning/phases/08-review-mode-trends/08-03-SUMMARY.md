---
phase: 08-review-mode-trends
plan: 03
subsystem: review
tags: [review, scorecard, checks, evidence, tdd, pure]
requires: [review/checks, review/evidence, shared/ipc v2 Scorecard]
provides: [assembleScorecard, computeChecks, summarizeChecks, rubricRows, GENERIC_RUBRIC, GradeDraft]
affects: [08-07 grader, adapters/fakeLlm, session/view buildReveal]
tech-stack:
  added: []
  patterns: [single assembly path for LLM drafts, compile-time type-equality guards]
key-files:
  created:
    - src/main/review/scorecard.ts
    - src/main/review/scorecard.test.ts
  modified:
    - src/main/adapters/fakeLlm.ts
    - src/main/adapters/fakeLlm.test.ts
    - src/main/session/view.ts
    - src/main/session/view.test.ts
    - src/main/session/runner.resume.test.ts
decisions:
  - "Evidence verifies against ALL candidate lines (incl. warm-up), so the fake's first-candidate-line quote verifies in T1; numbers checks use presentation+grilling only"
  - "GENERIC_RUBRIC uses DIMENSION_LABELS for the dimension name ('and' not '&'); five/one text is the playbook verbatim"
  - "Flag 'hinted' status now comes from control flags_hinted (08-02 flagMap), not hint_given"
metrics:
  duration: 9min
  completed: 2026-11-03
  tasks: 2
  files: 7
---

# Phase 8 Plan 03: Scorecard assembly and review checks Summary

`assembleScorecard` is now the only way a grade draft becomes a Scorecard:

- It validates that the draft has all 6 dimensions, each scored as an integer from 1 to 5.
- It verifies at most 3 quotes per dimension with `verifyQuotes`. A dimension with no verified quote is capped at 2 and flagged unverified.
- Total, band (`bandOf`), flag map (`flagMap`), checks summary and evidence stats are all computed in code. Rationale is cut to 40 words and summary to 60.
- The result is schema-parsed and frozen.

The fake scorer and `buildReveal` both route through this module.

## Tasks

| Task | Name | Commits |
|------|------|---------|
| 1 | scorecard.ts: rubricRows, computeChecks, summarizeChecks, assembleScorecard | 39c120d (RED), c61c5ec (GREEN) |
| 2 | Fake scorer and reveal use the shared assembly and checks | cf2fb9b (RED), 53bb111 (GREEN) |

## Verification

- **Tests:** `npx vitest run` gives 1355 passed and 10 skipped after the resume test fix. The only failures are in 08-04's in-flight `trends.test.ts`.
- **Typecheck:** `npm run typecheck` reports errors only in `src/main/review/trends.test.ts`, which a parallel plan owns.
- **Lint:** eslint is clean on every file I touched.
- **Greps:**
  - `verifyQuotes(` and `bandOf(` both match in scorecard.ts.
  - `draft.total` does not appear.
  - `CALL_RE` is gone from view.ts.
  - `assembleScorecard(` matches in fakeLlm.ts.

## Deviations from Plan

**1. [Rule 1 - Test expectation] runner.resume.test.ts expected a total of 18 for a session with no candidate turn**
- The plan specifies that a session with no candidate line has every dimension unverified and capped at 2, for a total of 12. The test now expects 12.
- Commit: 53bb111.

**2. fakeLlm hinted test now uses `flags_hinted`**
- This matches the 08-02 `flagMap` semantics, which the plan mandates.

E2E was not run, per the parallel-execution rules. T1 still expects 18/30. That holds because the fake STT's canned candidate lines have well over 3 tokens, so the 12-word quote verifies.

## Known Stubs

None.

## Self-Check: PASSED
