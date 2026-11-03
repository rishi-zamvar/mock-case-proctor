---
phase: 05-voice-out-avatar
plan: 04
subsystem: renderer-voice
tags: [headtts, webgpu, wasm-fallback, avatar, tdd]
requires: []
provides:
  - "connectTts / loadHeadTts / synthTimeoutMs (src/renderer/src/speech/headtts.ts)"
  - "avatarState / awaitingReply / shouldRun / STATE_PLAN / AvatarBinding (src/renderer/src/avatar/behaviour.ts)"
affects: [05-05, 05-06]
tech-stack:
  added: []
  patterns: [injected loader + gpu fakes, bounded synth promise with reconnect, pure state map]
key-files:
  created:
    - src/renderer/src/speech/headtts.ts
    - src/renderer/src/speech/headtts.test.ts
    - src/renderer/src/avatar/behaviour.ts
    - src/renderer/src/avatar/behaviour.test.ts
  modified: []
decisions:
  - "Device is decided by endpoint order: null/absent adapter goes straight to wasm; webgpu connect failure reconnects on wasm; double failure (or loader failure) yields device 'none' with no-op synth"
  - "Synth timeout resolves ok:false 'timeout' and fires a background connect on the current endpoint to replace the dead worker"
  - "loadHeadTts imports via a variable URL plus @vite-ignore; a string literal alone is still resolved by Vite import analysis"
  - "voiceURL is /res/models/voices (per plan) rather than RESEARCH's /res/voices; 05-05 must vendor voices there"
metrics:
  duration: 6min
  completed: 2026-11-03
  tasks: 2
  files: 4
---

# Phase 5 Plan 04: HeadTTS Adapter and Avatar Behaviour Summary

HeadTTS adapter with truthful webgpu/wasm/none device detection, never-hanging synth (timeout + reconnect), and PCM audition with guaranteed wav restore; plus a pure avatar state map, per-state action plan and the AvatarBinding contract for wave 2.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | HeadTTS adapter | f77bca1 (RED), d83326d (GREEN) |
| 2 | Avatar behaviour map + AvatarBinding | a175e37 (RED), 0743bf0 (GREEN) |

## Verification

- `npx vitest run --project renderer src/renderer/src/speech src/renderer/src/avatar`: 45 passed
- `tsc --noEmit -p tsconfig.web.json`: clean
- eslint clean on owned files; `vite-ignore` and `dtypeWasm` present; no static `@met4citizen/*` / `@huggingface/*` imports

## Deviations from Plan

**1. [Rule 3 - Blocking] Vite resolved the literal dynamic import even with @vite-ignore**
- **Found during:** Task 1 GREEN
- **Fix:** Moved the URL into a `const url` and `import(/* @vite-ignore */ url)`
- **Files modified:** src/renderer/src/speech/headtts.ts
- **Commit:** d83326d

Extra tests beyond the plan: loader rejection gives device 'none'; a 300 KB buffer round-trips base64 (chunked fromCharCode).

## Notes for 05-05

- PCM shape confirmed from spike source: with `audioEncoding:'pcm'` HeadTTS skips `decodeAudioData`, so `data.audio` is the raw Int16 LE ArrayBuffer.
- `loadHeadTts` is untested by design (exercised by the T2 E2E).

## Known Stubs

None.

## Self-Check: PASSED
