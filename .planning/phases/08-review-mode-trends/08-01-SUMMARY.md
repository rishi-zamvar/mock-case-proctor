---
phase: 08-review-mode-trends
plan: 01
subsystem: review
tags: [contracts, zod, schemas, migration, reveal, tdd]
requires: [shared/ipc, shared/schemas, store/sessionSchema, session/view, adapters/fakeLlm]
provides: [DIMENSION_IDS, DIMENSION_LABELS, Band, Scorecard v2, ChecksSchema v2, RevealSchema v2, TrendsViewSchema, SessionSummarySchema, retryScore intent, CH.trendsGet, upgradeScorecard, backSolveLines, ScoreInput.at/openingPlan]
affects: [08-03 reviewer agent, 08-04 trends, 08-05 review mode UI, runner scoring flow]
tech-stack:
  added: []
  patterns: [z.preprocess legacy upgrade on load, session-level + field-level preprocess]
key-files:
  created: []
  modified:
    - src/shared/ipc.ts
    - src/shared/schemas.ts
    - src/shared/schemas.test.ts
    - src/main/ports/index.ts
    - src/main/store/sessionSchema.ts
    - src/main/store/sessionSchema.test.ts
    - src/main/store/sessionStore.test.ts
    - src/main/adapters/fakeLlm.ts
    - src/main/adapters/fakeLlm.test.ts
    - src/main/agent/claudeLlm.test.ts
    - src/main/session/view.ts
    - src/main/session/view.test.ts
    - src/main/session/runner.ts
    - src/renderer/src/screens/ReviewMode.tsx
    - src/renderer/src/screens/ReviewMode.module.css
    - src/renderer/src/screens/ReviewMode.test.tsx
    - src/renderer/src/App.test.tsx
decisions:
  - "SessionFileSchema is now z.preprocess(upgradeSession, object): the session-level pass stamps legacy scoredAt from endedAt ?? startedAt; the field-level preprocess(upgradeScorecard) is a no-op on v2 (yields scoredAt 0 if hit alone)"
  - "upgradeScorecard treats a non-number second arg as 0, since z.preprocess passes ctx there"
  - "ReviewMode band chip shows Ready / Close, one fix / Run another; CSS classes renamed strong/average/weak -> ready/close/another"
metrics:
  duration: 6min
  completed: 2026-11-03
  tasks: 2
  files: 17
---

# Phase 8 Plan 01: Phase 8 contracts and v2 scorecard Summary

This plan defines every Phase 8 contract and keeps the tree green on the new shapes.

**Contracts:**
- A v2 scorecard. It has 6 dimension ids, verified evidence quotes with turn ids, keep, fix, insight, summary, evidence stats, a checks summary, and the grader model, prompt version and scoredAt.
- Checks rows of the form `{claim, matched, expected, correct: bool | 'unverifiable'}`.
- The reveal gains intendedRead, backSolve and a timed transcript.
- A TrendsView and a SessionSummary.
- A `retryScore` intent and a `trends:get` channel.
- ScoreInput gains `at` and `openingPlan`.

**Legacy upgrade:** session files written before Phase 8 now load as v2 instead of being quarantined.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Shared contracts, zod schemas, legacy scorecard upgrade, ScoreInput | d57df54 |
| 2 | v2 fake scorer, v2 reveal projection, ReviewMode compile fix | 2f8b0f6 |

Each commit contains its RED tests and GREEN code together. I watched the RED run fail before writing any implementation: 16 failures in Task 1, 21 in Task 2.

## Verification

- `npx vitest run`: 1299 passed, 10 skipped (90 files).
- `npm run typecheck` and `npm run lint` are both clean.
- The three greps came out as the plan expects:
  - `grep "import " src/shared/ipc.ts` finds nothing.
  - `preprocess(upgradeScorecard` matches in sessionSchema.ts.
  - There is no `...brief` or `...s` spread in view.ts.

## Deviations from Plan

**1. [Rule 3 - Blocking] runner.ts and claudeLlm.test.ts were not in files_modified**
- Adding `at: number` to ScoreInput broke typecheck at the only real call site and at one test literal.
- runner.ts now passes `openingPlan: s.openingPlan, at: clock.now()`, and the test literal now has `at: 0`.

**2. [Rule 1 - Correctness] Legacy scoredAt comes from the real session time, not 0**
- A field-level preprocess cannot see endedAt or startedAt.
- I wrapped SessionFileSchema in a session-level preprocess that calls `upgradeScorecard(raw.scorecard, raw.endedAt ?? raw.startedAt)`. That way Trends orders legacy sessions correctly instead of dating them 1970.
- SessionFileSchema is now a ZodPipe. It is only ever used via `.parse` and `.safeParse`, and the inferred type is unchanged.

**3. ReviewMode.module.css** now has the band classes renamed, so the chip keeps its colour.

## Known Stubs

- `checks.numbers` is still `[]` in buildReveal. That is intentional: 08-03 wires computeChecks.
- The fake scorer's `checksSummary` is all zeros. That is also intentional, since the real reviewer fills it in 08-03.

## Self-Check: PASSED
