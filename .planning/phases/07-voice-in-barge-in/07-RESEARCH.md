# Phase 7: Voice In & Barge-In - Research

**Researched:** 2026-11-03
**Domain:** Local STT (whisper.cpp via N-API in an Electron utilityProcess), WebAudio capture, barge-in history truthfulness, T2 voice-loop E2E
**Confidence:** HIGH. Every load-bearing claim below was measured in a spike on this Mac (M3 Pro, Electron 45.2.1, Node 22.20).

Spike code: `/private/tmp/claude-501/-Users-rishizamvar/b5aaa262-21e3-4b10-bb85-7693b3bc6956/scratchpad/stt-spike/` (`bench.js`, `opts.js`, `actx.js`, `full.js`, `eapp/` Electron app). The models are already downloaded there (`models/`, sha-verified). Executors may `mv` them into `resources/assets/models/whisper/` instead of downloading again, because the disk is nearly full (see Pitfall 7).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Push-to-talk
- **The user's rule.** "I should press a button to stop, there should be a timer, brevity is graded."
  - The Talk button (or Space) starts recording and pressing it again stops.
  - A per-answer timer shows while recording. The brevity band colour from Phase 2 metrics (`ideal` / `long` / `flagged`) is shown subtly.
- **Mic stream.** Reuse the mic stream from the setup check, or open one per session with echoCancellation, noiseSuppression and autoGainControl on. Capture only while recording, so the mic is gated and avatar audio isn't captured.
- **Capture path.** An AudioWorklet (vendored, served from `app://`, CSP-safe) downsamples to 16 kHz mono Float32 and accumulates chunks in the renderer.
  - On stop, send one buffer to main via a typed IPC `stt.submit(turnId, Float32Array)`, as a transferable ArrayBuffer.
  - Cap at about 5 minutes of audio.
- **Mute.** The mic mute toggle from Phase 4 now really disables the track.

#### Whisper
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

#### Transcript filtering
- **Silence gate.** Before calling whisper, compute RMS and duration. Below the threshold, or under 0.4 s of voiced audio, return `{text:'', noAnswer:true}`. The runner then has the partner say a short re-prompt ("Didn't catch that — go ahead.") without an LLM call.
- **Hallucination filter.** Drop known phrases when they are the whole output: "Thank you.", "Thanks for watching", "you", "[BLANK_AUDIO]", "(silence)", and music notes. Also collapse 3 or more repeated n-grams.
- **Display.** Show the transcript in the transcript panel as the candidate's line once transcription finishes. A "transcribing…" indicator shows while it runs.

#### Latency budget
- **Stamps.** Per turn: `t_stop`, `t_transcript`, `t_request`, `t_first_delta`, `t_first_sentence`, `t_first_audio` (from renderer ack timing; add a `speak.started(seq)` event if needed). Store them in session timings.
- **Gate.** Over a T2 session with replayed Claude, the median of `t_first_audio − t_stop` must be ≤3 s. Replayed Claude is near-instant, so this measures the STT plus TTS share.
- **Live measurement.** Separately measure with the live Claude TTFT from Phase 6 (about 2.7 s) and report the real-world total in the SUMMARY, together with the Phase 6 latency recommendation.
- **Tools that reduce latency:**
  - transcribe while recording (chunking) if needed;
  - the 6-word first TTS chunk (Phase 2 splitter early emit);
  - pre-warm whisper during the review phase.

#### Barge-in
- **Trigger.** Pressing Talk while the avatar is speaking or the reply is streaming.
- **Renderer (immediate).** Stop playback via `voice.cancel(turnId)` (under 50 ms, asserted in E2E with the existing `isSpeaking` probe) and start recording.
- **Main.** On the `bargeIn` intent: abort the Claude stream (AbortController, `APIUserAbortError`), drop queued sentences, and commit to history only the sentences acked with `spoken:true`, as a text-only assistant turn. This is allowed per Phase 6 research.
- **History.** It stays alternating, and the next user turn is the new answer.
- **Tests.** A unit test asserts that history stays truthful after barge-in.

#### Testing
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

