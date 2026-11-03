# Avatar, Shell, PDF, Storage, Claude Integration, and Forkable Apps: Research for the Mock-Case Proctor

Researched 2026-11-02. Target: an Electron desktop app for personal/internal use on Apple Silicon macOS. It runs a PE/GE case interview: choose a case, 45-minute proctored review, voice presentation, Claude interviewer grilling section by section through a talking-head avatar, then review mode.
Companion doc: `research/voice_pipeline.md` covers STT, TTS, VAD, and turn-taking in depth. This doc covers only where those parts plug into the avatar and the shell.

Repo metadata (license, last push, stars) was pulled live from the GitHub API today. npm versions come from `npm view` today.
Confidence tags: **[V]** = verified today from source code, README, or API. **[S]** = secondary or vendor source. **[M]** = prior knowledge, not re-verified; check before relying on it.

---

## TL;DR: one primary pick per component

| Component | Primary pick | License | Activity | Why |
|---|---|---|---|---|
| Avatar renderer | **TalkingHead.js** `@met4citizen/talkinghead` 1.8.2 (three r186) | MIT | pushed 2026-10-30, v1.8.2 released 2026-10-25 [V] | Full-body GLB avatar with lip-sync from word timings or visemes, moods, eye contact, gestures, idle motion, listening hooks, and streaming mode. It is a single ES module. |
| TTS feeding the avatar | **HeadTTS** `@met4citizen/headtts` 1.3.0 (Kokoro-82M, WebGPU, in the renderer) | MIT (model Apache-2.0) | pushed 2026-10-24 [V] | Same author as TalkingHead. Its output (`words/wtimes/wdurations/visemes/...`) is exactly what `head.speakAudio()` takes. |
| Fallback lip-sync | **HeadAudio** (audio-driven visemes, ~14 kB model) | MIT | pushed 2026-10-22 [V] | Use it if the TTS gives no timestamps (for example, macOS `say`). |
| Avatar asset (tonight) | Sample `avatars/brunette.glb` (or `avaturn.glb` / `avatarsdk.glb`) from the TalkingHead repo | CC BY-NC 4.0 / non-commercial | [V] | Already has the rig and the ARKit + Oculus viseme blendshapes. Works with zero asset work and is fine for internal use. |
| Avatar asset (professional upgrade) | **Microsoft Rocketbox `Business_Male_0x` / `Business_Female_0x` `_facial.fbx`** converted with TalkingHead's `blender/rename-rocketbox-shapekeys.py` | MIT | repo frozen 2022 [V] | Suit-wearing characters with 15 visemes, FACS, and ARKit shapes. Conversion takes about an hour of Blender + Mixamo work per character. |
| Electron starter | **electron-vite 6** via `npm create @quick-start/electron@latest -- --template react-ts`, packaged with **electron-builder 26** | MIT | pushed 2026-10-14 [V] | Gives main/preload/renderer with Vite HMR and TypeScript. The template already includes electron-builder config. |
| Electron runtime | Electron 45.x | MIT | 45.2.1 released 2026-11-02 [V] | Chromium with WebGPU, so HeadTTS runs on the GPU. |
| PDF viewer | **react-pdf 11** (wraps pdfjs-dist 6.x) | MIT / Apache-2.0 | both active this week [V] | Two components (`<Document>`/`<Page>`) and a text layer. |
| Timer / webcam | No library: a `Date.now()` deadline plus `requestAnimationFrame`, and `<video>` with `getUserMedia` | n/a | n/a | Native platform features are enough. |
| Storage | **Plain JSON files**, one folder per session under `app.getPath('userData')`, written atomically | n/a | n/a | No native module to rebuild. The data is small (tens of sessions). The grader can read every past file. |
| API key | **Electron `safeStorage`** (Keychain-backed), or env/`~/.config/keys` | built in | n/a | `keytar` was archived on 2022-12-12 [V]. |
| Claude | **`@anthropic-ai/sdk` 1.4.0** in the **main process**, `messages.stream()`, model `claude-opus-5-5` | Apache-2.0 | pushed 2026-11-02 [V] | Streams text deltas to the renderer over IPC, sentence by sentence into HeadTTS. |
| Forkable whole app | **None.** Borrow patterns from TalkingHead's own `index.html` demo, Amica, and liftoff. | | | No existing repo combines a TalkingHead avatar, voice, and an LLM interviewer at a usable quality bar. Details in §6. |

**Verdict:** The real dependencies are TalkingHead + HeadTTS + react-pdf + the Anthropic SDK. Everything else is a thin layer of glue. The app-specific parts we must write are the interview state machine, the prompts and rubric grader, and the session library UI.

---

## 1. Avatar

### 1.1 TalkingHead.js in depth

