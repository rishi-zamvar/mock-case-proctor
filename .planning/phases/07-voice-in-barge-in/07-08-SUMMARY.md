---
phase: 07-voice-in-barge-in
plan: 08
subsystem: main-wiring
tags: [stt, whisper, ipc, preload, utilityProcess]
requires: ["07-04", "07-06"]
provides: [stt-config, whisper-composition, stt-ipc-channels, preload-stt-api]
affects: ["07-09", "07-10"]
tech-stack:
  added: []
  patterns: [utilityProcess fork injected into compose as forkStt, filteredStt wraps only the real adapter]
key-files:
  created: []
  modified: [src/main/compose.ts, src/main/compose.test.ts, src/main/ipc.ts, src/main/ipc.test.ts, src/main/index.ts, src/preload/index.ts]
decisions:
  - "STT defaults to whisper outside E2E and to fake under E2E; STT/STT_MODEL are validated in readConfig"
  - "A missing fork logs 'stt worker unavailable' and a missing model logs 'whisper model missing; run npm run fetch:voice' (no paths); both report status 'failed'"
  - "stt:status is registered with the runner channels and resolves 'off' when no sttStatus dep is given"
  - "stt.chunk calls ipcRenderer.invoke directly so the E2E tap never holds audio"
metrics:
  duration: ~5 min
  completed: 2026-11-03
  tasks: 2
  files: 6
---

# Phase 7 Plan 08: Main STT Wiring Summary

Main now builds real whisper STT from config: it forks the `sttWorker.js` utilityProcess, pre-warms it at compose time, and wraps it in `filteredStt`. The STT IPC channels (chunk, started, status) are validated, and the preload exposes the STT API. E2E keeps FakeStt and `e2e:say` unless `STT` is set explicitly.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | compose config, whisper composition, IPC channels (TDD) | 1b71ada (RED), b1c0d2a (GREEN) |
| 2 | index.ts worker fork and model path; preload API | 99030cd |

## Verification

- `npx vitest run --project main src/main`: 864 passed, 9 skipped
- `npm run typecheck` (node and web): clean
- `grep app.asar.unpacked src/main/index.ts` and `grep "'--stt=whisper'" src/preload/index.ts`: both match
- `inject` appears in compose.ts only on the FakeStt branch
- No build or E2E was run here; 07-10 covers both.

## Deviations from Plan

**1. [Rule 1 - Test fix] Pre-warm init is async.** `createWhisperStt.warm()` queues behind a promise, so the `init` message is posted a microtask after compose returns. The test now uses `vi.waitFor` on `sent[0]` and also checks `forkStt` was called exactly once. No production change.

**2. [Rule 2] Two log messages for the whisper failure case.** A missing fork logs `stt worker unavailable`, and a missing model logs the plan's `whisper model missing; run npm run fetch:voice`. Neither includes a path.

**3. stt:status registration.** Registered inside `if (runner)`, so the key-only `setup()` still exposes exactly the three key channels, as its existing test asserts.

## Notes

- `compose > given TTS=headtts, when the T-10 warning fires` failed once while the parallel executors were loading the machine. It passes on its own and in every full-file rerun, so it is timing-sensitive but was already present before this plan.

## Known Stubs

None.

## Self-Check: PASSED