### Deferred Ideas (OUT OF SCOPE)
- Hands-free VAD, Smart Turn, streaming partials and mid-answer interrupts from streaming STT (v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIN-01 | Push-to-talk, Space toggle, visible per-answer timer | Talk toggle and `answer-timer` already exist in `Session.tsx`. Add capture start/stop, the brevity band (`brevityBand(ms)` in `domain/metrics.ts`) and a 5-min cap. See Pattern 1. |
| VIN-02 | Local whisper large-v3-turbo on Metal, seeded with the glossary and finance vocabulary | The binding works in Node 22 and in an Electron 45 utilityProcess (Node 24.22.1) on the MTL0 backend [V]. The `prompt` option works. Measured latency is in the Latency table. Patterns 2–3. |
| VIN-03 | Answer text shown after transcription | Push a candidate Turn as the runner already does, plus a `transcribing` view flag. Pattern 4. |
| VIN-04 | Near-silence means no answer; hallucinations and repetitions filtered | Measured hallucinations: silence gives "Thank you." / " dollars." / " You" / "Transcription by CastingWords"; noise gives an invented sentence. `no_speech_thold` and `suppress_nst` did **not** fix this [V]. A voiced-frame gate before whisper is mandatory. Pattern 5. |
| VOUT-04 | Median stop → first audio ≤3 s, logged per stage | Turbo-q5 tail ≤20 s takes about 0.85–1.0 s. 60 s of audio in one pass takes about 2.9–3.2 s, so **chunking is required** by the CONTEXT rule. Pattern 6, Pitfall 5 (the scaled clock). |
| VOUT-05 | Barge-in stops speech and cancels the stream; only spoken text is kept | `speechQueue.cancel` and `abortInflight` exist. Missing: a `bargeIn` intent, spoken-ack tracking in the runner, and a `ClaudeLlm` hook to commit `user + textOnlyAssistant(spoken, true)`. Pattern 7. |
| QA-03 | T2 E2E: real STT and TTS, replayed Claude, WAV fixtures as the mic | Verified in Electron: WAV, then `decodeAudioData`, then `MediaStreamDestination`, then `createMediaStreamSource`, then the worklet, all inside a 16 kHz AudioContext under the `script-src 'self'` CSP [V]. Pattern 8. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)
- TDD: write tests first. Every feature needs automated tests and a live E2E run in the real **built** app (`app://` and the production CSP).
- Voice stays local and free. The API key never reaches the renderer or the logs. Never log transcript or utterance text (the runner header already says this).
- Target ≤3 s from stop to first audible word.
- Use the BDD-ish existing test style in the repo (Vitest `main`/`renderer` projects; Playwright `workers: 1`).
- E2E uses an explicit env in `launch.ts`; never spread `process.env`.
- Chromium honours only ONE `disable-features` switch, so comma-join (`src/main/e2e.ts` note).
- Work goes through the GSD workflow; do not modify package.json while 06-10 E2E is running.

## Summary

`whisper-cpp-node@0.2.12` is the right choice and the fallback is not needed. It installs as a 3 MB prebuilt `@whisper-cpp-node/darwin-arm64/whisper.node`. It loads unchanged in Node 22 (Vitest) and inside an Electron 45 `utilityProcess` (Node 24.22.1). It logs `using MTL0 backend` and `flash attn = 1`. A `Float32Array` survives structured clone renderer→main→utility with about 1 ms overhead for 9 s of audio. A `process.crash()` in the worker surfaces as a utilityProcess `exit` event (code 11) and main stays alive. `brew whisper.cpp` (1.9.5) is not installed. **Do not build the fallback.** Keep the `SttPort` seam so a swap stays a one-file change.

The decisive number: turbo has a **fixed ~0.8 s cost per call**, because each call pads to a full 30 s encoder window. After that the cost grows with tokens: 10 s → 0.83 s, 30 s → 1.9 s, 60 s → 2.9–3.2 s, 120 s → 5.2–5.6 s. Under the CONTEXT rule (more than 1.5 s at 60 s), **chunked transcription while recording is required**. Cut chunks at the quietest frame near 20 s, so the tail on stop costs about 0.85–1.0 s. `audio_ctx` shrinking is broken on turbo (it produced " it" for 5 s of speech), so it is not a shortcut. `no_timestamps: true` **silently truncates** multi-window audio and drops the first words. Never set it.

Whisper hallucinates on every silent or near-silent input, with and without the prompt. The case prompt even biases it to " dollars." and " money.". `no_speech_thold`/`suppress_nst` did not help. The pre-whisper voiced-frame gate (20 ms frames with RMS > 0.02, at least 400 ms voiced) cleanly separated every speech fixture (6080 ms voiced) from every silence or noise fixture (0–20 ms). Use it per chunk and per answer.

