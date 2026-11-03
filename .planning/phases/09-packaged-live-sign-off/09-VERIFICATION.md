---
phase: 09-packaged-live-sign-off
verified: 2026-11-03T00:00:00Z
status: human_needed
score: 3/3 must-haves verified (criterion 3 has one human-only part)
human_verification:
  - test: "TCC re-prompt in the packaged app"
    expected: "After `tccutil reset Microphone` and `tccutil reset Camera` for com.rishizamvar.mockcaseproctor, opening the .app from Finder shows Microphone and Camera prompts. After granting both, the webcam tile shows the user and the mic meter moves."
    why_human: "Resets system privacy grants and needs real OS prompts. Not automated, and tccutil was never run."
---

# Phase 9: Packaged Live Sign-off Verification Report

**Phase Goal:** The signed `.app` delivers a full, real proctored session on Rishi's Mac against the live Claude API, with no hidden failures that only appear in the packaged app.
**Status:** human_needed
**Re-verification:** No
**Method:** Evidence review only, as instructed. Nothing was built, packaged or run. I read 09-02-SUMMARY, 09-03-SUMMARY, LATENCY.md, t3-results.json, `tests/e2e/signoff.t3.spec.ts` and `docs/SIGNOFF.md`.

## Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | T3 `@live` run on the packaged ad-hoc-signed arm64 `.app` completes a full session from library to review mode, with Whisper on Metal, HeadTTS on WebGPU, native files unpacked from asar | VERIFIED | `signoff.t3.spec.ts` (272 lines) asserts: review-mode screen visible, persisted scorecard total 6-30, evidence verified >= 1, flag rows >= 1, barge-in logged, whisper.node open from `app.asar.unpacked`, and a stt-worker process. t3-results.json records `sttStatus: metal`, `ttsDevice: webgpu`, and score totals for case_99 (10/30, evidence 12/12) and case 02 (8/30, 9/9). 09-02-SUMMARY: @t3 3/3 and @packaged 3/3 green. |
| 2 | Live evals pass: no answer-key leaks, pushback on wrong GRR, sections within cap | VERIFIED | 09-02-SUMMARY: the grr, section, pushback, style, cache and ttft evals passed first run. Injection passed on one re-run after a single model-variance miss (0 leaks, a deflection reply with no `?`). Reviewer eval passed. The @t3 tap asserts no interviewer material reached the renderer. |
| 3 | Latency report vs 3 s produced; offline apart from Claude; permissions re-prompt after tccutil reset; memory bounded over 3 sessions | VERIFIED for report, offline and memory. TCC is human_needed. | LATENCY.md exists with per-stage and per-case tables. Pooled median is 4.98 s (p90 8.61 s, n=12) and the 3 s target is MISSED and documented. Offline: the spec asserts no remote http(s)/ws(s) from the renderer and the host set equals `['api.anthropic.com']`, and the run passed. Memory: the soak spec asserts renderer and main ratios < 1.25 and 1 avatar instance. Measured main 0.98, renderer 0.62, GPU 0.82. TCC: only the automatable part is proven (`media.test.ts`, `verify-package.sh` entitlement and usage-string checks). The real prompt is left to Rishi. |

**Score:** 3/3 criteria satisfied as written. The criterion 3 TCC check is the only human-only part.

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `tests/e2e/signoff.t3.spec.ts` | VERIFIED | Substantive: real assertions as listed above. Tagged @t3. The soak harness budget was raised to 600 steps with no assertion loosened. |
| `.planning/phases/09-packaged-live-sign-off/t3-results.json` | VERIFIED | Numbers and enums only, with per-stage latency and totals. The summary reports a clean secret/PII grep. |
| `.planning/phases/09-packaged-live-sign-off/LATENCY.md` | VERIFIED | Report produced, with the miss and options documented. |
| `docs/SIGNOFF.md` | VERIFIED | Maps 52 requirements to tests and results, includes the checklist and a "Needs Rishi" list (TCC, voice choice, model/latency). QA-04 is marked pass (live). |

## Behavioral Spot-Checks

SKIPPED (instructed not to build, package or run). Reliance is on the recorded results.

## Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| QA-04 | 09-01, 09-02, 09-03 | SATISFIED, with the TCC re-prompt pending a human | @t3 3/3 live packaged, live evals green, final gate green (lint, typecheck, 1407 unit tests, T1 41/41). |

No orphaned requirements.

## Anti-Patterns / Notes

| Item | Severity | Impact |
|------|----------|--------|
| VOUT-04: 3 s stop-to-first-audio target missed live (4.98 s median). Claude TTFT of 3.2 s is the main cause. | Warning, non-blocking | Documented in LATENCY.md and SIGNOFF.md. Routed to Rishi as a model/latency decision. The Haiku trial was not faster and leaked 1 n-gram, so Opus is kept. |
| Injection live eval needed one re-run (model variance) | Info | No code change, 0 leaks. |
| Echo on laptop speakers and a minimised-window timer were not measured | Info | Disclosed in SIGNOFF.md. Both are mitigated by design. |

## Human Verification Required

### 1. TCC re-prompt in the packaged app

**Test:** Run `tccutil reset Microphone com.rishizamvar.mockcaseproctor` and `tccutil reset Camera com.rishizamvar.mockcaseproctor`. Open `Mock Case Proctor.app` from Finder.
**Expected:** Microphone and Camera prompts appear. After granting both and starting a case, the webcam tile shows the user and the mic-check meter moves.
**Why human:** It alters system privacy state and needs real OS prompts.

## Gaps Summary

No blocking gaps. The phase goal is evidenced as achieved. Two items remain for Rishi: the TCC prompt check, and the call on the 3 s latency miss, which is a non-blocking report item.

---

_Verified: 2026-11-03_
_Verifier: Claude (gsd-verifier)_