- **Repo:** https://github.com/met4citizen/TalkingHead. MIT, 1,659 stars, last push 2026-10-30. Releases: v1.8.0 (2026-10-22), v1.8.1, and v1.8.2 (2026-10-25). Very actively maintained by one author (Mika Suominen). [V]
- **v1.8.0 changes:** three.js bumped r180 to r186, Meshopt compression support, a `retargeter.mjs` that auto-fixes minor rig differences per avatar creator, and pt_br lip-sync. It also included PR #174, "Replaced defunct Ready Player Me avatar URLs with local brunette.glb". [V]
- **Packaging:** npm `@met4citizen/talkinghead`, `"type":"module"`, main `modules/talkinghead.mjs`. The only dependency is `three ^0.186` (npm `three` latest is 0.187.0). The package ships `talkinghead.mjs`, `dynamicbones.mjs`, `playback-worklet.js`, `retargeter.mjs`, and `lipsync-{en,de,fi,fr,lt,pt_br,bn}.mjs`. [V]
- **Imports** (from source, lines 25-36) [V]: `three`, plus `three/addons/` OrbitControls, GLTFLoader, DRACOLoader, `meshopt_decoder.module.js`, FBXLoader, RoomEnvironment, and stats. Also `./retargeter.mjs`, `./dynamicbones.mjs`, and `new URL('./playback-worklet.js', import.meta.url)`.

#### Embedding in the Electron renderer (Vite)

