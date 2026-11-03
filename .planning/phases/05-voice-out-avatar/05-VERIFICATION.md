---
phase: 05-voice-out-avatar
verified: 2026-11-03T04:45:00Z
status: passed
score: 4/4 success criteria verified
human_verification_nonblocking:
  - test: "Listen to audition WAVs (.planning/phases/05-voice-out-avatar/audition/)"
    expected: "Voice sounds natural; optionally switch VOICE in src/renderer/src/speech/voice.ts (am_fenrir/am_michael graded C+ vs bm_george C)"
    why_human: "Voice naturalness is subjective"
  - test: "Eyeball avatar framing and idle/listening/thinking look"
    expected: "Head framed higher (screenshot shows low framing with headroom); branded T-shirt on avatarsdk.glb"
    why_human: "Visual polish; recorded in 05-08 as non-blocking"
---

# Phase 5: Voice Out & Avatar Verification Report

**Phase Goal:** A believable 3D partner speaks any interviewer line out loud in a lifelike local voice, lip-synced, and looks attentive while idle, listening or thinking.
**Verified:** 2026-11-03 at commit 5f0d74a
**Status:** passed
**Re-verification:** No, initial verification

## Evidence run in this verification

| Check | Result |
| --- | --- |
| `npx vitest run` | 919 passed, 2 skipped |
| `npm run typecheck` (node + web) | clean |
| `npm run test:e2e:t2` (real HeadTTS/Kokoro + TalkingHead in built app) | 4/4 passed (38 s) |
| 3x T1 E2E, packaged build, audition | Not re-run. Taken from 05-08-SUMMARY: T1 39/39 x3, packaged 2/2, 25 WAVs |

## Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | A sentence sent to the speech queue is spoken by HeadTTS/Kokoro and lip-synced; E2E asserts speaking state, viseme count above zero and a non-blank canvas | VERIFIED | `voice.t2.spec.ts` test 1 polls `isSpeaking`, then asserts `visemeCount > 0` and canvas opaque fraction above 0.05. It passed in the live T2 run |
| 2 | Startup asserts HeadTTS is on WebGPU; a forced fallback shows a visible banner | VERIFIED | T2 test 4 forces a fallback via init script: `ttsDevice` is wasm or none and `voice-banner` is visible. Test 1 runs on WebGPU. Banner logic is covered by 05-07 unit tests |
| 3 | Avatar switches between idle, listening and thinking with session state; one instance for app lifetime; capped at 30 fps | VERIFIED | T2 samples states and asserts the listening, then thinking, then speaking order, and no speaking while listening. `probe('instances') === 1`, and a single canvas remains after the deck shown/hidden cycle. `avatarEngine.ts` sets `modelFPS: 30`. Render is gated on stage visible or audio playing (04/05 tests) |
| 4 | Queued sentences play in order with per-sentence acks; cancel by turn ID stops playback with no stale audio | VERIFIED | `speechQueue.test.ts` covers seq order, pre-synthesis and spoken:false acks. T2 test 2: `isSpeaking` goes false in under 200 ms and there is no stale seq afterwards |

**Score:** 4/4

## Requirements Coverage

| Requirement | Description | Status | Evidence |
| --- | --- | --- | --- |
| VOUT-01 | Local HeadTTS/Kokoro on WebGPU; startup asserts WebGPU; banner on fallback | SATISFIED | Truths 1 and 2; T2 passes |
| VOUT-03 | TalkingHead 3D avatar, lip-sync, idle/listening/thinking | SATISFIED | Truths 1 and 3 |

Both IDs are marked Complete and mapped to Phase 5 in REQUIREMENTS.md. No orphaned requirements: VOUT-02 belongs to Phase 2, VOUT-04 and VOUT-05 to Phase 7, VOUT-06 to Phase 4.

## Key Artifacts

`src/renderer/src/avatar/avatarEngine.ts` (singleton, modelFPS 30), `src/renderer/src/speech/{speechQueue,headtts,voice}.ts`, `tests/e2e/voice.t2.spec.ts` and `tests/e2e/audition.spec.ts` all exist, are substantive and are exercised by the passing T2 suite. The suite runs the wired path end to end under the production CSP: App, voice runtime, queue, HeadTTS, TalkingHead, canvas.

## Anti-Patterns

None blocking. The T2 console check found no CSP `Refused to` errors, no jsdelivr requests and no page errors.

## Non-blocking notes

- Avatar framing sits low, with headroom above the head (05-08 polish item; camera/origin tweak in avatarEngine.ts).
- The default avatar wears a branded T-shirt (`avatarsdk.glb`).
- Voice choice is `bm_george`; switching is a one-constant change after listening to the auditions.
- The 30 fps cap is `modelFPS` on the TalkingHead model. It was verified by config and not measured empirically.

## Gaps Summary

No gaps. All four success criteria are backed by passing automated evidence, including a fresh real-voice T2 run. The remaining items are subjective polish only.

---

_Verified: 2026-11-03_
_Verifier: Claude (gsd-verifier)_
