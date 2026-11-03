---
phase: 05-voice-out-avatar
plan: 06
subsystem: renderer-avatar
tags: [avatar, react, tdd, session]
requires: ["05-04 AvatarBinding / avatarState / awaitingReply"]
provides:
  - "AvatarStage component (src/renderer/src/avatar/AvatarStage.tsx)"
  - "SessionProps.avatar?: AvatarBinding (single mount point)"
affects: [05-05, 05-07]
tech-stack:
  added: []
  patterns: [persistent host moved between mounts, derived state pushed via effect]
key-files:
  created:
    - src/renderer/src/avatar/AvatarStage.tsx
    - src/renderer/src/avatar/AvatarStage.module.css
    - src/renderer/src/avatar/AvatarStage.test.tsx
  modified:
    - src/renderer/src/screens/Session.tsx
    - src/renderer/src/screens/Session.test.tsx
decisions:
  - "Fake mode renders the exact Phase 4 placeholder markup (ring + 'Interviewer'); avatar mode is a dark video tile with a bottom-left name tag carrying a small speaking-ring dot"
  - "playing only counts when an avatar exists, so fake mode never reports 'speaking' from audio"
  - "Thinking indicator is role=status with aria-label 'Interviewer is thinking'; pulse disabled under prefers-reduced-motion"
metrics:
  duration: 4min
  completed: 2026-11-03
  tasks: 2
  files: 5
---

# Phase 5 Plan 06: AvatarStage and Session Mount Summary

AvatarStage moves the one persistent TalkingHead host into its slot on mount and detaches it (setVisible(false) + remove, never destroyed) on unmount. It pushes idle/listening/thinking/speaking to the binding and shows a subtle "…" while thinking. Session mounts it at its single stage point.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | AvatarStage component | 249c000 (RED), a271567 (GREEN) |
| 2 | Mount in Session | 30713d7 (RED), a0f55ba (GREEN) |

## Verification

- `npx vitest run --project renderer src/renderer/src/screens/Session.test.tsx src/renderer/src/avatar`: 55 passed (all existing Session tests unchanged)
- eslint clean on owned files; `tsc -p tsconfig.web.json` shows no errors in owned files
- `<AvatarStage` appears once in Session.tsx; AvatarStage imports nothing from avatarEngine, voice, three or @met4citizen

## Deviations from Plan

- Session.tsx diff is 16+/11- (27 lines, plan said ~20). The extra lines come from Prettier splitting `SessionProps` across lines once `avatar` was added. No logic outside the mount point changed.
- `.ring` in Session.module.css is now unused (the styles moved to AvatarStage.module.css). It was left in place because the file is outside this plan's file list. It is safe to delete later.

## Known Stubs

None. In the app the binding stays absent until 05-05/05-07 wire it in, so the fake-mode placeholder keeps rendering.

## Self-Check: PASSED
