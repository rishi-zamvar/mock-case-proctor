---
phase: 04-proctored-review-block
plan: 07
subsystem: e2e
tags: [e2e, playwright, deck, countdown, mic, webcam, awake, gate]
requires: [04-05, 04-06]
provides:
  - review.spec.ts (deck via app:// + worker, page memory, drift-free countdown, once-only T-10 warning, auto-advance, Ready skip)
  - media.spec.ts (mic meter, silent-mic warning, mirrored never-recorded webcam tile, display-sleep assertion)
  - packaged deck smoke (2nd @packaged test)
  - silence.wav fixture + launchLibrary env override + deckCanvasPainted helper
affects: [Phase 5 (spoken warning reuses review-warning path)]
tech-stack:
  added: []
  patterns: [pmset assertion probe by app pid, window-held MediaStreamTrack handle to prove a stop]
key-files:
  created:
    - tests/e2e/review.spec.ts
    - tests/e2e/media.spec.ts
  modified:
    - tests/e2e/global-setup.ts
    - tests/e2e/session.ts
    - tests/e2e/flow.spec.ts
    - tests/e2e/packaged.spec.ts
    - src/renderer/src/media/WebcamTile.tsx
    - src/renderer/src/media/WebcamTile.test.tsx
    - src/main/power.test.ts
    - src/main/media.test.ts
    - .planning/phases/04-proctored-review-block/04-VALIDATION.md
decisions:
  - Countdown step bound includes one 250 ms renderer tick; a cumulative wall-clock drift bound was added on top
  - Display-sleep check accepts NoDisplaySleepAssertion (the legacy IOKit alias Chromium actually creates) on the app's own pid, and also asserts it is gone after release
  - WebcamTile unmounts the <video> when off instead of relying on [hidden]
metrics:
  duration: 35min
  completed: 2026-11-03
  tasks: 3
  files: 11
---

# Phase 4 Plan 07: E2E Specs + Phase Gate Summary

Every Phase 4 success criterion now has a passing Playwright `_electron` test against the built app, and the deck has one against the packaged `.app`. The E2E run exposed one real app bug: a black video frame covered "Camera off". It is fixed at the root.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| pre | Fix the 3 deferred lint errors (power/media unit tests) | 9222b7e |
| 1 | Harness tweaks + review.spec.ts + flow.spec deck-viewer | a98bbde |
| 2 | media.spec.ts + packaged deck smoke | 146a483 (app fix), b7ce072 |
| 3 | Phase 4 gate + VALIDATION green | d0b3e4f |

## Gate

| Check | Result |
| ----- | ------ |
| `npm run lint` | 0 errors (21 pre-existing warnings) |
| `npm run typecheck` | clean |
| `npm run build` | ok |
| `npx vitest run` | 785 passed, 2 skipped |
| `npm run test:e2e` run 1 / 2 / 3 | 39/39 each, no retries; 165 s / 165 s / 164 s |
| `npm run test:packaged` | 2/2 (`launches and loads the SDK`, `renders the deck from inside the asar`) |

Measured mic-check peak for the `say` fixture, with echoCancellation and noiseSuppression on: **1.00**. That is well above the 0.1 threshold, so processing stayed on.

## Success criterion to test mapping

1. **PDF renders through app://; the countdown runs from a fixed deadline and does not drift.** Proven by `review.spec`: "deck renders through app:// with the bundled worker" (4 pages, painted canvas, keyboard paging and zoom, no CSP or worker errors, and `pdf.worker.min-*.mjs` emitted) and "countdown is deadline-driven, warns once at T-10 and starts the presentation at T-0" (≥30 samples, never goes up, per-step bound, cumulative drift bound). Also `review.spec` "deck page is remembered for the session", `flow.spec` "full session walks every screen" (deck-viewer), and `packaged.spec` "packaged app renders the deck from inside the asar".
2. **T-10 warning fires; Ready skips to the presentation.** Proven by `review.spec` "countdown is deadline-driven…": the toast appears once with 300 to 600 s left, `review warning` is logged exactly once, and `reviewWarned` is true. Also `review.spec` "Ready skips straight to the presentation" and `flow.spec` "review deadline advances on its own under E2E_TIME_SCALE".
3. **The mic-check meter moves for the fake mic and flags a silent input.** Proven by `media.spec` "mic check meter moves for the fake WAV mic" (peak > 0.1, no silent flag after 4 s, live preview) and "a silent mic is flagged" (silence.wav shows "We can't hear you", and Start still works).
4. **Mirrored webcam tile on its own stream, nothing recorded, display kept awake.** Proven by `media.spec` "webcam tile is a mirrored live self-view that stops with the session" (videoWidth > 0, transform `matrix(-1, 0, 0, 1, 0, 0)`, track live, 0 audio tracks; toggling off or ending the session ends the track; no media files in userData) and "the display stays awake during a session" (the app pid holds the display-sleep assertion during review; `awake hold` and `awake release` are logged; the assertion is gone after the end).

## Deviations from Plan

**1. [Rule 1 - Bug] WebcamTile kept a visible black `<video>` when the camera was off**
- **Found during:** Task 2 (media.spec webcam test)
- **Issue:** `.video { display: block }` overrides the `[hidden]` attribute, so the off state showed a black frame over "Camera off".
- **Fix:** The component renders `camera-off` *or* `<video>`, never both. The unit test now asserts the video element is gone when off; it failed before the fix and passes after it. The test and fix went into one commit (RED was verified first).
- **Files:** src/renderer/src/media/WebcamTile.tsx, WebcamTile.test.tsx
- **Commit:** 146a483

**2. [Rule 1 - Test model] The countdown per-sample bound now includes the renderer tick**
- The Session countdown repaints every 250 ms. At scale 300, one repaint is 75 s of app time, so a 100 ms sample can see a 77 s drop. The plan's bound left out that tick. The fix adds one tick (250 ms) to dt, and a new, stricter cumulative check requires every sample to stay within 2 ticks of the wall-clock-projected value. That adds a drift check rather than weakening one.

**3. [Rule 3 - Environment] The pmset assertion name**
- Chromium creates `NoDisplaySleepAssertion`, the legacy alias of `PreventUserIdleDisplaySleep`, so pmset lists it under that name, attributed to the app's own pid (I confirmed this with a throwaway probe). The test matches either name on `pid <app pid>(`, so the pid stays strict, and it also asserts the assertion is released.

**4. Stronger webcam stop check**
- The test also keeps the live `MediaStreamTrack` on `window` and asserts that `readyState === 'ended'` after the camera is toggled off and after the session ends. This proves the stop rather than just checking the DOM.

**5. Deferred lint errors fixed** (orchestrator instruction)
- Added explicit return types to power.test.ts and media.test.ts, and replaced the unused `_t` with `vi.fn<Blocker['start']>`.

CSP: no violation was seen, so csp.ts is unchanged. The worker is emitted as `out/renderer/assets/pdf.worker.min-*.mjs`, so the `?url` fallback was not needed.

## Known Stubs

None added. These remain from earlier plans by design: the REVIEW_WARNING speech (Phase 5) and mic-toggle capture gating (Phase 7).

## Self-Check: PASSED
- tests/e2e/review.spec.ts, tests/e2e/media.spec.ts and tests/fixtures/audio/silence.wav exist
- Commits 9222b7e, a98bbde, 146a483, b7ce072 and d0b3e4f are in `git log`
