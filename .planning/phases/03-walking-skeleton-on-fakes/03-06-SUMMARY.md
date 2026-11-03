---
phase: 03-walking-skeleton-on-fakes
plan: 06
subsystem: renderer-ui
tags: [library, react, a11y, tdd]
requires: [03-01 LibraryView/StartOptions contracts]
provides: [Library screen component (props-driven, data-screen="home")]
affects: [03-09 App wiring]
tech-stack:
  added: []
  patterns: [props-only screen component, CSS module on tokens.css]
key-files:
  created:
    - src/renderer/src/screens/Library.tsx
    - src/renderer/src/screens/Library.module.css
    - src/renderer/src/screens/Library.test.tsx
  modified: []
decisions:
  - "Library start sheet restores focus to the triggering Start/Retake button on Cancel/Escape"
metrics:
  duration: 3min
  completed: 2026-11-03
requirements: [LIB-01, LIB-02]
---

# Phase 3 Plan 06: Library Screen Summary

The Library screen is a props-only component. It renders a `LibraryView` as a grid of case cards. Each card shows only the number, company, vertical and level. Completed cases are greyed to 0.45 opacity, show "Completed <date> · <n>/30" and offer Retake. A modal start sheet has a warm-up toggle that is on by default. The screen also has the resume banner, quarantine notice and error alert. 17 component tests cover it.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Library component tests (RED) | e824950 |
| 2 | Library component and styles (GREEN) | 20c4598 |

## Verification

- `npx vitest run src/renderer/src/screens/Library.test.tsx`: 17/17 pass
- eslint and prettier are clean on all three files; `tsc -p tsconfig.web.json` reports no Library errors
- `data-screen="home"` and `open-settings` are kept, so the Phase 1 E2E selectors still work. The file has no `window.api` usage.

## Deviations from Plan

**1. [Rule 2 - a11y] Focus returns to the trigger when the sheet closes.** This was not in the contract. It keeps keyboard users in place after they press Cancel or Escape.

I also added two tests the plan did not list: the toggle resets to on each time the sheet opens, and the `extraction` phase is labelled "presentation".

## Known Stubs

None. The component is wired to the App in 03-09, as planned.

## Notes

- There is no focus trap inside the sheet: `aria-modal` is set and focus starts on Start. Add a trap if Tab escaping the sheet becomes an issue.

## Self-Check: PASSED
