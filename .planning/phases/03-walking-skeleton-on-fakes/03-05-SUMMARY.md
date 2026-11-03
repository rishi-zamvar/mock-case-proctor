---
phase: 03-walking-skeleton-on-fakes
plan: 05
subsystem: session-view
tags: [redaction, barrier, view-state, reveal]
requires: [03-01]
provides: [toViewState, buildReveal, ViewExtras]
affects: [03-08, 03-10]
tech-stack:
  added: []
  patterns: [explicit-literal projection, schema-parse on every return]
key-files:
  created: [src/main/session/view.ts, src/main/session/view.test.ts]
  modified: []
decisions:
  - "ledWithCall tests only the opening's first sentence (split on .!? followed by whitespace)"
  - "keyNumbers copied as explicit {label,text} literals rather than passing brief.memorize by reference"
metrics:
  duration: 4min
  completed: 2026-11-03
---

# Phase 3 Plan 05: View Projection Summary

`toViewState` is now the one barrier between a session and the renderer. It builds the 12-key ViewState from explicit literals and returns it through `ViewStateSchema.parse`. The brief enters only through `buildReveal`, and only in reviewMode when a scorecard exists.

## Tasks

| Task | Commits |
|------|---------|
| 1 toViewState + buildReveal | 28c18fc (RED), 5838d83 (GREEN) |

## Verification

- `npx vitest run src/main/session`: 20 tests pass. These include the barrier sweep across 7 pre-review phases: no idealAnswer, flag text or say lines, hidden flags, rubric lines or intended-read sentence appear in the view, and checkUtterance passes on every string leaf.
- The spread grep prints nothing, and `ViewStateSchema.parse` is present.
- `typecheck:node`: the only errors are in `src/main/adapters/fakeLlm.test.ts`, which belongs to another wave-2 plan.

## Deviations from Plan

None. The plan was executed as written.

## Known Stubs

- `checks.numbers: []` in src/main/session/view.ts is intentional. Phase 8's tolerance parser (REV-03) fills it, and the code carries a `ponytail:` comment saying so.

## Self-Check: PASSED