**Primary recommendation:** Run whisper-cpp-node in a utilityProcess with `ggml-large-v3-turbo-q5_0.bin` (574 MB, as accurate as f16 on the fixtures and slightly faster). Capture with `new AudioContext({sampleRate:16000})` plus a tiny copy-only worklet in `public/`, because Chromium resamples natively. Stream ~20 s chunks to main while recording. Gate before whisper, filter after.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| whisper-cpp-node | 0.2.12 (npm, modified 2026-03-07; still latest [V `npm view`]) | whisper.cpp N-API binding with Metal | The only maintained Node binding with prompt support. The prebuilt needs no rebuild for Electron [V] |
| @whisper-cpp-node/darwin-arm64 | 0.2.12 (optionalDependency, auto-installed) | `whisper.node` (3,031,632 bytes) | Statically links Metal and CoreML, with an embedded metal library [V] |
| Electron `utilityProcess` | Electron 45.2.1 | Crash isolation | Verified loading and transcribing; `process.parentPort` messaging; `exit` event on crash [V] |
| WebAudio `AudioContext({sampleRate:16000})` + `AudioWorkletNode` | Chromium 156 | Capture at 16 kHz | Native resampling from the 48 kHz mic, verified (15,744 samples/s captured) [V] |

### Models (HF `ggerganov/whisper.cpp`, `resolve/main/<file>`; sha256 = the `x-linked-etag`, verified by `shasum` [V])
| File | Bytes | sha256 | Use |
|------|-------|--------|-----|
| ggml-large-v3-turbo-q5_0.bin | 574041195 | 394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2 | **`STT_MODEL=turbo` (prod)** |
| ggml-large-v3-turbo.bin (f16) | 1624555275 | 1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69 | Not needed: same text on the fixtures, slower, 3x the disk |
| ggml-large-v3-turbo-q8_0.bin | 874188075 | 317eb69c11673c9de1e1f0d459b253999804ec71ac4c23c17ecf5fbe24e259a1 | Only if q5 shows accuracy loss on Rishi's real voice |
| ggml-base.en.bin | 147964211 | a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002 | **`STT_MODEL=base`** (tests and fast mode) |
| ggml-tiny.en.bin | 77704715 | 921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f | Skip: base.en already takes about 0.1 s |

The CONTEXT says "Production: large-v3-turbo", and q5_0 is that model quantized. It is flagged here so the planner can confirm. It is the recommended default because the disk has 4.5 GB free.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| whisper-cpp-node | brew `whisper-cli` 1.9.5 subprocess | Not installed. Adds spawn plus a temporary WAV per call. Flags (`-m -f -l en --prompt -otxt -np`) are from training data, not verified [LOW]. Unnecessary: the binding works |
| Worklet downsampler (CONTEXT wording) | `AudioContext({sampleRate:16000})` native resampling | Native is less code and verified. The CONTEXT leaves the worklet implementation to discretion. A JS downsampler is only needed if `ctx.sampleRate !== 16000`, which never happened |
| CoreML encoder (`use_coreml`) | ANE encoder | Needs a separate ~1.2 GB `-encoder.mlmodelc` download, and disk is tight. Not measured; defer |

**Installation (after 06-10 finishes):** `npm i whisper-cpp-node@0.2.12` (into `dependencies`, so electron-vite externalises it and electron-builder packs it).

## Measured Latency (M3 Pro, warm context, `language:'en'`, case-style prompt, flash_attn on, timestamps on)

| Audio | base.en | turbo f16 | turbo q5_0 |
|-------|---------|-----------|------------|
| 8.6 s (finance line) | 106 ms | 826 ms | 837 ms |
| 30 s | 411 ms | 1945 ms | 1838 ms |
| 60 s | 1654 ms | 3224 ms | 2887 ms |
| 120 s | 2437 ms | 5596 ms | 5202 ms |
| 1 s / 20 s (turbo q5, in Electron / Node) | — | — | 846 ms / 997 ms |
| Context load | 120 ms | 1348 ms | 563 ms |

- Decoding options barely matter. greedy (`best_of:1`), `no_fallback`, `n_threads:8` and the defaults are all within ±5%. `beam_size:5` is about 10% slower. `flash_attn:false` is about 10% slower. Use the defaults plus `flash_attn:true`.
- First transcription after load costs about +500 ms. A **first-ever Metal library load is ~10 s per executable** (Node and the Electron helper each paid it once; afterwards 0.008 s / 986 ms init). Pre-warm at app start or review start.
- Inside Electron the round trip renderer→main→utility→back equals the worker's transcribe time to within 1 ms.

**Accuracy (prompted):** both models produced "I'd pass at 540 million. Gross retention is 87%, so the back-solve needs 48% CAGR." They also produced "112%", "4.1x", "1.5", "Rule of 40", "32", "3x over 5 years" and "pre-money". Misses: "NTM ARR" came out as "NTM air"/"NTMR" (macOS `say` voices "ARR" as a word), and turbo-q5 heard "MOIC" as "MOC". The prompt fixed "mock of" to "MOIC" on base. Assert numbers and keywords only, not ARR/MOIC.

