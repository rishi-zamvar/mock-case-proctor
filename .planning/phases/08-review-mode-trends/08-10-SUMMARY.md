---
phase: 08-review-mode-trends
plan: 10
subsystem: review
tags: [review, grader, trends, replay, live-eval, fixtures]
requires: [08-04 createTrendsAgent+toSummary, 08-07 createReviewer+PROMPT_VERSION]
provides: [STRONG, AVERAGE, WEAK, CONTROLS, scoreInputOf, reviewer-* fixtures, trends-run fixture, review LIVE=1 eval]
affects: [phase 8 gate]
tech-stack:
  added: []
  patterns: [replay server scenario fixtures, LIVE=1 numbers-only eval]
key-files:
  created:
    - src/main/review/gradeScripts.harness.ts
    - src/main/review/review.replay.test.ts
    - src/main/review/review.live.test.ts
    - tests/fixtures/claude/reviewer-strong/
    - tests/fixtures/claude/reviewer-average/
    - tests/fixtures/claude/reviewer-weak/
    - tests/fixtures/claude/trends-run/
  modified: []
decisions:
  - "grader.ts untouched: first recording already ordered strong > average > weak, so no prompt change was needed"
  - "Script controls exported as CONTROLS; scoreInputOf(turns, controls?) defaults to the script's own control log"
  - "Trends agent uses DEFAULT_REVIEWER_MODEL in tests (compose wires config.reviewerModel)"
metrics:
  duration: 6min
  completed: 2026-11-03
  tasks: 2
  files: 7
---

# Phase 8 Plan 10: Graded case_99 transcripts, fixtures, replay and live eval Summary

Three fictional Fixturely (case_99) sessions are graded by real Opus through the real SDK. The recorded replay and the live eval both order them strong > average > weak. Every live quote verified, so the dropped-quote rate was 0%. A recorded trends run over the three summaries returns valid insights and picks its next case from the unseen list.

## Results

| Run | Strong | Average | Weak | Dropped quotes |
|-----|--------|---------|------|----------------|
| Recorded (raw model scores) | 22 (4 3 5 2 4 4) | 11 | 6 | all STRONG rows verified |
| Live (one run) | 21 (close) | 12 (another) | 6 (another) | 0/36 = 0.000 |

Live trends call: 5 recurring weaknesses, 5 dimensions marked 'up', next case '98' (from the unseen list).

## Tasks

| Task | Name | Commits |
|------|------|---------|
| 1 | Scripted transcripts, replay test, recorded fixtures | c5bdfcc (RED), 5a7794c (fixtures), 3914311 (skip fix) |
| 2 | LIVE=1 eval suite | 3b622e3 |

## Verification

- `npx vitest run --project main src/main/review tests/config`: 118 passed, 2 skipped (the live suite, which skips without LIVE=1). Offline.
- `RECORD=1` replay: 4 API calls. `LIVE=1` was run twice (8 calls in total), because the first run hid console output for passing tests.
- Grep of the 4 fixture directories and the harness for the 12 real company names, `sk-ant`, `x-api-key` and `authorization` found 0 hits. The only `sk-ant` string in the new files is the replay test's own `not.toContain('sk-ant')` assertion.
- Typecheck: the new files are clean.

## Deviations from Plan

**1. [Rule 1 - Bug] `it.each` callbacks get no test context**
- **Issue:** `ctx.skip` inside `it.each` was the row value, which caused a TS error and would crash under RECORD=1 when no key is present.
- **Fix:** replaced it with `describe.skipIf(RECORD && !realKey())`.
- **Commit:** 3914311.

## Known Stubs

None.

## Self-Check: PASSED
