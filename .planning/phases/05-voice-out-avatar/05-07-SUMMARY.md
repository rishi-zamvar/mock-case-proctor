---
phase: 05-voice-out-avatar
plan: 07
subsystem: renderer-shell
tags: [voice, avatar, app-shell, tdd]
requires: ["05-01 Api.config.tts / onSpeakCancel / ack spoken", "05-05 getVoice runtime", "05-06 Session avatar prop"]
provides:
  - "App tts-mode switch (fake queue vs the one voice runtime)"
  - "speak:sentence -> voice.enqueue, speak:cancel -> voice.cancel"
  - "voice-banner (role=alert) for wasm/none TTS devices"
  - "AudioContext resume on the Start/Resume gesture"
affects: [05-08]
tech-stack:
  added: []
  patterns: [single getVoice call in a lazy useState initializer, screen element variable + top-level banner fragment]
key-files:
  created:
    - src/renderer/src/App.module.css
  modified:
    - src/renderer/src/App.tsx
    - src/renderer/src/App.test.tsx
decisions:
  - "A missing api.config is treated as tts 'fake', so old mocks and fake mode keep the Phase 4 behaviour unchanged"
  - "App is the only getVoice caller, from a lazy useState initializer, so the runtime is created once and persists past unmount (only clear() runs on cleanup)"
  - "Resume also calls voice.resume(): it is a user gesture into a session, the same as Start"
  - "The banner is a fixed top strip with pointer-events:none, so it never blocks the footer controls"
metrics:
  duration: 6min
  completed: 2026-11-03
  tasks: 1
  files: 3
---

# Phase 5 Plan 07: App Voice Wiring Summary

App picks the fake queue or the one voice runtime from `api.config.tts`. In headtts mode it warms the runtime on mount, routes speak events to `voice.enqueue` and cancels to `voice.cancel`, forwards acks with the `spoken` flag, shows a red banner when the TTS device is `wasm` or `none`, resumes the AudioContext on Start and Resume, and passes `avatar={voice}` to Session.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | App voice wiring, banner and Start-gesture resume | bfe68c7 (RED), a907f5c (GREEN) |

## Verification

- `npm test`: 62 files passed and 1 skipped; 917 tests passed and 2 skipped
- `npm run typecheck`: clean
- `npm run lint`: 0 errors. The 21 prettier warnings are all in files this plan did not touch, and App.tsx and App.test.tsx lint clean.
- The grep acceptance checks match: the CPU banner text, `onSpeakCancel` and `createFakeSpeechQueue` are all in App.tsx. App.tsx is the only file outside voice.ts that calls `getVoice(`.
- E2E was not run, as instructed (05-08 covers it).

## Deviations from Plan

**1. [Rule 2 - Missing critical] AudioContext resume on Resume too**
- **Found during:** Task 1
- **Issue:** The plan resumed audio only on Start. A resumed session would have opened with a suspended AudioContext, so the avatar would be silent.
- **Fix:** `onResume` now calls `voice?.resume()` before `session.resume`. A test covers it.
- **Commit:** a907f5c

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/renderer/src/App.tsx, src/renderer/src/App.test.tsx, src/renderer/src/App.module.css
- FOUND: bfe68c7, a907f5c