1. `npm i @met4citizen/talkinghead three`. Vite resolves the bare `three` / `three/addons/*` imports from node_modules, so no import map is needed (the README's import map is only for CDN use).
2. **Pitfall: lip-sync modules are loaded by a runtime-computed dynamic import.** The source (lines 2814-2820) does this:
   ```js
   lipsyncGetProcessor(lang, path="./") { const moduleName = path + 'lipsync-' + lang.toLowerCase() + '.mjs'; import(moduleName).then(...) }
   ```
   Vite/Rollup cannot see this import, and `optimizeDeps` pre-bundling moves `talkinghead.mjs` into `.vite/deps`, which breaks the relative path. The production build also won't copy `lipsync-en.mjs`. **Fix (lazy and robust):** vendor `node_modules/@met4citizen/talkinghead/modules/*` into `src/renderer/src/vendor/talkinghead/`. Then replace that method body with a static `import { LipsyncEn } from './lipsync-en.mjs'` and `this.lipsync[lang] = new LipsyncEn()`. That is about 3 lines, and we only need English. Alternatively, keep the npm package, add `optimizeDeps: { exclude: ['@met4citizen/talkinghead'] }`, and copy `lipsync-en.mjs` with `vite-plugin-static-copy`. Vendoring has fewer moving parts.
3. Set `lipsyncModules: ['en']` and `lipsyncLang: 'en'`. Without this, the defaults are `['fi','en','lt']` and `'fi'` (Finnish). [V]
4. **Pitfall: `fetch()` of `file://` URLs.** GLTFLoader/FileLoader use `fetch`, and Chromium refuses `file://` for fetch. In production, electron-vite loads the renderer from `file://`. Register a privileged custom protocol in main, for example `protocol.registerSchemesAsPrivileged([{scheme:'app', privileges:{standard:true, secure:true, supportFetchAPI:true, stream:true}}])` plus `protocol.handle('app', …)`. Serve avatars, case PDFs, and session media through it. The same protocol serves the case library (`app://cases/<id>/interviewee.pdf`). [M: the file:// fetch restriction is long-standing Chromium behaviour; confirm on Electron 45]
5. Minimal setup:
   ```js
   const head = new TalkingHead(el, {
     ttsEndpoint: null,                 // we bring our own TTS (HeadTTS) -> speakAudio
     lipsyncModules: ['en'], lipsyncLang: 'en',
     cameraView: 'upper',               // 'full' | 'mid' | 'upper' | 'head'; 'upper' looks like a Zoom tile
     modelFPS: 30, avatarMood: 'neutral',
     avatarIdleEyeContact: 0.4, avatarSpeakingEyeContact: 0.7   // defaults 0.2 / 0.5
   });
   await head.showAvatar({ url: 'app://avatars/interviewer.glb', body: 'M', avatarMood: 'neutral', lipsyncLang: 'en' });
   ```
   The documented constructor and `showAvatar` options match the README table. [V]

#### Speech / lip-sync APIs [V]

- **`speakAudio(r, opt, onsubtitles)`** is the one we use. `r = { audio: AudioBuffer | Int16 PCM chunks, words[], wtimes[], wdurations[], visemes?[], vtimes?[], vdurations?[], markers?, mtimes?, anim? }`. When visemes are given, the built-in text→viseme step is bypassed. Calls **queue**, so pushing one call per sentence plays them back to back. That queue is the whole sentence-streaming mechanism.
- **`speakText(text, opt, onsubtitles, excludes)`** only works with a Google-style TTS endpoint that returns SSML `<mark>` timings. Not used.
- **Streaming mode** (`streamStart(opt, onAudioStart, onAudioEnd, onSubtitles, onMetrics)`, `streamAudio`, `streamNotifyEnd`, `streamInterrupt`, `streamStop`) takes PCM chunks with `lipsyncType` set to `'visemes'`, `'blendshapes'`, or `'words'`. Use it only if we later move to true chunked-audio TTS. For sentence-level HeadTTS, the `speakAudio` queue is simpler.
- **`stopSpeaking()`** clears the queue. Use it for barge-in.
- **Built-in English lip-sync** (`lipsync-en.mjs`): rule-based text→Oculus visemes. If a TTS returns only word timings, TalkingHead derives visemes itself. If it returns nothing, estimate word times proportionally to character count. Otherwise use HeadAudio.

#### Behaviour APIs [V]

- **Moods:** `setMood('neutral'|'happy'|'angry'|'sad'|'fear'|'disgust'|'love'|'sleep')`. An interviewer stays on `neutral`, occasionally `happy`. Moods drive idle templates: breathing, posture, blink, and micro-movements.
- **Eye contact and gaze:** `makeEyeContact(ms)`, `lookAtCamera(ms)`, `lookAhead(ms)`, `lookAt(x,y,ms)`. Speaking calls `lookAtCamera(500)` automatically. With `cameraView:'upper'` the avatar appears to look at the user.
- **Gestures:** `playGesture('handup'|'index'|'ok'|'thumbup'|'thumbdown'|'side'|'shrug', dur, mirror, ms)` and `stopGesture`. Emoji in the text become facial expressions or gestures. A grilling interviewer can `index` on a pointed question or `shrug` on a hedged answer.
- **Mixamo FBX animations:** `playAnimation(url, onprogress, dur, ndx, scale=0.01)`, plus `playPose`/`stopPose`. Use one "sitting/listening" idle loop if the default standing idle looks wrong at `'upper'` view.
- **Listening:** `startListening(analyserNode, opt, onchange)` fires `start`/`stop`/`maxsilence`/`maxactive` based on `listeningSilence*` / `listeningActive*` thresholds. This is a free, crude end-of-turn detector on the mic stream. Per voice_pipeline.md, Silero VAD is primary; this is the zero-dependency backup.
- **Extras:** `modelDynamicBones` (hair physics), `avatarOnly` mode (embed in your own three.js scene), `setFixedValue` / `mtAvatar[...]` for direct blendshape control (HeadAudio writes visemes this way), and `playBackgroundAudio` (room tone).
- **Optional plugin:** `lhupyn/motion-engine` (MIT, pushed 2026-10-17) chooses expressions and gestures from the transcript with a classifier. Skip it for v1; add it if the avatar feels robotic.

#### Avatar requirements [V]

- GLB (Meshopt by default, Draco optional), with a Mixamo-compatible skeleton whose root is named `Armature` (`mixamorig` prefix allowed).
- **All 52 ARKit blendshapes + 15 Oculus visemes** (`viseme_sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U`). `mouthOpen`, `mouthSmile`, `eyesClosed`, `eyesLookUp`, and `eyesLookDown` are optional; they are generated from ARKit shapes.
- The repo ships Blender helper scripts: `build-visemes-from-arkit.py`, `build-extras-from-arkit.py`, `rename-mixamo-bones.py`, `rename-cc4-shapekeys.py` (Character Creator 4), `rename-rocketbox-shapekeys.py`, `rename-tomcat-shapekeys.py`, `rename-avatarsdk-shapekeys.py`, and VRoid/MPFB/Faceit pipelines.

### 1.2 Avatar sources in late 2026

| Source | Status (2026-11) | License | Ready for TalkingHead? | Look | Notes |
|---|---|---|---|---|---|
| **Ready Player Me** | **Dead.** Netflix acquired it (Dec 2025); the public API, creator, and SDKs shut down **2026-01-31**. [S: genies.com, avatarsdk.com blog 2026-07-07; these are competitor posts, but they agree on the facts] | n/a | Old exported GLBs still load | Stylized | TalkingHead removed RPM URLs in v1.8.0 [V]. The repo's `brunette.glb` is a saved RPM avatar (CC BY-NC 4.0). Note: RPM shut down in **Jan 2026**, not 2025 as the brief assumed. |
| **TalkingHead samples** (`avatars/`) | In repo [V] | brunette: CC BY-NC 4.0; mpfb: CC0; avaturn, avatarsdk, vroid: non-commercial | **Yes, zero work** | brunette: semi-stylized woman (4.7 MB); avaturn: photo-real-ish woman (13.8 MB); avatarsdk: man (12.3 MB); mpfb: woman (36.8 MB); vroid: anime | **Use tonight.** `siteconfig.js` holds per-avatar `retarget`/`baseline` tweaks; copy them. For a male interviewer, use `avatarsdk.glb` (body 'M', needs its retarget block). |
| **Microsoft Rocketbox** https://github.com/microsoft/Microsoft-Rocketbox | Frozen (last push 2022-10) [V] | **MIT** [V] | Needs about 1 hour per character: Blender + Mixamo auto-rig + TalkingHead's `rename-rocketbox-shapekeys.py` (script header documents the steps) [V] | **Business_Male_01-07, Business_Female_01-04**, with `*_facial.fbx` variants (15 visemes + 48 FACS + ARKit shapes) [V] | **Best free "PE interviewer in a suit."** Low-poly, game-like quality. |
| **MPFB2** (MakeHuman for Blender) https://github.com/makehumancommunity/mpfb2 | Active (pushed 2026-10-24) [V] | Code GPL; assets mostly CC0/CC-BY [S, TH README] | TalkingHead ships an MPFB add-on, rig, and targets (doc updated 2026-10-30) [V] | Realistic-ish; suits come from asset packs | Fully free/CC0 path, but a few hours of Blender work. |
| **Avaturn** (avaturn.me) | Still operating [S: avatarsdk 2026-08 roundup] | Free non-commercial; paid PRO (~$800/mo reported) [S] | GLB with ARKit + visemes reported. Check the export: some "T1" bodies lack ARKit shapes [S] | Photo-based, realistic | Good for a lookalike interviewer; non-commercial is fine for us. |
| **Avatar SDK MetaPerson** | Active, commercial, pitching itself as the RPM replacement [S] | Commercial | TH has `rename-avatarsdk-shapekeys.py` and `build-avatarsdk-eyes.py` [V] | Photo-based, realistic | Paid route. |
| **Character Creator 4 (Reallusion)** | Active, commercial [M] | Paid; export EULA restrictions | TH has `rename-cc4-shapekeys.py` [V] | Highest-quality realistic humans | Paid; skip. |
| **VRoid / VRM** | Active | VRoid output fairly permissive | TH has VRoid conversion scripts [V] | Anime | Wrong look for a PE interview. |

**Pick:** ship with `avatarsdk.glb` (male) or `brunette.glb` tonight. Track a "Rocketbox Business_Male_02 conversion" task as the professional-look upgrade, since that step needs a human in Blender and Mixamo (Adobe login).

### 1.3 Alternatives evaluated

| Option | Repo / license / activity | Verdict |
|---|---|---|
| **three-vrm + custom lip-sync** | `pixiv/three-vrm` MIT, pushed 2026-10-22, `@pixiv/three-vrm` 3.5.5 [V] | VRM expressions give only 5 vowel visemes (aa/ih/ou/ee/oh) [M], and the ecosystem is anime-oriented. We would have to rebuild what TalkingHead already does: gaze, idle, moods, the speech queue. **Reject.** |
| **Amica** (three-vrm app) | `semperai/amica` MIT, pushed 2026-09-22 [V] | Next.js + Tauri, VRM characters [V]. Shows how to wire VRM, Whisper, and an LLM, but uses the wrong renderer for a realistic look. **Reference only.** |
| **Ditto** (photoreal diffusion talking head) | `antgroup/ditto-talkinghead` Apache-2.0, pushed 2025-11-12 [V] | Tested only on NVIDIA A100 + TensorRT 8.6 + CUDA. No macOS/Apple Silicon support documented [V]. **Reject:** it can't run locally on a Mac. |
| **LivePortrait** | `KlingAIResearch/LivePortrait` (license NOASSERTION; InsightFace dependency is non-commercial), pushed 2026-06 [V] | Driven by a portrait plus driving video, not audio. Needs an extra audio→motion model, a Python + PyTorch MPS sidecar, and multi-GB weights. It is not real-time on M-series at interview latency [M]. **Reject.** |
| **SadTalker** | `OpenTalker/SadTalker` NOASSERTION, last push 2024-06 [V] | Offline video generation; seconds of compute per second of video. Unmaintained. **Reject.** |
| **2D photo + HeadAudio mouth-shape sprites** | n/a | Possible "no-3D" fallback, but it looks cheaper than TalkingHead. **Reject.** |

**Avatar verdict:** TalkingHead.js, fed by HeadTTS through `speakAudio`, with HeadAudio as the lip-sync fallback. Photoreal neural heads are too heavy for an overnight, Mac-local build.

---

## 2. Electron shell

### 2.1 Starter

- **electron-vite** (`alex8088/electron-vite`, MIT, 5.6k stars, v6.0.0 on 2026-10-14) [V]. Scaffold with `npm create @quick-start/electron@latest mock-case-proctor -- --template react-ts` [V]. You get `src/main`, `src/preload`, `src/renderer` (React + TS), a single `electron.vite.config.ts`, output in `out/`, and an `electron-builder.yml` [M: template contents]. Requires Node 20.19+ or 22.12+ [V].
- **Alternatives:** `electron-vite/electron-vite-react` (the separate "vite-plugin-electron" template, MIT, pushed 2026-09) [V], or **Electron Forge 8** (`@electron-forge/cli` 8.0.1) [V] with its Vite plugin. Forge is Electron's official tool, but its Vite integration has historically lagged. electron-vite has the cleanest main/preload/renderer split. **Pick electron-vite + electron-builder.**
- `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true` on the renderer. Expose a narrow `window.api` via `contextBridge` (`listCases`, `startSession`, `sendTurn`, `onClaudeDelta`, `saveSession`, …).

### 2.2 Packaging with native / ONNX deps on Apple Silicon

- **Keep native modules to a minimum.** TalkingHead, HeadTTS (onnxruntime-web/transformers.js in a Web Worker), react-pdf, and VAD are all pure JS/WASM/WebGPU in the renderer, so they need no rebuild.
- The **only likely native module** is the whisper.cpp binding recommended by voice_pipeline.md (`smart-whisper` / `whisper-cpp-node`). better-sqlite3 would be another, which is one reason we skip it. For native modules:
  - Rebuild for Electron's ABI: electron-builder runs `install-app-deps` automatically (`npmRebuild: true`). Otherwise use `@electron/rebuild` 4.2.1 [V].
  - `asarUnpack: ["**/*.node", "**/*.dylib", "**/*.metal", "resources/models/**"]`, because native binaries and mmap-ed model files can't load from inside asar.
  - Build `--arm64` only (`mac.target: [{target: dmg, arch: arm64}]`); there's no need for universal builds.
- **Models** (Kokoro ONNX ~80-330 MB, whisper ggml ~800 MB-1.6 GB) go in `extraResources` or are downloaded on first run into `userData/models`. Don't put them in asar.
  - **Pitfall:** HeadTTS loads `transformers.js` from jsDelivr and the model from the Hugging Face hub by default (`transformersModule` and `model` options) [V]. For offline use, vendor transformers.js, point `transformersModule` at the local copy, and set transformers.js `env.allowRemoteModels=false` / `env.localModelPath` inside the HeadTTS worker. That last part likely needs a small patch in HeadTTS's worker module [M]. The first-run HF download is acceptable for personal use, but the model must be cached under the custom protocol or HTTP origin, not `file://`.
- **Signing:** For internal use, ad-hoc signing (`identity: "-"`) or a free Apple Development cert is enough. Notarization is unnecessary unless the app is distributed. **Pitfall:** macOS TCC permissions (camera/mic) are tied to the code signature. Unsigned builds that change signature on every rebuild re-prompt, or silently get denied after "Don't allow". Keep a stable ad-hoc identity and use `tccutil reset Camera <bundle-id>` when testing.

### 2.3 Camera / mic permissions (macOS)

- **Info.plist usage strings** (electron-builder `mac.extendInfo`): `NSCameraUsageDescription` and `NSMicrophoneUsageDescription`. Without them, the app is killed on first `getUserMedia`. [M]
- **Hardened-runtime entitlements** (`build/entitlements.mac.plist`, which the quick-start template already has): `com.apple.security.device.camera`, `com.apple.security.device.audio-input`, plus the standard `com.apple.security.cs.allow-jit` and `allow-unsigned-executable-memory` for V8/WASM. [M]
- **Main process:** `await systemPreferences.askForMediaAccess('camera')` and `askForMediaAccess('microphone')` before opening the session window. Use `session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['media'].includes(perm)))` so Chromium-level prompts are auto-granted for our own origin only. [M]
- **In dev,** the permission prompt is attributed to Electron.app or the terminal. That's expected.

### 2.4 Python sidecar (only if needed)

- Avoid it. Per voice_pipeline.md, the whole voice stack is JS/native-binding.
- If one becomes necessary (for example, a mlx-whisper fallback), build a PyInstaller one-dir binary into `extraResources`. Spawn it from main with `child_process.spawn` and talk NDJSON over stdin/stdout, which is the same pattern CrateDig's engine uses. Kill it on `before-quit`.
  - `utilityProcess.fork` is the right primitive for **Node** helpers (for example, running whisper off the main thread), not for Python.
  - One-dir PyInstaller avoids the 2-5 s one-file unpack on every launch. Codesign nested `.dylib`s if you sign at all.

---

## 3. PDF display, timer, webcam

- **react-pdf** (`wojtekmaj/react-pdf`, MIT, 11.2k stars, v11.0.0 2026-09-10, pushed 2026-10-28) wraps **pdf.js** (`mozilla/pdf.js`, Apache-2.0, `pdfjs-dist` 6.5.438 on 2026-11-01) [V].
  - Set the worker the Vite way: `pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()`. Make sure react-pdf's bundled pdfjs-dist version and any directly installed one match. A mismatch causes the classic "API version does not match Worker version" error. [M]
  - Import `react-pdf/dist/Page/TextLayer.css` and `AnnotationLayer.css`, or turn the layers off (`renderTextLayer={false}`).
  - Scroll all pages in a column (`numPages` map) with zoom buttons. Load from `app://cases/<id>/interviewee.pdf`.
  - **The interviewer PDF must never be rendered in the candidate UI.** Only main reads it, to pass to Claude (§5).
- **Alternative:** Chromium's built-in PDF viewer (`<iframe src=...pdf>` / `<webview>` with `plugins:true`). It needs no code, but it's harder to control (toolbar, can't disable download/print) and doesn't render inside a sandboxed renderer by default [M]. react-pdf is fine.
- **Timer:** store `deadline = startedAt + 45*60_000` in session state. Render `max(0, deadline - Date.now())` on a 250 ms `setInterval`, and persist `startedAt` so a crash or reload resumes correctly. Drifting `setInterval` counters are a bug; computing from the deadline avoids it. Show amber at 5 min and red at 1 min. At zero, auto-advance to the presentation phase (optionally after a "Ready now" button).
- **Webcam self-view:** `const s = await navigator.mediaDevices.getUserMedia({video:{width:640,height:360}, audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}})` → `<video autoPlay muted playsInline style="transform:scaleX(-1)" ref={v => v && (v.srcObject = s)} />`.
  - Reuse the **same** audio track for VAD/STT. Don't call getUserMedia twice.
  - Optional `MediaRecorder` on the stream to save `session.webm` for review playback. It's cheap to add, and the review grader can't use video anyway, so it's optional.

---

## 4. Storage

| Option | Version / status | Verdict |
|---|---|---|
| **Plain JSON files** | built in | **Pick.** |
| better-sqlite3 | 13.0.3 (2026-08), MIT, pushed 2026-08-10 [V] | Good library, but it's a native module (ABI rebuild + asarUnpack) and overkill for fewer than 1,000 sessions. Upgrade if you ever need cross-session queries/aggregates at scale. |
| electron-store | 12.0.0 (2026-10-12), MIT [V] | ESM-only JSON key-value store with schema/migrations. Fine for **settings only** (avatar choice, voice, checklist order), but a single `settings.json` via `fs` works too. Optional. |

**Layout:**
```
userData/
  settings.json                      # voice, avatar, user's section checklist order, safeStorage-encrypted key blob
  sessions/<sessionId>/session.json  # caseId, phase timestamps, status, transcript[], per-section notes
  sessions/<sessionId>/grade.json    # grader output (scores per rubric item, strengths, gaps, drills)
  sessions/<sessionId>/audio/*.webm  # optional
cases/<caseId>/{interviewee.pdf, interviewer.pdf, data.json}   # read-only library (outside userData, user-chosen folder)
```
- **"Completed cases greyed out"**: on startup, scan `sessions/*/session.json` and build a `Set` of `caseId`s whose status is `graded`.
- **Atomic writes:** write `file.tmp` then `fs.rename`. Save the transcript after every turn, so a crash loses at most one turn.

---

## 5. Claude integration

### 5.1 Main-process streaming → sentence chunks → TTS

- SDK: `@anthropic-ai/sdk` 1.4.0 (Apache-2.0, pushed 2026-11-02) [V]. Run it in **main**: the key never touches the renderer, and you avoid CORS and browser-mode warnings.
- Model: **`claude-opus-5-5`** (current default Opus; $4/$20 per MTok, 1M context) [V: claude-api skill, cached 2026-10-06].
  - Thinking can't be disabled on Opus 5.5. Effort is the lever, and its default is `medium`.
  - Interviewer turns: `output_config: {effort: "low"}` to cut time-to-first-token. Grader: `effort: "high"`.
  - If interviewer latency is still too high, Haiku 5.5 is the user's call; it is not the default.
  - Opus 5.5 rejects forced `tool_choice` (`any`/`tool`), assistant prefill, `temperature`, and `budget_tokens`. All return 400. [V: skill]
  - Add the server-side refusal fallback: `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"` [V: skill].
- Pattern (from the skill's TS streaming docs) [V]:
  ```ts
  const stream = client.messages.stream({ model: 'claude-opus-5-5', max_tokens: 4000,
    output_config: { effort: 'low' }, system: [...], tools: [sectionTool], messages });
  let buf = '';
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
      buf += ev.delta.text;
      let m; while ((m = buf.match(/^(.+?[.!?])(\s+|$)/s))) {            // ponytail: naive splitter; "e.g." / "$1.5B" may split early
        win.webContents.send('claude:sentence', m[1]); buf = buf.slice(m[0].length);
      }
    }
  }
  if (buf.trim()) win.webContents.send('claude:sentence', buf);
  const final = await stream.finalMessage();   // inspect tool_use blocks + stop_reason here
  ```
  The renderer calls `headtts.synthesize({input: sentence})` per sentence. HeadTTS replies in order, and `onmessage` → `head.speakAudio(msg.data)` queues. The first sentence starts speaking while Claude is still generating.
  - **Barge-in:** call `stream.abort()` in main, `head.stopSpeaking()` in the renderer, and drop pending HeadTTS jobs.
  - Merge very short sentences ("Okay.") with the next one to avoid choppy prosody. Normalise finance tokens before TTS ("$1.5B" → "1.5 billion dollars", "EBITDA" stays). TalkingHead's `lipsync-en` preProcessText handles numbers for lip-sync, but Kokoro needs the same text.
- **API key:** `safeStorage.encryptString(key)` → base64 into `settings.json`; `safeStorage.decryptString` at startup. On macOS this is backed by a Keychain entry [M]. `keytar` is archived (2022-12-12) [V], so don't use it. Simplest of all for a personal tool: read `ANTHROPIC_API_KEY` from env, or the user's central `~/.config/keys/` .env (the keymgr setup), and fall back to the safeStorage prompt.

### 5.2 Interviewer state machine

Plain TypeScript in main, as a discriminated union. No XState: there are five phases.
```ts
type Phase =
  | { kind: 'review';       deadline: number }                          // 45 min, no Claude calls (or one silent "ready" check)
  | { kind: 'presentation'; startedAt: number }                         // candidate speaks: recap, rec, for/against; Claude only listens
  | { kind: 'grilling';     sectionIdx: number; turnsInSection: number } // sections = user's checklist order ∩ rubric sections
  | { kind: 'wrapup' }
  | { kind: 'done' };
```
- **Context layout (prompt-cache friendly):**
  - `system` = [persona + rules, **interviewer.pdf as a `document` block (base64)**, `data.json`, the user's checklist order] with `cache_control: {type:'ephemeral'}` on the last stable block.
  - `messages` = append-only transcript. Each grilling turn reuses the cached prefix. Verify with `usage.cache_read_input_tokens > 0`.
  - Never edit earlier turns; Opus 5.5 "preserved thinking" penalises history edits [V: skill]. Phase changes go in as **mid-conversation system messages** (`{role:'system', content:'Now grilling section 3: Value creation plan'}` appended after a user turn) instead of editing `system`. That keeps the cache [V: skill].
- **Section sufficiency:** give Claude one client tool, `section_complete({section_id, sufficient: boolean, evidence: string, gaps: string[]})` with `strict: true`, and `tool_choice: auto`. The prompt says to call it when the candidate has covered the section's answer-key points or after N probes. When main sees the tool_use in `finalMessage()`, it returns a `tool_result`, records the notes, advances `sectionIdx`, and appends the system message for the next section.
  - The model speaks plain text (streamed to TTS) and signals state through the tool. That avoids streaming JSON. Add a hard cap (for example, 6 turns per section) in code so a section can't loop forever.
- **Presentation phase:** don't call Claude per utterance. Accumulate STT text until the candidate says "that's my recommendation" or presses Done. Then send it as one user turn that kicks off grilling.
- **Fresh agent per case:** each session starts a new `messages` array. Nothing from past sessions enters the interviewer's context, which keeps the proctor unbiased and the cache prefix clean.

### 5.3 Grader / review agent with memory

- A separate one-shot call after `done`: `messages.parse` / `output_config.format` with a JSON schema (rubric item → score 1-5 + evidence quote + fix, overall, strengths, top-3 drills). Inputs: interviewer.pdf (document block), the full transcript, the per-section `section_complete` notes, and **memory**, meaning the last N `grade.json` summaries (just `overall`, `drills`, and `recurring_gaps`, not full transcripts) loaded from disk.
  - The prompt asks it to call out recurring weaknesses ("third session in a row you skipped downside cases").
  - Save as `grade.json`. Review mode renders it next to the transcript, with click-to-seek if audio was recorded.
- "Memory" = files on disk that we choose to inject. Don't use the memory tool or Managed Agents for this; that would be over-engineering a local single-user app.

---

## 6. Existing open-source apps to fork or borrow from

GitHub search (2026-11-02) for mock-interview / AI-interviewer / TalkingHead / avatar-chatbot repos. **Nothing combines a 3D lip-synced avatar + local voice + an LLM interviewer at production quality.** Interview repos are web apps with text or browser TTS and no avatar. Avatar repos are companions or VTubers. Ranked by reusability for *this* app:

| Rank | Repo | License / activity | What to take | Why not fork whole |
|---|---|---|---|---|
| 1 | **TalkingHead `index.html` + `examples/`** (`mp3.html`, `minimal.html`, `azure-audio-streaming.html`, `tests/streaming-tests.html`) https://github.com/met4citizen/TalkingHead | MIT, 2026-10-30 [V] | Known-good wiring for avatar setup, `speakAudio` from an external audio file with word timings (mp3.html), streaming, and the per-avatar config blocks in `siteconfig.js`. | It's a demo site (Google/Azure/ElevenLabs/OpenAI via JWT proxy), not an app. |
| 2 | **HeadTTS / HeadAudio test pages** (`met4citizen/HeadTTS`, `met4citizen/HeadAudio` `tester.html`) | MIT, Oct 2026 [V] | The exact HeadTTS → TalkingHead glue, and the HeadAudio worklet wiring with its delay-node trick. | Libraries, not apps. |
| 3 | **Amica** https://github.com/semperai/amica | MIT, 1.6k stars, 2026-09-22 [V] | Whisper + Silero VAD + transformers.js in-browser patterns, plus settings UI ideas for voice/LLM backends. | VRM/anime renderer, Tauri + Next.js, no Claude [V]. |
| 4 | **liftoff** https://github.com/Tameyer41/liftoff | MIT, 1.5k stars, last push 2023-12 [V] | Mock-interview UX: record → transcribe → structured AI feedback page layout. | Stale, Next.js web, OpenAI, no avatar, no live back-and-forth. |
| 5 | **Pipecat** (`pipecat-ai/pipecat`, BSD-2, 17k stars) and **LiveKit Agents** (`livekit/agents`, Apache-2.0, 15k stars), both pushed today [V], plus `livekit-examples/agent-starter-react` (MIT) | active | Turn-taking/interruption design and Smart Turn (see voice_pipeline.md). | Built for server-side WebRTC voice agents; adds a Python runtime and media server to a single-user local app. Patterns only. |

Also seen and rejected:
- `adrianhajdin/ai_mock_interviews`: no license, Vapi-hosted voice.
- `jiatastic/GPTInterviewer`: MIT, Streamlit, 2024.
- `XUZIAa/Multi-Agent-Mock-Interview`: GPL-3.0; viral license, Chinese-language.
- `Open-LLM-VTuber`: custom license, Live2D proprietary SDK.
- `wass08/r3f-virtual-girlfriend-*` / `r3f-ai-language-teacher`: no license, Rhubarb lip-sync, 2024.
- `a16z-infra/companion-app`: MIT, 2024, no avatar.
- Assorted zero-star "AI interviewer" repos.

None of these has a case-interview flow (proctored review → presentation → rubric grilling). That flow is our core and has to be built.

---

## 7. Recommended architecture

```
┌──────────────────────────── Electron main (Node) ────────────────────────────┐
│ CaseLibrary (fs scan cases/*)   SessionStore (JSON files, atomic writes)       │
│ InterviewMachine (Phase union)  ClaudeClient (@anthropic-ai/sdk, stream)       │
│   └─ sentence splitter → IPC 'claude:sentence'   GraderAgent (parse, schema)   │
│ STT (whisper.cpp binding, per voice_pipeline.md)  safeStorage key             │
│ protocol 'app://' → avatars/, cases/, sessions/ media                          │
└───────────────▲ IPC (contextBridge window.api) ▼───────────────────────────────┘
┌──────────────────────────── Renderer (React + Vite) ──────────────────────────┐
│ LibraryView (grey = graded)   ReviewView: <react-pdf> + deadline timer         │
│ InterviewView: TalkingHead canvas (cameraView 'upper') + webcam <video> tile   │
│   HeadTTS (Web Worker, WebGPU Kokoro) → head.speakAudio queue                  │
│   Silero VAD (vad-web) on shared mic track → audio to main for STT             │
│ FeedbackView: grade.json + transcript                                          │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Reuse vs build

**Reuse (install / vendor):** TalkingHead (vendored + 3-line lipsync patch), a sample GLB avatar, HeadTTS + Kokoro model, HeadAudio (fallback), react-pdf/pdf.js, `@anthropic-ai/sdk`, electron-vite template + electron-builder, Silero VAD and the whisper.cpp binding (per voice_pipeline.md), Electron `safeStorage` / `protocol` / `systemPreferences`.

**Build (ours, roughly in order):**
1. `app://` protocol + case library scanner (`cases/<id>/{interviewee.pdf, interviewer.pdf, data.json}`).
2. Session JSON store + library view with greyed-out completed cases.
3. Review view: PDF + 45-min deadline timer + webcam tile.
4. Avatar view: TalkingHead + HeadTTS glue, `speak(sentence)` queue, `stopSpeaking` barge-in.
5. Claude main-process stream → sentence IPC.
6. InterviewMachine (phases, `section_complete` tool, per-section cap, checklist ordering, mid-conversation system messages).
7. Presentation capture (STT accumulate → one turn).
8. Grader call with schema + past-grade memory; feedback view.
9. Prompts: interviewer persona (PE partner, terse, probing), grader rubric mapping.

### Pitfalls checklist

1. **TalkingHead's dynamic `import('./lipsync-'+lang+'.mjs')`** breaks under Vite pre-bundling and production builds. Vendor it and use a static import. Also set `lipsyncLang:'en'`; the default is Finnish.
2. **`file://` + `fetch`**: GLB/PDF/model loads fail in production builds. Use a privileged custom protocol.
3. **HeadTTS defaults to CDN + Hugging Face** for transformers.js and Kokoro. First run needs network, and fully offline use needs vendoring plus a worker patch. Kokoro fp32 first load is slow and memory-heavy [V]. Warm it up during the 45-minute review phase, not at interview start.
4. **Echo / self-interruption:** the avatar's speaker output gets into the mic. Use `echoCancellation:true`, recommend headphones, and ignore VAD while `head.isSpeaking`, unless barge-in is wanted.
5. **macOS TCC:** missing Info.plist strings mean a crash. Signature changes cause stale denials. Missing `device.camera`/`audio-input` entitlements under the hardened runtime make getUserMedia fail silently.
6. **Native module ABI** (whisper binding, better-sqlite3 if adopted): rebuild for Electron and asarUnpack `.node`/`.dylib`/models.
7. **Opus 5.5 API drift:** no forced tool_choice, no prefill, no temperature, no `budget_tokens`, and thinking is always on (use `effort`). Append-only history; phase changes as mid-conversation system messages. Check `stop_reason` (`refusal`, `max_tokens`) before reading content.
8. **Prompt caching silently missing:** any per-turn timestamp or reordered JSON in `system` kills it. Put volatile state in messages and verify `cache_read_input_tokens`.
9. **Sentence splitter edge cases:** "$1.5B", "e.g.", "vs." and decimals can split early. Use the naive regex plus a small abbreviation list, and keep a minimum chunk length (~25 chars).
10. **Never render or send interviewer.pdf to the renderer.** Keep it main-only so the candidate can't see the answer key in DevTools.
11. **Asset licenses:** the sample avatars (CC BY-NC / non-commercial) and Mixamo animations (no raw redistribution) are fine for internal use. Swap to Rocketbox (MIT) or MPFB (CC0) before any distribution.
12. **Ready Player Me is gone** (shut down 2026-01-31). Don't plan on any RPM URL or API, and don't use old tutorials that load `models.readyplayer.me/...glb`.

### Sources
- TalkingHead: https://github.com/met4citizen/TalkingHead (README, `modules/talkinghead.mjs`, `package.json`, `siteconfig.js`, `blender/*`, releases v1.8.0-v1.8.2)
- HeadTTS: https://github.com/met4citizen/HeadTTS · HeadAudio: https://github.com/met4citizen/HeadAudio · MotionEngine: https://github.com/lhupyn/motion-engine
- RPM shutdown: https://genies.com/blog/ready-player-me-shutdown · https://avatarsdk.com/blog/2026/07/07/ready-player-me-migration-guide/ · https://avatarsdk.com/blog/2026/08/31/avatar-platforms-2026-whos-alive-whos-gone/
- Avaturn pricing (third party): https://toolradar.com/tools/avaturn/pricing
- Rocketbox: https://github.com/microsoft/Microsoft-Rocketbox · MPFB2: https://github.com/makehumancommunity/mpfb2 · three-vrm: https://github.com/pixiv/three-vrm
- Ditto: https://github.com/antgroup/ditto-talkinghead · LivePortrait: https://github.com/KlingAIResearch/LivePortrait · SadTalker: https://github.com/OpenTalker/SadTalker
- electron-vite: https://electron-vite.org/guide/ · https://github.com/alex8088/electron-vite · react-pdf: https://github.com/wojtekmaj/react-pdf · pdf.js: https://github.com/mozilla/pdf.js
- better-sqlite3: https://github.com/WiseLibs/better-sqlite3 · electron-store: https://github.com/sindresorhus/electron-store · keytar (archived): https://github.com/atom/node-keytar
- Anthropic TS SDK: https://github.com/anthropics/anthropic-sdk-typescript
- Apps: https://github.com/semperai/amica · https://github.com/Tameyer41/liftoff · https://github.com/pipecat-ai/pipecat · https://github.com/livekit/agents · https://github.com/livekit-examples/agent-starter-react