## Architecture Patterns

### Recommended Structure
```
src/main/stt/
  worker.ts        # utilityProcess entry: owns WhisperContext; {init|transcribe|warm} messages
  whisperStt.ts    # SttPort adapter in main: fork, request queue, crash→reject+respawn, Metal check
  gate.ts          # pure: voicedMs(pcm), isNoAnswer(pcm) (thresholds as exported knobs)
  clean.ts         # pure: hallucination phrase filter + n-gram collapse
  assemble.ts      # pure: per-turn chunk map → ordered text (chunk idx, tail)
src/renderer/src/mic/
  capture.ts       # AudioContext(16k) + worklet + accumulator + chunk cut + 5-min cap
  accumulator.ts   # pure: push(Float32Array) / cut(at) / quietestCut(frames)
src/renderer/public/pcm-capture.worklet.js   # unhashed, served from app:// (script-src 'self')
scripts/fetch-voice-assets.sh  # + whisper models (reuse fetch(); add sha256 check)
```

### Pattern 1: Copy-only worklet in `public/`
```js
// src/renderer/public/pcm-capture.worklet.js — verified loads via addModule('/…') under the app CSP
class Cap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(4096); this.n = 0 }
  process(inputs) {
    const ch = inputs[0][0]
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i]
      if (this.n === this.buf.length) { this.port.postMessage(this.buf); this.buf = new Float32Array(4096); this.n = 0 }
    }
    return true
  }
}
registerProcessor('pcm-capture', Cap)
```
Use `port.postMessage({flush:true})` → the worklet posts its partial buffer, so that on stop nothing is lost. A `blob:` worklet **is blocked** by the CSP [V], so the file must be a real file. The worklet node does not need to connect to `destination` to run [V].

### Pattern 2: utilityProcess worker (verified shape)
```ts
// worker.ts (bundled as a second main entry; whisper-cpp-node stays external)
import { createWhisperContext, transcribeAsync, type WhisperContext } from 'whisper-cpp-node'
let ctx: WhisperContext
process.parentPort.on('message', async ({ data: m }) => {
  if (m.type === 'init') {
    ctx = createWhisperContext({ model: m.model, use_gpu: true, flash_attn: true, no_prints: true })
    process.parentPort.postMessage({ type: 'ready', info: ctx.getSystemInfo(), gpus: getGpuDevices() })
  } else if (m.type === 'transcribe') {
    const r = await transcribeAsync(ctx, { pcmf32: m.pcm, language: 'en', prompt: m.prompt })
    process.parentPort.postMessage({ type: 'text', id: m.id, text: r.segments.map((s) => s.text).join('') })
  }
})
```
- **Metal check:** `getSystemInfo()` reports compiled backends only (`MTL : EMBED_LIBRARY = 1`), not the runtime choice. Use `getGpuDevices()` (returned `[{name:'MTL0', description:'Apple M3 Pro', type:'gpu'}]`). Treat an empty array as CPU-only and show the banner. Optional extra: run with `no_prints:false` and scan stderr (`stdio:'pipe'`) for `using MTL0 backend`.
- electron-vite: add `main.build.rollupOptions.input = { index: 'src/main/index.ts', sttWorker: 'src/main/stt/worker.ts' }`, then `utilityProcess.fork(join(__dirname, 'sttWorker.js'), [], { serviceName: 'stt', stdio: 'pipe' })`.
- Packaging: `asarUnpack` already contains `**/*.node`, and the entitlements already carry `cs.disable-library-validation` (inherit included). Add a `verify-package.sh` check that `app.asar.unpacked/node_modules/@whisper-cpp-node/darwin-arm64/whisper.node` exists. The model path resolves under the existing assets root (`resources/**` is unpacked).
- Serialise requests: one transcription at a time per context (a queue in `whisperStt.ts`).
- Crash: on `exit`, reject in-flight promises with `SttCrashed`, respawn lazily, and have the runner `sayLine('Sorry, transcription failed. Please repeat that.')` with no transcript entry.

### Pattern 3: SttPort shape
```ts
export interface SttPort {
  transcribe(pcm16k: Float32Array, o?: { prompt?: string }): Promise<{ text: string; noAnswer?: boolean }>
  warm?(): Promise<void>
}
```
The gate and filter wrap any adapter (one `filteredStt(inner)` function), so FakeStt stays untouched and T1 is unchanged. `compose.readConfig`: accept `STT=whisper|fake` (default `whisper`, or `fake` when `E2E=1`) and `STT_MODEL=turbo|base` (default turbo). Today the code **throws** for any `STT` other than `fake`, so update `compose.test.ts`.

