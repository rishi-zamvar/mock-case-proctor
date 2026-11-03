# Phase 5: Voice Out & Avatar - Research

**Researched:** 2026-11-03
**Domain:** In-renderer neural TTS (HeadTTS/Kokoro on WebGPU via transformers.js + onnxruntime-web) driving a three.js talking head (TalkingHead) inside a sandboxed Electron 45 renderer under a strict CSP
**Confidence:** HIGH. The core path was **spiked end-to-end on this Mac today** (Electron 45.2.1, from `app://`, under the project CSP with no `unsafe-eval`, fully offline). Every API claim below comes from the npm-packed source of the exact pinned versions.

## Summary

The full pipeline works in Electron 45 with **zero patches to HeadTTS or TalkingHead**. The spike ran HeadTTS in its own module worker on WebGPU, then TalkingHead (avatarsdk.glb, `cameraView:'upper'`) rendered and lip-synced. Results:
- RTF was about 0.17: 7.9 s of audio synthesised in 1.3 s.
- `connect()` took 1.6 s.
- Cancel (`stopSpeaking`) was synchronous: `isSpeaking` went false in 0 ms.

Getting there took three integration fixes that the existing research did not predict, and the planner must include all three:

1. **The `app://` handler must send `Content-Length`.** `net.fetch(file://)` returns no `content-length`. transformers.js's `readResponse` then grows its buffer chunk by chunk, which is O(n²). Loading the 326 MB fp32 model took **133 s without the header and 1.3 s with it** (measured).
2. **The CSP `connect-src` must include `blob:`.** three's GLTFLoader turns embedded GLB textures into `blob:` URLs and `fetch()`es them through ImageBitmapLoader. Without `blob:`, every texture is refused (reproduced).
3. **transformers.js fetches the ORT `.wasm` from jsDelivr by default.** That holds even on WebGPU: the default is `cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/`. HeadTTS doesn't expose `env`, so pass HeadTTS a 9-line **`transformersModule` shim**. It re-exports `transformers.min.js` and sets these before any session is created:
   - `env.backends.onnx.wasm.wasmPaths` set to the local ORT files;
   - `env.useWasmCache=false`, because otherwise ORT's glue is imported from a `blob:` URL that `script-src` would block;
   - `env.allowLocalModels` / `env.localModelPath` for local model files.

Load HeadTTS by **dynamic `import()` of an unmodified copy served as static files** (`/vendor/headtts/modules/headtts.mjs`), not through Vite. Its own `new URL('./worker-tts.mjs', import.meta.url)` and the worker's `import('./language-en-us.mjs')` and `../dictionaries` then all resolve naturally. The worker is a same-origin `app://` module worker, so no `blob:` worker is needed.

TalkingHead *can* go through Vite. Construct it with `lipsyncModules: []`, so its computed dynamic import never runs. Then assign `head.lipsync.en = new LipsyncEn()` from a static deep import (`@met4citizen/talkinghead/modules/lipsync-en.mjs`; the package has no `exports` map). HeadTTS always supplies visemes, so `speakAudio` never touches lip-sync anyway.

**Primary recommendation:**
- **Vendoring and serving:** vendor the HeadTTS, transformers and ORT runtime files into `src/renderer/public/vendor/` with a tiny Vite copy plugin (gitignored). Serve the model, the voices and the GLB from `resources/assets/` through a **same-origin** `app://bundle/res/*` route that sets `Content-Length`.
- **Playback and acks:** drive playback per sentence with `head.speakAudio(data)`, then `head.speakMarker(() => ack(seq))`. `stopSpeaking()` clears the speech queue, so the markers of cancelled sentences never fire. That is exactly the "spoken vs dropped" signal the queue needs.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Engines
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

#### Avatar
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

#### Speech queue
- `SpeechQueue` takes `{seq, turnId, text}` events from `onSpeak`. For each one it synthesises with HeadTTS, plays it via TalkingHead `speakAudio`, and calls `speak.ack(seq)` once playback ends.
- To cut the gaps between sentences, it pre-synthesises the next sentence while the current one plays.
- Sentences play strictly in seq order.
- `cancel(turnId)` stops current playback immediately (`head.stopSpeaking()`), drops queued items for that turn, and acks the dropped seqs as `{spoken:false}` so main knows what was actually said.
- Barge-in in Phase 7 reuses this cancel path.
- The AudioContext starts suspended. Resume it on the first user gesture (the Start button). Kokoro outputs 24 kHz; let TalkingHead or AudioContext resample.
- **Fake fallback.** Keep the existing fake queue as the T1 adapter, selected by a `TTS=fake` env flag that main passes in ViewState/config. The real queue is used when `TTS=headtts`. Default to `headtts` in dev and normal runs, and to `fake` in T1 E2E.

#### Warm-up
- During the review phase (45 min, plenty of time), load the HeadTTS model and avatar in the background, then synthesise one silent warm-up sentence so the first real line is fast.
- The REVIEW_WARNING from Phase 4 becomes a spoken line ("Ten minutes left.") when real TTS is active.

#### Voice choice
- Audition the Kokoro voices on 5 real interviewer-style lines that include numbers. Candidates: `bm_george`, `bm_lewis` (British male), `am_michael`, `am_fenrir` (US male), `af_heart` (female).
- Pick by naturalness. The research notes that Kokoro's US male voices are weak.
- Make the voice a single config value, and record the choice and the reasoning in the SUMMARY.
- Since a human can't listen overnight, the executor should prefer `bm_george`, or the voice HeadTTS docs recommend as highest quality. Generate the audition WAVs into `.planning/phases/05-voice-out-avatar/audition/` (gitignored if large) so Rishi can listen later.

#### Testing
- Unit tests (jsdom) cover the queue's ordering, cancel and ack logic, with fake engines injected.
- A T2 E2E project, real TTS with the fake LLM, launches with `TTS=headtts` and checks:
  - after a sentence is spoken: `isSpeaking` became true, `visemeCount > 0`, and the canvas is not blank (sample a few pixels via `getImageData`, or check `toDataURL` entropy);
  - `ttsDevice === 'webgpu'`;
  - cancel stops playback and no audio follows (`isSpeaking` goes false within 200 ms, and no later sentence plays).

  The T1 suite keeps running on the fake queue. Add a `test:e2e:t2` script.
