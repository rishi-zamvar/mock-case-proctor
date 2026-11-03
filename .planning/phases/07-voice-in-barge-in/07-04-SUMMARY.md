---
phase: 07-voice-in-barge-in
plan: 04
subsystem: stt
tags: [whisper, utilityProcess, metal, crash-isolation]
requires: [07-01 engine.ts loadEngine, 07-02 SttPort]
provides: [createWhisperStt, SttCrashed, MODEL_FILES, ChildLike, ToWorker/FromWorker, sttWorker build entry]
affects: [07-08 compose wiring, 07-10 build check]
tech-stack:
  added: []
  patterns: [promise-chain enqueue, lazy fork + respawn on exit, stale-child guard]
key-files:
  created: [src/main/stt/protocol.ts, src/main/stt/whisperStt.ts, src/main/stt/whisperStt.test.ts, src/main/stt/worker.ts]
  modified: [electron.vite.config.ts]
decisions:
  - "electron-vite 6 reads build.rolldownOptions.input (verified in its source), so the second main entry uses rolldownOptions"
  - "init_failed is sticky: status stays 'failed' and the child is killed. Exit or timeout resets, so the next call respawns"
metrics:
  duration: 5min
  completed: 2026-11-03
---

# Phase 7 Plan 04: Whisper worker adapter Summary

`createWhisperStt` is the production SttPort. It drives a crash-isolated whisper worker: lazy fork, init, then serialised transcribe requests, each with a 60 s timeout. A timeout kills the child. A worker exit rejects the in-flight request with SttCrashed, and the next call respawns the worker. `status()` reports metal, cpu or failed from the worker's GPU list. `warm()` transcribes 1 s of zeros once. The adapter is proven against a fake child (11 tests). The worker entry and the `sttWorker` build input are also in place.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1 RED | 8b07101 | protocol.ts + 11 failing tests |
| 1 GREEN | 3acd2d0 | whisperStt.ts, all 11 pass. No electron or whisper-cpp-node import |
| 2 | b6c8d07 | worker.ts over loadEngine, plus the `sttWorker` input in electron.vite.config.ts |

## Verification

- `npx vitest run --project main src/main/stt`: 54 passed, 1 skipped (the slow integration test).
- `npm run typecheck:node`: green.
- **The build-output check is deferred to 07-10.** No `electron-vite build` was run, because parallel executors share `out/`. 07-10 must assert that `out/main/sttWorker.js` exists.

## Deviations from Plan

None. The plan expected that Rolldown might ignore `rollupOptions`, and it allowed the `rolldownOptions` key. I chose that key directly after reading electron-vite 6's source, which reads `build.rolldownOptions.input`.

## Known Stubs

None.

## Self-Check: PASSED
