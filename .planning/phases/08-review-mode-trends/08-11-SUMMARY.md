---
phase: 08-review-mode-trends
plan: 11
subsystem: e2e
tags: [e2e, playwright, review-mode, trends, replay, phase-gate]
requires: ["08-03", "08-05", "08-08", "08-09", "08-10"]
provides: [T1 review-mode + trends E2E, T2 real replayed reviewer scorecard, recordOne fixture helper, Phase 8 sign-off]
affects: [tests/e2e, tests/replay, tests/fixtures/claude/interviewer-e2e]
tech-stack:
  added: []
  patterns: [seeded schema-validated session.json files for E2E, env-gated vitest file as a one-shot recorder]
key-files:
  created:
    - tests/e2e/reviewmode.spec.ts
    - tests/replay/recordOne.test.ts
    - tests/fixtures/claude/interviewer-e2e/31.req.json
    - tests/fixtures/claude/interviewer-e2e/31.res.json
  modified:
    - tests/e2e/flow.spec.ts
    - tests/e2e/interviewer.t2.spec.ts
    - tests/e2e/shell.spec.ts
    - .planning/phases/08-review-mode-trends/08-VALIDATION.md
decisions:
  - "The numbers-row check uses a concrete case_99 opening ('GRR is 85% and GRR is about 95%'): exactly 1 correct row and 1 wrong row, with number-expected 85%. This replaces the always-true count >= 0."
  - "flow.spec's Trends tab now asserts data-status 'insufficient' (one scored session) instead of the old Phase 8 placeholder."
metrics:
  duration: 71min
  completed: 2026-11-03
  tasks: 3
  files: 8
---

# Phase 8 Plan 11: T1 + T2 E2E for review mode and trends, plus the phase gate

The built app now proves every Phase 8 surface end to end. T1 runs on fakes with two seeded scored sessions and covers the debrief, flag map, checks, reveal, quote-to-transcript highlight, search, and Trends with 3-point sparklines, fake insights and trends.json. T2 runs a replayed full session that ends in a real Opus reviewer scorecard, from one newly recorded fixture.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | T1 reviewmode.spec + flow.spec Trends update | 77cd208 |
| 2 | recordOne helper, reviewer fixture 31, T2 real scorecard assertions | ec71677 |
| 3 | Gate (+ shell allowlist fix) and VALIDATION sign-off | 98167ea + docs commit |

## Gate

| Command | Result |
|---------|--------|
| `npm run lint` | green |
| `npm run typecheck` | green |
| `npm run build` | green |
| `npm test` | 1404 passed, 13 skipped (103 files) |
| `npm run test:e2e` ×3, consecutive | 41/41, 41/41, 41/41 |
| `npm run test:e2e:t2` ×2 (all @t2 specs) | 6/6, 6/6 |
| `LIVE=1 npx vitest run --project main src/main/review/review.live.test.ts` | 2/2 (score ordering + dropped-quote rate) |
| `npm run test:packaged` | 3/3 (release/ removed before and after) |

## Recording

- The first T2 run with `REVIEWER=claude` hit 599 at request index 31. That is the reviewer request: `output_config.effort` 'high' plus a json_schema format. Indexes 32 to 34 were the retries, with a byte-identical body.
- `recordOne` made 1 live call and wrote `31.res.json` (status 200) plus `31.req.json`.
- No trends call is made, because one session means the insufficient state.
- Hygiene: fixture-hygiene and secret-scan are green. The fixture contains no `sk-ant`, `x-api-key` or `authorization`.

## Deviations from Plan

**1. [Rule 1 - Stale assertion] shell.spec allowlist was missing `trends`**
- **Found during:** Task 3 (T1 ×3). It failed the same way on all 3 runs.
- **Issue:** 08-09 deliberately added `window.api.trends.get`. The exact-keys allowlist in `shell.spec.ts` was never updated.
- **Fix:** I added `trends` to the list and a new exact assertion that `window.api.trends` has only `get`. The check is stricter, not looser.
- **Commit:** 98167ea.

**2. Process note:** an over-broad `pkill -f` killed my first T1 ×3 loop. I restarted it. The 3 consecutive green runs listed above were all taken after the fix.

## Known Stubs

None.

## Self-Check: PASSED
