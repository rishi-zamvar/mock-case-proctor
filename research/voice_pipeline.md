# Voice Pipeline Research: Local STT, TTS, VAD, and Lip-Sync for the Mock-Case Proctor

Researched 2026-11-02. Target: a macOS (Apple Silicon) Electron app. Mic goes to local STT, then the Claude API (text, streamed), then local TTS, then the TalkingHead.js avatar lip-syncs.
Constraints: TTS and STT must be local and free. This is for personal use, so commercial terms are a nice-to-have.

Confidence legend: **[V]** = verified from the project's own README or docs during this research. **[S]** = secondary source or vendor claim. **[M]** = from prior knowledge, not re-verified today; check before relying on it.

---

## TL;DR: recommended stack

| Slot | Primary | Fallback | Why |
|---|---|---|---|
| **TTS + lip-sync timing** | **HeadTTS** (met4citizen, MIT) runs Kokoro-82M (timestamped ONNX) in the Electron renderer on WebGPU. | **kokoro-js** or **sherpa-onnx-node** Kokoro (no timestamps), paired with **HeadAudio** audio-driven visemes or TalkingHead's text lip-sync with estimated word times. | HeadTTS is by the TalkingHead author. It outputs `words/wtimes/wdurations` **and** `visemes/vtimes/vdurations`, which go straight into `head.speakAudio()`. It needs zero glue code, has no Python, and has no GPL eSpeak. |
| **STT (final transcript)** | **whisper.cpp large-v3-turbo** (Metal) via **`whisper-cpp-node`** or **`smart-whisper`**, run in the Electron main or utility process. Send a finance-vocab `initial_prompt`. | **Parakeet TDT 0.6B v2** (English) via `sherpa-onnx-node`, or Apple **SpeechAnalyzer** through a small Swift helper. | Whisper is the only option here with prompt biasing (EBITDA, ARR, CAGR, "pre/post-money"). Turbo on Metal transcribes a 10 to 20 s answer in well under a second. |
| **STT (live partials)** | Re-run whisper.cpp **base.en / small.en** on the growing utterance buffer every ~700 ms (display only). | Moonshine Voice streaming (MIT), or SpeechAnalyzer volatile results. | Reuses the same native binding, so there is no second engine. Partials are only for display; the final transcript comes from turbo. |
| **VAD** | **@ricky0123/vad-web** (Silero v5/v6, ONNX/WASM) in the renderer. | Push-to-talk (hold Space), which is always available. | Mature and in-browser, and its callbacks map directly to turn-taking. |
| **End-of-turn** | Silero silence plus **Pipecat Smart Turn v3.2** (BSD-2, 8 MB int8 / 33 MB fp32 ONNX, ~20 to 40 ms on CPU), with a long silence ceiling. | A fixed long `redemptionMs` (1.8 to 2.5 s) plus a "Done" key. | Case candidates pause mid-math. A semantic or prosodic turn model avoids cutting them off without making every turn slow. |
| **Barge-in** | VAD `onSpeechStart` while the avatar is speaking (with Chromium AEC on) triggers `head.stopSpeaking()` / `streamInterrupt()` and aborts the Claude stream. | Barge-in only via key press (headphones not required). | Simple, and every needed hook exists. |
| **Whole-stack reuse** | Don't adopt a framework; borrow patterns from `kwindla/macos-local-voice-agents` (Pipecat). | Pipecat as a Python sidecar if the JS approach stalls. | The Electron/JS path needs no Python at all. Pipecat is the best reference, but it adds a Python runtime to package. |

