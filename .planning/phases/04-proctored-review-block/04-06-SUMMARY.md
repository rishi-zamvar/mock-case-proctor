---
phase: 04-proctored-review-block
plan: 06
subsystem: renderer-screens
tags: [session, library, deck, webcam, mic, countdown]
requires: [04-01, 04-02, 04-03]
provides:
  - Session deck stage + Deck toggle, webcam tile, camera/mic toggles, T-10 toast, monotonic countdown
  - Library start-sheet "Check your setup" (MicCheck + WebcamTile preview)
affects: [Phase 5 AvatarStage mount point (unchanged), 04-07 E2E]
tech-stack:
  added: []
  patterns: [per-deadline min-clamp countdown recomputed from the deadline on tick/view/visibilitychange]
key-files:
  created: []
  modified:
    - src/renderer/src/screens/Session.tsx
    - src/renderer/src/screens/Session.test.tsx
    - src/renderer/src/screens/Session.module.css
    - src/renderer/src/screens/Library.tsx
    - src/renderer/src/screens/Library.test.tsx
    - src/renderer/src/screens/Library.module.css
decisions:
  - Countdown is state clamped by nextRemaining(prev, deadline, raw); the raw value always comes from the deadline, ticks never accumulate
  - Mic mute is UI state only (ponytail comment); Phase 7 gates capture on it
  - Start sheet widened 400px -> 520px to fit the meter beside the 200px preview
metrics:
  duration: 2min
  completed: 2026-11-03
  tasks: 2
  files: 6
---

# Phase 4 Plan 06: Session + Library Phase 4 Mounts Summary

Session now shows the real interviewee deck (`app://bundle/cases/<id>/interviewee.pdf`) during review, and a Deck/Interviewer toggle in presentation, extraction, grilling and wrapup. The countdown is clamped so it never goes up for the same deadline and recomputes on `visibilitychange`. A one-time "10 minutes left" status toast appears and hides after 8 s. The mirrored webcam tile has camera/mic toggles. Library's start sheet now has a live mic meter and camera preview, and Start is never blocked.

## Tasks

| Task | Name | RED | GREEN |
| ---- | ---- | --- | ----- |
| 1 | Session stage, toggles, webcam tile, toast, monotonic countdown | c11d272 | a15adf0 (see deviation) |
| 2 | "Check your setup" in the start sheet | 6a81a04 | bb75607 |

## Verification

- `npx vitest run --project renderer`: 123/123 pass
- `npm run typecheck:web`: clean
- `npx eslint src/renderer/src/screens/`: 0 problems
- `npm run lint` shows 3 errors, all in 04-05's in-progress `src/main/media.test.ts` and `src/main/power.test.ts`. They come from the parallel plan, not this one.
- Acceptance greps: `app://bundle/cases/` present; `data-testid="avatar-stage"` block unchanged; no "Phase 4" left in Session.tsx; `visibilitychange` present; `setup-check` and `<MicCheck` present in Library.tsx
- App.test.tsx needed no changes

## Deviations from Plan

**1. [Process - parallel commit race] Task 1 GREEN landed inside 04-05's commit a15adf0**
- **Found during:** Task 1 commit
- **Issue:** I ran `git add` on my Session files in the shared index. The parallel 04-05 executor then ran a plain `git commit`, which included them. As a result, a15adf0 (`feat(04-05): wire awake + media access...`) contains the full Session.tsx / Session.module.css / Session.test.tsx GREEN change.
- **Fix:** I did not rewrite history, because the other executor was still committing in the same tree. The code is correct and complete; only the commit message is wrong. After that I used `git commit -- <paths>`, which stages and commits in one step, for every later commit.
- **Files:** src/renderer/src/screens/Session.{tsx,module.css,test.tsx}

**2. [Rule 1 - Test fix] Monotonic-countdown test anchors**
- The first draft of the test re-sent a view with the original `clockNow`, which does not move time forward. I changed it to `clockNow + 10s` before GREEN, so the test now exercises the 2-s "estimate goes up" case it was written for.

Otherwise the plan was executed as written.

## Known Stubs

- `mic-toggle` is UI-only (marked with a ponytail comment in Session.tsx). By design, Phase 7 wires capture gating to it.

## Self-Check: PASSED
- All 6 modified files exist; commits c11d272, a15adf0, 6a81a04, bb75607 present in `git log`.
