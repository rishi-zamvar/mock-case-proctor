---
phase: 08-review-mode-trends
verified: 2026-11-03T00:00:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 8: Review Mode & Trends Verification Report

**Phase Goal:** After any session, Rishi gets an honest, evidence-backed debrief on that case and a picture of how he is trending across all his sessions.
**Judged at commit:** 35f2495
**Re-verification:** No

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 6-dim rubric /30 with band; quotes verified against transcript; grader model and prompt version saved | VERIFIED | `src/main/review/scorecard.ts` `assembleScorecard` runs `verifyQuotes`, caps unverified dimensions, sums `total`, sets `bandOf(total)`, and stores `graderModel` and `promptVersion` (lines 139-182). `evidence.ts` and `grader.ts` are present with tests. Live eval: 0/36 quotes dropped. |
| 2 | Flag map shows found / hinted / missed, consistent with the `interview_control` log | VERIFIED | `checks.ts` `flagMap` derives status from `flags_hinted` and `flags_surfaced` (lines 98-114). Hinted wins over found; absent flags are missed. |
| 3 | Code-computed number match (tolerance parser), brevity bands, led-with-call, omitted sections | VERIFIED | `checks.ts` exports `numberChecks` (with `METRIC_KEYWORDS`), `ledWithCall`, `brevityRows`, `flagMap`. `scorecard.ts` carries `omitted` through `SECTION_CATALOG`. `checks.test.ts` passes. The T1 E2E numbers row asserts exactly 1 correct and 1 wrong row. |
| 4 | Reveal shows ideal 60s answer next to opening, key numbers, full transcript; strong > average > weak | VERIFIED | `Debrief.tsx` plus its test. 08-10 recorded replay: strong 22, average 11, weak 6. Live: 21, 12, 6. T1 E2E covers reveal, quote-to-transcript highlight and transcript search. |
| 5 | Separate review agent reads past summaries and reports recurring weaknesses, per-dimension progress, carried-forward one fix; interviewer isolated | VERIFIED | `trends.ts` takes `listSummaries()` only, with no transcripts, and caches to `trends.json`. `Sparkline.tsx` and the Trends tab have E2E coverage (3-point sparklines, insights). `isolation.test.ts` proves isolation by type, at runtime (store and summaries smuggled into config are never touched) and by import graph. |

**Score:** 5/5

## Spot Evidence

- `npx vitest run --project main src/main/review`: 7 files passed, 1 skipped (the live file, which needs LIVE=1). 93 tests passed, 2 skipped.
- Gate evidence from 08-11-SUMMARY, not re-run here: `npm test` 1404 passed; T1 E2E 41/41 three times; T2 6/6 twice; live review evals 2/2; packaged 3/3.

## Requirements Coverage

| Req | Status | Evidence |
|-----|--------|----------|
| REV-01 | SATISFIED | Truth 1 |
| REV-02 | SATISFIED | Truth 2 |
| REV-03 | SATISFIED | Truth 3 |
| REV-04 | SATISFIED | Truth 4 |
| REV-06 | SATISFIED | Truth 5 |

All five are marked Complete and mapped to Phase 8 in REQUIREMENTS.md. There are no orphans. REV-05 belongs to Phase 3 and is out of scope.

## Anti-Patterns

None blocking. 08-11-SUMMARY lists no known stubs. The `shell.spec` allowlist omission was found and fixed in 98167ea.

## Notes / Non-blocking

- The live score ordering is a single run of a stochastic grader. The margins are wide (21/12/6), but the live eval would be flaky if the margins narrowed.
- Raw model scores can differ slightly from the recorded replay (22 vs 21 for strong). This is expected.
- The visual quality of the Debrief and Trends UI was covered by E2E assertions only and was not inspected by eye.

## Gaps Summary

No gaps. The phase goal is achieved.

_Verified: 2026-11-03_
_Verifier: Claude (gsd-verifier)_
