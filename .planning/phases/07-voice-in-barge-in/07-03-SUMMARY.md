---
phase: 07-voice-in-barge-in
plan: 03
subsystem: renderer-mic-capture
tags: [audio, worklet, chunking, e2e-hook]
requires: []
provides: [createAccumulator, quietestCut, createMicCapture, brevityBand-shared, pcm-capture-worklet, window.__mic]
affects: [07-09, 07-10]
tech-stack:
  added: []
  patterns: [copy-only AudioWorklet in public/, flush handshake, deps-injected Web Audio fakes in jsdom]
key-files:
  created:
    - src/shared/brevity.ts
    - src/renderer/src/mic/accumulator.ts
    - src/renderer/src/mic/accumulator.test.ts
    - src/renderer/src/mic/capture.ts
    - src/renderer/src/mic/capture.test.ts
    - src/renderer/public/pcm-capture.worklet.js
  modified:
    - src/main/domain/metrics.ts
decisions:
  - "Accumulator aligns the quietest-frame search start to the absolute 20 ms grid, so cuts are frame-aligned from recording start"
  - "Injected E2E WAV replaces the mic for one recording; getUserMedia is not opened for that recording"
metrics:
  duration: 4min
  completed: 2026-11-03
  tasks: 2
  files: 7
---

# Phase 7 Plan 03: Renderer Mic Capture Summary

The renderer side of push-to-talk capture. A pure accumulator cuts about 20 s chunks at the quietest 20 ms frame in their last 2 s, stops at a 5-minute cap and flushes the tail on stop. A copy-only `pcm-capture` worklet has a flush handshake, and `createMicCapture` handles the context, the stream, mute and the `window.__mic` WAV injection used only under E2E. `brevityBand` moved to `src/shared`.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | c3dcae5 | test(07-03): add failing accumulator tests |
| 1 GREEN | 29137a4 | feat(07-03): move brevityBand to shared + pure PCM accumulator |
| 2 RED | e301a9d | test(07-03): add failing mic capture tests |
| 2 GREEN | 54b3c6b | feat(07-03): pcm-capture worklet + createMicCapture glue + __mic E2E hook |

## Verification

- `npx vitest run src/renderer/src/mic src/main/domain`: 17 files and 347 tests pass. The metrics and view tests are unchanged and still green.
- `eslint` and `tsc -p tsconfig.web.json` are clean on the plan's files.
- No `subarray` in accumulator.ts. Every emitted chunk is a `slice()` copy, and a test asserts `buffer.byteLength === length * 4`.
- Real audio has not been tested yet: the 16 kHz resample, `decodeAudioData`, and the injected WAV reaching whisper. Those are proven by the 07-10 T2 E2E. In this plan, Web Audio is faked in jsdom.

## Deviations from Plan

- **[Rule 1 - Bug] The search window is aligned to the absolute frame grid.** If the window started at `len - searchMs*16` without alignment, a silent frame at 19.5 s could straddle two candidate frames, so the cut would miss it. `from` is now floored to a multiple of FRAME. `quietestCut` itself keeps its contract: it stays aligned relative to `from`. This fix is in commit 29137a4.
- **[Rule 3 - Lint] ESLint inline directives were added.** The worklet got a `/* global */` comment and a return-type disable on `process`. One test helper got a return-type disable. These were needed so the plan's eslint check passes.

## Known Stubs

None. The wiring into Session/App is 07-09's scope.

## Self-Check: PASSED
