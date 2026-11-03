---
phase: 03-walking-skeleton-on-fakes
plan: 09
subsystem: renderer
tags: [routing, ipc, speech-queue, tdd]
requires: [03-01, 03-06, 03-07]
provides: [app-routing, fake-speech-queue]
affects: [src/renderer/src/App.tsx]
tech-stack:
  added: []
  patterns: [state-switch routing, IPC push subscriptions in one useEffect, injected-ack FIFO queue]
key-files:
  created:
    - src/renderer/src/speech/fakeSpeechQueue.ts
    - src/renderer/src/speech/fakeSpeechQueue.test.ts
  modified:
    - src/renderer/src/App.tsx
    - src/renderer/src/App.test.tsx
  deleted:
    - src/renderer/src/screens/Home.tsx
decisions:
  - "Fake speech queue resolves setTimeout at call time (not construction) so test fake timers installed after mount apply"
  - "Library-list failure renders Library with error view instead of a separate error screen"
metrics:
  duration: 8min
  completed: 2026-11-03
requirements: [LIB-01, QA-02]
---

# Phase 3 Plan 09: App routing and fake speech queue Summary

App.tsx now routes loading/settings/home(Library)/session/reviewMode from `key.status`, `library.list` and `onView` pushes, and feeds `onSpeak` into a FIFO fake speech queue that acks each sentence after words x 60 ms. The Phase 1 Home placeholder is gone.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Fake speech queue | 42e8e61 (RED), 29ce564 (GREEN) |
| 2 | App routing, remove Home.tsx | fe07d54 (RED), 35a3869 (GREEN), 3ff45a2 (lint refactor) |

## Verification

- `npx vitest run --project renderer`: 67/67 pass (7 files)
- `npm run typecheck:web`: exit 0
- `Home.tsx` deleted; no `screens/Home` references remain
- E2E/build not run (shared `out/` with parallel plan 03-08, per orchestrator instruction)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Queue captured the real setTimeout at construction**
- **Found during:** Task 2 (App speak-ack test with fake timers enabled after mount)
- **Fix:** Resolve `o.setTimeout ?? setTimeout` per schedule call
- **Files modified:** src/renderer/src/speech/fakeSpeechQueue.ts
- **Commit:** 35a3869

**2. [Rule 3 - Blocking] ESLint explicit-return-type errors in new tests**
- **Fix:** Added return types / one targeted disable on the inferred mock factory
- **Commit:** 3ff45a2

## Known Stubs

- `fakeSpeechQueue.ts` is the intentional Phase 3 stand-in (no audio); Phase 5 replaces it with HeadTTS/TalkingHead behind the same `enqueue`/`clear` shape.

## Self-Check: PASSED
