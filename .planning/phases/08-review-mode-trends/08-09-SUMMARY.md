---
phase: 08-review-mode-trends
plan: 09
subsystem: main/compose + ipc + preload
tags: [reviewer, trends, ipc, isolation, wiring]
requires: ["08-04", "08-06", "08-07"]
provides: ["REVIEWER/REVIEWER_MODEL config", "real reviewer in app", "trends service + trends:get IPC", "api.trends.get", "interviewer isolation tests"]
affects: ["renderer Trends tab (08-08) now has a live data source", "E2E (REVIEWER=claude opt-in)"]
tech-stack:
  added: []
  patterns: ["per-session Anthropic client per role (interviewer 30 s, reviewer 180 s)", "runner onScored -> trends.refresh"]
key-files:
  created: [src/main/compose.review.test.ts, src/main/review/isolation.test.ts]
  modified: [src/main/compose.ts, src/main/compose.test.ts, src/main/ipc.ts, src/main/ipc.test.ts, src/main/index.ts, src/preload/index.ts]
decisions:
  - "Reviewer and trends agent share the REVIEWER switch and key: real only when reviewer != fake and a key exists, else fakes"
  - "Reviewer client timeout 180 s (effort high); interviewer stays 30 s; both honour ANTHROPIC_BASE_URL"
  - "Trends cache lives at <sessionsDir>/trends.json (store.list already ignores non-dirs)"
metrics:
  duration: ~12min
  completed: 2026-11-03
  tasks: 2
  files: 8
---

# Phase 8 Plan 9: Reviewer + trends wiring and isolation test Summary

compose now scores sessions with the real ReviewerAgent (REVIEWER_MODEL, default claude-opus-5-5, 180 s client) and keeps a trends.json-cached TrendsService refreshed on every scorecard. The renderer reads it through one guarded, zod-validated `trends:get` channel (`api.trends.get`). Tests show the interviewer cannot reach past sessions: its factory type, a runtime spy check, and the agent/ import graph.

## Tasks

| Task | Commits |
| ---- | ------- |
| 1 compose: reviewer + trends wiring | 7debf46 (RED), 503a8f8 (GREEN), 06a114e (prettier) |
| 2 trends:get IPC + preload + isolation | 44a6e87 (RED), ec10e78 (GREEN) |

## Behaviour
- `readConfig`: `reviewer` (`fake|claude|auto`; E2E defaults to fake, otherwise auto; any other value throws `REVIEWER=<v>`), `reviewerModel` (trimmed, falls back to the default).
- `makeLlm(brief)`: the interviewer works as before. When the reviewer is real and a key exists, `scoreSession` is replaced by `createReviewer(...)(brief)`. This works with LLM=fake too.
- The trends agent is real under the same condition, otherwise `createFakeTrendsAgent`. Its case list comes from `listCases` and becomes `[]` on error.
- Startup log: `reviewer <mode> <model>`. The key is never logged, and a test asserts this.

## Deviations from Plan

**1. [Rule 3 - Blocking] Updated the existing compose.test.ts full-config `toEqual`.** It needed the two new fields `reviewer: 'auto'` and `reviewerModel`. The file was not listed in files_modified but had to change.

**2. Isolation tests passed on first run (expected).** The isolation already holds by construction: createClaudeLlm's scoreSession delegates to the fake, and agent/ has no store, trends or fs imports. The tests are regression guards, so there was no RED phase for them. The RED commit 44a6e87 still failed on the IPC half.

## Deferred Issues
- `src/main/review/review.replay.test.ts` (08-10, a parallel plan) currently fails typecheck and 4 tests. It is that plan's in-progress RED state, so it was left alone.

## Known Stubs
None.

## Self-Check: PASSED
