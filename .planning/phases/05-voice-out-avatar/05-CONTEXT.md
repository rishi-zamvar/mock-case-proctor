# Phase 5: Voice Out & Avatar - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning
**Mode:** Smart discuss, auto-accepted (the user asked Claude to choose the best path and not wait)

<domain>
## Phase Boundary

This phase replaces the renderer's fake speech queue with the real pipeline: HeadTTS (Kokoro-82M on WebGPU) produces audio, word timings and visemes, which feed TalkingHead's `speakAudio` on a 3D avatar in the Session stage.

It covers:
- a seq-ordered queue with an ack per sentence;
- cancellation by turn ID;
- idle, listening and thinking behaviour states;
- the WebGPU startup assertion and a fallback banner;
- engine warm-up during the review phase;
- choosing the voice by audition;
- E2E state assertions.

Main keeps sending `speak:sentence` events. Phase 3 already normalises their text with `speakable()`; verify that it does.

Out of scope:
- barge-in triggered by the mic (Phase 7);
- the Claude interviewer (Phase 6).
</domain>

<decisions>
## Implementation Decisions

### Engines
- **Packages.**
  - `@met4citizen/talkinghead@1.8.2`, pinned with `three@0.186.1` exactly.
  - `@met4citizen/headtts@1.3.0`, which uses `@huggingface/transformers ^4`.
- **Bundling.**
  - Vendor or import both modules so that nothing loads from a CDN.
  - TalkingHead's lipsync module is loaded through a computed dynamic import, which Vite breaks. Import `lipsync-en` statically and pass `lipsyncLang: 'en'` (the default is Finnish).
- **HeadTTS runtime.**
  - Run HeadTTS in a Web Worker on WebGPU (`device: 'webgpu'`, dtype per HeadTTS defaults for WebGPU).
  - First-run model download from the Hugging Face hub is acceptable for v1. It goes into the Chromium cache, and the CSP `connect-src` allows `https://huggingface.co` and `https://*.hf.co` (cdn-lfs).
  - Research whether the model and the ONNX/WASM assets can be served from `app://models/` instead. If that is cheap, do it, so the app works offline after the first run.
- **Startup checks.**
  - On startup (or at the first session), assert that `navigator.gpu` is present and that HeadTTS reports `webgpu`.
  - If it falls back to WASM, show a red banner: "Voice is running on CPU — replies will be slow".
  - Expose `ttsDevice` through `window.__e2e`.

### Avatar
- **Model.**
  - Use the TalkingHead sample avatar `avatarsdk.glb` (male), or `brunette.glb` (female) if the male voice is weak. The non-commercial licence is fine for personal use.
  - Vendor the GLB under `resources/assets/avatars/` and serve it through `app://bundle/assets/...` or the existing assets root.
  - Check the licence and record it in a `NOTICE` file.
  - If neither sample can be vendored, use any CC-licensed RPM-compatible GLB with ARKit and Oculus viseme blendshapes.
- **Framing.** Use the camera view `'upper'` (head and shoulders, Zoom-like), a neutral dark-studio background matching the tokens, and soft key lighting.
- **Behaviour states:**
  - `idle`: subtle breathing and blinks, eye contact.
  - `listening`: while the candidate is talking (the Talk button is active): occasional small nods and eye contact. No audio backchannels.
  - `thinking`: between the candidate stopping and the first audio: glances aside, a slight head tilt, plus a subtle "…" indicator in the UI.
  - `speaking`: lip-synced.

  Drive the states from ViewState and speech-queue events.
