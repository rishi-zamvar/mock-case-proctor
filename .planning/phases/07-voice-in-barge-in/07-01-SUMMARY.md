---
phase: 07-voice-in-barge-in
plan: 01
subsystem: stt
tags: [whisper, metal, stt, models]
requires: []
provides: [loadEngine, whisper models on disk]
affects: [07-04 stt worker]
tech-stack:
  added: [whisper-cpp-node@0.2.12]
  patterns: [createRequire for CJS-only native addon]
key-files:
  created: [src/main/stt/engine.ts, src/main/stt/whisper.int.test.ts]
  modified: [package.json, package-lock.json, scripts/fetch-voice-assets.sh]
decisions:
  - "whisper-cpp-node loaded via createRequire: its 0.2.12 'import' export points at an unpublished dist/index.mjs"
  - "Whisper models fetched by STT_MODELS (turbo base) with WHISPER_CACHE move, sha256 check and 1 GiB disk guard"
metrics:
  duration: 4min
  completed: 2026-11-03
---

# Phase 7 Plan 01: Whisper engine + models Summary

whisper-cpp-node 0.2.12 on Metal behind a 20-line `loadEngine(model)`. Both ggml models were moved from the spike cache (sha-verified, no download), and a real-whisper Vitest proves base.en gets 540 million / 87% / 48% out of a `say` finance fixture.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1 Install binding + fetch script | 1826b59 | `whisper-cpp-node` exact in `dependencies`; whisper section with `need_space`, `sha_ok`, `whisper_model`, `WHISPER_CACHE`, `STT_MODELS` |
| 2 RED test | e426776 | `src/main/stt/whisper.int.test.ts` |
| 2 GREEN engine | f2fa4e8 | `src/main/stt/engine.ts` |

## Results

- Models: `resources/assets/models/whisper/ggml-large-v3-turbo-q5_0.bin` (sha 394221…a7e2) and `ggml-base.en.bin` (sha a03779…d002). Both printed `moved` on the first run and `skip` on the second. Git doesn't track them (`models/` is gitignored).
- Disk guard checked by hand: `need_space 999999999999999` prints `not enough disk for big.bin: need … MB free, have 8392 MB` and exits 1.
- Disk: 6.7 GiB free before, 8.2 GiB after deleting the 1.6 GB scratch f16 model (`df -h .`). The scratch `models/` dir is removed; bench.js and eapp/ are kept.
- base.en suite: 3 tests pass in about 5 s (the Metal `MTL*` GPU check, the finance numbers with a second transcribe on the same context, and the missing-model throw).
- Turbo q5_0 latency (SLOW=1, Metal, warm context):

| Audio | Latency |
|-------|---------|
| 10 s  | 889 ms  |
| 30 s  | 1768 ms |
| 60 s  | 2806 ms |
| 120 s | 5472 ms |

These are in line with RESEARCH (0.85 / 1.8 / 2.9 / 5.2 s). The turbo finance numbers match too.

## Deviations from Plan

**1. [Rule 3 - Blocking] whisper-cpp-node ESM entry is broken**
- **Found during:** Task 2
- **Issue:** In 0.2.12, `exports["."].import` points at `./dist/index.mjs`, but that file isn't in the published package. Vite/Vitest fails with "Failed to resolve entry", and Node ESM would fail the same way.
- **Fix:** `engine.ts` loads it with `createRequire(import.meta.url)('whisper-cpp-node')`, typed as `typeof import('whisper-cpp-node')`.
- **Files modified:** src/main/stt/engine.ts
- **Commit:** f2fa4e8

## Notes

- When the model path is missing, the addon prints `[whisper-addon] Falling back to CPU...` before it throws. The message comes only from the missing-model test, not from the real loads.
- Lint errors in `src/main/stt/answers*.ts`, `filtered.test.ts` and `gate.test.ts` belong to the parallel plan 07-02 and are out of scope.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/main/stt/engine.ts, src/main/stt/whisper.int.test.ts, both model files
- FOUND commits: 1826b59, e426776, f2fa4e8
