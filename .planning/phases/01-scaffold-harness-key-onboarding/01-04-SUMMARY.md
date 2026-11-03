---
phase: 01-scaffold-harness-key-onboarding
plan: 04
subsystem: test-harness
tags: [replay-server, anthropic-sdk, fixtures, secret-hygiene, tdd]
requires: [01-01]
provides:
  - tests/replay/server.ts startReplayServer / ReplayServer (replay, RECORD proxy, /__log canary)
  - tests/fixtures/claude/ directory (empty, .gitkeep)
  - fixture hygiene scan in the main Vitest project
affects: [01-07]
tech-stack:
  added: []
  patterns: [node:http + global fetch only (no MSW/nock), headers never serialized, auth values kept in memory for canary checks]
key-files:
  created: [tests/replay/server.ts, tests/replay/server.test.ts, tests/config/fixture-hygiene.test.ts, tests/fixtures/claude/.gitkeep]
  modified: []
key-decisions:
  - "Replay mode writes the req log even when the fixture is missing, so a 599 still leaves a trace of what was asked"
  - "Unexpected handler errors return 500 replay_internal JSON rather than hanging the connection"
requirements-completed: [FND-03, KEY-03, QA-01]
duration: 4min
completed: 2026-11-03
---

# Phase 1 Plan 04: Claude Replay/Record Server Summary

`node:http` replay server (scenario + per-launch counter, 599 on missing fixture, RECORD proxy that writes header-free fixtures, in-memory `sawCanary` log endpoint) proven with the real Anthropic SDK 1.4.0 via `baseURL`, plus a fixture secret scan.

## Accomplishments

- 7 server tests with the real SDK: replay, header-free req log, counter + 599 + fresh launch key, 401 -> AuthenticationError, byte-identical SSE, canary log, RECORD against a stub upstream (prefix stripped, Bearer forwarded, nothing secret on disk)
- Fixture hygiene test: `findLeaks` self-check + recursive walk; RED proven by planting `tmp/0.req.json` with an authorization field (failed, file path only), then removed
- `npx vitest run tests/config tests/replay`: 19 passed; no typecheck errors in these files

## Task Commits

1. Task 1 RED: failing replay server tests - `059210b` (test)
2. Task 1 GREEN: replay/record server - `8428e7d` (feat)
3. Task 2: fixture hygiene scan - `8d3f817` (test)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. `tests/fixtures/claude/` is intentionally empty; 01-07 records `probe-ok` / `probe-401`.

## Self-Check: PASSED
