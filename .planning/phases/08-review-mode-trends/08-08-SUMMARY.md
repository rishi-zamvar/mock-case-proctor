---
phase: 08-review-mode-trends
plan: 08
subsystem: review-ui
tags: [react, trends, sparkline, svg, tdd, a11y]
requires: [08-01 TrendsView contracts, 08-05 ReviewMode shell]
provides: [Sparkline component, Trends tab component]
affects: [08-09 preload trends.get, 08-11 E2E (testids; flow.spec.ts placeholder assertion)]
tech-stack:
  added: []
  patterns: [inline SVG polyline sparkline, load-prop seam defaulting to window.api.trends?.get]
key-files:
  created:
    - src/renderer/src/screens/review/Sparkline.tsx
    - src/renderer/src/screens/review/Trends.tsx
    - src/renderer/src/screens/review/Trends.module.css
    - src/renderer/src/screens/review/Trends.test.tsx
  modified:
    - src/renderer/src/screens/ReviewMode.tsx
    - src/renderer/src/screens/ReviewMode.test.tsx
decisions:
  - "The Sparkline reference-line prop is named refValue, because ref is reserved in React"
  - "A rejected load is shown as status failed with no summaries; a failed status that still has 2 or more summaries keeps its sparklines"
  - "Trends mounts only when the trends tab is selected, so the IPC runs only once the tab is opened"
metrics:
  duration: 8min
  completed: 2026-11-03
  tasks: 2
  files: 6
---

# Phase 8 Plan 08: Trends tab UI Summary

The Trends tab now works. It shows dependency-free inline SVG sparklines for:

- the total, with a dashed ready line at 26
- each of the 6 rubric dimensions
- the flag-found rate
- the average answer length
- number accuracy

Below the sparklines are the trends agent's insights: recurring weaknesses, progress by dimension (an arrow plus an up/flat/down aria-label), the carried-forward fix, the next case, and readiness. The tab also has loading, insufficient and failed states.

## Tasks

| Task | Name | RED | GREEN |
|------|------|-----|-------|
| 1 | Sparkline (inline SVG) | 10a5ee2 | 19fdbd0 |
| 2 | Trends tab + ReviewMode mount | 083d5b1 | cc440fe |

## Verification

- `npx vitest run --project renderer`: 274 tests passed.
- `npm run typecheck:web` is clean.
- eslint is clean on the files this plan owns.
- No chart dependency was added. `Trends arrive in Phase 8` no longer appears in ReviewMode.tsx.
- Every sparkline has a role="img" aria-label that lists its values. Null values show as "–".
- Borders are full 1px tokens only. Status is shown by arrow colour and a chip, with no one-side accent stripes.

## Deviations from Plan

1. **[Rule 3] `ref` was renamed to `refValue`** on the Sparkline props, because `ref` is a reserved React prop.
2. **[Rule 3] ReviewMode.test.tsx was updated.** The tab-switch test now asserts the `trends` panel instead of the placeholder text, as the plan's read_first asked.

## Known Stubs / Follow-ups

- **`tests/e2e/flow.spec.ts:111` still asserts `Trends arrive in Phase 8`.** It is not in this plan's files, and 08-11 owns the E2E update, so it will fail until 08-11 changes it.
- Until 08-09 wires the preload `trends.get`, the default loader rejects and the tab shows "Trends unavailable". This is intended.

## Self-Check: PASSED