- A spike first (inside the first plan): prove that HeadTTS and TalkingHead work inside the Electron renderer under the CSP, from `app://`, before building the queue. If HeadTTS can't run in a worker under the CSP, record exactly why and adjust (for example a `blob:` worker-src).

### Claude's Discretion
- Internal structure (`src/renderer/src/avatar/`, `src/renderer/src/speech/`), how the GLB is served, the lighting and background details, and the exact mood mapping.

### Deferred Ideas (OUT OF SCOPE)
- A suited avatar converted from Rocketbox (v2).
- A Python-sidecar TTS upgrade (v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOUT-01 | The interviewer speaks with a lifelike local voice that costs nothing to run (HeadTTS/Kokoro on WebGPU). Startup asserts WebGPU is in use and shows a banner if it falls back. | Spike-proven recipe (§Code Examples 1-3), three mandatory fixes (Content-Length, the ORT wasm shim, `connect-src blob:`), and the device-detection strategy (§Pattern 3; HeadTTS has no "connected device" field, so detect it by endpoint ordering). Voice grades are in §Voices. |
| VOUT-03 | A 3D talking-head avatar (TalkingHead.js) lip-syncs to the voice and has idle, listening and thinking behaviour. | Spike-proven TalkingHead constructor and `showAvatar`, the `speakAudio` + `speakMarker` ack pattern, and `stopSpeaking` semantics (§Pattern 2). Behaviour-state mapping uses TalkingHead's built-in `animEmojis` (`yes` nod, `🤔`) via `animQueue` (§Pattern 5). The canvas-readback recipe for E2E is in §Validation. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- macOS Apple Silicon, Node 22 dev / Electron 45 (Node 24 inside). A single machine.
- Voice and avatar run **local and free**. Claude is the only paid dependency.
- Latency target: the avatar's first audible word comes ≤ 3 s after the candidate stops talking, typically (Phase 7 measures this; Phase 5 must not add avoidable latency: warm-up plus pre-synthesis).
- Privacy: the API key never reaches the renderer or the logs. Interviewer materials are never candidate-visible. Phase 5 adds only renderer-side TTS. The speakable text is already leak-guarded in main.
- **TDD.** Every feature is covered by automated tests **and** a live E2E run in the real app.
- BDD-ish test naming and the existing conventions:
  - Vitest projects `main`/`renderer`;
  - Playwright `_electron` against the **built** `out/`;
  - `workers: 1`.
- Existing security rule (index.ts): never gate security on `is.dev` / `!app.isPackaged`.
- `compose.ts` is "the only module that constructs adapters or reads config env".
- `src/shared/ipc.ts` has NO runtime imports, because the sandboxed preload bundles it.
- Chromium honours only ONE `disable-features` switch; comma-join into the existing one (e2e.ts).

## Standard Stack

### Core
| Library | Version (verified `npm view`, 2026-11-03) | Purpose | Why |
|---------|---------|---------|-----|
| `@met4citizen/talkinghead` | 1.8.2 | Avatar, lip-sync, idle/gaze/mood | Locked. Its only dependency is `three ^0.186`. No `exports` map, so deep imports such as `modules/lipsync-en.mjs` work (verified by a Vite build). |
| `three` | **0.186.1** exact | Renderer for TalkingHead | Locked. Has `"./addons/*": "./examples/jsm/*"`, which TalkingHead's imports need. |
| `@met4citizen/headtts` | 1.3.0 (published 2026-04-03) | Kokoro TTS plus words/visemes/timings | Locked. Its dependencies are `@huggingface/transformers ^4.0.0` and `ws`. Postinstall runs a harmless `mkdir`. |
| `@huggingface/transformers` | **4.3.2** (pin exact) | Inference runtime loaded inside the HeadTTS worker | The latest that satisfies `^4`. Only `dist/transformers.min.js` (self-contained, ORT bundled) is used. Pin it exactly, because the vendored ORT wasm must match its bundled ORT version. |
| `onnxruntime-web` | **1.31.0-dev.20260914-8d85527a0** (transitive; pinned exactly by transformers 4.3.2) | Supplies `ort-wasm-simd-threaded.asyncify.{mjs,wasm}` (53 KB + 26.9 MB) | transformers.min.js's bundled ORT reports `versions.web = 1.31.0-dev.20260914-8d85527a0` (grepped). The wasm must be this exact build. |

**Install all four as `devDependencies`.** The renderer is fully bundled by Vite, and the vendored runtime is copied at build time. If they were in `dependencies`, electron-builder would ship `@huggingface/transformers`' `sharp` and `onnxruntime-node` (native, about 100 MB+) inside the `.app` (`npmRebuild:false`, `asarUnpack **/*.node`).

```bash
npm i -D --save-exact @met4citizen/talkinghead@1.8.2 three@0.186.1 @met4citizen/headtts@1.3.0 @huggingface/transformers@4.3.2
npm i -D --save-exact @types/three@0.186   # optional; check `npm view @types/three versions`. TalkingHead ships no types, so add a small local .d.ts
```

### Model and assets (not npm)
| Asset | Size | Source | Licence |
|-------|------|--------|---------|
| `onnx-community/Kokoro-82M-v1.0-ONNX-timestamped`: `config.json`, `tokenizer.json`, `tokenizer_config.json`, `onnx/model.onnx` (fp32) | 325.5 MB | `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/resolve/main/...` (34 s download here) | Apache-2.0 |
| Voices `<name>.bin` (one per voice) | 522,240 bytes each | `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/<name>.bin` (HeadTTS default `voiceURL`). **Plain `fetch`, not cached by transformers.js.** | Apache-2.0 |
| `avatarsdk.glb` | 12.28 MB | `https://raw.githubusercontent.com/met4citizen/TalkingHead/<tag-or-sha>/avatars/avatarsdk.glb`. **Not in the npm package**; only the repo has it. | "created at AvatarSDK for non-commercial use" (TalkingHead README §licenses). It wears a **"METAPERSON AVATARS" branded T-shirt** (seen in the spike screenshot). |
| `brunette.glb` | 4.72 MB | same repo, `avatars/brunette.glb` | Ready Player Me, **CC BY-NC 4.0** |
| `mpfb.glb` | 36.8 MB | same repo | **CC0** (the only permissive sample) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local `app://bundle/res/models/` | First-run HF download into Cache Storage | Every E2E launch gets a **fresh `USER_DATA_DIR`** (`tests/e2e/launch.ts`), so the Cache Storage is empty and each T2 run would re-download 326 MB. Voices aren't cached by transformers either. Use local files; keep HF only as the remote fallback in dev. |
| HeadTTS `workerModule` (blob worker) | Default `new URL('./worker-tts.mjs', import.meta.url)` worker | A blob worker inherits the document CSP and needs absolute `dictionaryURL`/`voiceURL` (its base URL is `blob:`). The same-origin module worker is simpler and spike-proven. |
| `speakAudio` queue | `streamStart`/`streamAudio` streaming mode | Streaming only pays off for chunked PCM. `speakAudio` already queues, and `speakMarker` gives per-sentence callbacks. |

## Architecture Patterns

### Recommended Project Structure
```
src/renderer/src/
├── speech/
│   ├── fakeSpeechQueue.ts      # existing T1 adapter (keep)
│   ├── speechQueue.ts          # pure: ordering, pre-synth, cancel, acks; engines injected (TDD)
│   ├── speechQueue.test.ts
│   ├── headtts.ts              # loads /vendor/headtts via dynamic import, connect + device detection, synth()
│   └── tf-shim.mjs             # copied to public/vendor/headtts/ by the Vite plugin
├── avatar/
│   ├── avatarEngine.ts         # module singleton: TalkingHead on a detached div, showAvatar, setState(idle|listening|thinking|speaking), pause/resume
│   ├── AvatarStage.tsx         # appendChild(engine.el) on mount, remove + engine.pause() on unmount
│   └── behaviour.ts            # pure state→actions map (unit-testable)
├── vendor.d.ts                 # minimal types for TalkingHead / HeadTTS
src/renderer/public/vendor/     # GITIGNORED, produced by the copy plugin
│   ├── headtts/modules/{headtts,worker-tts,utils,language,language-en-us}.mjs
│   ├── headtts/dictionaries/en-us.txt   (2.8 MB)
│   ├── headtts/tf-shim.mjs
│   ├── tf/transformers.min.js           (588 KB)
│   └── ort/ort-wasm-simd-threaded.asyncify.{mjs,wasm}
resources/assets/
│   ├── avatars/avatarsdk.glb   # committed (12 MB) or fetched by script; NOTICE alongside
│   └── models/...              # GITIGNORED (`models/` already in .gitignore); fetched by scripts/fetch-voice-model.sh
```
electron-builder already has `asarUnpack: ["resources/**"]`. `files` excludes `src/*`, but `out/renderer` (which receives the copied public dir) ships. [MEDIUM: the electron-vite 6 renderer root is `src/renderer`, so the default `publicDir` is `src/renderer/public`. Verify with one build: `ls out/renderer/vendor`.]

### Pattern 1: Serve everything the renderer and worker fetch from the **same origin** with `Content-Length`
The `assets` root today is a *different origin* (`app://assets`). The app scheme has no `corsEnabled` privilege, so a fetch from `app://bundle` to `app://assets` will be refused. Add a same-origin route, a sibling of the case-PDF route, that maps `app://bundle/res/<path>` to `resources/assets/<path>`, reusing `resolveSafePath`. Then set `Content-Length` in `serve()` for **all** files:
```ts
// appProtocol.ts serve(): net.fetch(file://) has NO content-length (spike: headers were only content-type + last-modified)
const { size } = await stat(file)            // node:fs/promises
headers.set('Content-Length', String(size))
```
Dev (`electron-vite dev`, renderer at `http://localhost`): add an 8-line `configureServer` middleware in electron.vite.config.ts that serves `/res/*` from `resources/assets` with `resolveSafePath` + `Content-Length`. Or accept HF-remote models in dev and keep the GLB in the public dir. The planner picks one; E2E and normal runs use the built app.

### Pattern 2: Per-sentence playback with marker acks (spike-proven)
```ts
// Source: talkinghead.mjs 1.8.2 speakAudio L3106, speakMarker L3019, startSpeaking L3311, stopSpeaking L3508
head.speakMarker(() => onStart(seq))   // fires when the queue reaches this sentence (metrics/state)
head.speakAudio(msg.data)              // {words,wtimes,wdurations,visemes,vtimes,vdurations,audio:AudioBuffer}; pushes item + {break:300}
head.speakMarker(() => ack(seq, true)) // fires after audio end + 300 ms break (spike: 5.07 s audio → end marker at +5.38 s)
// cancel(turnId):
head.stopSpeaking()                    // sync: stops source, clears speechQueue (incl. pending markers) → isSpeaking=false at 0 ms (spike)
// → markers of cancelled sentences NEVER fire (spike: cancelEndFired=false); the queue acks those seqs spoken:false itself
```
- `speakAudio` with `r.visemes` present **bypasses lip-sync modules entirely** (source L3138: the text→viseme path runs only `if (!r.visemes)`).
- `startSpeaking` returns early when `!this.armature`. Speech queued before `showAvatar` resolves waits silently, so the speech queue must await avatar readiness.
- `speakAudio` reads `this.avatar.lipsyncLang`. Calling it before `showAvatar` throws, because `this.avatar` is undefined.
- **Caveat:** `stopSpeaking()` does **not** remove `'markers'`-template anim entries (it filters only viseme/subtitles/blendshapes). So use `speakMarker` (the speech-queue level), never `r.markers`/`mtimes` (the anim level), for acks.

### Pattern 3: HeadTTS connect plus device detection
HeadTTS 1.3.0 **has no "connected device" property**. It tries `endpoints` in order and sets `isConnected`. So detect the device by endpoint ordering:
1. `const adapter = await navigator.gpu?.requestAdapter()`. If it is null, skip to WASM straight away. This avoids the up-to-30 s worker connect timeout, because a WebGPU failure inside the worker surfaces only as a missing `ready` message.
2. `new HeadTTS({ endpoints: ['webgpu'], ... })`, then `await tts.connect()`. If it resolves, `ttsDevice = 'webgpu'`.
3. If it rejects ("HeadTTS connection failed: ..." is thrown because no `onerror` handler is set), call `await tts.connect({ endpoints: ['wasm'] })`, set `ttsDevice = 'wasm'`, and show the red banner.

### Pattern 4: AudioContext and autoplay
- Share one context: pass `audioCtx: head.audioCtx` to HeadTTS. HeadTTS `decodeAudioData`s the WAV (24 kHz) into an AudioBuffer at the context rate. The spike measured 44.1 kHz with no artefacts and needed no `pcmSampleRate` handling.
- `decodeAudioData` works while the context is suspended (spike: synthesis succeeded with `ctx.state==='suspended'`), so warm-up during review is fine.
- TalkingHead's `playAudio` calls `audioCtx.resume()` itself, and `head.start()` does too. In the spike the BrowserWindow had `webPreferences.autoplayPolicy: 'no-user-gesture-required'`, and the context went `suspended`→`running` without any gesture. **Recommend that flag** on the session window. It makes E2E deterministic and removes the "first line silent" pitfall. Additionally call `head.audioCtx.resume()` in the Start-button handler, per the locked decision. [Spike verified *with* the flag; not tested *without* it.]
- `head.stop()` **suspends the AudioContext** as well as stopping rAF (source L4309). That suits "pause while hidden"; `head.start()` resumes both.

### Pattern 5: Behaviour states (TalkingHead 1.8.2 built-ins)
| State | Trigger | Actions (all in-source) |
|-------|---------|------------------|
| idle | default / queue drained | `setMood('neutral')`, `makeEyeContact(ms)`. Breathing, blink and micro-moves come free from the mood templates. Option `avatarIdleEyeContact: 0.4` (default 0.2). |
| listening | `recording` (Talk active) | `makeEyeContact(2000)` plus a nod every ~4-7 s: `head.animQueue.push(head.animFactory(head.animEmojis['yes']))`. **Don't use `speakEmoji`**: it goes through `startSpeaking`, which sets `isSpeaking=true` / `stateName='speaking'` and would break the E2E assertions. |
| thinking | answer submitted → first `onStart` marker | `lookAt(x, y, 800)` aside (or `lookAhead`), plus `animQueue.push(animFactory(animEmojis['🤔']))`. The UI shows "…". |
| speaking | `onStart` marker → last ack | Automatic: `startSpeaking` does `lookAtCamera(500)`, `speakWithHands()` and visemes. |

`stateName` and `isSpeaking` are public fields on the instance. Keep the app-level state in `avatarEngine` (the source of truth for E2E), not by reading `head.stateName`.

### Pattern 6: One instance, moved, not destroyed
Create `TalkingHead` once on a detached `<div class="avatar-host">` inside a module singleton. `AvatarStage` does `ref.current.appendChild(host)` on mount and `head.start()`; on unmount it does `head.stop()`. TalkingHead's `ResizeObserver` on the host re-sizes the renderer and camera when the host is re-parented.

The constructor calls `renderer.setSize(node.clientWidth, node.clientHeight)`. Constructing on a 0×0 detached node gives a 0×0 canvas until the observer fires. That is fine, but call `head.onResize()` after attaching to be safe. Avoid `display:none` hosts while rendering.

### Anti-Patterns to Avoid
- **Importing HeadTTS through Vite.** Pre-bundling moves `headtts.mjs` into `.vite/deps` and breaks `new URL('./worker-tts.mjs', import.meta.url)`. In a build, `new URL(...)` copies the worker as an asset **without** its `./utils.mjs` / `./language-*.mjs` imports.
- **Using the default `transformersModule`.** It is the jsDelivr URL, and the CSP blocks it.
- **Using `r.markers` for acks.** They survive `stopSpeaking()`.
- **Constructing a TalkingHead per session.** It leaks WebGL contexts (TalkingHead has `dispose()`, L4822; the decision is one instance anyway).
- **`audioEncoding:'pcm'` into `speakAudio`.** TalkingHead then uses `pcmSampleRate` (default **22050**), not 24000, and the audio plays slowed. Use the default `'wav'`. Use PCM only for writing audition files.
- **Treating `synthesize()`'s promise as success.** It *resolves* with `{type:'error', data:{error}}` on failure. Check `m.type === 'audio'`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text→phonemes→visemes→timings | a G2P / viseme mapper | HeadTTS output (`visemes/vtimes/vdurations`) | Already aligned to the model's predicted durations. |
| Per-sentence "playback ended" | timers from `audio.duration` | `head.speakMarker(fn)` | Fires in queue order and is auto-cancelled by `stopSpeaking`. |
| Nod / thinking face | custom bone tweens | `head.animEmojis['yes']`, `['🤔']`, `['👀']` via `animFactory` → `animQueue` | Built in and blends with the mood templates. |
| WAV/24 kHz resampling | a resampler | `decodeAudioData` on the shared context (HeadTTS does it) | Spike-verified. |
| Model-file serving/caching | a custom IndexedDB cache | transformers.js `env.localModelPath` + the `app://bundle/res/` route | Two lines in the shim. |

## Runtime State Inventory
Not a rename/migration phase. Omitted.

## Common Pitfalls

### Pitfall 1: Model load takes 2+ minutes from `app://`
**What goes wrong:** `HeadTTS.connect()` takes about 135 s, and it looks like a hang or a "slow GPU".
**Why it happens:** the `net.fetch(file://)` response has no `Content-Length`. transformers.js `readResponse` reallocates and copies the whole buffer on every chunk.
**How to avoid:** set `Content-Length` from `fs.stat` in `appProtocol.serve` (measured: 133 s → 1.3 s). Add a unit test in `appProtocol.test.ts`.
**Warning signs:** the "Unable to determine content-length" warning from transformers; `connectMs` > 10 s.

### Pitfall 2: Avatar renders untextured / CSP "Refused to connect blob:"
**Cause:** GLTFLoader's ImageBitmapLoader `fetch()`es `blob:` URLs. **Fix:** add `blob:` to `connect-src` in `src/shared/csp.ts`. (`img-src blob:` is already present but irrelevant here.)

### Pitfall 3: ORT wasm fetched from jsDelivr (offline failure, CSP violation)
**Cause:** transformers.js sets `ONNX_ENV.wasm.wasmPaths` to the jsDelivr CDN at import time if it is unset. **Fix:** the shim overrides it after import (the default is set at module init and our assignment runs later, before any `from_pretrained`). Also set `useWasmCache=false`. Otherwise `loadWasmFactory` re-imports the ORT glue from a `blob:` URL (the Chrome-extension check `IS_CHROME_AVAILABLE` is false in Electron), and `script-src` lacks `blob:`.

### Pitfall 4: `new Function` in the ORT/embind glue
Both `transformers.min.js` and `ort-wasm-simd-threaded.asyncify.mjs` contain an embind `new Function(...)` (emval method caller). **The spike never hit it on the WebGPU path** under `script-src 'self' 'wasm-unsafe-eval'` (no `unsafe-eval`). If a future model or EP triggers it, the fix is a worker-scoped CSP: serve `worker-tts.mjs` with `'unsafe-eval'` added, since a module worker's CSP comes from its own response header. Don't relax the document CSP.

### Pitfall 5: Canvas reads blank in E2E
**Cause:** the WebGLRenderer uses the default `preserveDrawingBuffer:false`, and the first frames after `showAvatar` are not yet drawn (spike: 0 opaque samples immediately, 34,948 after 1.5 s). **Fix:** in one synchronous task, call `head.render()`, then `drawImage(head.renderer.domElement)` into an `OffscreenCanvas` 2D context, then `getImageData`. Poll for up to 5 s until the opaque fraction exceeds 5 %.

### Pitfall 6: `window.__e2e` cannot be extended from the renderer
**Verified:** contextBridge objects are frozen ("Cannot add property b, object is not extensible"). The renderer must publish its own global, for example `window.__voice = { get ttsDevice(), get isSpeaking(), visemeCount, opaqueFraction() }`, and only when `'__e2e' in window` (preload exposes `__e2e` only under `--e2e`). Spec code reads `window.__voice`. Note this as a deviation from "expose through `window.__e2e`".

### Pitfall 7: The worker dies, so the synth promise hangs forever
`worker-tts.mjs`'s `process()` does not catch `model(inputs)` throws. The worker's `onerror` then terminates it, and pending `synthesize` promises **never settle**. Wrap every synth in a timeout (for example `max(10 s, 0.5 × textLen × 80 ms)`). On timeout, reconnect (`tts.connect({…})` forces a reconnect) and ack that seq as `spoken:false`.

### Pitfall 8: Dev tooling chokes on vendored JS
ESLint (`eslint --cache .`) would lint the 588 KB `transformers.min.js`. Add `src/renderer/public/vendor/**` to the eslint `ignores` (eslint.config.mjs line 9), to `.prettierignore` and to `.gitignore`. tsconfig.web should not `include` it.

### Pitfall 9: The ack contract has no "spoken" flag
Today `speak.ack(turnId, seq)` uses `AckArgsSchema = z.tuple([string, int])`, and `runner.ack` just resolves a waiter (30 s `ackTimeoutMs`). The locked decision needs `{spoken:false}` for dropped seqs. Extend it to `ack(turnId, seq, spoken = true)`: update the tuple schema (`.optional()` 3rd boolean), the preload and `Api`. Phase 7 (VOUT-05) consumes it, so Phase 5 only needs to carry the flag through and have the runner record it (or ignore it).

### Pitfall 10: First synthesis after connect is slow (shader compile)
Spike: the first call (2 words) took 2.65 s; the next (17 words, 7.9 s of audio) took 1.31 s. The silent warm-up sentence during review is what makes the first real line fast. Don't skip it, and don't play it: synthesise it, then discard.

### Pitfall 11: Avatar branding
`avatarsdk.glb` wears a "METAPERSON AVATARS" T-shirt, which isn't Lead-Edge-partner-like. It's acceptable under the locked decision. `brunette.glb` (4.7 MB, CC BY-NC) is the alternative. Note the trade-off in the SUMMARY, since a suited Rocketbox avatar is v2.

## Code Examples

### 1. The `transformersModule` shim (spike-proven, offline, under the project CSP)
```js
// public/vendor/headtts/tf-shim.mjs. Passed as HeadTTS `transformersModule` (absolute URL)
export * from '../tf/transformers.min.js'
import { env } from '../tf/transformers.min.js'
env.backends.onnx.wasm.wasmPaths = new URL('../ort/', import.meta.url).href // loads ort-wasm-simd-threaded.asyncify.{mjs,wasm}
env.useWasmCache = false            // else ORT glue is imported from blob: (script-src blocks)
env.allowLocalModels = true
env.localModelPath = new URL('/res/models/', import.meta.url).href // → app://bundle/res/models/<model-id>/...
env.allowRemoteModels = true        // HF fallback when local files are absent (CSP connect-src already allows HF); set false in E2E to prove offline
```
HeadTTS needs these exports from it, all verified to exist in 4.3.2 `transformers.min.js`: `StyleTextToSpeech2Model, AutoTokenizer, Tensor, env, LogLevel`.

### 2. HeadTTS construction (spike-proven)
```ts
const url = '/vendor/headtts/modules/headtts.mjs'
const { HeadTTS } = await import(/* @vite-ignore */ url)   // NOT bundled: keeps its relative worker/language/dictionary URLs intact
const tts = new HeadTTS({
  endpoints: ['webgpu'],               // see Pattern 3 for wasm fallback
  audioCtx: head.audioCtx,             // share TalkingHead's context
  transformersModule: new URL('/vendor/headtts/tf-shim.mjs', location.href).href,
  voiceURL: new URL('/res/voices', location.href).href,   // default is HF; absolute, worker resolves vs self.location
  voices: [VOICE], defaultVoice: VOICE,
  splitSentences: false,               // main already splits; keep 1 sentence → 1 audio message
  // dtypeWebgpu: 'fp32' (default, recommended by README), dictionaryURL default '../dictionaries' works
})
await tts.connect()                    // spike: 1.6 s with Content-Length + local files
const [m] = await tts.synthesize({ input: text })   // resolves array; m.type 'audio' | 'error'
// m.data: { phonemes, words, wtimes, wdurations, visemes, vtimes, vdurations, audio: AudioBuffer, audioEncoding:'wav' }
```
- Worker startup timeout: 30 s, then 10 s between progress events (`headtts.mjs` connect).
- `tts.clear()` resolves all queued items with `{type:'error', data:{error:'Cancelled, clear method called.'}}`.
- An in-flight item's late result is dropped ("Item not found").

### 3. TalkingHead construction (spike-proven)
```ts
import { TalkingHead } from '@met4citizen/talkinghead'
import { LipsyncEn } from '@met4citizen/talkinghead/modules/lipsync-en.mjs'
const head = new TalkingHead(host, {
  ttsEndpoint: null, lipsyncModules: [], lipsyncLang: 'en',   // [] = constructor never runs the computed import()
  cameraView: 'upper', modelFPS: 30, avatarMood: 'neutral',
  avatarIdleEyeContact: 0.4, avatarSpeakingEyeContact: 0.7,
  // lighting knobs: lightAmbientIntensity (2), lightDirectIntensity (30), lightDirectColor (0x8888aa), lightSpotIntensity (0)
})
head.lipsync.en = new LipsyncEn()       // satisfies "import lipsync-en statically"; unused when visemes are supplied
await head.showAvatar({                 // spike: 75 ms from local, 12 MB
  url: '/res/avatars/avatarsdk.glb', body: 'M', avatarMood: 'neutral', lipsyncLang: 'en',
  retarget: { Neck:{z:-0.01,rx:-0.15}, Neck1:{z:-0.01,rx:-0.15}, Neck2:{z:-0.01,rx:-0.15},
              LeftShoulder:{rz:-0.3}, RightShoulder:{rz:0.3}, scaleToEyesLevel:1.0, origin:{y:-0.1} },
  baseline: { headRotateX:-0.04, eyeBlinkLeft:0.05, eyeBlinkRight:0.05 }   // from TalkingHead siteconfig.js 'AvatarSDK'
})                                      // showAvatar ends with setView(cameraView), setMood, start()
```
- `dracoEnabled` defaults to false (the gstatic CDN is never hit).
- The Meshopt decoder is inline WASM, which needs `'wasm-unsafe-eval'` (already in the CSP).
- `playback-worklet.js` is only fetched by `streamStart`, which we don't use.
- The background is transparent (`alpha:true`), so the host's CSS background (`--bg` token) shows through.
- Lighting is set via the constructor `light*` options or `head.setLighting(opt)`.

### 4. E2E probe (renderer side; only when `'__e2e' in window`)
```ts
Object.defineProperty(window, '__voice', { value: {
  get ttsDevice() { return engine.ttsDevice },             // 'webgpu' | 'wasm' | null
  get isSpeaking() { return head.isSpeaking },
  get spokenSeqs() { return queue.stats().spoken },         // [{turnId,seq,visemes,startedAt,endedAt}]
  get visemeCount() { return queue.stats().visemeCount },   // sum of msg.data.visemes.length actually played
  opaqueFraction() {                                        // one sync task: render + read
    head.render(); const c = head.renderer.domElement
    const g = new OffscreenCanvas(c.width, c.height).getContext('2d')!; g.drawImage(c, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0, k = 0
    for (let i = 3; i < d.length; i += 64) { k++; if (d[i] > 0) n++ } return n / k
  }
}})
```

### 5. Vite copy plugin (sketch, in electron.vite.config.ts `renderer.plugins`)
```ts
{ name: 'vendor-voice', buildStart() {
    const out = resolve('src/renderer/public/vendor'); const nm = resolve('node_modules')
    cpSync(`${nm}/@met4citizen/headtts/modules`, `${out}/headtts/modules`, { recursive: true, filter: (f) => !f.endsWith('headtts-node.mjs') })
    cpSync(`${nm}/@met4citizen/headtts/dictionaries/en-us.txt`, `${out}/headtts/dictionaries/en-us.txt`)
    cpSync(resolve('src/renderer/src/speech/tf-shim.mjs'), `${out}/headtts/tf-shim.mjs`)
    cpSync(`${nm}/@huggingface/transformers/dist/transformers.min.js`, `${out}/tf/transformers.min.js`)
    const ort = existsSync(`${nm}/@huggingface/transformers/node_modules/onnxruntime-web`) ? `${nm}/@huggingface/transformers/node_modules/onnxruntime-web` : `${nm}/onnxruntime-web`
    // guard: ORT dist version must equal transformers' pinned dependency
    const want = JSON.parse(readFileSync(`${nm}/@huggingface/transformers/package.json`,'utf8')).dependencies['onnxruntime-web']
    if (JSON.parse(readFileSync(`${ort}/package.json`,'utf8')).version !== want) throw new Error('onnxruntime-web version mismatch')
    for (const f of ['ort-wasm-simd-threaded.asyncify.mjs','ort-wasm-simd-threaded.asyncify.wasm']) cpSync(`${ort}/dist/${f}`, `${out}/ort/${f}`)
} }
```

### 6. Model fetch script (one-time, about 330 MB)
`scripts/fetch-voice-model.sh`: `curl -fL` the 4 model files into `resources/assets/models/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/{config.json,tokenizer.json,tokenizer_config.json,onnx/model.onnx}`, plus the voice bins (`bm_george bm_lewis am_michael am_fenrir af_heart`, 522 KB each) into `resources/assets/voices/`. Make it idempotent (skip when the size matches). T2 E2E must **fail loudly** if the files are missing; don't let it silently fall back to HF.

## Voices (Kokoro-82M v1.0, HF `hexgrad/Kokoro-82M` VOICES.md)

There are 54 voice bins in `onnx-community/Kokoro-82M-v1.0-ONNX/voices`. HeadTTS supports `language: 'en-us'` only (`fi` also exists). British voices are therefore phonemised with US G2P: a British timbre with US pronunciation.

| Voice | Target | Overall grade |
|-------|--------|---------------|
| af_heart | A | (the flagship; no grade listed on the page, commonly treated as the best) |
| af_bella | A | A- (HeadTTS `defaultVoice`) |
| am_fenrir / am_michael / am_puck | B | **C+** (the best male; `am_fenrir` is HeadTTS's README example male voice) |
| bm_george | B | C |
| bm_fable | B | C |
| bm_lewis | C | D+ |
| bf_emma | B | B- |

**Recommendation for the unattended run:** default to `bm_george` as locked. Record that `am_fenrir` and `am_michael` grade one notch higher (C+ vs C), so Rishi can switch the single config value after listening to the audition WAVs.

Audition generation: in a Playwright `@audition` spec against the built app:
1. Call `tts.setup({ audioEncoding: 'pcm' })`.
2. Synthesise the 5 lines per voice.
3. Return the PCM16 (24 kHz mono) bytes to Node.
4. Write each file with a 44-byte WAV header to `.planning/phases/05-voice-out-avatar/audition/<voice>-<n>.wav` (about 25 files × ~300 KB; gitignore the folder).
5. Restore `'wav'` afterwards.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| The research docs assumed `streamStart({sampleRate:24000})` | `speakAudio` + `speakMarker` per sentence, with the WAV decoded on the shared context | No sample-rate pitfall at all. |
| "HeadTTS may need a worker patch for `allowRemoteModels`/`localModelPath`" (avatar_shell.md §2.2) | Not needed: `transformersModule` can be our own shim that sets `env` | No HeadTTS fork. |
| "Vendor TalkingHead and patch `lipsyncGetProcessor`" (avatar_shell.md §1.1) | Not needed: `lipsyncModules: []` + `head.lipsync.en = new LipsyncEn()` | No TalkingHead fork; npm import through Vite works. |
| HF Cache Storage as the offline path | Local files via `app://bundle/res/` | Deterministic E2E with fresh userData. |

## Open Questions

1. **Is `autoplayPolicy: 'no-user-gesture-required'` strictly needed?**
   - Known: with it, the context resumes without a gesture (spike).
   - Recommendation: set it anyway (one line) and also resume on Start.
2. **What happens with the WASM fallback under the CSP?**
   - Not exercised: WebGPU was available.
   - The `wasm` endpoint uses the same ORT asyncify build and `dtypeWasm:'q4'`. That means a different model file (`onnx/model_q4.onnx`, 305 MB), which the fetch script won't have locally. It would come from HF (allowed by the CSP).
   - Recommendation: unit-test the banner logic with a fake engine. Accept WASM as an untested degraded path. Optionally add a T2 test that forces `endpoints:['wasm']` behind a `TTS_FORCE_WASM=1` debug flag.
3. **The dev-mode (`electron-vite dev`) asset route.**
   - The E2E and normal runs use the built `app://`.
   - Recommendation: the planner picks between the dev middleware and accepting HF models plus the GLB in `public/` for dev.
4. **REVIEW_WARNING as a spoken line.**
   - `REVIEW_WARNING` exists in `interviewMachine.ts`, but the runner doesn't emit a speak event for it yet; Phase 4 is in flight.
   - Recommendation: in main, when `TTS=headtts`, emit `speak:sentence` with the text "Ten minutes left." on the warning effect. Coordinate with the Phase 4 runner edits.
5. **How the renderer learns `TTS` mode.**
   - Recommendation: follow the existing `--e2e` precedent. Have `webPreferences.additionalArguments: ['--tts=headtts']` come from `compose` config, and have the preload expose it as a constant on `window.api` (e.g. `api.config.tts`).
   - `readConfig` currently **throws** for `TTS` values other than `fake`. Extend it to accept `headtts`, defaulting to `headtts` unless `E2E=1`, where the default stays `fake`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Electron | runtime | ✓ | 45.2.1 (project node_modules) | — |
| WebGPU (Metal) in the renderer **and in a dedicated worker** | VOUT-01 | ✓ (spike: `navigator.gpu` + adapter, RTF 0.17 inside the HeadTTS worker) | Chromium 156 | WASM q4 (slow, banner) |
| Network to huggingface.co | one-time model fetch | ✓ (326 MB in 34 s) | — | none needed after the fetch |
| raw.githubusercontent.com | one-time GLB fetch | ✓ | — | commit the GLB |
| Node | Vitest / scripts | ✓ | 22.20.0 | — |
| curl | fetch script | ✓ | system | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.1.0 (projects `main` node, `renderer` jsdom) + Playwright 1.64.1 `_electron` |
| Config file | `vitest.config.ts`, `playwright.config.ts` (testDir `tests/e2e`, workers 1, 60 s timeout) |
| Quick run command | `npx vitest run --project renderer src/renderer/src/speech src/renderer/src/avatar` |
| Full suite command | `npm test && npm run test:e2e` (T1, fakes) |
| T2 command (new) | `"test:e2e:t2": "electron-vite build && playwright test --grep @t2"`. Exclude `@t2`/`@audition` from `test:e2e`'s `--grep-invert`. |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOUT-01 | Queue plays in seq order; pre-synthesises next while current plays (synth(n+1) called before ack(n)) | unit (jsdom, fake tts + fake head) | `npx vitest run src/renderer/src/speech/speechQueue.test.ts` | ❌ Wave 0 |
| VOUT-01 | `cancel(turnId)` calls `stopSpeaking`, drops queued items, acks dropped seqs `spoken:false`, later seqs of that turn never play; other turns unaffected | unit | same | ❌ Wave 0 |
| VOUT-01 | synth error/timeout → ack `spoken:false`, queue continues | unit (fake timers) | same | ❌ Wave 0 |
| VOUT-01 | Device detection: no adapter → wasm + banner; webgpu connect reject → wasm + banner; success → 'webgpu', no banner | unit (fake HeadTTS factory) | `npx vitest run src/renderer/src/speech/headtts.test.ts` | ❌ Wave 0 |
| VOUT-01 | `readConfig` accepts `TTS=headtts|fake`; default headtts, `fake` when E2E=1 | unit (node) | `npx vitest run src/main/compose.test.ts` | ✅ (extend) |
| VOUT-01 | app:// serves `Content-Length`; `/res/*` path-safe (traversal refused) | unit (node) | `npx vitest run src/main/appProtocol.test.ts src/main/protocol.test.ts` | ✅ (extend) |
| VOUT-01 | CSP contains `connect-src … blob:` | unit | `npx vitest run src/shared` (csp test) | check / ❌ |
| VOUT-01 | Ack schema accepts optional `spoken` boolean | unit | `npx vitest run src/main/ipc.test.ts` | ✅ (extend) |
| VOUT-01 | Real app: `__voice.ttsDevice === 'webgpu'`; a sentence plays (`isSpeaking` true then false, ack received in IPC tap) | E2E T2 `@t2` | `npm run test:e2e:t2` | ❌ Wave 0 |
| VOUT-03 | Real app: after speaking, `visemeCount > 0`; `opaqueFraction() > 0.05` (polled ≤ 5 s) | E2E T2 | same | ❌ Wave 0 |
| VOUT-03 | Real app: cancel mid-sentence → `isSpeaking` false within 200 ms; no later seq for that turn starts in the next 2 s | E2E T2 | same | ❌ Wave 0 |
| VOUT-03 | Behaviour mapping: ViewState (recording / awaiting first audio / speaking / idle) → avatar state; listening never sets `isSpeaking` | unit (pure `behaviour.ts`) | `npx vitest run src/renderer/src/avatar` | ❌ Wave 0 |
| VOUT-03 | One instance across screen changes (construct count === 1 after home→session→reviewMode→home) | unit (mock engine) + E2E T2 assertion on a `__voice.instances` counter | both | ❌ Wave 0 |
| VOUT-01 | T1 suite still green on the fake queue | E2E T1 | `npm run test:e2e` | ✅ |
| — | Voice audition WAVs generated | E2E `@audition` (manual listening) | `electron-vite build && playwright test --grep @audition` | ❌ |

Manual-only: judging voice naturalness (WAVs land in `audition/`); judging avatar framing and lighting (attach a `page.screenshot` of the stage to the T2 run as an artefact, with no assertion).

### Sampling Rate
- **Per task commit:** the quick run command (< 5 s).
- **Per wave merge:** `npm test && npm run test:e2e`.
- **Phase gate:** the full suite plus `npm run test:e2e:t2` green (needs `scripts/fetch-voice-model.sh` run once) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `src/renderer/src/speech/speechQueue.test.ts`: fake `tts.synthesize` (deferred promises) and a fake head (`speakAudio`, `speakMarker` invoking callbacks in order, `stopSpeaking` dropping pending markers). The fake must mirror Pattern 2 semantics exactly.
- [ ] `src/renderer/src/speech/headtts.test.ts`: fake `navigator.gpu` and HeadTTS factory.
- [ ] `src/renderer/src/avatar/behaviour.test.ts`
- [ ] `tests/e2e/voice.t2.spec.ts` (`@t2`), plus a `launch({ env: { TTS: 'headtts' } })` variant. `launch.ts` passes a minimal env, so `TTS` must be added explicitly.
- [ ] `scripts/fetch-voice-model.sh` and a T2 precondition check.
- [ ] The `test:e2e:t2` script; `--grep-invert` updated to `"@live|@packaged|@t2|@audition"`.
- [ ] jsdom never imports `@met4citizen/*` or `three`; engines are injected. Keep the TalkingHead/HeadTTS imports confined to `avatarEngine.ts` / `headtts.ts`, which unit tests mock.

## Sources

### Primary (HIGH confidence)
- **The spike on this Mac (2026-11-03):** Electron 45.2.1 with an `app://` privileged scheme, CSP header on every response, sandboxed renderer, local model files. Scratch at `/private/tmp/claude-501/-Users-rishizamvar/b5aaa262-21e3-4b10-bb85-7693b3bc6956/scratchpad/spike/`. Measured: `connectMs` 1594, synth RTF 0.17, `avatarMs` 75, cancel 0 ms with the end marker not fired, `stop()`/`start()` toggling ctx suspended/running, Content-Length 133 s→1.3 s, `connect-src blob:` required, contextBridge object frozen.
- npm-packed source, read directly:
  - `@met4citizen/headtts@1.3.0`: `modules/headtts.mjs` (constructor defaults, connect, synthesize, processData, processOut), `modules/worker-tts.mjs` (connect, loadLanguage, loadVoice, process), README.
  - `@met4citizen/talkinghead@1.8.2`: `modules/talkinghead.mjs` (constructor options L128-190, lipsyncGetProcessor L2814, speakAudio L3106, playAudio L3230, startSpeaking L3311, stopSpeaking L3508, speakMarker L3019, start/stop L4295-4312, dispose L4822, animEmojis L625-690).
  - `@huggingface/transformers@4.3.2`: `dist/transformers.js` (env defaults, readResponse, ensureWasmLoaded, loadWasmFactory, the wasmPaths CDN default, pathJoin/getFile); `dist/transformers.min.js` exports.
  - `onnxruntime-web@1.31.0-dev.20260914-8d85527a0` dist listing.
  - `three@0.186.1`: GLTFLoader (blob URL + ImageBitmapLoader fetch), package exports.
- HF API: model tree sizes and voice list (`/api/models/onnx-community/Kokoro-82M-v1.0-ONNX{,-timestamped}/tree/main`).
- GitHub `met4citizen/TalkingHead`: `avatars/` listing, README licence section, `siteconfig.js` (AvatarSDK retarget/baseline).

### Secondary (MEDIUM confidence)
- `hexgrad/Kokoro-82M` VOICES.md (voice grades), via WebFetch. af_heart's grade cell was not rendered.
- electron-vite renderer `publicDir` default (`src/renderer/public`): inferred from the project layout; verify with one build.

### Tertiary (LOW confidence)
- Whether `autoplayPolicy` is *required* (only verified as sufficient).
- WASM-fallback behaviour under the CSP (not exercised).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Versions come from the registry; the wasm/version coupling was grepped.
- Architecture: HIGH. Every pattern except dev-mode serving and the WASM fallback was exercised in the spike.
- Pitfalls: HIGH for 1-3, 5-7, 9 and 10 (reproduced or read in source); MEDIUM for 4 and 8.

**Research date:** 2026-11-03
**Valid until:** 2026-12-03 (all versions are pinned exactly; re-check only on a version bump)