### Pattern 4: IPC
- Renderer to main: `stt:chunk {turnId, idx, pcm: Float32Array}` while recording, then `intent {type:'answer', ms, turnId, chunks: n}` plus the tail as `stt:chunk` with `final:true`. Electron IPC (`ipcRenderer.invoke` / `send`) **cannot transfer ArrayBuffers**; only MessagePorts are transferable. Structured-clone copy is ~1 ms and is fine, because 5 min is 19 MB. **Send `pcm.slice()`, never a `subarray`**, because a view clones its entire backing buffer. Validate at the trust boundary with zod (`z.instanceof(Float32Array)`, length ≤ 16000×310).
- Main to utility: `child.postMessage({type:'transcribe', pcm})`. The `Float32Array` arrives intact [V].
- The view gets `transcribing: boolean` so the UI shows "transcribing…".

### Pattern 5: Gate + filter (pure, main)
```ts
export const FRAME = 320, VOICED_RMS = 0.02, MIN_VOICED_MS = 400 // ponytail: absolute threshold; make relative to the noise floor if AGC rooms trip it
export function voicedMs(p: Float32Array): number {
  let v = 0
  for (let i = 0; i + FRAME <= p.length; i += FRAME) {
    let e = 0; for (let j = 0; j < FRAME; j++) e += p[i + j] ** 2
    if (Math.sqrt(e / FRAME) > VOICED_RMS) v++
  }
  return v * 20
}
```
Measured: speech fixture 6080 ms, white noise at rms 0.018 gave 20 ms, hiss and digital silence gave 0. Apply it **per chunk** (skip whisper for a silent 20 s pause chunk, which would otherwise hallucinate) and **per answer** (total < 400 ms means `noAnswer`). Post-filter phrases observed in the spike: `thank you.`, `you`, `.`, `dollars.`, `money.`, `transcription by castingwords`, `thanks for watching`, `[blank_audio]`, `(silence)`, `♪`. Normalise by lowercasing, stripping punctuation and whitespace, and comparing whole-output only. N-gram collapse: tokens, any n in 1..8 repeated ≥3 consecutive times collapses to one.

### Pattern 6: Chunked transcription (required)
- Renderer accumulator: once ≥20 s are buffered, cut at the quietest 20 ms frame within the last 2 s (a min-energy scan), send that chunk, and keep the remainder. Cap at 300 s: auto-stop, or refuse more.
- Main: transcribe chunks in arrival order in the background. On the final chunk, await all and join with a space. Each chunk passes the gate and filter independently. Use the same case prompt for every chunk; skip the previous-text conditioning (YAGNI).
- Expected stop→transcript: about 0.85–1.0 s (tail ≤ ~22 s) plus waiting for any still-running chunk. Chunks run at ~0.1x real time, so they finish while the user talks.
- **Never** `audio_ctx` (broken on turbo [V]) and **never** `no_timestamps:true` (truncates multi-window audio [V]).

### Pattern 7: Barge-in history (the gap in today's code)
1. Renderer on Talk while `view.speaking`: `voice.clear()` (synchronous `head.stopSpeaking()` plus acks `spoken:false` for cancelled items), start capture, `onIntent({type:'bargeIn'})`.
2. Runner: today `ack(turnId, seq)` ignores `spoken`. Record `spokenSeqs: Set<string>` for `spoken === true`. True acks arrive at sentence end, long before the press, so there is no ordering race with the bargeIn IPC. On `bargeIn`: capture `written.filter(spoken)` for `speakingTurn`, then `abortInflight()`. When the aborted `speakTurnInner` returns, push an interviewer Turn with only the spoken sentences (when there are any), followed by `[interrupted]` semantics, then set `speaking=false`. Today the aborted path pushes **nothing**, so both the user answer and the partial reply vanish.
3. `ClaudeLlm.streamTurn` on abort currently `return`s without `remember()` (see the "Phase 7 barge-in owns partial history" ponytail at `claudeLlm.ts:114`). Add an LlmPort method `interrupted(spokenText: string)`:
   - non-empty: `grillMsgs.push(user, textOnlyAssistant(spokenText, true))`, then `pendingToolUseId = null`;
   - empty: keep `user` pending and merge it into the next user message (adjacent user roles otherwise fail `checkConversation`).
4. `answer` intent today returns early when `speaking || inflight`. After a barge-in both are cleared, so the following answer flows normally.
5. Unit test: a fake stream of 3 sentences, ack seq 0 `spoken:true`, then bargeIn. Expect the transcript to hold only sentence 0, `checkConversation(msgs)` to be `[]`, and the next request's messages to end with `[…, assistant(s0 + ' [interrupted]'), user(newAnswer)]`.

