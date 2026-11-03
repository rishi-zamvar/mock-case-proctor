---
phase: 07-voice-in-barge-in
plan: 10
subsystem: voice-loop-e2e
tags: [e2e, t2, phase-gate, latency, barge-in, packaging, whisper]
requires: [07-01, 07-02, 07-03, 07-04, 07-05, 07-06, 07-07, 07-08, 07-09]
provides: [voiceloop.t2 spec, VOICE_FIXTURES, packaged whisper smoke, turbo-only packaging, Phase 7 sign-off]
affects: [Session.tsx barge-in order, compose clock seam]
tech-stack:
  added: []
  patterns: [WAV injection via window.__mic per answer, MutationObserver for brief UI states, manual clock injected into compose]
key-files:
  created:
    - tests/e2e/voiceFixtures.ts
    - tests/e2e/voiceloop.t2.spec.ts
  modified:
    - tests/e2e/global-setup.ts
    - tests/e2e/packaged.spec.ts
    - tests/e2e/shell.spec.ts
    - electron-builder.json
    - scripts/verify-package.sh
    - src/renderer/src/screens/Session.tsx
    - src/renderer/src/screens/Session.voice.test.tsx
    - src/main/session/runner.bargein.test.ts
    - src/main/compose.ts
    - src/main/compose.test.ts
    - src/main/stt/whisperStt.ts
    - src/main/stt/whisperStt.test.ts
    - .planning/phases/07-voice-in-barge-in/07-VALIDATION.md
decisions:
  - "Barge-in sends the bargeIn intent BEFORE stopSpeech: the drop acks share the IPC pipe and must arrive after it, or main commits the cut turn as fully spoken"
  - "compose() takes an optional clock as a test seam; the T-10 test drives manualClock instead of a 10000x wall clock"
  - "Live real-world median 3.78 s (above the 3 s target) is reported, not gated; the interviewer model stays claude-opus-5-5 (Rishi's call)"
metrics:
  duration: ~115min
  completed: 2026-11-03
  tasks: 3
  files: 15
---

# Phase 7 Plan 10: Full voice-loop E2E, latency gate, packaging Summary

The real voice loop (whisper turbo on Metal in the utilityProcess, HeadTTS on WebGPU, replayed Claude, `say` WAVs injected as the mic) runs end to end in the built app. Its median stop→first-audio is **1.42 s**, and barge-in silences the avatar in **under 1 ms**. The run also caught a barge-in truthfulness bug, which is now fixed. The packaged `.app` ships only turbo and loads whisper on Metal.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1 Spec + fixtures + packaging config | eb440e6 | voiceloop.t2 (@t2 + @livevoice), VOICE_FIXTURES (+2 retry answers), packaged whisper test, base.en excluded, verify-package whisper checks |
| 2 Regression + T2 voice loop (fix until green) | ff5b44c, 204b373, d69114c | Barge-in order fix, deterministic T-10 clock, lint, api allowlist |
| 3 Package, live latency, VALIDATION | d35c43a | VALIDATION signed off; release/ removed |

## Gate results

- `npx vitest run`: 1220 passed, 10 skipped. It was green 4× in a row after the clock fix.
- `npm run typecheck` and `npm run lint`: clean.
- `electron-vite build`: `out/main/sttWorker.js` and `out/renderer/pcm-capture.worklet.js` are both present. The `rolldownOptions` key from 07-04 works.
- T1 (`npm run test:e2e`): **39/39, 3× consecutive green**.
- All T2 (`--grep @t2`, which covers voice.t2, interviewer.t2 and voiceloop.t2): **6/6, green 2×**.
- `npm run test:packaged`: "package OK" plus **3/3 @packaged**, including 'packaged app loads whisper on Metal' (11.8 s, covering the first Metal load).

## T2 voice loop numbers (replayed Claude, real clock)

| Turn | stop→first-audio (ms) run 1 / run 2 / run 3 | STT (transcriptAt−stopAt) |
|------|------|------|
| grill 0 | 1502 / 1470 / 1496 | 937 / 917 / 936 |
| grill 1 | 1341 / 1307 / 1306 | 897 / 890 / 891 |
| grill 2 | 1397 / 1420 / 1417 | 917 / 915 / 923 |
| grill 3 (interrupted) | 1564 / 1583 / 1567 | 945 / 965 / 954 |
| grill 4 | 1145 / 1157 / 1172 | 831 / 842 / 854 |
| **median** | **1397 / 1420 / 1417** (gate ≤ 3000) | about 0.9 s |

- Stage breakdown, typical: STT about 0.9 s on 9–13 s answers. Request comes 15–50 ms after the transcript. With replay, the first delta is +6 ms and the first sentence +7 ms. TTS synth and first audio take about 0.4–0.5 s.
- **Barge-in: 0.7 / 0.9 / 0.5 ms** (gate ≤ 200 ms, target < 50 ms). The interrupted line holds only fully spoken sentences. The next grill request passes `checkConversation` with `[]`, its second-to-last message is the assistant line ending `[interrupted]`, and its last message is the user turn.
- Transcripts are accurate: the opening yields a 40% mention, and the finance answer parses $540M, 87% and 48% ("I'd pass at 540 million. Gross retention is 87%…").
- Silent answer: no transcript line is added, and "Didn't catch that — go ahead." is spoken.
- Privacy: app stdio does not contain transcript text, and there are no CSP or jsdelivr console errors.

## Turbo q5_0 (SLOW=1, re-confirmed)

