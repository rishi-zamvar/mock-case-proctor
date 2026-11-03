# Phase 7: Voice In & Barge-In - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning
**Mode:** Smart discuss, auto-accepted. The user asked Claude to pick the best path and not wait.

<domain>
## Phase Boundary

This phase replaces FakeStt with real local speech-to-text and closes the voice loop. It covers:
- Push-to-talk capture in the renderer: mic, then an AudioWorklet, then 16 kHz mono Float32.
- Sending PCM to main over IPC.
- whisper.cpp large-v3-turbo on Metal, run in a crash-isolated Electron `utilityProcess` and seeded with the case STT prompt.
- Filtering: a silence/RMS gate, a hallucination phrase filter and repetition collapse.
- Showing the transcript.
- Per-stage latency stamps, and a check that median stop-to-first-word is ≤3 s.
- Button barge-in: pressing Talk while the avatar speaks stops it locally in under 50 ms, cancels the Claude stream, and keeps only the spoken sentences in history.
- A T2 E2E full voice loop: real STT and TTS, replayed Claude, and WAV fixtures as the mic.

Out of scope: VAD, Smart Turn, hands-free mode and streaming partial transcripts (v2).
</domain>

<decisions>
## Implementation Decisions

### Push-to-talk
- **The user's rule.** "I should press a button to stop, there should be a timer, brevity is graded."
  - The Talk button (or Space) starts recording and pressing it again stops.
  - A per-answer timer shows while recording. The brevity band colour from Phase 2 metrics (`ideal` / `long` / `flagged`) is shown subtly.
- **Mic stream.** Reuse the mic stream from the setup check, or open one per session with echoCancellation, noiseSuppression and autoGainControl on. Capture only while recording, so the mic is gated and avatar audio isn't captured.
- **Capture path.** An AudioWorklet (vendored, served from `app://`, CSP-safe) downsamples to 16 kHz mono Float32 and accumulates chunks in the renderer.
  - On stop, send one buffer to main via a typed IPC `stt.submit(turnId, Float32Array)`, as a transferable ArrayBuffer.
  - Cap at about 5 minutes of audio.
- **Mute.** The mic mute toggle from Phase 4 now really disables the track.

### Whisper
- **Library.** `whisper-cpp-node@0.2.12`: N-API, statically linked Metal, loads in Node 22 and Electron 45 per the STACK research.
- **Fallback.** `brew whisper-cli` subprocess behind the same `transcribe(pcm) → {text}` port. Research which one works and pick it.
- **Process isolation.** Run in an Electron `utilityProcess` (`src/main/stt/worker.ts`) so a Metal or GPU crash can't kill the session. Restart on crash and report "transcription failed, please repeat".
- **Models.**
  - Production: large-v3-turbo.
  - Tests and fast mode: base.en or tiny.en.
  - Download with an idempotent script (extend `scripts/fetch-voice-assets.sh`, or add `fetch-stt-model.sh`) into gitignored `resources/assets/models/whisper/`, with size pinned and sha checked if available.
  - Make the model a config value: `STT_MODEL=turbo|base`.
- **Startup check.** At STT worker init, log the Metal backend and reject (with a banner) if CPU-only.
- **Decoding.**
  - `language: 'en'`.
  - `prompt` = the case STT vocabulary prompt (Phase 2 `sttPrompt.ts`).
  - Greedy or beam per the library defaults tuned for latency.
  - `no_speech_thold` if exposed.
- **Long answers.** Measure final-pass latency for 30, 60 and 120 s fixtures. Answers can be 60–120 s, so if turbo exceeds about 1.5 s on 60 s of audio, implement chunked transcription while recording: transcribe completed 20–30 s chunks in the background while the user keeps talking, then only the tail on stop. Otherwise skip chunking (YAGNI) and record the numbers.

### Transcript filtering
- **Silence gate.** Before calling whisper, compute RMS and duration. Below the threshold, or under 0.4 s of voiced audio, return `{text:'', noAnswer:true}`. The runner then has the partner say a short re-prompt ("Didn't catch that — go ahead.") without an LLM call.
- **Hallucination filter.** Drop known phrases when they are the whole output: "Thank you.", "Thanks for watching", "you", "[BLANK_AUDIO]", "(silence)", and music notes. Also collapse 3 or more repeated n-grams.
- **Display.** Show the transcript in the transcript panel as the candidate's line once transcription finishes. A "transcribing…" indicator shows while it runs.

