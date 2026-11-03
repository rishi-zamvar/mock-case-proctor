---
phase: 05-voice-out-avatar
plan: 05
subsystem: renderer/voice
tags: [talkinghead, headtts, voice-runtime, e2e-probe, tdd]
requires: [05-02, 05-03, 05-04]
provides:
  - "createAvatarEngine / avatarInstances / AvatarEngine / TalkingHeadLike (avatar/avatarEngine.ts)"
  - "createAvatarCore / CoreHead (avatar/avatarCore.ts): pure run gating + state plan + stateLog"
  - "createVoice / getVoice / Voice / VoiceDeps / EngineLike / VOICE / AUDITION_VOICES / WARMUP_TEXT (speech/voice.ts)"
  - "window.__voice VoiceProbe under __e2e"
affects: [05-06, 05-07, 05-08]
tech-stack:
  added: []
  patterns: [pure core + thin WebGL glue, lazy idempotent warm promise, deferred ready promise for the queue, dynamic import of the engine]
key-files:
  created:
    - src/renderer/src/avatar/avatarCore.ts
    - src/renderer/src/avatar/avatarCore.test.ts
    - src/renderer/src/avatar/avatarEngine.ts
    - src/renderer/src/vendor.d.ts
    - src/renderer/src/speech/voice.ts
    - src/renderer/src/speech/voice.test.ts
  modified: []
decisions:
  - "The avatar logic (gating, STATE_PLAN application, nod interval, stateLog) lives in avatarCore.ts and is tested against a fake head; avatarEngine.ts is only the TalkingHead construction, showAvatar and the canvas readback"
  - "The thinking look-aside uses head.lookAhead(800), which needs no client coordinates, rather than lookAt(x,y)"
  - "The queue's ready is a deferred promise that warm() settles: it rejects when the device is 'none', so every seq acks false at once"
  - "onDevice fires right away for late subscribers once the device is known"
  - "stateLog starts empty and records distinct transitions only (the initial 'idle' is not logged)"
  - "GLB URL is /res/models/avatars/avatarsdk.glb, per 05-02's on-disk layout under resources/assets/models/"
metrics:
  duration: 4min
  completed: 2026-11-03
  tasks: 2
  files: 6
---

# Phase 5 Plan 05: Voice Runtime and Avatar Engine Summary

This plan builds one TalkingHead singleton: a detached host, 30 fps, `lipsyncModules: []`, gated by shouldRun, with canvas readback. Its logic sits in a pure, unit-tested core. It also builds the `voice.ts` runtime, which composes the speech queue, HeadTTS and the engine through a dynamic import. `voice.ts` warms up silently, wakes the engine for audio even while the stage is hidden, and publishes `window.__voice` in E2E only.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | TalkingHead engine singleton + module types (with tested core) | 3108355 (RED), 0ebd69c (GREEN) |
| 2 | voice.ts runtime, warm-up, window.__voice probe | 266a0df (RED), 96e2312 (GREEN) |

## Verification

- avatarCore.test.ts: 10 tests. They cover run gating before and after ready, wake/sleep only on change, `onResize` on the next frame after becoming visible, stateLog, listening nods via animQueue, and the thinking look-aside + emoji. They also check that speaking leaves the head alone.
- voice.test.ts: 16 tests, one or more for each behaviour in the plan, plus host replay and `resume()`.
- `npm test`: 905 passed, 2 skipped. `tsc -p tsconfig.web.json` is clean. eslint is clean on all owned files.
- Acceptance greps all pass:
  - `lipsyncModules: []` and `modelFPS: 30` are present.
  - There is no `speakEmoji` or `speakText`.
  - Only `avatarEngine.ts` and `vendor.d.ts` reference `@met4citizen/talkinghead`.
  - `voice.ts` has `export const VOICE = 'bm_george'` and loads the engine only via `import('../avatar/avatarEngine')`. Its only other reference to that module is a type-only `typeof import(...)`.

## Deviations from Plan

**1. [Plan-checker note] Extracted avatarCore.ts.** The plan said avatarEngine.ts gets no unit test. Per the orchestrator's note, the pure state, gating and stateLog logic was moved into `avatarCore.ts` and test-driven (RED, then GREEN). The WebGL glue left in `avatarEngine.ts` is covered by 05-08 T2.

**2. [Rule 2] Device 'none' acks without touching the head.** The queue's `ready` rejects when warm ends with device `'none'`, including when makeEngine or showAvatar reject. Every seq then acks `spoken:false` straight away, and `speakMarker` is never reached on a missing engine.

**3. [Rule 1] `opaqueFraction()` guards against a 0x0 canvas or a missing 2D context, and returns 0 in those cases.**

## Notes for 05-06 / 05-07 / 05-08

- `head.render()` only draws while TalkingHead `isRunning`. A hidden, idle engine is stopped, so `opaqueFraction()` should be polled while the stage is visible.
- `getVoice` is memoised, so the first caller's `ack` wins. App (05-07) should be the only caller.
- `audition()` awaits `warm()` and rejects when there is no TTS or the device is `'none'`.

## Known Stubs

None.

## Self-Check: PASSED
