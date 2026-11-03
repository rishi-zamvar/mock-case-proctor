---
phase: 02-core-domain-logic
plan: 04
subsystem: domain/text
tags: [tts, normaliser, splitter, vout-02]
requires: []
provides: [speakable, LEXICON, createSentenceSplitter, SentenceSplitter]
affects: [phase-05-tts, phase-06-agent, phase-07-voice-loop]
tech-stack:
  added: []
  patterns: [ordered regex rule table, held-boundary streaming splitter]
key-files:
  created:
    - src/main/domain/text/speakable.ts
    - src/main/domain/text/speakable.test.ts
    - src/main/domain/text/speakable.real.test.ts
    - src/main/domain/text/sentenceSplitter.ts
    - src/main/domain/text/sentenceSplitter.test.ts
  modified: []
decisions:
  - "speakable: hyphen ranges must be tight (no spaces); spaced ranges only with en dash, so arithmetic 'a - b' is not read as a range"
  - "Splitter early chunk: first ,;:— followed by whitespace with >= earlyFirstWords words before it (later commas qualify); thousands commas never trigger"
  - "flush() resets the early-emit flag so one splitter can be reused per turn"
metrics:
  duration: 9min
  completed: 2026-11-03
---

# Phase 2 Plan 04: Speakable normaliser and sentence splitter Summary

Table-driven `speakable()` (17 ordered regex rules + 12-entry finance lexicon) that turns every printed number form in the 12-case library into words, plus a streaming `createSentenceSplitter()` that holds trailing boundaries, tracks quotes, skips abbreviations and can emit an early first clause.

## Tasks

| Task | Commits |
|---|---|
| 1. speakable + lexicon + real census | 8782acb (RED), dbf4f41 (GREEN), 4aad577 (prettier) |
| 2. sentence splitter | 6094c55 (RED), 879bed2 (GREEN) |

## Verification

- `npx vitest run src/main/domain/text/speakable src/main/domain/text/sentenceSplitter`: 91 passed; census ran (not skipped) over all 12 cases, 1511 unique token values, zero unspeakable outputs.
- eslint clean on all five files; no `electron` import under `src/main/domain/text`.

## Deviations from Plan

- Added extra unit cases found in the census: `$1T`, `2x`, `1,000+`, `100–999`, `$500K–$1.2M` (mixed-scale range keeps the low scale). Added a thousands-comma guard test for the early chunk, plus the "later comma qualifies" case the orchestrator specified.
- The digit-dot rejection in the splitter was not coded separately: it is covered by the rule that a boundary needs whitespace after it, plus the held trailing boundary.

## Known Stubs

None.

## Self-Check: PASSED