10 s → 864 ms, 30 s → 1801 ms, 60 s → 2818 ms, 120 s → 5658 ms. These were measured while the T1 E2E run was loading the machine, so they are slight upper bounds.

## Live real-world total (@livevoice, real Claude claude-opus-5-5, one run)

| Turn | stop→first-audio | STT | request after transcript | TTFT (firstDelta−request) |
|------|------|------|------|------|
| grill 0 (after opening) | 5720 ms | 915 | +3044 (extraction call runs first) | 886 |
| grill 1 | 3775 ms | 928 | +17 | 2257 |
| grill 2 | 3329 ms | 942 | +21 | 1827 |
| **median** | **3775 ms** | | | |

**Phase 6 TTFT comparison and recommendation.** Phase 6 measured a pooled median TTFT of 1.74 s (p90 4.8 s; run medians 1.1–3.4 s; the plan's ~2.7 s reference falls inside that range). Today's grill TTFT was 1.8–2.3 s. The real-world total is roughly STT 0.9 s + TTFT 1.8–2.3 s + TTS first audio 0.4–0.6 s ≈ 3.3–3.8 s, so **the ≤3 s target is missed live by about 0.3–0.8 s at the median, and it is entirely the Claude TTFT that tips it over**. The pipeline the app controls (STT + TTS) is about 1.4 s. The first turn after the opening also pays for the opening-plan extraction call (+3 s).

The Phase 6 options still apply and remain Rishi's call; nothing was changed:
1. Keep Opus and accept a live median of about 3.5–3.8 s.
2. Try `INTERVIEWER_MODEL=claude-haiku-5-5`, which likely brings the total under 3 s. Persona quality is untested.
3. Shrink the cached prefix (about 36K → about 20K tokens) to cut prefill TTFT without switching models.
4. (New) Start the first grill turn concurrently with the extraction call, or skip the wait on it, to remove the +3 s on the first turn after the opening.

## Packaging

- Disk: 7.1 GiB free at start → 7.8 GiB after `rm -rf release/` (703 MB old release) → 6.5 GiB with the new package → **7.8 GiB at the end** (release/ removed again).
- `.app` size: **1.2 GB** (`du -sh release/mac-arm64`). The turbo model accounts for 574 MB of it. base.en is absent.
- verify-package checks that whisper.node is unpacked, that the turbo model is unpacked at 574041195 bytes, that base.en is absent, and that `out/main/sttWorker.js` is in the asar. The checks were captured into variables to avoid SIGPIPE.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Barge-in was ignored by main, and the cut turn was stored as fully spoken**
- **Found during:** Task 2 (first voiceloop run: no `interrupted` timing, and the full interviewer line was stored)
- **Issue:** `Session.toggleTalk` called `stopSpeech()` before `onIntent({type:'bargeIn'})`. stopSpeech acks every unplayed sentence `spoken:false` over the same IPC pipe, so main received the acks first, resolved the turn's waits, committed `written` (all sentences) as a normal turn and cleared `live`. When the barge-in arrived after that, it was a no-op. As a result the transcript and Claude's history claimed sentences the candidate never heard. Unit tests had locked in the wrong order.
- **Fix:** Send `bargeIn` first, then `stopSpeech()`. Both run synchronously in one click, so the avatar still goes quiet immediately (0.5–0.9 ms measured). The renderer test now asserts `['intent:bargeIn', 'stopSpeech', 'start']`, and a new main test covers the real IPC order (bargeIn followed by trailing `spoken:false` acks).
- **Files:** src/renderer/src/screens/Session.tsx, Session.voice.test.tsx, src/main/session/runner.bargein.test.ts
- **Commit:** ff5b44c

**2. [Rule 1 - Flaky test root cause] compose T-10 headtts test**
- **Issue:** It used a 10000× wall clock, so 270 ms of real time had to elapse inside a 3 s wait. That starved under parallel-suite CPU load.
- **Fix:** `compose()` now accepts an optional `clock` (a plain-argument seam). The test drives the existing `manualClock` past T-10 and then past the deadline. It is deterministic, and the assertions are unchanged (exactly one warning line for headtts, none for fake).
- **Commit:** 204b373

**3. [Rule 3 - Blocking] lint gate**
- 07-04 left one `explicit-function-return-type` error (whisperStt.test.ts `setup`) and two prettier warnings (whisperStt.ts). Fixed in 204b373.

**4. [Rule 1 - Stale assertion] shell.spec renderer api allowlist**
- 07-08 added `window.api.stt` and `config.stt`, but the T1 allowlist test was never updated (T1 failed 3/3 on that test alone). The allowlist now pins `stt` to exactly `{chunk, status}` and config to `{tts, stt}`. Commit d69114c.

**5. [Plan detail] Barge-in retry answers.** The plan says to "answer the next SCRIPT line" when retrying a single-sentence reply. Since answers are WAVs, I added `tooling` and `gaps` (interviewer.t2 SCRIPT[2], [4]) to VOICE_FIXTURES. They weren't needed in any run, because the reply to `diligence` was multi-sentence every time.

### Observed once, not reproduced
- `runner.resume.test.ts` "crash mid-grilling … flow continues" hit the default 5 s timeout once, during a `src/main`-only run made while the old scaled-clock compose test was still in place. It takes 590 ms alone, and it passed in 4 consecutive full-suite runs after the clock fix. No change made.

## Notes
- interviewer.t2.spec.ts and claudeLlm.live.test.ts are untouched.
- A parallel Phase 8 executor committed (08-02) between my commits. No files overlap.

## Known Stubs
None.

## Self-Check: PASSED