### Pattern 8: E2E mic injection (verified feasible)
The existing `__e2e.say(text)` is the FakeStt text injector used by T1. **Keep it and name the new hook differently.** Preload `__e2e` is a frozen contextBridge object, so publish the hook renderer-side as `window.__mic` only when `'__e2e' in window`, the same pattern as `window.__voice`. The test reads the WAV in Node and passes base64 through `page.evaluate`. That avoids serving `tests/fixtures/audio` (gitignored, outside `/res/`) through `app://`.
```ts
// renderer, E2E only
window.__mic = { async play(b64) {
  const ctx = capture.ctx                       // the 16 kHz capture context
  const buf = await ctx.decodeAudioData(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer)
  const dest = ctx.createMediaStreamDestination()
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(dest)
  capture.setStream(dest.stream)                // replaces the mic track feeding createMediaStreamSource
  src.start(); await new Promise(r => (src.onended = r))
}}
```
Verified: a 48 kHz `say` WAV decoded to a 16 kHz buffer gave 8.94 s captured, peak 0.82, and transcribed correctly in the utilityProcess. Flow per answer: click Talk, `__mic.play(wav)` (real time), click Done. Barge-in timing: poll in-page (`performance.now()` loop on `__voice.isSpeaking`) from the click to false, then assert ≤200 ms (target <50).

### Anti-Patterns to Avoid
- Running whisper in the main process. A Metal fault kills the session, and the sync model load blocks IPC for 0.5–1.3 s.
- One-shot transcription of the full answer on stop (3–5 s for 60–120 s answers).
- Trusting `no_speech_thold` to stop hallucinations (it does not [V]).
- Calling whisper while the avatar speaks. GPU contention with HeadTTS and three.js. Button gating already prevents it; keep chunks only during recording.
- A `blob:` or inline worklet (CSP blocks it).

## Don't Hand-Roll
| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 48→16 kHz resampling | A JS polyphase downsampler | `new AudioContext({sampleRate:16000})` | Chromium resamples the MediaStreamSource natively [V] |
| Process isolation and crash detect | A child_process plus your own IPC | `utilityProcess.fork` + `parentPort` | Typed-array structured clone and the `exit` event are built in [V] |
| STT engine | A CLI wrapper | whisper-cpp-node | Already loads in both runtimes [V] |
| Number check in tests | Regexes | `parseNumbers`/`matches` in `domain/text/numbers.ts` | Already exists (Phase 2) |
| Brevity colour | New thresholds | `brevityBand(ms)` in `domain/metrics.ts` | Already exists |
| Mute | Discarding samples | `track.enabled = false` | Gives digital zeros within <200 ms [V] |

## Common Pitfalls

### Pitfall 1: `no_timestamps:true` truncates audio
**What goes wrong:** 60 s and 120 s inputs return the same text as 30 s, and with the long prompt the first words are dropped ("percent, so the back-solve…") [V].
**How to avoid:** Leave timestamps on and join `segments[].text`.

### Pitfall 2: Silence hallucinations, including prompt-biased ones
Silence, hiss and noise give "Thank you.", " dollars.", " money.", " You", " .", "Transcription by CastingWords", and "The next step is to make sure the water is in the middle of the road." [V]. The gate comes first. The phrase list is the second line of defence only.

### Pitfall 3: First-ever Metal init takes ~10 s per executable
The packaged app's helper pays it on first launch. Warm the worker at app start: init, then transcribe 1 s of zeros and discard the result. Never block the Talk button on it; queue instead. Expect E2E's first launch on a fresh build path to be slow, so give the timeouts generous headroom.

### Pitfall 4: `audio_ctx` speed hack is broken on turbo
5 s of speech gave " it", and 10 s got slower (2.3 s) [V]. Don't use it.

### Pitfall 5: Latency stamps on the scaled clock
`createScaledClock` multiplies elapsed time by `E2E_TIME_SCALE`, so durations become inflated. Record latency stamps from an unscaled `realNow` (inject `Date.now`), or divide by `clock.scale`. The renderer `t_first_audio` must come over a new `speak:started {turnId, seq}` IPC; main stamps on receipt (~1 ms skew).

### Pitfall 6: Barge-in loses the user answer from Claude's history
This is a real bug today: the aborted `streamTurn` never calls `remember(user, …)`. See Pattern 7. Also `flushAcks()` in `abortInflight` resolves waits. Record spoken flags in `ack()` itself, not at flush.

### Pitfall 7: Disk is 99% full (4.5 GB free)
Turbo f16 (1.6 GB) plus base.en would leave little for build output. Use q5_0 (574 MB). The fetch script should check free space and fail with a clear message. Clean up the scratch model copies (or `mv` them) after the phase.

