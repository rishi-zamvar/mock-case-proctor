---
phase: 05-voice-out-avatar
plan: 01
subsystem: main-voice-plumbing
tags: [ipc, tts, runner, compose, electron]
requires: []
provides:
  - "CH.speakCancel push + SpeakCancelSchema"
  - "TtsMode/TtsDevice/AvatarStateName/SpokenSeq/VoiceProbe contracts"
  - "speak:ack optional spoken flag (preload -> zod -> runner)"
  - "window.api.config.tts from --tts=<mode>"
  - "Runner emitCancel + reviewWarningLine deps"
affects: [05-02, 05-03, 05-04, renderer voice plans]
tech-stack:
  added: []
  patterns: ["main pushes speak:cancel for the turn it aborts mid-speech", "TTS mode read in main, passed to renderer as a process arg"]
key-files:
  created:
    - src/main/session/runner.voice.test.ts
  modified:
    - src/shared/ipc.ts
    - src/shared/schemas.ts
    - src/shared/schemas.test.ts
    - src/main/ipc.ts
    - src/main/ipc.test.ts
    - src/preload/index.ts
    - src/preload/index.d.ts
    - src/main/session/runner.ts
    - src/main/session/runner.harness.ts
    - src/main/compose.ts
    - src/main/compose.test.ts
    - src/main/index.ts
decisions:
  - "TTS mode defaults to headtts, fake under E2E=1; any other TTS value still throws"
  - "T-10 warning line is proctoring: spoken without ack wait and not added to the transcript"
  - "spoken ack flag carried end to end but ignored by the runner until Phase 7"
metrics:
  duration: "~25 min"
  completed: 2026-11-03
---

# Phase 5 Plan 01: Main-side voice plumbing Summary

The IPC contracts gain a `speak:cancel` push, a `spoken` flag on acks and the `VoiceProbe` type. The runner now pushes a cancel for any turn it aborts mid-speech and, in headtts mode only, speaks "Ten minutes left." at T-10. The TTS mode goes from env to the renderer as `--tts=<mode>` (`window.api.config.tts`), and the session window has `autoplayPolicy: 'no-user-gesture-required'`.

## Tasks

| Task | Commits |
| ---- | ------- |
| 1. Contracts, ack schema, IPC handler, preload | 49e1c11 (RED), 76fae39 (GREEN), f618eae (prettier) |
| 2. Runner cancel push, T-10 line, spoken flag | c446db0 (RED), 0bca002 (GREEN) |
| 3. TTS config in compose, window args, autoplay | 92f464d (RED), 56504a3 (GREEN), 35a4669 (test fix) |

## Implementation notes

- The runner wraps `speakTurn` to track `speakingTurn`. `abortInflight()` emits the cancel, so skip warm-up, end, start, resume and discard all go through it.
- `runner.ack(turnId, seq)` keeps its old body. The interface accepts an optional `spoken`, and a `ponytail:` comment records that the flag is ignored until Phase 7.
- T1 parity: with E2E=1 and no TTS env, mode is `fake`, so no warning line is spoken and the fake queue is unchanged.

## Deviations from Plan

**1. [Rule 1 - Bug] Compose T-10 test was flaky at a 100000x time scale**
- **Found during:** Task 3
- **Issue:** At 100000x, a few ms of queue latency is 10 app minutes. The machine therefore saw the warning after the deadline and ignored it, which is the correct guard.
- **Fix:** The test now runs at 10000x (a 60 ms real window) and waits for the phase to leave review rather than polling `reviewWarned`.
- **Commit:** 35a4669

**Note:** `tsc -p tsconfig.node.json` without `--composite false` sometimes reports TS2742 on `runner.harness.ts setup()`. This comes from declaration emit only. The project's `npm run typecheck` passes `--composite false` and is clean.

## Verification

- `npm test`: 871 passed, 2 skipped
- `npm run typecheck`: clean
- eslint clean on the touched files

## Known Stubs

None. The ignored `spoken` flag is intentional and Phase 7 consumes it.

## Self-Check: PASSED