**Estimated end-to-end latency** (candidate stops talking until the avatar's first audible syllable), on an M-series Mac:

| Stage | Typical |
|---|---|
| End-of-turn wait (silence `redemptionMs` 1.0 to 1.4 s, or Smart Turn early-commit ~0.3 to 0.5 s) | 0.4 to 1.4 s |
| Whisper large-v3-turbo final pass on a 10 to 20 s utterance (Metal) | 0.3 to 0.9 s |
| Claude streaming time-to-first-token (Sonnet/Haiku class) | 0.5 to 1.2 s |
| Buffer the first sentence (~10 to 15 words) from the stream | 0.2 to 0.5 s |
| HeadTTS first sentence (WebGPU RTF 0.15 to 0.23 [V] means ~3 s of speech in ~0.5 to 0.7 s) | 0.4 to 0.7 s |
| **Total** | **~1.8 to 4.5 s, median ~2.5 to 3 s** |

That is fine for an interviewer persona, since human case interviewers routinely pause 2 to 3 s. Biggest levers: Smart Turn early-commit, speculatively starting Whisper when silence begins, splitting the first TTS chunk at a clause boundary (~6 to 8 words), and a "thinking" idle animation and gaze while waiting.

---

## 1. Local TTS

### 1.1 What TalkingHead needs (verified)
TalkingHead (github.com/met4citizen/TalkingHead, **MIT**, current CDN tag `talkinghead@1.8`, no GitHub releases) [V]:

- `speakAudio(audio, opt, onsubtitles)`
  - `audio.audio`: an `AudioBuffer` or an array of 16-bit LE PCM chunks.
  - `audio.words`, `audio.wtimes`, `audio.wdurations`: word timings in ms. TalkingHead derives visemes from the words using its language module (`lipsyncLang: 'en'`).
  - Optional `visemes/vtimes/vdurations`: Oculus viseme IDs. These take precedence and give the best accuracy.
  - Optional `markers/mtimes`: timed callbacks, useful for "show next exhibit when the avatar says X".
  - Optional `anim`: raw blendshape tracks.
- **Streaming API:**
  - `streamStart(opt, onAudioStart, onAudioEnd, onSubtitles, onMetrics)`. `opt` takes `sampleRate`, `lipsyncType`, `waitForAudioChunks`, and `mood`.
  - `streamAudio({audio, visemes|words|anims...})`.
  - `streamNotifyEnd()`, `streamInterrupt()`, and `streamStop()`.

  This fits sentence-by-sentence TTS of a streamed LLM reply exactly.
- Built-in lip-sync languages: en, de, fr, pt-BR, fi, lt, bn.
- **If the TTS emits no timestamps**, there are three options:
  1. **HeadAudio** (below).
  2. Pass `words` with *estimated* `wtimes`, spreading the audio duration across words weighted by character or phoneme count. TalkingHead's English module turns those into visemes. It looks OK at a glance but drifts on long sentences.
  3. A raw amplitude-to-`jawOpen` blendshape, which is the crudest.
- Avatar: a GLB with a Mixamo-compatible rig (root `Armature`), **52 ARKit blendshapes + 15 Oculus visemes**.
  - Sources: Avaturn, MPFB (Blender), VRoid, Avatar SDK, Microsoft RocketBox. Ready Player Me shut down its public service in 2025 [M], so don't plan around it.
  - The sample `brunette.glb` is CC BY-NC 4.0 (fine for personal use).

### 1.2 HeadTTS: primary recommendation
- Repo: https://github.com/met4citizen/HeadTTS. License **MIT** [V]. Deps: transformers.js / onnxruntime (Apache-2.0) and the Kokoro weights (Apache-2.0). It **avoids eSpeak/GPL** [V]. CDN examples reference v1.3. There are no GitHub releases and ~55 commits, so it is small but maintained by the TalkingHead author.
- Model: `Kokoro-82M-v1.0-ONNX-timestamped` (a Kokoro build that exposes predicted durations).
- Two modes [V]:
  - **In-browser** (`headtts.mjs`): runs in a Web Worker on **WebGPU** or WASM. Electron's Chromium has WebGPU on macOS, so this works in the renderer with no server.
  - **Node server** (`headtts-node.mjs`, Node 20+): WebSocket and REST APIs, on WebGPU or CPU. Could run in an Electron `utilityProcess`.
- Output [V]: WAV or raw PCM16, plus `words, wtimes, wdurations, visemes, vtimes, vdurations, phonemes`. It is designed to be passed straight into `speakAudio`.
- Speed on MacBook Air M2 [V, self-reported]:
  - WebGPU fp32 in Chrome: RTF **0.23**.
  - Node WebSocket WebGPU: **0.15**.
  - WASM q4: **1.46**, slower than real time. **WebGPU is mandatory**; don't ship the WASM path as the main path.
- Caveats [V]:
  - English only.
  - REST input is capped at 500 chars, so split into sentences anyway.
  - The first model load is long and memory-heavy. Pre-warm at app launch and run a throwaway synth.
  - Node WebGPU is single-thread.
  - Intel Macs may need an older `onnxruntime-node` pin. Irrelevant on Apple Silicon.
- Naturalness: Kokoro is the best quality-per-parameter open TTS. It is very clean, but prosody is "audiobook narrator", not conversational. It has no laughs or breaths.
  - **Voice choice matters** [M]. The female `af_heart` (grade A) and `af_bella` are the strongest voices. US male voices (`am_michael`, `am_fenrir`, `am_puck`) are noticeably weaker, about grade C+. British `bm_george` and `bm_fable` work well for a "senior partner" feel.
  - Audition voices before locking the interviewer persona.
- Integration sketch:
  ```js
  // renderer
  const tts = new HeadTTS({ endpoints: ["webgpu"], languages: ["en-us"], voices: ["bm_george"] });
  await tts.connect();                     // pre-warm at launch
  head.streamStart({ sampleRate: 24000, lipsyncType: "visemes", waitForAudioChunks: true });
  for await (const sentence of sentencesFrom(claudeStream)) {
    const msg = await tts.synthesize({ input: sentence });  // {audio, words, wtimes, visemes, vtimes...}
    head.streamAudio(msg.data);           // or head.speakAudio(msg.data) per sentence
  }
  head.streamNotifyEnd();
  ```
  Check the exact method names against the HeadTTS README examples; it shows the `speakAudio` hand-off directly.

### 1.3 Other TTS candidates

| Engine | License | Size | Runtime on Mac | Naturalness | First-audio latency | Streaming | Timestamps for lip-sync | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Kokoro-82M via HeadTTS** | Apache/MIT | ~80 to 330 MB (q8 to fp32) | Browser WebGPU, or Node | Very good, narrator-ish | ~0.3 to 0.7 s per sentence | Sentence-level | **Yes, words + visemes** [V] | **Primary** |
| **kokoro-js** (hexgrad/kokoro `kokoro.js`, npm `kokoro-js` ~1.2.x) | Apache-2.0 | same | transformers.js, browser (WebGPU/WASM) or Node | same | same | **Yes**, `TextSplitterStream` feeds LLM tokens and yields audio per sentence [S] | **No** [S] | Fallback; lip-sync via HeadAudio or estimated words |
| **kokoro-onnx** (thewh1teagle) | MIT (uses espeak-ng, which is GPL) | ~300 MB fp32, ~90 MB int8 | Python sidecar | same | ~0.3 s | sentence | No (raw durations accessible with hacking) | Only if you already have a Python sidecar |
| **Kokoro Python (`kokoro>=0.9`) / Kokoro-FastAPI** (remsky) | Apache-2.0 | same | Python sidecar, **MPS supported via `./start-gpu_mac.sh`** (not Docker) [V] | same | <1 s on M3 Pro CPU [V] | Yes | **Yes**, `POST /dev/captioned_speech` gives word timestamps, streaming or not [V] | Good fallback if you want a sidecar with word timings |
| **sherpa-onnx** (k2-fsa), `sherpa-onnx-node` | Apache-2.0 | Kokoro / Piper / Matcha models | **Prebuilt Node addon for darwin-arm64**; also WASM [V] | Kokoro voice = same; Piper/VITS = robotic-ish | fast (CPU) | Callback-per-chunk generation [M] | No word timestamps [M] | Solid native fallback; one lib for TTS **and** STT (Parakeet, Whisper, streaming zipformer) |
| **Piper** (rhasspy, now OHF-Voice/piper1-gpl) | **GPL-3** for new piper1; old Piper MIT | 20 to 60 MB | CPU, any | Clearly synthetic | ~100 ms | yes | Phoneme durations internally; no official word API | Too robotic for "lifelike" |
| **Kyutai Pocket TTS** (Jan 2026, v1.0.x) | MIT [S] | 100M params | CPU, **~200 ms first chunk, ~6x real time on M4 Air, 2 cores** [S]; community ONNX/browser ports | Very natural, voice cloning | ~200 ms | **Yes, true streaming** | Not documented [S] | Strong "more lifelike" upgrade; pair with HeadAudio |
| **Kyutai TTS 1.6B (DSM)** | CC-BY-4.0 weights [M] | 1.6B | MLX via `moshi-mlx` [M] | Excellent, conversational | ~0.2 to 0.4 s | Yes, true streaming | **Emits word timestamps natively** [M] | Worth a spike if HeadTTS sounds too flat; Python sidecar |
| **Sesame CSM-1B** | Apache-2.0 | 1B (+Llama tokenizer) | `mlx-audio` (`mlx-community/csm-1b`) [S] | Most conversational, but unstable without context audio | 1 to 2 s on Mac | Partial | No | Overkill and slow; skip for v1 |
| **Orpheus 3B** | Apache-2.0 (Llama "Built with" attribution) | 3B | MLX/llama.cpp (GGUF) | Very good, emotive tags (`<laugh>`, `<sigh>`) | ~0.5 to 1 s on M-Max, slower on base M | Yes (SNAC frames) | No | Too heavy for a laptop alongside Whisper |
| **Chatterbox / Chatterbox Turbo** (Resemble AI) | MIT, outputs carry Perth watermark | 500M / Turbo 350M | PyTorch MPS; Turbo claims sub-200 ms and `[laugh]` tags [S] | Very good, cloning | ~0.3 to 1 s | yes | No | Good cloning option, Python sidecar |
| **Qwen3-TTS** (Jan 2026) | Apache-2.0 [S] | 0.6B / 1.7B | `mlx-audio` [S] | Claimed ElevenLabs-class [S] | 97 ms first packet (GPU, vendor) [S] | yes | No | Promising; Mac perf unverified |
| **F5-TTS / StyleTTS2 / XTTS-v2** | F5: CC-BY-NC weights; StyleTTS2: MIT; XTTS: **CPML non-commercial, Coqui defunct** | 300M to 1B | Python, slow on MPS | Good | 1 to 3 s | XTTS yes, F5 no | No | Superseded by Kokoro/Chatterbox/Pocket TTS; skip |
| **macOS AVSpeech Premium/Enhanced voices** (Siri-quality "Zoe/Ava Premium", Personal Voice) | System, free | 0 (download in Settings) | `AVSpeechSynthesizer` (Swift helper) or Chromium `speechSynthesis` | Good (Premium); below Kokoro | ~100 ms | yes | **Yes**: word-boundary callbacks (`willSpeakRangeOfSpeechString`; Web Speech `onboundary`) | **Pitfall:** Web Speech audio is played by the OS, so you **can't get the PCM** into TalkingHead's audio graph. You'd need a Swift helper using `AVSpeechSynthesizer.write(_:toBufferCallback:)` and word callbacks. Emergency fallback only. |

**Lifelike ranking for this use case** (subjective, from community consensus [S]):
1. CSM, Orpheus, Kyutai, Qwen3-TTS, and Chatterbox are the most human. They are all GPU-hungry Python sidecars without lip-sync timestamps (Kyutai DSM excepted).
2. Pocket TTS and Kokoro come next. Kokoro is the best *in-JS* option and the only one with a turnkey TalkingHead path.

**Decision:** ship Kokoro via HeadTTS tonight. If the voice feels too flat, the upgrade path is a Python sidecar (`mlx-audio` or Pocket TTS) that streams PCM, with lip-sync from **HeadAudio**, without changing the avatar code.

### 1.4 Lip-sync without timestamps: HeadAudio
- https://github.com/met4citizen/HeadAudio, **MIT** [V]. Very new (2 commits at the time of research).
- An AudioWorklet that downsamples to 16 kHz, computes MFCCs, and classifies Oculus visemes with a Mahalanobis/Gaussian-prototype classifier. It ships a pre-trained model and can retrain on HeadTTS voices.
- ~50 ms end-to-end; the authors suggest delaying speech 50 to 100 ms to align [V].
- The authors say it is **less accurate than text-driven lip-sync** and "far from optimal" at low SNR [V]. Clean TTS audio is the best case for it.
- Wiring: connect TalkingHead's speech gain node to the HeadAudio node, set `onvalue` to write blendshapes, and call `update()` per frame.
- Other approaches people use:
  - Rhubarb Lip Sync (MIT, offline, needs the full clip, so it is not streaming).
  - Wav2Lip and SadTalker (2D video, irrelevant for a 3D head).
  - NVIDIA Audio2Face (closed, CUDA).
  - Forced alignment (whisper word timestamps on the TTS output). This is wasteful when HeadTTS already provides timings.

---

## 2. Local speech-to-text

### 2.1 Options

| Engine | License | Mac runtime | Accuracy (English) | Speed | Streaming partials | Vocabulary biasing | Integration |
|---|---|---|---|---|---|---|---|
| **whisper.cpp** large-v3-turbo (809M; q5_0 ~550 MB, q8 ~870 MB) | MIT | Metal + optional Core ML encoder on ANE | ~WER 2 to 4% clean; strong numerals and punctuation | 10 s audio in ~0.3 to 0.8 s on M-series (Metal) [M] | Pseudo: sliding window (`stream` example) | **`initial_prompt`** (≤224 tokens) [V] | Node: **`whisper-cpp-node`** (prebuilt darwin-arm64 Metal, optional Core ML, Jan to Mar 2026 releases) [S]; **`smart-whisper`** (Metal out of the box, model manager, auto offload; ~12 months since last release) [S]; `nodejs-whisper` shells out to a compiled CLI (works, clunkier). |
| **faster-whisper** (CTranslate2) | MIT | **CPU only on Mac** (no Metal/MPS in CTranslate2) [M] | same models | Slower than whisper.cpp/MLX on Mac | via `whisper_streaming` / WhisperLive | prompt + hotwords | Python sidecar. **Not recommended on Mac.** Use `mlx-whisper` or `lightning-whisper-mlx` if you go Python. |
| **transformers.js Whisper / Moonshine** (renderer, WebGPU) | Apache-2.0 / MIT | WebGPU in Electron | turbo same as above | turbo on WebGPU ~1 to 2 s per 10 s [M]; Moonshine-base very fast | Moonshine designed for it | Whisper prompt support in transformers.js is limited [S] | Zero native modules, but competes with HeadTTS for the GPU and ~1.6 GB of fp16 turbo weights in the renderer. Good no-native-module fallback. |
| **Moonshine Voice** (moonshine-ai, Feb 2026) | **MIT** (English and streaming models; legacy non-English models are non-commercial) [V] | Python, JS/WASM, iOS/macOS, C API [V] | Small Streaming 123M: WER 7.84%; Tiny Streaming 34M: 12.0% [S] | very low latency, true streaming encoder | **Yes**, native partials [S] | No | Good for live captions; less accurate than turbo for finals |
| **NVIDIA Parakeet TDT 0.6B v2 (EN) / v3 (25 langs)** | CC-BY-4.0 | MLX (`parakeet-mlx`), Core ML/ANE (FluidAudio, Swift), ONNX via sherpa-onnx | Top of Open ASR leaderboard class; v3 avg WER ~6.3 vs turbo ~7.8 on that leaderboard [S]; outputs punctuation, caps, numerals | ~10x faster than turbo [S] | FluidAudio has streaming/EOU variants [S] | No prompt (sherpa-onnx hotwords only for some transducers) | `sherpa-onnx-node` (prebuilt arm64) loads Parakeet ONNX. **Best fallback.** |
| **Apple SFSpeechRecognizer** | System | On-device mode | Mediocre; 1-min limit per request historically [M] | fast | Yes | `contextualStrings` | Legacy; skip |
| **Apple SpeechAnalyzer / SpeechTranscriber** (macOS 26 "Tahoe"+) | System, free | ANE | Beat Whisper Small on LibriSpeech (2.12% vs 3.74% WER clean) [S]; not compared vs turbo | ~3x Whisper Small [S] | **Yes**, volatile + final results | custom vocabulary / `AnalysisContext` contextual strings [M] | Needs a **Swift helper binary** (stdin/stdout NDJSON) spawned from Electron main. Model assets download on first use. macOS 26+ only. |

### 2.2 Financial jargon and numbers
- Whisper large-v3/turbo normally writes "$184 million pre-money", "48.2% CAGR", and "4.1x ARR" as digits and symbols. Small models and Parakeet sometimes spell out ("four point one times") [M].
- **Do this:**
  1. Pass an `initial_prompt` written in the *style* you want: "Private equity case interview. Revenue $184M, 48.2% CAGR, 4.1x ARR, EBITDA margin 22%, LTV/CAC, IRR, MOIC, pre-money, post-money, TAM, churn, NRR, cohort, take-private, LBO, bps." Whisper imitates the prompt's formatting and vocabulary [V: prompt support; S: style effect].
  2. Add a ~30-line deterministic post-normalizer for the display transcript: "x" multiples, "bips" to "bps", "mil" to "M", "percent" to "%", and "point" between digits.
  3. Remember **Claude is the consumer**. It handles "one eighty-four million" fine, so STT formatting mostly matters for the displayed transcript and scoring rubric, not comprehension.
- Mishearing risk is in acronyms (ARR/"ARE", MOIC/"Moik", NRR). The prompt fixes most of these. Parakeet can't be prompted, which is the main reason Whisper is primary.
- **Test plan:** record 20 of your own answers with dense numbers. Run turbo with and without the prompt, and Parakeet v2. Measure numeric-token accuracy. It takes about 30 minutes and settles the choice.

### 2.3 Live partial transcript
- **Simplest:** while VAD says "speaking", every ~700 ms run whisper.cpp `base.en` (~140 MB, ~50 ms per window on Metal) on the current utterance buffer. Display it greyed. When the turn ends, run turbo once on the full utterance and replace the text.
  - It uses one binding and two models, with no streaming-ASR complexity.
  - `ponytail:` this re-transcribes the whole growing buffer, which is O(n²) over a long answer. Cap the window to the last ~15 s for partials if answers run long.
- Upgrades: Moonshine streaming, or SpeechAnalyzer volatile results, for true incremental partials.

---

## 3. VAD and turn-taking

### 3.1 @ricky0123/vad-web
- https://github.com/ricky0123/vad, ISC/MIT-style license (check the LICENSE file). Version `0.0.31` was referenced by the current README, with `onnxruntime-web@1.22`. Ships `silero_vad_v5.onnx` and **`silero_vad_v6.onnx`** [V].
- Defaults [V]:
  - `positiveSpeechThreshold` 0.3
  - `negativeSpeechThreshold` 0.25
  - `redemptionMs` **1400**
  - `preSpeechPadMs` 800
  - `minSpeechMs` 400
- Callbacks [M, check the docs]: `onSpeechStart`, `onSpeechRealStart`, `onSpeechEnd(Float32Array@16k)`, `onVADMisfire`, `onFrameProcessed({isSpeech})`.
- `onSpeechEnd` hands you 16 kHz Float32 audio, which is exactly whisper.cpp's input format.
- **Electron:** self-host the assets. Copy `vad.worklet.bundle.min.js`, the `.onnx` models, and the `ort-wasm*.wasm` files into the app and set `baseAssetPath` / `onnxWASMBasePath` to local paths. A CDN is not an option offline, and `file://` and CSP need `wasm-unsafe-eval`.

### 3.2 Not cutting off a thinking candidate
Case interviews are pathological for VAD: "So revenue is... [3 s of mental math] ...about 184 million."

Layered approach:
1. **Silero segments speech.** Keep VAD segments short-ish (`redemptionMs` ~600 to 800 ms) but **don't treat VAD end as turn end**. Accumulate segments into the "current turn".
2. **Smart Turn v3.2** (Pipecat, **BSD-2**, ONNX, 8 MB int8 / 33 MB fp32; ~20 to 36 ms on Apple CPU; ~93% accuracy) [S]. Run it on the last ≤8 s of turn audio at each VAD pause.
   - If P(complete) > 0.7 after ≥500 ms of silence, end the turn.
   - Otherwise keep listening. It reads intonation (trailing "...and so" vs a falling "that's my answer"). Run it with `onnxruntime-web` in the renderer, since vad-web already loads ORT, or with `onnxruntime-node`.
   - HF: `pipecat-ai/smart-turn-v3`. CoreML and ONNX re-exports exist.
3. **Hard ceiling:** after 3.5 to 5 s of silence, end the turn regardless.
4. **Explicit signals:** spoken cue words ("that's my answer", "done") checked on the partial transcript. Also a **hotkey (Enter) "I'm done"**, and a visible countdown ring when silence passes ~1.5 s so the candidate knows the AI is about to jump in.
5. **"Thinking" mode:** if the candidate says "let me take a minute", suspend auto-end until speech resumes. A real interviewer would wait silently too.
6. **Push-to-talk fallback:** hold Space to talk. It bypasses all of the above. Make it a settings toggle, and the default if VAD misfires in a noisy room.

### 3.3 Barge-in (candidate interrupts the avatar)
1. Open the mic with `getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}})`. Chromium's AEC3 uses the page's own WebAudio output as the reference. Because TalkingHead plays through the same renderer's AudioContext, echo is mostly cancelled [M]. Still raise `positiveSpeechThreshold` to ~0.6 while the avatar talks, and require ≥250 ms of speech (`onSpeechRealStart`) before interrupting.
2. On interrupt:
   - `head.streamInterrupt()` (or `head.stopSpeaking()`).
   - `abortController.abort()` on the Claude stream.
   - Drop queued TTS sentences.
   - Record in history what the avatar actually said up to that point (keep the per-sentence text you sent) so Claude's context is truthful.
3. A keyboard interrupt (Esc) is always available. Headphones remove echo entirely; recommend them in the UI.

---

## 4. Reusable voice-agent stacks

| Project | What | License | Claude support | Fit |
|---|---|---|---|---|
| **Pipecat** (pipecat-ai/pipecat) | Python framework covering transport, VAD, STT, LLM, TTS, and turn detection | BSD-2 | **Yes**, `AnthropicLLMService` [M] | Best-in-class reference. Using it means a Python sidecar plus a WebRTC/WebSocket transport to the renderer. |
| **kwindla/macos-local-voice-agents** | Pipecat on macOS: Silero + Smart Turn + **MLX Whisper** + local LLM + **Kokoro via mlx-audio**; **<800 ms voice-to-voice** claimed [S]. Last push ~Aug 2025. | BSD-2 (check) | Swap Gemma/LM Studio for `AnthropicLLMService` | **Best blueprint.** Copy its turn logic and timings. If you want a Python sidecar, this is the closest drop-in. |
| **LiveKit Agents** | Python/Node agent framework, open turn-detector model, needs a LiveKit server (self-hostable) | Apache-2.0 | Yes, Anthropic plugin [M] | A server dependency for a single-user desktop app is too heavy. |
| **HF speech-to-speech** (huggingface/speech-to-speech) | Modular VAD→STT→LLM→TTS, MLX path on Mac (lightning-whisper-mlx, MeloTTS/Kokoro) | Apache-2.0 | via OpenAI-compatible LLM shim | A reference only. |
| **arietta-voice** | Moonshine + Kokoro + Silero + Smart Turn + MLX Gemma [S] | check | swap LLM | Good reference for a Moonshine + Smart Turn combination. |
| **Murmur** (hdt325/murmur) | **Electron**, local Whisper + local Kokoro + auto-listen, drives Claude Code [S] | unverified | Claude Code, not the API | Closest *Electron* analogue. Read its packaging and mic code. |
| **claude-voice**, **halo**, **voice-mcp** | CLI/Python whisper.cpp + Kokoro + Claude Code or MCP | various | Claude Code | Small references only. |
| **Ultravox** (fixie-ai) | Speech-in LLM (Llama/Gemma + Whisper encoder) | MIT | No (replaces the LLM) | Not applicable; we want Claude. |
| **Moshi** (Kyutai) | Full-duplex speech-to-speech model, MLX build | CC-BY / Apache | No (replaces the LLM) | Not applicable, but proves MLX real-time viability. |
| **Kyutai Unmute** | STT + TTS wrapper around any text LLM, word-timestamped TTS | MIT / CC-BY | Any OpenAI-compatible LLM (Claude via shim) | CUDA-oriented server; reference only. |
| **TalkingHead test app + HeadTTS** | The avatar author's own demo wiring of TTS, Whisper, and avatar | MIT | Uses OpenAI/Gemini in demos | **Directly reusable** for the avatar half. |

**Conclusion:** there is no turnkey "Electron + Claude + local Kokoro + TalkingHead" app. The cheapest path is to assemble **TalkingHead + HeadTTS + vad-web + whisper.cpp binding + `@anthropic-ai/sdk` streaming**: four libraries and roughly 400 to 600 lines of glue. Borrow turn-taking constants from kwindla's Pipecat demo.

---

## 5. Architecture (minimal)

```
Renderer (Chromium, WebGPU)                       Main / utilityProcess (Node)
------------------------------------------        -------------------------------
getUserMedia(AEC on)                               whisper-cpp-node (Metal)
 -> vad-web (Silero v6, ORT-wasm)                     base.en  -> partials
 -> Smart Turn v3.2 (ORT-web)                         turbo    -> final transcript
 -> 16k Float32 utterance  ---- IPC ----------->   @anthropic-ai/sdk messages.stream()
                                <--- IPC: partial/final transcript, Claude text deltas
sentence splitter on Claude deltas
 -> HeadTTS worker (Kokoro WebGPU)
 -> head.streamAudio({audio, visemes, vtimes, vdurations, words...})
TalkingHead (three.js) renders + plays
barge-in: VAD start while speaking -> streamInterrupt + IPC abort
```
- Keep the **Anthropic API key in main** (keychain via `safeStorage`), never in the renderer.
- Model files live in `app.getPath('userData')/models`. Download on first run with a progress UI, or bundle them via `extraResources`.

---

## 6. Pitfalls

**Electron packaging**
- Native addons (`whisper-cpp-node` / `smart-whisper` `.node` + `libwhisper*.dylib` + `ggml-metal.metal`/`.metallib`; `sherpa-onnx-node`; `onnxruntime-node`) must go in **`asarUnpack`** (e.g. `"**/*.node", "**/*.dylib", "**/*.metal*"`). Rebuild against Electron's ABI with `@electron/rebuild` unless the addon is N-API prebuilt (most of these are).
- Code-sign each unpacked dylib. With hardened runtime, unsigned dylibs fail to load (`code signature not valid`). electron-builder signs them if they are inside the app bundle. For personal use you can ad-hoc sign and skip notarization.
- The Metal shader file must sit where ggml looks for it (next to the dylib, or embedded via `GGML_METAL_EMBED_LIBRARY`). The prebuilt packages usually embed it. Verify in a packaged build, not just `electron .`.
- **Prefer WASM/WebGPU in the renderer for ONNX** (vad-web, Smart Turn, HeadTTS). There are no native modules to package. Copy the `ort-*.wasm` and `.mjs` files into the build. Vite/webpack love to rename or hash them, which breaks `onnxWASMBasePath`. Set CSP `script-src 'self' 'wasm-unsafe-eval'`.
- WebGPU: confirm `navigator.gpu` is available in your Electron version (≥ v28 is safe on macOS). Don't launch with `--disable-gpu`. `transformers.js` falls back to WASM silently and becomes 6x slower, so log `device` at startup.
- GPU contention: HeadTTS (WebGPU) and whisper turbo (Metal) both hit the GPU, and three.js renders too. They rarely overlap in time (TTS runs while the user isn't talking), but don't run turbo partials while the avatar speaks.

**macOS microphone permissions**
1. Add `NSMicrophoneUsageDescription` to `Info.plist` (electron-builder `mac.extendInfo`).
2. With hardened runtime, add `com.apple.security.device.audio-input` to **both** `entitlements` **and** `entitlementsInherit`. The **Helper (Renderer)** process opens the mic and uses the inherit plist. If it's missing there, macOS silently denies with no prompt [S].
3. Call `systemPreferences.askForMediaAccess('microphone')` in main before the renderer calls `getUserMedia`. Handle `session.setPermissionRequestHandler` to allow `media` for your own origin.
4. In dev (`electron .`), the permission is attributed to the terminal or Electron.app. Reset with `tccutil reset Microphone <bundle-id>` when testing prompts.

**Model download sizes (approximate)**

| Model | Size |
|---|---|
| Kokoro-82M timestamped ONNX | fp32 ~330 MB, q8 ~90 MB (+ voices ~0.5 MB each) |
| Whisper large-v3-turbo ggml | q5_0 ~550 MB / q8_0 ~870 MB (+ optional Core ML encoder ~1.2 GB) |
| Whisper base.en ggml | ~140 MB (q5 ~60 MB) |
| Silero VAD v5/v6 | ~2 MB |
| Smart Turn v3.2 | 8 MB int8 / 33 MB fp32 |
| **Total** | **~0.8 to 1.3 GB**. Download on first run from HF with resume and checksums. Don't put it in git. |
| Optional Parakeet v2 ONNX (int8) | ~650 MB |

**Behavioral**
- Kokoro mispronounces finance shorthand. Pre-normalize the TTS text: "$184M" to "184 million dollars", "4.1x" to "4.1 times", "bps" to "basis points", "LTV/CAC" to "L T V to CAC", "EBITDA" to "ee-bit-dah".
  - Better: instruct Claude to write speakable text and put symbols only in a separate on-screen "exhibit" channel. For example, ask for JSON or XML tags `<say>` vs `<show>`.
- Split TTS at sentence or clause boundaries from the stream; Kokoro intonation degrades on very short fragments [V for Kokoro-FastAPI note]. Use a ~6-word minimum for the first chunk and full sentences after.
- First-run warm-up: the first WebGPU TTS call and the first whisper Metal call each compile kernels (1 to 5 s). Run a dummy synth and transcription during the splash screen.
- Echo self-trigger: without headphones, the avatar's voice can trip VAD and cause self-interruption. Mitigate with AEC, the higher threshold while speaking, and the 250 ms minimum (section 3.3).

---

## 7. Build order for tonight
1. TalkingHead + HeadTTS standalone in the renderer: type text, the avatar speaks. This is the riskiest visual piece; it should take about an hour using the HeadTTS examples.
2. Claude streaming in main, sentence splitter, then HeadTTS, then `streamAudio`.
3. vad-web, then IPC, then whisper turbo final. Push-to-talk first; it's trivially reliable.
4. Auto turn-end (silence ceiling), then Smart Turn, partials, and barge-in.
5. Package with electron-builder, then verify the mic prompt, Metal, and WebGPU in the **packaged** app.

## Sources
- TalkingHead: https://github.com/met4citizen/TalkingHead
- HeadTTS: https://github.com/met4citizen/HeadTTS
- HeadAudio: https://github.com/met4citizen/HeadAudio
- Kokoro: https://github.com/hexgrad/kokoro · kokoro-js npm: https://pkgstats.com/pkg:kokoro-js
- Kokoro-FastAPI: https://github.com/remsky/Kokoro-FastAPI
- mlx-audio: https://pypi.org/project/mlx-audio/ · https://blaizzy.github.io/mlx-audio/models/stt/
- kokoro-coreml: https://huggingface.co/mattmireles/kokoro-coreml
- sherpa-onnx JS: https://k2-fsa.github.io/sherpa/onnx/javascript-api/install.html
- Pocket TTS: https://kyutai.org/tts/ · https://pypi.org/project/pocket-tts/
- Qwen3-TTS: https://www.sourcepulse.org/projects/23133865
- Chatterbox Turbo (secondary): https://tts.ai/voices/chatterbox-turbo/
- Open-source TTS overview 2026 (secondary): https://tts.ai/blog/open-source-text-to-speech-guide-2026/
- Moonshine: https://github.com/moonshine-ai/moonshine · https://petewarden.com/2026/02/13/announcing-moonshine-voice/ · https://arxiv.org/html/2602.12241
- Parakeet vs Whisper (secondary): https://whispernotes.app/blog/parakeet-v3-default-mac-model · https://github.com/anvanvan/mac-whisper-speedtest
- Apple SpeechAnalyzer benchmarks: https://www.gigazine.net/gsc_news/en/20260714-apple-speech-analyzer-benchmark/ · https://dev.to/iravoice/apple-speechanalyzer-vs-whispercpp-a-40-speaker-mac-benchmark-40i4
- whisper.cpp prompt: https://github.com/ggerganov/whisper.cpp/pull/1981.patch
- Node bindings: https://classic.yarnpkg.com/en/package/smart-whisper · https://cdn.jsdelivr.net/npm/whisper-cpp-node@0.2.12/README.md
- vad-web: https://github.com/ricky0123/vad · https://docs.vad.ricky0123.com/user-guide/algorithm/
- Smart Turn: https://reference-server.pipecat.ai/en/stable/api/pipecat.audio.turn.smart_turn.local_smart_turn_v3.html · https://huggingface.co/soniqo/Smart-Turn-v3.2-ONNX
- macOS local Pipecat agents: https://github.com/kwindla/macos-local-voice-agents
- Electron mic entitlements: https://bigbinary.com/blog/request-camera-micophone-permission-electron · https://electron-vite.org/guide/distribution
- Related local voice apps: https://github.com/aayushdebugging/claude-voice · https://github.com/VW3st/halo
