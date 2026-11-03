---
phase: 05-voice-out-avatar
plan: 03
subsystem: renderer/speech
tags: [tts, talkinghead, speech-queue, tdd]
requires: []
provides: [createSpeechQueue, SpeechQueue, HeadLike, TtsLike, SynthResult, SynthData, SpokenSeq]
affects: [05-04, 05-05]
tech-stack:
  added: []
  patterns: [engine-injected pure queue, speakMarker start/end acks, single promise hand-off chain]
key-files:
  created:
    - src/renderer/src/speech/speechQueue.ts
    - src/renderer/src/speech/speechQueue.test.ts
  modified: []
decisions:
  - "Failed synth is acked via a speakMarker, so spoken:false acks stay in seq order behind the playing sentence"
  - "handOff races item.synth against a per-item dropped promise, so a cancelled turn whose synth never settles cannot block the next turn"
  - "synthesize() rejections are mapped to {ok:false}"
metrics:
  duration: 6min
  completed: 2026-11-03
  tasks: 1
  files: 2
---

# Phase 5 Plan 03: Speech Queue Summary

This plan adds a pure speech queue, with the TTS engine and avatar head injected. It synthesises every sentence as soon as it arrives and plays them strictly in seq order through `speakMarker`/`speakAudio`/`speakMarker`. The end marker is the only `spoken:true` ack. `cancel(turnId)` calls `stopSpeaking()` once and acks every unplayed seq `spoken:false`.

## What was built

- `speechQueue.ts` (131 lines after prettier expanded the contract types). It matches the plan's interface contract exactly and imports only `SpeakEvent`, as a type. It does not import TalkingHead, three or headtts.
- `speechQueue.test.ts` has 14 given/when/then tests against a fake head that behaves like TalkingHead 1.8.2. The fake keeps one FIFO of markers and audio, fires markers synchronously when idle, and stays busy on audio until `endAudio()`. `stopSpeaking()` clears the FIFO, so pending markers never fire. The tests cover:
  - pre-synthesis
  - playback order when synthesis resolves out of order
  - acks in seq order
  - `onPlaying` staying true while the next sentence is still being synthesised
  - stats and viseme count
  - cancel while a sentence plays, cancel with nothing handed to the head, and cancel of another turn
  - a new turn after a cancel whose synthesis never settles
  - synthesis that fails, and synthesis that rejects
  - waiting for `ready`, and `ready` rejecting
  - `clear()`

  Every test checks that each seq is acked exactly once.

## Commits

- 7b4b681 test(05-03): add failing tests for seq-ordered speech queue (RED: the module did not exist)
- 2ca3369 feat(05-03): implement seq-ordered speech queue with marker acks (GREEN; also fixes lint in the test file)

## Deviations from Plan

**1. [Rule 1 - Bug] Failed-synth ack ordering**
- **Issue:** The plan says to ack false directly when `!r.ok`. If the previous sentence is still playing, that ack would arrive before the earlier seq's true ack, which breaks "acks arrive in seq order".
- **Fix:** The failure ack is queued as a `speakMarker`. When the head is idle it still fires synchronously.

**2. [Rule 2 - Correctness] A cancelled synthesis that never settles must not block the queue**
- **Issue:** A turn is cancelled while one of its synths is pending and never settles (Pitfall 7). With the single chain, every later turn would wait behind it.
- **Fix:** `handOff` races the synth against the item's dropped promise. There is a test for this.

**3. [Rule 2] Synth promise rejection is handled as `{ok:false}`.**

## Verification

- `npx vitest run --project renderer src/renderer/src/speech/speechQueue.test.ts`: 14/14 pass
- `npx eslint` and `prettier` are clean on both files, and `tsc -p tsconfig.web.json` reports nothing for speechQueue.

## Known Stubs

None.

## Self-Check: PASSED
