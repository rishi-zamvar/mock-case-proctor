---
phase: 09-packaged-live-sign-off
plan: 02
subsystem: testing
tags: [t3, packaged, live, latency, soak, qa-04]
requires:
  - phase: 09-packaged-live-sign-off
    provides: "@t3 spec, latencyStages, voiceDrive/tap helpers (09-01)"
provides:
  - packaged live sign-off evidence (t3-results.json)
  - LATENCY.md per-stage report vs 3 s
affects: [09-03]
tech-stack:
  added: []
  patterns: ["driveToReviewMode(page, steps) step budget for real-TTS callers"]
key-files:
  created:
    - .planning/phases/09-packaged-live-sign-off/t3-results.json
    - .planning/phases/09-packaged-live-sign-off/LATENCY.md
  modified:
    - tests/e2e/session.ts
    - tests/e2e/signoff.t3.spec.ts
key-decisions:
  - "Soak failure was a harness budget (40 steps vs ~8 s HeadTTS per fake reply), not an app defect; budget raised to 600 steps, no assertion changed"
  - "Injection live eval failed once (one deflection reply had no '?', 0 leaks) and passed on its single re-run: model variance, no code change"
  - "Latency target MISSED (pooled 4.98 s); reported with options, interviewer model unchanged (Rishi's call)"
metrics:
  duration: ~45min
  completed: 2026-11-03
  tasks: 2
  files: 4
---

# Phase 9 Plan 02: Packaged live gate + latency report Summary

The packaged, ad-hoc-signed arm64 `.app` passes verify-package, 3/3 @packaged and 3/3 @t3. It ran case_99 and case 02 live from the library to review mode, made remote requests only to api.anthropic.com, and stayed memory-stable over 3 sessions. Live evals are green. The measured stop→first-audio median is 4.98 s against the 3 s target, and LATENCY.md reports that as a miss.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Package + @t3 packaged live suite (fix until green) | 792082e |
| 2 | Live evals + LATENCY.md | abfd8c4 |

## Task 1: `npm run test:t3`

- **Disk:** 6.5 GiB free before the run (no old `release/` present), 6.5 GiB after `rm -rf release/`. `test ! -d release` holds.
- **Package:** verify-package printed "package OK". @packaged 3/3 passed: SDK, deck from asar, whisper on Metal.
- **case_99 (3.3 min):**
  - STT ran on Metal (`metal`) and TTS on WebGPU (`webgpu`), with `whisper.node` loaded from `app.asar.unpacked` (lsof).
  - Scorecard total 10/30, band "another", evidence 12/12 verified.
  - The GRR pushback was logged, and the barge-in took 1.4 ms.
  - The tap was clean, with no CSP or uncaught errors, and main contacted only `api.anthropic.com`.
- **case 02 PawsHub (3.5 min):** the same checks passed. Total 8/30, band "another", evidence 9/9 verified, barge-in 0.7 ms.
- **Memory soak:** the first run failed with a harness defect (below). On the re-run it passed (8.1 min), with exactly 1 avatar instance:

  | Process (workingSetSize, KB) | s1 | s2 | s3 | s3/s1 |
  |---|---|---|---|---|
  | main | 175152 | 179696 | 172208 | 0.98 |
  | renderer | 1227376 | 1251648 | 756976 | 0.62 |
  | GPU | 350576 | 359984 | 288672 | 0.82 |

  Memory showed no growth and the renderer shrank, so the 5-session extension was not needed.
- **Results hygiene:** `t3-results.json` holds only numbers and enums. `grep -iE "sk-ant|pawshub|fixturely|retention"` finds 0 matches.

## Task 2: live evals (`LIVE=1 vitest run` → `electron-vite build` → `playwright --grep @live`, which is the `test:live` sequence split so the TTFT JSON can be copied out in between)

- **Vitest:** 1416 passed and 1 failed (injection), with 3 skipped. The failure: both attacks got 0 leak-guard hits, but one deflection reply contained no `?`. On its single allowed re-run (`-t injection`) it **passed**. This is model variance, so no code changed and no assertion was loosened.
- **Interviewer evals:** grr, section, pushback, style, cache and ttft passed on the first run, and injection passed on the re-run.
  - TTFT: n=12, median **1902 ms**, p90 4437 ms.
  - Missing control: 0/14 turns.
- **Reviewer eval (`review.live.test.ts`):** passed, covering schema-valid cards, strong > average > weak, and a dropped-quote rate < 20%. Vitest did not print the per-card totals, and they were not re-fetched, to save live spend.
- **@live Playwright:** 1 passed (key auto-fill + live probe) and 1 skipped (@livevoice, which needs LIVE_VOICE=1).
- **LATENCY.md** has per-case and pooled tables plus the verdict:
  - Pooled total median **4983 ms**, p90 8607 ms, which **MISSED** the 3 s target.
  - Stage medians: STT 919 ms, TTFT 3195 ms, token→audio 671 ms.
  - The first turn after the opening (+extraction wait) runs about 8.6 s in both cases. Excluding it, the median is 4.25 s.
  - The file lists the four options, and none of them was applied.
- `git diff src/main/agent/claudeLlm.ts` is empty, so `DEFAULT_INTERVIEWER_MODEL` is still `claude-opus-5-5`.

## Deviations from Plan

**1. [Rule 1 - Harness bug] Soak exhausted the `driveToReviewMode` step budget**
- **Found during:** Task 1 (the soak failed after 41.6 s in session 1, after 4 answers).
- **Issue:** the soak runs fake LLM with real HeadTTS. Each reply is spoken for real (about 8 s per turn), so the 40-step loop (200 ms per idle step) ran out before review mode. barrier.spec uses fake TTS, which is instant, so the shared default had always been enough there.
- **Fix:** `driveToReviewMode(page, steps = 40)`, and the soak passes 600. The other callers are unchanged, and every soak assertion (<25% growth, 1 instance) is intact.
- **Files:** tests/e2e/session.ts, tests/e2e/signoff.t3.spec.ts
- **Commit:** 792082e

**2. [Plan detail] `test:live` run as its three steps** so that `test-results/live/interviewer-ttft.json` could be copied before Playwright clears `test-results/`. The commands are identical.

No app defects were exposed, so no RED/GREEN commits were needed.

## Known Stubs

None.

## Self-Check: PASSED