### Pitfall 8: Subarray IPC sends the whole backing buffer
Structured clone serialises the full `ArrayBuffer` behind a view. `slice()` chunks before sending.

### Pitfall 9: Vitest loads the native addon per test file
Use one integration file (`src/main/stt/whisper.int.test.ts`) with a shared context in `beforeAll`. Generate fixtures with `say -o … --data-format=LEI16@16000` into `os.tmpdir()`. Missing model means a loud failure ("run npm run fetch:voice"), not a silent skip, except for the turbo test, which is `SLOW=1`.

## Code Examples
WAV → Float32 (spike-verified, for the Vitest fixtures):
```ts
function wavToF32(b: Buffer): Float32Array {
  let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4)
  const n = b.readUInt32LE(o + 4) / 2, a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = b.readInt16LE(o + 8 + 2 * i) / 32768
  return a
}
```
Fetch-script addition (reuse the existing `fetch()`; add a sha check):
```bash
HF_W=https://huggingface.co/ggerganov/whisper.cpp/resolve/main
fetch "$HF_W/ggml-base.en.bin" "$M/whisper/ggml-base.en.bin" 147964211
fetch "$HF_W/ggml-large-v3-turbo-q5_0.bin" "$M/whisper/ggml-large-v3-turbo-q5_0.bin" 574041195
# then: shasum -a 256 -c <<< "<sha>  <file>" (values in the Models table)
```

## State of the Art
| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| smart-whisper | whisper-cpp-node 0.2.x | smart-whisper is stale since 2024-10 |
| ScriptProcessorNode | AudioWorklet | Deprecated API; off the main thread |
| `no_speech_thold` as a silence fix | A pre-whisper energy/VAD gate | Measured ineffective here |

