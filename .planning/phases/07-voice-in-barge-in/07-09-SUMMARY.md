---
phase: 07-voice-in-barge-in
plan: 09
subsystem: renderer
tags: [voice-in, barge-in, push-to-talk, stt, renderer]
requires: ["07-03", "07-06"]
provides: [renderer capture wiring, barge-in click path, speak:started reporting, STT banner]
affects: [07-10]
tech-stack:
  added: []
  patterns: [whisper-gated wiring (T1 untouched), cut-turn id set for late-sentence drop, stopRef for onCap]
key-files:
  created:
    - src/renderer/src/speech/speechQueue.started.test.ts
    - src/renderer/src/screens/Session.voice.test.tsx
    - src/renderer/src/App.voice.test.tsx
  modified:
    - src/renderer/src/speech/speechQueue.ts
    - src/renderer/src/speech/voice.ts
    - src/renderer/src/screens/Session.tsx
    - src/renderer/src/screens/Session.module.css
    - src/renderer/src/App.tsx
    - src/preload/index.d.ts
decisions:
  - "Barge-in is the Talk button pressed while speaking, only when a mic exists and phase is warmup/presentation/grilling; stopSpeech runs synchronously before the bargeIn intent"
  - "Late speak events for a barged-in turn are dropped renderer-side via a cut-turn id set in App"
  - "Brevity band shown as timer text colour only (accent/warning/danger tokens); short/brief default"
metrics:
  duration: ~15min
  completed: 2026-11-03
  tasks: 3
  files: 9
---

# Phase 7 Plan 09: Renderer voice-in + barge-in wiring Summary

Whisper-gated push-to-talk capture, synchronous barge-in with cut-turn filtering, brevity-band timer, "Transcribing…" status, real mute, speak:started reporting and an STT health banner — fake STT (T1) path unchanged.

## Tasks

| # | Task | RED | GREEN |
|---|------|-----|-------|
| 1 | speechQueue onStarted + voice `started` option | e394b48 | 2f66111 |
| 2 | Session capture, barge-in, band, transcribing, mute | daa78d0 | 1a70a8f |
| 3 | App mic/started/STT banner/cut-turn filter + `__mic` d.ts | 089ab60 | 671462e |

## Verification

- `npx vitest run src/renderer`: 22 files, 249 tests green (existing suites untouched).
- `npm run typecheck:web`: green.
- Full `npx vitest run` / `npm run typecheck` (both projects) not run here, since parallel plans 07-07/07-08 were editing main files at the same time. The verifier runs them.

## Deviations from Plan

None. One small addition: 089ab60 also contains a prettier-only reformat of Session.voice.test.tsx.

## Known Stubs

None.

## Self-Check: PASSED
