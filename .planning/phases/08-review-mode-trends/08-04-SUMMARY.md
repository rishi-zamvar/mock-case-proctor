---
phase: 08-review-mode-trends
plan: 04
subsystem: review
tags: [trends, claude, structured-output, cache, tdd]
requires: [08-01 SessionSummary/TrendsInsights/TrendsViewSchema, store/sessionStore, agent/sse.harness]
provides: [toSummary, store.listSummaries, TrendsInsightsSchema (snake_case), createTrendsAgent, createFakeTrendsAgent, createTrendsService, DEFAULT_TRENDS_EFFORT]
affects: [08-09 compose (wires trends:get to createTrendsService)]
tech-stack:
  added: []
  patterns: [sha256 summary key cache, shared in-flight promise, tmp+fsync+rename atomic write]
key-files:
  created:
    - src/main/review/trends.ts
    - src/main/review/trends.test.ts
  modified:
    - src/main/store/sessionStore.ts
    - src/main/store/sessionStore.test.ts
decisions:
  - "Unknown dimension ids are rejected by the SDK's zod validation of the DIMENSION_IDS enum (throws 'trends unparsable'); mapping only dedupes"
  - "unseen cases = cases() minus every caseId present in the summaries"
  - "Failures are never cached; the next get() retries"
metrics:
  duration: 12min
  completed: 2026-11-03
  tasks: 2
  files: 4
---

# Phase 8 Plan 04: Trends pipeline Summary

This plan builds the trends pipeline in the main process. Scored sessions become compact summaries, and a single structured Claude call reads those summaries, never transcripts. The resulting insights are cached in `trends.json`, keyed by the set of scored sessions.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| RED | Failing tests for summaries, agent and service | 002e1d1 |
| 1 | toSummary, store.listSummaries, TrendsAgent (real + fake) | 4e481cf |
| 2 | TrendsService with trends.json cache | 1b39604 |

## Verification

- `npx vitest run --project main src/main/review src/main/store`: 116 passed.
- `npm run typecheck:node` is clean.
- `zodOutputFormat(TrendsInsightsSchema` matches in trends.ts, and so does `renameSync`.
- The only "transcript" in trends.ts is a comment. A test asserts that the request body contains no `<candidate_said>` and no transcript text, and that every summary it sends has exactly the SessionSummary keys.

## Deviations from Plan

**1. [Rule 1 - Bug] Unknown progress ids are rejected by the schema, not dropped in mapping**
- The SDK validates `parsed_output` against the zod enum. A response with an unknown id therefore fails to parse before the mapping code ever sees it, and a filter in the mapping would be dead code.
- Such a response now throws `trends unparsable`, which a test covers. The mapping only dedupes.

**2. [Rule 1 - Bug] Synchronous agent-factory throw**
- Typecheck flagged a `finally` block that referenced the in-flight promise before it was assigned. That would have been a ReferenceError if `o.agent()` threw synchronously, for example when no API key is set.
- Cleanup is now chained with `p.then(...)`. A test covers the case: the first call fails, and the retry succeeds.

## Known Stubs

None.

## Self-Check: PASSED