- **Lifetime.** One TalkingHead instance for the app's lifetime. Mount it once in a persistent stage container and move it between screens, or hide it, rather than destroying it.
- **Rendering.** Cap rendering at 30 fps (TalkingHead's `modelFPS` or similar), and pause rendering while the stage is hidden (for example during review with the deck shown).

### Speech queue
- `SpeechQueue` takes `{seq, turnId, text}` events from `onSpeak`. For each one it synthesises with HeadTTS, plays it via TalkingHead `speakAudio`, and calls `speak.ack(seq)` once playback ends.
- To cut the gaps between sentences, it pre-synthesises the next sentence while the current one plays.
- Sentences play strictly in seq order.
- `cancel(turnId)` stops current playback immediately (`head.stopSpeaking()`), drops queued items for that turn, and acks the dropped seqs as `{spoken:false}` so main knows what was actually said.
- Barge-in in Phase 7 reuses this cancel path.
- The AudioContext starts suspended. Resume it on the first user gesture (the Start button). Kokoro outputs 24 kHz; let TalkingHead or AudioContext resample.
- **Fake fallback.** Keep the existing fake queue as the T1 adapter, selected by a `TTS=fake` env flag that main passes in ViewState/config. The real queue is used when `TTS=headtts`. Default to `headtts` in dev and normal runs, and to `fake` in T1 E2E.

### Warm-up
- During the review phase (45 min, plenty of time), load the HeadTTS model and avatar in the background, then synthesise one silent warm-up sentence so the first real line is fast.
- The REVIEW_WARNING from Phase 4 becomes a spoken line ("Ten minutes left.") when real TTS is active.

### Voice choice
- Audition the Kokoro voices on 5 real interviewer-style lines that include numbers. Candidates: `bm_george`, `bm_lewis` (British male), `am_michael`, `am_fenrir` (US male), `af_heart` (female).
- Pick by naturalness. The research notes that Kokoro's US male voices are weak.
- Make the voice a single config value, and record the choice and the reasoning in the SUMMARY.
- Since a human can't listen overnight, the executor should prefer `bm_george`, or the voice HeadTTS docs recommend as highest quality. Generate the audition WAVs into `.planning/phases/05-voice-out-avatar/audition/` (gitignored if large) so Rishi can listen later.

### Testing
- Unit tests (jsdom) cover the queue's ordering, cancel and ack logic, with fake engines injected.
- A T2 E2E project, real TTS with the fake LLM, launches with `TTS=headtts` and checks:
  - after a sentence is spoken: `isSpeaking` became true, `visemeCount > 0`, and the canvas is not blank (sample a few pixels via `getImageData`, or check `toDataURL` entropy);
  - `ttsDevice === 'webgpu'`;
  - cancel stops playback and no audio follows (`isSpeaking` goes false within 200 ms, and no later sentence plays).

  The T1 suite keeps running on the fake queue. Add a `test:e2e:t2` script.
- A spike first (inside the first plan): prove that HeadTTS and TalkingHead work inside the Electron renderer under the CSP, from `app://`, before building the queue. If HeadTTS can't run in a worker under the CSP, record exactly why and adjust (for example a `blob:` worker-src).

### Claude's Discretion
- Internal structure (`src/renderer/src/avatar/`, `src/renderer/src/speech/`), how the GLB is served, the lighting and background details, and the exact mood mapping.
</decisions>

<code_context>
## Existing Code Insights
- `src/renderer/src/speech/fakeSpeechQueue.ts` (03-09) is the interface to match or replace. `App.tsx` wires `onSpeak` and `speak.ack`.
- The Session stage placeholder ("Interviewer" with a speaking ring) is in `src/renderer/src/screens/Session.tsx`. Phase 4 may edit Session.tsx in parallel. Coordinate by putting the avatar in its own component (`AvatarStage.tsx`) and touching Session.tsx minimally (one mount point).
- `src/main/compose.ts` selects adapters by env. Add `TTS=headtts|fake` there and pass the choice to the renderer through config.
- CSP: `src/shared/csp.ts` (needs `worker-src blob:`/`'self'`, `wasm-unsafe-eval` already, `connect-src` for HF).
- Research: `research/voice_pipeline.md` and `research/avatar_shell.md` (TalkingHead and HeadTTS integration, pitfalls), `.planning/research/STACK.md`.
</code_context>

<specifics>
## Specific Ideas
- It must feel interpersonal: a professional-looking partner on a video call.
</specifics>

<deferred>
## Deferred Ideas
- A suited avatar converted from Rocketbox (v2).
- A Python-sidecar TTS upgrade (v2).
</deferred>
