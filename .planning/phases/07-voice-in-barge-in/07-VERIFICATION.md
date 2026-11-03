---
phase: 07-voice-in-barge-in
verified: 2026-11-03T12:15:00Z
status: passed
score: 5/5 must-haves verified
gaps: []
non_blocking:
  - "Live real-world median stop->first-audio 3775 ms (target 3 s), driven by Claude Opus TTFT"
---

# Phase 7: Voice In & Barge-In Verification Report

**Phase Goal:** The core loop works by voice. Rishi presses Talk, speaks, presses stop, sees his words, and hears the partner reply within about 3 s. He can cut the partner off at any time.
**Verified at commit:** 2ce2798 (read via `git show`; no build or E2E run)
**Status:** passed
**Re-verification:** No

Evidence: code inspection at 2ce2798, 07-10-SUMMARY gate numbers, and a spot run of `npx vitest run --project main src/main/stt src/main/session` (16 files, 174 passed, 1 skipped).

## Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Talk/Space toggles recording with timer; local whisper turbo on Metal, glossary-seeded; text shown | VERIFIED | `Session.tsx` handles Space and toggleTalk. `whisperStt.ts` derives status `metal` or `cpu` from `gpus.length`, and engine/worker pass a `prompt` (glossary) to whisper. `whisper.int.test.ts` includes a "runs on Metal" test. T2 voiceloop shows the transcript lines on screen. |
| 2 | Finance WAV transcribes key numbers; silence gives "no answer"; hallucinations/repeats filtered | VERIFIED | `gate.ts` voiced-frame RMS gate runs before whisper. `clean.ts` handles hallucination phrases and 1..8-gram repeat collapse (3+). `whisper.int.test.ts` checks 540 million / 87% / 48%. T2 shows a silent answer producing "Didn't catch that" and no transcript line. |
| 3 | Sentence streaming; per-stage timestamps logged; median stop->first word <= 3 s over a T2 session | VERIFIED | `runner.ts` stamps stopAt, transcriptAt, firstDeltaAt and firstAudioAt, then logs the totals. T2 replayed medians are 1397 / 1420 / 1417 ms across 3 runs, against the 3000 ms gate. |
| 4 | Barge-in < 50 ms, cancels stream, history holds only spoken sentences, alternating | VERIFIED | `Session.tsx` sends `bargeIn` before `stopSpeech` (a real ordering bug found and fixed in 07-10). `runner.ts` `bargeIn` case sets `interrupted: true` and calls `llm.interrupted(said)`. T2 measures 0.7 / 0.9 / 0.5 ms. The next request passes `checkConversation`, and the assistant line ends `[interrupted]`. `runner.bargein.test.ts` covers the real IPC order. |
| 5 | T2 E2E full voice loop (real STT/TTS, replayed Claude, WAV mic) | VERIFIED | `tests/e2e/voiceloop.t2.spec.ts` and `voiceFixtures.ts` exist. 07-10 reports all T2 at 6/6 green twice, T1 at 39/39 three times, and packaged at 3/3 including whisper on Metal. |

**Score:** 5/5

## Requirements Coverage

All seven IDs are marked Phase 7 / Complete in REQUIREMENTS.md, and none are orphaned. VIN-05 belongs to Phase 4.

| ID | Status | Evidence |
|----|--------|----------|
| VIN-01 | SATISFIED | Talk button and Space toggle, with timer (SC1) |
| VIN-02 | SATISFIED | whisper turbo on Metal, glossary prompt (SC1) |
| VIN-03 | SATISFIED | Transcript displayed after transcription (SC1, T2) |
| VIN-04 | SATISFIED | gate.ts + clean.ts + filtered.ts, unit-tested (SC2) |
| VOUT-04 | SATISFIED | Per-stage stamps; replayed median about 1.4 s (SC3) |
| VOUT-05 | SATISFIED | Barge-in under 1 ms, truthful history (SC4) |
| QA-03 | SATISFIED | voiceloop.t2 spec with real STT/TTS and WAV mic (SC5) |

## Anti-Patterns

None blocking. Test output shows a whisper-addon "Falling back to CPU" message, which is expected in the unit environment. The packaged app test confirms Metal.

## Documented Non-Blocking Item: live latency miss

The roadmap criterion is judged "over a T2 session" with replayed Claude, and that passes at about 1.4 s. In one real-Claude `@livevoice` run (claude-opus-5-5), the median was 3775 ms (turns: 5720, 3775, 3329 ms), which is about 0.8 s over the 3 s goal.

- The app-controlled pipeline (STT about 0.9 s plus TTS about 0.5 s) is about 1.4 s.
- Claude TTFT of 1.8 to 2.3 s accounts for the rest.
- The first turn after the opening adds about 3 s for the extraction call.

**Recommendation for Rishi (his decision; nothing was changed):**
1. Try `INTERVIEWER_MODEL=claude-haiku-5-5`. It is the most likely way to get under 3 s live, but persona quality is untested. Try this first.
2. Shrink the cached prefix (about 36K to about 20K tokens) to cut prefill TTFT without changing models.
3. Run the first grill turn concurrently with the extraction call, which removes the extra 3 s on that turn.
4. Otherwise keep Opus and accept a live median of about 3.5 to 3.8 s.

This is a single live sample, so it is an indicator and not a statistically solid measurement.

## Human Verification

None required for goal sign-off. Optional: do a real-mic session, to judge the feel of the latency and Space-key behaviour on the actual hardware.

---

_Verified: 2026-11-03_
_Verifier: Claude (gsd-verifier)_
