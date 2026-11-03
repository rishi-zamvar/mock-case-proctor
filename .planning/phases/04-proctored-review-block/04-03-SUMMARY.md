---
phase: 04-proctored-review-block
plan: 03
subsystem: renderer-media
tags: [media, mic-check, webcam, privacy]
requires: []
provides: [MicCheck, WebcamTile, level.measure, level.createSilenceWatch, no-recording guard]
affects: [04-06, 04-07]
tech-stack:
  added: []
  patterns: [injectable getUserMedia/meter/now seams, cancelled-flag effect cleanup, 50 ms setInterval poll]
key-files:
  created:
    - src/renderer/src/media/level.ts
    - src/renderer/src/media/level.test.ts
    - src/renderer/src/media/MicCheck.tsx
    - src/renderer/src/media/MicCheck.test.tsx
    - src/renderer/src/media/WebcamTile.tsx
    - src/renderer/src/media/WebcamTile.test.tsx
    - src/renderer/src/media/media.module.css
    - tests/config/no-recording.test.ts
  modified: []
decisions:
  - "MicCheck/WebcamTile treat an explicitly passed getUserMedia={undefined} as unavailable ('getUserMedia' in props); omitted prop falls back to navigator.mediaDevices"
  - "Unavailable state derived at initial render (no setState in effect, per react-hooks/set-state-in-effect)"
  - "GetMedia type exported from MicCheck.tsx and reused by WebcamTile"
metrics:
  duration: 6min
  completed: 2026-11-03
---

# Phase 4 Plan 03: Mic Check and Webcam Tile Summary

This plan adds a native `<meter>` mic check (AnalyserNode RMS, running peak, 3 s silence warning) and a mirrored 640x360 self-view tile on its own video-only stream. Both release every track on unmount. A static guard keeps MediaRecorder, captureStream and createWriteStream out of the renderer and preload.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Level math + MicCheck | bd9331b (RED), 89da768 (GREEN) |
| 2 | WebcamTile + no-recording guard | a28fee1 (RED), b821b2e (GREEN) |

## Verification

- `npx vitest run --project renderer src/renderer/src/media`: 21/21 pass
- `npx vitest run --project main tests/config/no-recording.test.ts`: pass
- Full `npx vitest run`: 759 pass, 2 skipped. `npm run typecheck`: 0 errors.
- The DOM contract matches the plan's interfaces block: `mic-check`, `mic-level` (data-level/data-peak at 2dp), `mic-silent`, `mic-unavailable`, `webcam-tile[data-state]`, `webcam-video`, `camera-off`.

## Deviations from Plan

**1. [Rule 3 - Blocking] No jest-dom in the project.** The tests use plain `textContent` and `getAttribute` assertions instead of `toHaveTextContent` and `toHaveAttribute`.

**2. Note.** The no-recording guard passed at the RED step. That is expected: it guards against code that must never be added, so there was no behaviour to fail. The WebcamTile tests were red as planned.

## Known Stubs

None.

## Self-Check: PASSED
