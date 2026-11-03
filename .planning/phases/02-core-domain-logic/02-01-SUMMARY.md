---
phase: 02-core-domain-logic
plan: 01
subsystem: case-library
tags: [resolver, placeholders, fixtures, tdd]
requires: []
provides: [resolveString, resolveDeep, makeFnRef, makeResolver, LEFTOVER_RE, splitPages, case_99_fixture]
affects: [02-02]
tech-stack:
  added: []
  patterns: ["string-leaf leftover check via resolveDeep walker"]
key-files:
  created:
    - src/main/domain/cases/resolve.ts
    - src/main/domain/cases/deckText.ts
    - src/main/domain/cases/resolve.test.ts
    - src/main/domain/cases/resolve.real.test.ts
    - src/main/domain/cases/deckText.test.ts
    - tests/fixtures/cases/_work/data/case_99.json
    - tests/fixtures/cases/case_99_fixture/deck.txt
  modified:
    - .gitignore
decisions:
  - "Leftover checks walk string leaves, not JSON.stringify: compact JSON objects like {\"id\":\"x\"} match LEFTOVER_RE"
  - "src/main/domain/cases/ un-ignored in .gitignore (the cases/ rule swallowed it)"
metrics:
  duration: 6min
  completed: 2026-11-03
  tasks: 2
  files: 8
---

# Phase 2 Plan 01: Placeholder resolver and deck page splitter Summary

Shared `{fn:...}` then `{\w+}` resolver mirroring build_interviewer.js fnRef (throws on unknown/ambiguous), a form-feed page splitter, and a fictional committed `case_99_fixture`; all 12 real cases resolve with zero leftovers.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | f6af6ae | .gitignore negation + Fixturely case_99.json + 3-page deck.txt |
| 2 RED | 8ae8bc6 | failing resolver/deck tests (+ un-ignore src/main/domain/cases/) |
| 2 GREEN | a42170f | resolve.ts + deckText.ts |

## Verification

- `npx vitest run src/main/domain/cases`: 36 passed (12 real-library cases ran, not skipped)
- eslint clean; tsc (node) clean for these files; no electron/node:fs imports in resolve.ts/deckText.ts

## Deviations from Plan

**1. [Rule 3 - Blocking] `cases/` gitignore rule also swallowed `src/main/domain/cases/`**
- Fix: added `!src/main/domain/cases/` negation. Commit 8ae8bc6.

**2. [Rule 1 - Bug] `JSON.stringify(...)` not-match LEFTOVER_RE is always false-positive**
- Found during: Task 2 GREEN. Any compact JSON object without spaces (e.g. `{"id":"post","v":34}`) matches `/\{[^{}\s]+\}/`.
- Fix: tests collect string leaves with `resolveDeep(out, s => ...)` and assert the leftover list is `[]`.
- **Note for 02-02:** RESEARCH's real-library example uses `JSON.stringify(brief)` with this regex; use the string-leaf walk instead.
- Commit a42170f.

## Known Stubs

None.

## Self-Check: PASSED
