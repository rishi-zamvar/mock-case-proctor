---
phase: 03-walking-skeleton-on-fakes
plan: 07
subsystem: renderer-ui
tags: [react, screens, session, review-mode, a11y]
requires: [03-01 ViewState/Intent/Reveal contracts]
provides: [Session screen, ReviewMode screen]
affects: [App.tsx wiring (later plan), T1 E2E suite]
tech-stack:
  added: []
  patterns: [props-driven screens (view -> DOM, clicks -> intents), injectable now() for timer tests]
key-files:
  created:
    - src/renderer/src/screens/Session.tsx
    - src/renderer/src/screens/Session.module.css
    - src/renderer/src/screens/Session.test.tsx
    - src/renderer/src/screens/ReviewMode.tsx
    - src/renderer/src/screens/ReviewMode.module.css
    - src/renderer/src/screens/ReviewMode.test.tsx
  modified: []
decisions:
  - Countdown anchors app clock to local now() when the view prop identity changes (setState-during-render pattern, no refs)
  - Space toggle ignored while the end-confirm dialog is open (avoids recording behind a modal)
  - Tab panels are conditionally rendered (not hidden) so the inactive panel is absent from the DOM
metrics:
  duration: ~10min
  completed: 2026-11-03
  tasks: 2
  files: 6
---

# Phase 3 Plan 07: Session and ReviewMode Screens Summary

One shared Session layout (62/38 grid: deck/avatar/scoring stage, webcam tile, phase header with scaled countdown or section label, transcript with aria-live region, bottom bar with Talk/Done + Space, Ready, Skip warm-up, End-with-confirm) and a ReviewMode debrief (rubric table, flag-map chips, checks, two-column reveal, key numbers, transcript, Trends tab, ended-early notice).

## Tasks

| Task | Commit (RED / GREEN) |
| ---- | -------------------- |
| 1 Session screen | 99280ab / 49205bf |
| 2 ReviewMode screen | 912db9f / 1b962c8 |

Tests: Session 12, ReviewMode 11; renderer project 55/55 green. eslint + typecheck clean for these files.

## Deviations from Plan

- Session GREEN commit also touched Session.test.tsx for lint only (explicit return type, typed `vi.fn<(i: Intent) => void>()`, prettier); no behaviour change.
- Added beyond contract (a11y): Escape cancels the end dialog, cancel button autofocused, roving tabindex on tabs, "Space to talk" hint.

## Known Stubs

Intentional per 03-CONTEXT (final layout slots): `deck-placeholder` (Phase 4), `webcam-tile` (Phase 4), `avatar-stage` ring (Phase 5), Trends tab (Phase 8). Screens are not yet wired into App.tsx; that is another plan's scope.

## Self-Check: PASSED
