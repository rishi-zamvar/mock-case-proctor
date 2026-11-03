---
phase: 02-core-domain-logic
plan: 05
subsystem: domain/text
tags: [leak-guard, BAR-03, numbers, metrics, tdd]
requires: []
provides:
  - "checkUtterance / normalizeForGuard / BANNED_TERMS / LeakSource / LeakResult (src/main/domain/text/leakGuard.ts)"
  - "parseNumbers / matches / NumberMention (src/main/domain/text/numbers.ts)"
  - "brevityBand / BrevityBand (src/main/domain/metrics.ts)"
affects: [02-02 InterviewerBrief (must carry leakSources + deckText), Phase 6 agent output gate, Phase 8 REV-03 scoring]
tech-stack:
  added: []
  patterns: [WeakMap-memoised 8-gram Set per source object, single global regex number scanner]
key-files:
  created:
    - src/main/domain/text/leakGuard.ts
    - src/main/domain/text/leakGuard.test.ts
    - src/main/domain/text/numbers.ts
    - src/main/domain/text/numbers.test.ts
    - src/main/domain/metrics.ts
    - src/main/domain/metrics.test.ts
  modified: []
decisions:
  - "Leak guard banned grams = answer-key 8-grams minus deck 8-grams; banned terms match whole normalised tokens ('rubrics', 'answer keys' pass)"
  - "Banned-term check runs before the n-gram check, so an utterance with both reports banned_term"
  - "parseNumbers ignores bare number words with no scale/unit ('one of the issues' is not a mention)"
metrics:
  duration: 3min
  completed: 2026-11-03
---

# Phase 2 Plan 05: Leak Guard, Number Parser, Brevity Bands Summary

BAR-03 answer-key leak guard (8-gram copy detection minus deck wording, plus whole-token banned terms, WeakMap-memoised per source), a regex-based canonical number parser with 2% relative-tolerance matching, and 15/30/60/90 s brevity bands, all as pure modules with table tests.

## Tasks

| Task | Name | RED | GREEN |
|------|------|-----|-------|
| 1 | leakGuard.ts | 0ea6958 | df955a4 |
| 2 | numbers.ts + metrics.ts | 14dcab6 | b6481db |

## Verification

- `npx vitest run --project main src/main/domain/text/leakGuard src/main/domain/text/numbers src/main/domain/metrics`: 74 passed
- 15 passing probes (10 ordinary questions plus the 7-word, deck-overlap, empty, 'rubrics' and 'answer keys' cases); every banned term blocked
- eslint clean on the three modules; no Electron imports; no logging in leakGuard.ts; tsc reports no errors in these files

## Deviations from Plan

**1. [Rule 2 - Correctness] Bare number words need a scale or unit.** The plan's fallback of "else count" would have turned every "one" in ordinary speech into a count mention. Word numbers now count only when a scale or unit follows ("three x", "twelve percent"). Digit numbers still fall back to `count`.

Otherwise the plan was executed as written.

## Known Stubs

None.

## Self-Check: PASSED