### Latency budget
- **Stamps.** Per turn: `t_stop`, `t_transcript`, `t_request`, `t_first_delta`, `t_first_sentence`, `t_first_audio` (from renderer ack timing; add a `speak.started(seq)` event if needed). Store them in session timings.
- **Gate.** Over a T2 session with replayed Claude, the median of `t_first_audio − t_stop` must be ≤3 s. Replayed Claude is near-instant, so this measures the STT plus TTS share.
- **Live measurement.** Separately measure with the live Claude TTFT from Phase 6 (about 2.7 s) and report the real-world total in the SUMMARY, together with the Phase 6 latency recommendation.
- **Tools that reduce latency:**
  - transcribe while recording (chunking) if needed;
  - the 6-word first TTS chunk (Phase 2 splitter early emit);
  - pre-warm whisper during the review phase.

### Barge-in
- **Trigger.** Pressing Talk while the avatar is speaking or the reply is streaming.
- **Renderer (immediate).** Stop playback via `voice.cancel(turnId)` (under 50 ms, asserted in E2E with the existing `isSpeaking` probe) and start recording.
- **Main.** On the `bargeIn` intent: abort the Claude stream (AbortController, `APIUserAbortError`), drop queued sentences, and commit to history only the sentences acked with `spoken:true`, as a text-only assistant turn. This is allowed per Phase 6 research.
- **History.** It stays alternating, and the next user turn is the new answer.
- **Tests.** A unit test asserts that history stays truthful after barge-in.

### Testing
- Unit tests cover the downsampler and accumulator (jsdom, pure functions), the silence gate, the hallucination filter, the n-gram collapse, latency stamp bookkeeping, and the barge-in history truncation.
- **Integration (Vitest, node).**
  - Real whisper (base.en) on `say`-generated WAV fixtures, including a finance-heavy line such as "I'd pass at five hundred forty million; gross retention is eighty seven percent, so the back solve needs forty eight percent CAGR".
  - Assert normalised keywords are present (numbers via the Phase 2 number parser) rather than exact strings.
  - Turbo runs in a tagged slow test.
  - A silent fixture yields noAnswer.
- **T2 E2E.**
  - Launch with `STT=whisper`, `TTS=headtts` and the replay server for Claude.
  - The mic is fed by fixture WAVs through the E2E-only `window.__e2e.say(url)` hook, which plays a WAV into a MediaStreamDestination that replaces the mic track. This bypasses Chromium's one-file-per-launch fake mic limit.
  - Drive a full loop: opening, then 2–3 grilling answers, then barge-in, then end. Assert transcripts appear, latency stamps exist, median ≤3 s, and barge-in stops speech in under 50–200 ms.
  - Generate 3–5 `say` fixtures, plus the existing one.
- **T1.** Stays on FakeStt and is unchanged.

### Claude's Discretion
- Exact worklet implementation, IPC buffer transfer details, chunking thresholds and file layout (`src/main/stt/`, `src/renderer/src/mic/`).
</decisions>

<code_context>
## Existing Code Insights
- `SttPort` and FakeStt (`src/main/adapters/fakeStt.ts`); composition root `src/main/compose.ts` (add `STT=whisper|fake`; default whisper normally, fake under E2E).
- STT prompt: `src/main/domain/cases/sttPrompt.ts`. Number parser: `src/main/domain/text/numbers.ts`. Metrics and brevity bands: `src/main/domain/metrics.ts`.
- Runner (`src/main/session/runner.ts`): turn flow, timings, abort and `speak:cancel`, the `spoken` ack flag (05-01: "reaches the runner but the runner ignores it until Phase 7"). Phase 6 added `ClaudeLlm` with an abort path and a text-only assistant fallback (`messages.ts textOnlyAssistant`).
- Renderer: `Session.tsx` (Talk button, Space toggle, mic mute toggle), `MicCheck.tsx`/`level.ts` (getUserMedia patterns), `speech/voice.ts` (cancel, `isSpeaking` probe via `window.__voice`).
- E2E: `tests/e2e/global-setup.ts` (say/afconvert WAV generation), `launch.ts`, `voice.t2.spec.ts` (T2 project pattern), replay server.
- The STACK research has the whisper-cpp-node API (createWhisperContext, transcribeAsync with pcmf32 and prompt).
</code_context>

<specifics>
## Specific Ideas
- Brevity is graded, so the timer must be visible and the band subtle.
- This phase completes the core value: speak, see your words, hear the partner within a few seconds, and cut it off at any time.
</specifics>

<deferred>
## Deferred Ideas
- Hands-free VAD, Smart Turn, streaming partials and mid-answer interrupts from streaming STT (v2).
</deferred>