## Open Questions
1. **Real-voice accuracy of q5_0 vs f16**: `say` fixtures can't tell them apart. Recommendation: ship q5_0. If Rishi's own recordings show misses, switch `STT_MODEL` to q8_0 (one constant).
2. **Gate threshold under real AGC/noise suppression**: 0.02 frame-RMS is calibrated on synthetic audio. Keep it as an exported knob, and log `voicedMs` (a number, not text) per turn so it can be tuned.
3. **Chromium AEC with a 16 kHz capture context and real mic**: verified with the fake device only. Low risk, since the mic is gated during avatar speech.
4. **Live total**: STT tail ~1 s + TTFT ~2.7 s + first-sentence TTS. That likely exceeds 3 s live. Report it in the SUMMARY (do not switch models; that is Rishi's call per Phase 6).

## Environment Availability
| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| whisper-cpp-node prebuilt | VIN-02 | ✓ (installed in scratch; not yet in the project) | 0.2.12 | — |
| Metal GPU | VIN-02 | ✓ | Apple M3 Pro, MTL0, MTLGPUFamilyApple9 | CPU banner |
| Electron | worker | ✓ | 45.2.1 (Node 24.22.1) | — |
| `say`, `afconvert` | fixtures | ✓ | macOS | — |
| brew whisper.cpp | fallback only | ✗ | (bottle 1.9.5 available) | Not needed |
| Disk | models | ⚠ 4.5 GB free | — | q5_0 + base.en only (~720 MB) |
| HF network | fetch script | ✓ | — | `mv` from the scratch spike dir |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.1.0 (projects `main`=node, `renderer`=jsdom); Playwright 1.64.1 `_electron` |
| Config file | `vitest.config.ts`, `playwright.config.ts` (workers 1) |
| Quick run command | `npx vitest run src/main/stt src/renderer/src/mic src/main/session` |
| Full suite command | `npx vitest run && npm run test:e2e && npm run test:e2e:t2` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIN-01 | Talk/Space toggles capture; timer and brevity band; 5-min cap; mute zeroes the track | unit (jsdom) + E2E | `npx vitest run src/renderer/src/mic src/renderer/src/screens/Session.test.tsx`; T2 spec | ❌ Wave 0 (`mic/accumulator.test.ts`) |
| VIN-02 | Real whisper base.en transcribes the finance fixture; numbers via `parseNumbers` | integration | `npx vitest run src/main/stt/whisper.int.test.ts` | ❌ Wave 0 |
| VIN-02 | Turbo accuracy and latency (30/60/120 s numbers recorded) | integration, slow | `SLOW=1 npx vitest run src/main/stt/whisper.int.test.ts -t turbo` | ❌ Wave 0 |
| VIN-02 | Config `STT=whisper\|fake`, `STT_MODEL`; Metal-missing banner | unit | `npx vitest run src/main/compose.test.ts src/main/stt/whisperStt.test.ts` | partial (compose.test.ts exists) |
| VIN-02 | Worker crash → reject + respawn + "please repeat" | unit (fake child) | `npx vitest run src/main/stt/whisperStt.test.ts` | ❌ Wave 0 |
| VIN-03 | Candidate line appears after transcription; "transcribing…" shown | unit + E2E | `npx vitest run src/main/session/runner.test.ts`; T2 | partial |
| VIN-04 | Gate: silence/hiss/noise → noAnswer; re-prompt without LLM | unit + integration | `npx vitest run src/main/stt/gate.test.ts src/main/stt/clean.test.ts` | ❌ Wave 0 |
| VIN-04 | Phrase filter and n-gram collapse | unit | `npx vitest run src/main/stt/clean.test.ts` | ❌ Wave 0 |
| VOUT-04 | Stamps recorded (unscaled); median gate ≤3 s | unit + T2 | `npx vitest run src/main/session/latency.test.ts`; `npm run test:e2e:t2` | ❌ Wave 0 |
| VOUT-04 | Chunk cut at the quietest frame; chunks assembled in order | unit | `npx vitest run src/renderer/src/mic/accumulator.test.ts src/main/stt/assemble.test.ts` | ❌ Wave 0 |
| VOUT-05 | Barge-in keeps only spoken sentences; `checkConversation` clean; next request alternates | unit | `npx vitest run src/main/session/runner.bargein.test.ts src/main/agent/claudeLlm.test.ts` | ❌ Wave 0 |
| VOUT-05 | isSpeaking false within ≤200 ms of Talk | E2E T2 | `npm run test:e2e:t2` | ❌ (new `voiceloop.t2.spec.ts`) |
| QA-03 | Full loop: real STT + HeadTTS + replay Claude + `__mic.play` WAVs | E2E T2 | `npx playwright test tests/e2e/voiceloop.t2.spec.ts` (after build) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the quick run command above (<30 s, base.en integration included).
- **Per wave merge:** `npx vitest run && npm run test:e2e`.
- **Phase gate:** the full suite plus `npm run test:e2e:t2` plus `SLOW=1` turbo, green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `npm i whisper-cpp-node@0.2.12` (after 06-10 finishes) and the whisper models in `scripts/fetch-voice-assets.sh` (size + sha256)
- [ ] `src/main/stt/{gate,clean,assemble}.test.ts`, `whisperStt.test.ts`, `whisper.int.test.ts` (the `say` fixtures go to tmpdir in `beforeAll`)
- [ ] `src/renderer/src/mic/accumulator.test.ts`
- [ ] `src/main/session/runner.bargein.test.ts`, latency stamp test
- [ ] `tests/e2e/global-setup.ts`: 3–5 more `say` WAVs (finance answer, short answer, silence)
- [ ] `tests/e2e/voiceloop.t2.spec.ts` plus a replay scenario for the grill turns
- [ ] Add `src/main/stt/**` to the vitest `main` include (already covered by `src/main/**/*.test.ts`)

## Sources

### Primary (HIGH)
- Local spike, 2026-11-03: whisper-cpp-node 0.2.12 `dist/types.d.ts` (full option surface: `use_gpu`, `flash_attn`, `gpu_device`, `use_coreml`, `no_prints`; `prompt`, `no_speech_thold`, `suppress_nst`, `beam_size`, `best_of`, `temperature`, `no_fallback`, `audio_ctx`, `no_timestamps`, `vad*`; `getGpuDevices`, `getSystemInfo`), latency and accuracy benches, Electron 45.2.1 utilityProcess + AudioWorklet + CSP + MediaStreamDestination spike.
- HuggingFace `ggerganov/whisper.cpp` HEAD (`x-linked-size`, `x-linked-etag`), with sha256 re-verified locally.
- `npm view whisper-cpp-node` (0.2.12, modified 2026-03-07); `brew info whisper-cpp` (1.9.5, not installed).

### Secondary (MEDIUM)
- `.planning/research/STACK.md`, `PITFALLS.md` (Pitfalls 4, 9, the barge-in history pitfall), `research/voice_pipeline.md`.

### Tertiary (LOW)
- whisper-cli flag names (training data only; unused).

## Metadata
**Confidence breakdown:**
- Standard stack: HIGH. Installed, loaded and benchmarked in both runtimes.
- Architecture: HIGH for STT, IPC and capture (spiked). MEDIUM for the exact barge-in LlmPort hook shape (derived from code reading).
- Pitfalls: HIGH. Each one was reproduced.

**Research date:** 2026-11-03
**Valid until:** 2026-12-03
