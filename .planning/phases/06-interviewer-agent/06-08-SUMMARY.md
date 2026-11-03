---
phase: 06-interviewer-agent
plan: 08
subsystem: composition-root
tags: [compose, config, anthropic, key-handling]
requires: ["06-06 createClaudeLlm/DEFAULT_INTERVIEWER_MODEL", "06-02 WARMUP_CLOSING_LINE", "06-07 RunnerDeps.warmupClosingLine"]
provides: ["AppConfig.llm (fake|claude|auto)", "AppConfig.interviewerModel", "compose getKey option", "per-session Claude interviewer"]
affects: [src/main/compose.ts, src/main/index.ts]
tech-stack:
  added: []
  patterns: ["per-session Anthropic client built from a lazy main-only key getter"]
key-files:
  created: []
  modified: [src/main/compose.ts, src/main/compose.test.ts, src/main/index.ts]
decisions:
  - "LLM defaults to auto outside E2E and fake under E2E; LLM=claude opts E2E into the replay server"
  - "No key falls back to the fake interviewer with one warn per session, not an error"
requirements: [INT-01, INT-08]
metrics:
  duration: ~8min
  completed: 2026-11-03
---

# Phase 6 Plan 08: Interviewer at the composition root Summary

compose now builds a fresh Anthropic client and Claude interviewer for each session from the stored key (`maxRetries: 1`, 30 s timeout, `ANTHROPIC_BASE_URL` when set). The model comes from `INTERVIEWER_MODEL`, default `claude-opus-5-5`. Under E2E the fake stays unless `LLM=claude` is set.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 RED | Failing readConfig and interviewer-selection tests | b959411 |
| 1 GREEN | readConfig llm/interviewerModel, per-session makeLlm, warmupClosingLine | 49b485f |
| 2 | index.ts passes a lazy `getKey` over the KeyStore | 6d5a779 |

## Verification

- `npx vitest run --project main src/main`: 763 passed, 1 skipped
- `npm run typecheck:node` passes, and eslint is clean on the touched files
- The replay-server test sends a POST to /v1/messages with the configured model, and `sawCanary` is true. The key does not appear in any log call
- `getKey` does not appear in ipc.ts or preload

## Deviations from Plan

None. The plan ran as written.

## Notes

- The pre-existing T-10 warning tests in compose.test.ts (3 s `waitFor`) failed now and then when load average was above 5 while the parallel executor was running. They passed 10/10 on a rerun, and the old compose.ts passed 8/8 under the same conditions, so the failures are timing sensitivity under load and not a regression. Not fixed because it is out of scope.
- Full `npm test`, renderer typecheck and E2E were not run: this executor's scope stops at its own files (the parallel 06-09 plan owns other files), and the last wave runs E2E.

## Self-Check: PASSED
