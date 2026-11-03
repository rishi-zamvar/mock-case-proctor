---
phase: 08-review-mode-trends
plan: 05
subsystem: review-ui
tags: [react, review-mode, scorecard, transcript, tdd, a11y]
requires: [08-01 Reveal v2 / Scorecard v2 / Checks v2 contracts]
provides: [Debrief component, TranscriptPanel component, review fixtures (v2Reveal/v2View)]
affects: [08-08 Trends tab (placeholder untouched), 08-11 E2E (new testids)]
tech-stack:
  added: []
  patterns: [props-only debrief component, regex-escaped split for <mark> highlighting, focus object identity to re-scroll on repeat clicks]
key-files:
  created:
    - src/renderer/src/screens/review/Debrief.tsx
    - src/renderer/src/screens/review/TranscriptPanel.tsx
    - src/renderer/src/screens/review/Debrief.test.tsx
    - src/renderer/src/screens/review/fixtures.ts
    - src/renderer/src/screens/review/time.ts
  modified:
    - src/renderer/src/screens/ReviewMode.tsx
    - src/renderer/src/screens/ReviewMode.module.css
    - src/renderer/src/screens/ReviewMode.test.tsx
decisions:
  - "Review header lives inside the Scorecard tab (Debrief), not above the tabs; the top bar keeps only back-to-library"
  - "Transcript focus is a new {id} object per quote click, so clicking the same quote again re-scrolls"
  - "Status shown with full 1px borders plus coloured dots or a tinted background, never one-side accent stripes (orchestrator design fix)"
metrics:
  duration: 14min
  completed: 2026-11-03
  tasks: 2
  files: 8
---

# Phase 8 Plan 05: Review mode UI Summary

The Scorecard tab now renders the v2 reveal in debrief order. The sections are:

1. A header with the total out of 30, the band, the case, the date, and keep and fix.
2. The insight card: what he called out and what he missed.
3. The flag map, with a status chip and the deck location for each flag.
4. The reveal: the intended read, the back-solve, the ideal answer beside his opening, and the numbers to memorize.
5. The rubric rows, each with score dots, the rationale, clickable verified quotes, an "Unverified evidence" badge where needed, and the answer-key item.
6. The summary.
7. The checks card: the numbers table, the brevity strip, led-with-call and omitted sections.
8. A timed, searchable transcript. Clicking a quote highlights its line and scrolls to it.

## Tasks

| Task | Name | RED | GREEN |
|------|------|-----|-------|
| 1 | Debrief cards | cfd608c | 3f0a411 |
| 2 | TranscriptPanel and ReviewMode shell | e73a382 | d31d4e9 |
| (fix) | Design fix: no one-side accent stripes | n/a | d45c4f9 |

## Verification

- `npx vitest run --project renderer`: 262 tests passed.
- `npm run typecheck:web` and `npm run lint` are clean.
- There are no hex colours in ReviewMode.module.css.
- There is no `dangerouslySetInnerHTML` under screens/.

## Deviations from Plan

1. **[Rule 3] `fixtures.ts` and `time.ts` are new files.** The plan did not list them.
   - The v2 fixtures are shared by both test files. Importing one test file from another would register its tests twice.
   - `mss` moved into `time.ts` to satisfy the react-refresh rule that a component file exports only components.
2. **[Orchestrator design fix] Three one-side accent borders were replaced.**
   - Evidence quotes now have a full 1px `var(--border)`.
   - The keep and fix callouts now have a full border and a coloured status dot on the label.
   - The focused transcript line now has a tinted `--elevated` background and a 1px accent outline.
   - Commit d45c4f9.
3. **Search treats regex characters literally**, which is now tested. The match count is pluralised ("1 match").
4. **The band label for "another" is now "Run another Level 1 case".** It was "Run another" before. The old ReviewMode test was updated to match. T1 E2E does not assert this label.

## Known Stubs

- The Trends tab still shows the placeholder "Trends arrive in Phase 8". This is intentional: 08-08 fills it, and T1 E2E asserts the text for now.

## Self-Check: PASSED
