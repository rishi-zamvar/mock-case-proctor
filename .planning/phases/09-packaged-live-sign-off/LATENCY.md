# Phase 9 latency report (packaged app, live Claude)

**Source:** `t3-results.json`, written by `npm run test:t3` on 2026-11-03. The run used the packaged arm64 `.app` with whisper turbo on Metal, HeadTTS on WebGPU, and live `claude-opus-5-5` (interviewer, `effort:'low'`) from this Mac. Times are in ms, from the session's stored timings via `latencyStages`. p90 is nearest-rank. n is small (5 and 7 turns), so treat p90 as indicative.

**Target:** 3 s from the end of Rishi's turn (Done pressed) to the avatar's first audible word.

## Verdict

**MISSED.** The pooled stop→first-audio median is **4.98 s** (p90 8.61 s) against the 3 s target. Only 1 of 12 turns came in under 3 s (2.94 s).

STT and TTS are not the problem: together they add about 1.6 s. Nearly all of the miss is Claude time-to-first-token.

## case_99 (fixture case)

| Stage | n | median | p90 |
|---|---|---|---|
| stop → transcript (stt) | 6 | 898 | 995 |
| transcript → first token (ttft) | 5 | 3757 | 6911 |
| first token → first audio (tokenToAudio) | 5 | 771 | 880 |
| **stop → first audio (total)** | 5 | **5459** | **8638** |

## case 02 (PawsHub, real library)

| Stage | n | median | p90 |
|---|---|---|---|
| stop → transcript (stt) | 8 | 942 | 1198 |
| transcript → first token (ttft) | 7 | 2574 | 6003 |
| first token → first audio (tokenToAudio) | 7 | 503 | 1406 |
| **stop → first audio (total)** | 7 | **3998** | **8607** |

## Pooled (both cases)

| Stage | n | median | p90 |
|---|---|---|---|
| stop → transcript (stt) | 14 | 919 | 995 |
| transcript → first token (ttft) | 12 | 3195 | 6114 |
| first token → first audio (tokenToAudio) | 12 | 671 | 927 |
| **stop → first audio (total)** | 12 | **4983** | **8607** |

The STT stage has more samples than the others because the barged-in turn and the final turn have a transcript but no measured reply audio.

**First turn after the opening.** It is the slowest turn in both cases: total 8.64 s and 8.61 s, TTFT 6.9 s and 6.0 s. That turn waits on the opening extraction call. With those two turns excluded, the pooled total median is **4.25 s** (n=10) and the TTFT median is 2.60 s, so the target is still missed.

## Barge-in

From pressing Talk while the avatar speaks to the avatar going silent: **1.4 ms** (case_99) and **0.7 ms** (case 02). Target met.

## Live eval TTFT (`claudeLlm.live.test.ts`, same day)

| Model | n (cached grill turns) | median | p90 | missing control |
|---|---|---|---|---|
| claude-opus-5-5 | 12 | 1902 | 4437 | 0/14 |

This eval measures the API call in isolation, with short scripted answers and no extraction wait. Its median sits under the 2.5 s TTFT line. In-app TTFT is higher (3.2 s pooled median) because real sessions carry longer transcripts, include the post-opening turn, and include the GRR pushback turns.

## Against earlier phases

| Measure | Phase 6 (live eval TTFT) | Phase 7 (live @livevoice, built app) | Phase 9 (packaged, live) |
|---|---|---|---|
| TTFT median | 1.74 s (pooled n=54) | 1.8-2.3 s | 3.19 s in app (n=12); 1.90 s in eval |
| TTFT p90 | 4.8 s | - | 6.1 s in app; 4.4 s in eval |
| stop → first audio median | - | 3.78 s | **4.98 s** |
| T2 replayed Claude (no network) | - | 1.42 s | - |

The local pipeline is unchanged. STT was about 0.9 s in both Phase 7 and Phase 9, and TTS was 0.4-0.8 s. The 1.42 s replayed figure shows what the app costs without Claude. The packaged build adds no measurable overhead over the built app. The difference from Phase 7 is Claude TTFT variance and longer in-session contexts.

## Options (none applied)

**The interviewer model is unchanged.** `DEFAULT_INTERVIEWER_MODEL` is still `claude-opus-5-5`. Which option to take is Rishi's call.

1. **Keep Opus and accept a live median of about 4-5 s.** Persona quality stays as it is.
2. **Try Haiku with `INTERVIEWER_MODEL=claude-haiku-5-5`.** This should bring the total under 3 s, but persona quality is untested. Measure it in one run, which also checks every structural eval: `INTERVIEWER_MODEL=claude-haiku-5-5 LIVE=1 npx vitest run --project main src/main/agent/claudeLlm.live.test.ts`
3. **Trim the cached prefix** from about 36K to about 20K tokens by dropping comps rows and duplicate deck facts. This cuts prefill TTFT without switching models.
4. **Overlap the first grill turn with the opening extraction**, or stop waiting on extraction. This removes the roughly +3 s on the first turn after the opening, the 8.6 s outliers in both cases.
