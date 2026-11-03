---
phase: 04-proctored-review-block
plan: 01
subsystem: domain-contracts
tags: [reducer, ipc, zod, review-warning]
requires: []
provides:
  - REVIEW_WARNING event/effect + REVIEW_WARNING_MS + reviewWarned state
  - ViewState.deckPage, ViewState.reviewWarned, Intent deckPage
  - AwakePort
affects: [04-05 runner, 04-06 session screen, Phase 5 spoken warning]
tech-stack:
  added: []
  patterns: [backward-compatible zod .default() for persisted state]
key-files:
  created: []
  modified:
    - src/main/domain/machine/interviewMachine.ts
    - src/main/domain/machine/interviewMachine.test.ts
    - src/main/store/sessionSchema.ts
    - src/main/store/sessionSchema.test.ts
    - src/shared/ipc.ts
    - src/shared/schemas.ts
    - src/shared/schemas.test.ts
    - src/main/session/view.ts
    - src/main/session/view.test.ts
    - src/main/ports/index.ts
    - src/renderer/src/App.test.tsx
    - src/renderer/src/screens/Session.test.tsx
    - src/renderer/src/screens/ReviewMode.test.tsx
decisions:
  - "REVIEW_WARNING_MS is a constant (10 min), not a MachineConfig field"
  - "Warning timer armed only when reviewMs > 10 min; REVIEW_WARNING accepted only inside [deadline-10min, deadline) and once"
metrics:
  duration: 2min
  completed: 2026-11-03
---

# Phase 4 Plan 01: Review Warning + Contracts Summary

The reducer now arms a T-10 warning timer on every review entry and emits `REVIEW_WARNING` once. `deckPage` and `reviewWarned` flow through the zod-validated ViewState/Intent contract, and old session files still load because of the schema defaults.

## Tasks

| Task | Name | RED | GREEN |
| ---- | ---- | --- | ----- |
| 1 | Reducer emits T-10 review warning once | a11615f | 1265ef0 |
| 2 | Extend renderer contract (ViewState, Intent, view, AwakePort) | c96179b | 1d50eee |

## Verification

- `npx vitest run`: every test in this plan's files passes (730 passed overall). The only failing file is `src/renderer/src/deck/DeckViewer.test.tsx`, a RED test from a parallel plan whose module isn't written yet. It is not in this plan's scope.
- `npm run typecheck:node`: passes. `typecheck:web` fails only on that same parallel DeckViewer import.
- No changes to runner.ts, Session.tsx or Library.tsx.

## Deviations from Plan

None. The plan was executed as written.

## Known Stubs

None. The `deckPage` intent isn't handled yet; 04-05 will add that to the runner.

## Self-Check: PASSED
