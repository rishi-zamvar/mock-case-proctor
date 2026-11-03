<!-- GSD:project-start source:PROJECT.md -->
## Project

**Mock Case Proctor**

A macOS Electron desktop app that runs a full, proctored Lead Edge Capital growth-equity case interview against the 12-case mock library at `~/Documents/Projects/lead_edge_mock_cases`. Rishi picks a case, reviews the interviewee deck in-window for 45 minutes, then presents by voice to a lifelike 3D talking-head partner (Claude-driven, local free voice) who interrupts, probes and grills section by section, and finally gets a rubric scorecard plus trends across all past sessions. It is a single-user personal prep tool for a real interview.

**Core Value:** It must feel like a real conversation with a Lead Edge partner: Rishi speaks, a believable avatar answers out loud within a few seconds, follows his structure, and pushes on exactly the things the case's answer key says matter. If only one thing works, it is the voice loop with an interviewer who knows the case.

### Constraints

- **Platform**: macOS Apple Silicon, Node 22, Electron (latest stable) — single machine
- **Cost**: voice and avatar local and free; only paid dependency is the Claude API (existing ANTHROPIC_API_KEY via `~/.config/keys` keymgr)
- **Latency**: candidate-stops-talking → avatar's first audible word target ≤ 3 s typical
- **Privacy**: interviewer materials never visible to the candidate before review; API key never in renderer or logs
- **Quality**: TDD; every feature covered by automated tests AND a live E2E run in the real app
- **Timeline**: overnight autonomous build
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Spike results (2026-11-03, Electron 45.2.1 + Playwright 1.64.1, run on this Mac)
| Claim | Result |
|---|---|
| Playwright `_electron.launch()` drives Electron 45 | **Works** [V] |
| WebGPU in a Playwright-launched Electron 45 window | **Works.** `requestAdapter()` and `requestDevice()` succeed; adapter `apple/metal-3` [V] |
| WebGPU, WebGL2 and `page.screenshot()` with `show:false` (hidden window) | **Work.** rAF still ran at about 120 Hz under Playwright [V] |
| `--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream` | **Work.** The track label is "Fake Default Audio Input" and there is no TCC prompt [V] |
| `--use-file-for-fake-audio-capture=<wav>` on its own | **Fails silently.** The track opens but the samples are all zero (peak 0.0) [V] |
| The same flag plus `--disable-features=AudioServiceSandbox` | **Works.** Peak 0.72; the WAV reaches the page [V] |
| Electron 45 bundled runtime | Node **24.22.1**, Chromium 156, `NODE_MODULE_VERSION` 150 [V]. The dev machine's Node is 22.20, so **Vitest and the app run on different Node ABIs.** |
| `node:sqlite` | Loads in both Node 22 (with an ExperimentalWarning) and the Electron 45 main process (SQLite 3.53.4) [V] |
| `whisper-cpp-node` 0.2.12 darwin-arm64 prebuilt | **N-API** (it exports `napi_register_module_v1`). It is one statically linked `whisper.node` that loads only system Metal, CoreML and Accelerate frameworks, with no loose dylib or metallib files [V]. The same binary loads in Node 22 (Vitest) and Electron's Node 24, and **no `@electron/rebuild` is needed.** |
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended | Conf. |
|---|---|---|---|---|
| Electron | **45.2.1** | Desktop shell | Latest stable (released 2026-11-02). Bundles Chromium 156 with WebGPU on Metal, which HeadTTS needs. **The scaffold template pins `^44.7.2`, so bump it.** | HIGH [V] |
| electron-vite | **6.0.0** | Build and dev server for main, preload and renderer | The cleanest three-process split with Vite 8 HMR. Scaffold with `npm create @quick-start/electron@latest -- --template react-ts` (create-electron 1.0.31, 2026-10-14). | HIGH [V] |
| Vite | **8.3.5** | Bundler (Rolldown-based) | Peer of electron-vite 6 and `@vitejs/plugin-react` 6. | HIGH [V] |
| React | **19.3.1** | Renderer UI | Template default. react-pdf 11 and Testing Library 16 both peer on React 19. | HIGH [V] |
| TypeScript | **^5.9.3 (keep the template pin)** | Types | **Do not take `latest` (7.0.2, the Go-native compiler).** The current `typescript-eslint` (8.72.1) peers `typescript >=4.8.4 <6.1.0`, so TypeScript 7 breaks linting. TypeScript 6.0.3 also fits the range, but it deprecates options the `@electron-toolkit/tsconfig` presets may use, and the switch gains nothing. | HIGH [V] |
| `@anthropic-ai/sdk` | **1.4.0** | Claude streaming, main process only | Released 2026-11-02. `messages.stream()` handles interviewer turns. `zodOutputFormat()` from `@anthropic-ai/sdk/helpers/zod` handles the grader's structured output. **Test seams are built in:** the `fetch` constructor option, and the `baseURL` option, which defaults to `process.env.ANTHROPIC_BASE_URL`. | HIGH [V] |
| electron-builder | **26.18.0** | Package a `.app` (arm64 only, ad-hoc signed) | Already configured by the template. Its postinstall runs `install-app-deps`. | HIGH [V] |
### Voice, avatar and media
| Library | Version | Purpose | Notes | Conf. |
|---|---|---|---|---|
| `whisper-cpp-node` | **0.2.12** (prebuilt `@whisper-cpp-node/darwin-arm64`) | STT with large-v3-turbo on Metal, in main or a `utilityProcess` | API: `createWhisperContext({model, use_gpu, use_coreml})`, then `transcribeAsync(ctx, {pcmf32: Float32Array@16k, language:'en', prompt:'<finance vocab>'})`. **Prompt biasing is supported**, which the finance-jargon requirement needs. Its N-API build means no ABI rebuild. Risk: one maintainer (a fork at `predict-woo/whisper.cpp`), last release 2026-03-07. | HIGH for the API, MEDIUM for maintenance [V] |
| (fallback) `whisper-cli` from `brew install whisper-cpp` | brew current | STT via `child_process.spawn` on a temporary WAV | Zero npm risk, at the cost of roughly 100 to 200 ms of process spawn per turn. Swap to it if the binding misbehaves. Keep STT behind one function, `transcribe(pcm): Promise<string>`, so the swap touches one file. | MEDIUM [M] |
| `@met4citizen/talkinghead` | **1.8.2** | 3D avatar, lip-sync and idle behaviour | **Peer is `three ^0.186`, which in 0.x semver means `>=0.186.0 <0.187.0`.** npm `latest` for three is 0.187.0, so **pin `three@0.186.1`** or npm will warn and you'll run an untested three. Vendor the module and make it import `lipsync-en` statically (see avatar_shell.md §1.1). | HIGH [V] |
| `three` | **0.186.1** (exact) | Renderer for TalkingHead | See the note above. | HIGH [V] |
| `@met4citizen/headtts` | **1.3.0** | Kokoro-82M TTS on WebGPU, which returns visemes and word timings | Depends on `@huggingface/transformers ^4` (latest 4.3.2). The npm publish is from 2026-04-03, while the repo was pushed in October 2026; if you need recent fixes, consider vendoring from GitHub. It fetches the model from the Hugging Face hub by default, so the first run needs network. | MEDIUM [V] |
| `react-pdf` | **11.0.0** | Shows the interviewee deck | **It pins `pdfjs-dist` to exactly 6.3.289. Do not `npm i pdfjs-dist` yourself:** latest is 6.5.438, and the mismatch causes the "API version does not match Worker version" error. Point the worker at `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`, which resolves to react-pdf's copy. | HIGH [V] |
| `getUserMedia` + `<video>` | built in | Webcam tile and microphone | Open the stream once and reuse the audio track for STT capture. | HIGH |
| `@ricky0123/vad-web` | 0.0.31 | **Defer: not needed for v1** | PROJECT.md locks button start/stop turns with no VAD auto-cutoff. Barge-in can be the same button pressed while the avatar is speaking. That removes VAD, Smart Turn and onnxruntime-web from v1. Add them only if hands-free barge-in is requested. | HIGH (decision) |
### Supporting Libraries
| Library | Version | Purpose | When to Use | Conf. |
|---|---|---|---|---|
| `zod` | **4.6.7** | One schema per persisted file and per Claude output | The grader schema goes to `zodOutputFormat()` for Claude, and the same schema validates `session.json` and `grade.json` when read back from disk (a trust boundary, since files can be corrupt or from an older version). The SDK peers `zod ^3.25 \|\| ^4`. | HIGH [V] |
| Plain JSON files plus `fs.writeFile(tmp)` and `fs.rename` | built in | Session library | Tens of sessions per user is trivially small. A temporary file plus rename is atomic on APFS. No `write-file-atomic` or `electron-store` dependency. | HIGH |
| `node:sqlite` | built in (Node 22 / Electron's Node 24) | **Upgrade path only** | If cross-session queries outgrow loading every `grade.json`, use the built-in module, not better-sqlite3. It loads in both runtimes (spike-proven) and needs no native module. | MEDIUM [V] (it is still marked experimental) |
| `@electron-toolkit/preload`, `@electron-toolkit/utils` | template | `contextBridge` helpers and `is.dev` | Template defaults; keep them. | HIGH |
### Development Tools (test stack)
| Tool | Version | Purpose | Notes | Conf. |
|---|---|---|---|---|
| Vitest | **5.1.0** | Unit and integration tests, TDD loop | Needs Node `^22.12` (you have 22.20). Use **two test projects** in one `vitest.config.ts` (`test.projects`): `main` (environment `node`, covering `src/main/**` and `src/shared/**`) and `renderer` (environment `jsdom`, covering `src/renderer/**`). Keep it separate from `electron.vite.config.ts`. | HIGH [V] for the version, MEDIUM [M] for the exact config key |
| `@vitest/coverage-v8` | 5.1.0 | Coverage | Gate on the main-process logic (state machine, prompt builders, store, sentence splitter), not on the renderer glue. | HIGH [V] |
| jsdom | **30.1.3** | DOM for renderer component tests | Pick jsdom over happy-dom for fidelity. Neither has WebGPU, WebAudio rendering or media, so they test component logic only. | HIGH [V] |
| `@testing-library/react` + `@testing-library/dom` + `@testing-library/user-event` | 16.3.3 / ^10 / 14.6.8 | Component tests | `@testing-library/dom` is a required peer that you must install yourself. | HIGH [V] |
| `@playwright/test` | **1.64.1** | Live E2E of the real Electron app via `_electron` | Electron support is **experimental** but covers v21 and later; proven against Electron 45 above. `electronApp.evaluate()` runs code in main (stub dialogs, read state). Launch fails if the `EnableNodeCliInspectArguments` fuse is off, so don't flip that fuse. | HIGH [V] |
| Playwright `toHaveScreenshot` | built in | Visual regression for **static** screens | Use it for the library, review and scorecard screens. Mask the avatar canvas, webcam tile and timer. No pixelmatch dependency. | MEDIUM |
| `say` + `afconvert` (macOS) | system | Generate audio fixtures | `say -o turn1.wav --data-format=LEI16@48000 "…"` makes fixtures that are deterministic and need no human. Add 3 to 5 real recordings of Rishi for the accuracy test. | HIGH [V] |
## The test architecture
### Layer 1: Unit (Vitest, `node`). Write the test first, every time.
- **Rule:** `src/main/**` logic takes its dependencies as plain function arguments (`transcribe`, `claudeClient`, `now()`, `fs` root). No DI framework; this is just parameters.
### Layer 2: Integration (Vitest, `node`). Real SDK, recorded network.
- **Claude:** construct `new Anthropic({ apiKey: 'test', fetch: replayFetch('fixtures/claude/grill-turn-3.sse') })`. `replayFetch` returns a `Response` whose body streams the recorded SSE bytes. The **real SDK parser, `MessageStream`, and tool-use handling** all run, so `section_complete` detection, abort, `stop_reason` handling and the sentence-to-IPC sequence are tested deterministically and offline. No MSW and no nock: the SDK's own `fetch` option is the seam (rung 5: an option the installed dependency already has). [V]
- **Recording:** a `RECORD=1` mode wraps the real `fetch`, tees the response body to `fixtures/claude/<name>.sse` and the request JSON to `<name>.req.json`. Run it once with the real key and commit the fixtures. Assert on the **request** shape (system blocks, `cache_control` placement, no interviewer content in renderer-bound data) as strictly as on the response.
- **STT:** run `whisper-cpp-node` for real on the fixture WAVs. It loads under Vitest because it is N-API. Use `base.en` in CI-speed tests and turbo in a tagged accuracy test. Assert that **normalised keywords** are present ("184", "million", "48", "%"), not exact strings. Whisper output drifts slightly between models and versions.
- **Tag** slow tests (`describe.skipIf(!process.env.SLOW)`) so the TDD loop stays fast.
### Layer 3: E2E (Playwright `_electron`, the built app). Every screen and feature.
- Launch the **built** output (`electron-vite build`, then `electron.launch({ args: ['.'] })`) rather than the dev server, so E2E exercises the production `app://` protocol, the asset paths and the CSP. Run one smoke test on the **packaged** `.app` via `executablePath` before declaring a phase done.
- **Claude in E2E:** start a ~60-line `node:http` **replay server** in Playwright `globalSetup` and pass `env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:<port>' }` to `electron.launch`. The SDK reads that env var by default [V]. Fixtures are keyed by scenario plus turn index, and the same `RECORD=1` proxy mode captures new ones. This tests the real main-process code path with zero app changes.
- **E2E flag in main:** if `process.env.E2E === '1'`, before `app.whenReady()` (Chromium switches must be set before ready):
- **Voice loop, two tiers:**
- **Asserting on the avatar and WebGPU rendering.** Pixels of an animated head are flaky, so assert **state**, not screenshots:
- Windows can stay hidden (`show:false` worked in the spike), but set `backgroundThrottling: false` on the session window anyway so the avatar keeps animating when the app is unfocused in real use.
- Run E2E with `workers: 1`. Each Electron instance holds the GPU, whisper turbo (about 1 GB) and Kokoro, so parallel instances will thrash the machine.
### Layer 4: Live (opt-in, real Claude, `@live` tag)
- `npx playwright test --grep @live`, plus a Vitest `LIVE=1` suite, hitting the real API with the key from keymgr (`~/.config/keys`). This guards against prompt drift and API changes that recorded fixtures can't see.
- Assert **structure**, not wording:
- Run before each phase sign-off, not on every save. It costs money, and per the API-frugality rule, fixtures are the default.
## Installation
# Core runtime
# Test stack
# No `npx playwright install` is needed for Electron-only E2E; it drives the electron binary.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| JSON files + zod | `better-sqlite3` 13.0.3 | Never for this app. It is a native module, and Vitest (Node 22, ABI 127) and Electron (Node 24, ABI 150) need **two different builds**, which breaks the "same code under test and in the app" property. If you outgrow JSON, use `node:sqlite`. |
| JSON files | `electron-store` 12 | Only if you want schema migrations for settings. `settings.json` read through zod does the same job. |
| SDK `fetch` option + SSE fixtures | MSW 3 / nock 15 | If you ever need to intercept HTTP you don't construct yourself. Here we construct the client, so the option is cheaper and exact. |
| Replay server via `ANTHROPIC_BASE_URL` (E2E) | `electronApp.evaluate()` to monkey-patch the SDK in main | Never. Patching main from the test diverges from production code. The env var exercises the real path. |
| `whisper-cpp-node` | `smart-whisper` 0.8.1 | Don't. Its last publish was **2024-10-02**, two years stale [V] (voice_pipeline.md said about 12 months). |
| `whisper-cpp-node` | `whisper-cli` subprocess (brew) | If the binding crashes or stalls. It has the same model files and prompt flag (`--prompt`), at about 150 ms extra per turn. |
| State assertions + canvas non-blank check | Pixel-diff screenshots of the avatar | Never as a gate; idle animation, blinks and moods make them flaky. Use attachments for eyeballing only. |
| Vitest jsdom for components | Vitest Browser Mode (`@vitest/browser-playwright` 5.1.0) | If renderer logic needing real WebAudio or WebGPU grows beyond what E2E covers comfortably. Not needed for v1. |
| electron-vite + electron-builder | Electron Forge 8 | If you want Electron's official toolchain. Its Vite plugin lags behind electron-vite, and there is no benefit here. |
## What NOT to Use
| Avoid | Why | Use Instead |
|---|---|---|
| `typescript@7.0.2` (npm `latest`) | `typescript-eslint` 8.72.1 caps at `<6.1.0`, so linting breaks [V] | `typescript@^5.9.3` (template) |
| `three@0.187.0` (npm `latest`) | Outside TalkingHead 1.8.2's `^0.186` peer range [V] | `three@0.186.1` |
| Installing `pdfjs-dist` directly | react-pdf 11 pins exactly 6.3.289; a different version causes the worker/API mismatch error [V] | Let react-pdf bring its own |
| `--use-file-for-fake-audio-capture` alone | Silently delivers zeros on macOS Electron 45 because the audio service sandbox can't read the file [V spike] | Also pass `--disable-features=AudioServiceSandbox` |
| Calling Claude live in the TDD loop | Slow, costs money, and nondeterministic | Recorded SSE fixtures; `@live` tag at phase gates |
| `keytar` | Archived 2022 | Env/keymgr, or Electron `safeStorage` |
| VAD, Smart Turn and `onnxruntime-web` in v1 | PROJECT.md locks button-driven turns, so they are pure surface area | Button start/stop; button press while speaking = barge-in |
| `smart-whisper` | Unmaintained since 2024-10 [V] | `whisper-cpp-node` |
| `nodejs-whisper` | Shells out with compile-on-install; clunky | `whisper-cpp-node`, or the brew `whisper-cli` fallback |
| Running E2E against `electron-vite dev` | Misses the `app://` protocol, the production CSP and asset hashing, which are exactly what breaks in a real build | E2E on the built `out/`, plus one packaged-`.app` smoke test |
## Stack Patterns by Variant
- Let the first run download from the Hugging Face hub into the Chromium cache, or vendor transformers.js and the model under `app://models/`.
- This is acceptable for a personal tool. Record it as a phase-specific research flag.
- Run whisper in a `utilityProcess` so main stays responsive. Never run partial transcriptions while the avatar is speaking. With button turns there are no partials in v1 anyway.
- Use `output_config.effort: 'low'` on interviewer turns first. Moving to a smaller model is Rishi's decision, not a default (avatar_shell.md §5.1).
## Version Compatibility
| Package A | Compatible With | Notes |
|---|---|---|
| electron@45.2.1 | Node 24.22.1 internally / ABI 150 | The dev Node (22.20) differs. Only N-API addons work in both without a rebuild. [V] |
| whisper-cpp-node@0.2.12 | Node 22 and Electron 45 | N-API, statically linked Metal/CoreML; `asarUnpack: ["**/*.node"]` still required. [V] |
| electron-vite@6.0.0 | vite ^6 \|\| ^7 \|\| ^8 | Use 8.3.5. [V] |
| vitest@5.1.0 | vite ^6.4 \|\| ^7 \|\| ^8; Node ^22.12 | Matches. [V] |
| @vitejs/plugin-react@6.2.1 | vite ^8 | [V] |
| @met4citizen/talkinghead@1.8.2 | three >=0.186 <0.187 | Pin 0.186.1. [V] |
| @met4citizen/headtts@1.3.0 | @huggingface/transformers ^4 (4.3.2) | [V] |
| react-pdf@11.0.0 | react ^19, pdfjs-dist **=6.3.289** | [V] |
| @anthropic-ai/sdk@1.4.0 | zod ^3.25 \|\| ^4 (for `helpers/zod`) | [V] |
| typescript-eslint@8.72.1 | typescript <6.1.0, eslint ^8.57–^10 | Keeps TS on 5.9 (or 6.0). [V] |
| @playwright/test@1.64.1 `_electron` | Electron >=21 | Proven on 45.2.1. [V] |
## Sources
- npm registry (`npm view`, `npm pack` + source inspection), 2026-11-03: electron, electron-vite, @quick-start/create-electron template, vite, vitest, @playwright/test, @anthropic-ai/sdk (client.d.ts `fetch`/`baseURL`, `ANTHROPIC_BASE_URL` default, helpers/zod `zodOutputFormat`), whisper-cpp-node and @whisper-cpp-node/darwin-arm64 (README API, N-API symbols, `otool -L`), react-pdf, @met4citizen/talkinghead, @met4citizen/headtts, typescript-eslint, @testing-library/react. HIGH.
- Local spike (Electron 45.2.1 + Playwright 1.64.1 on Apple Silicon): fake media flags, `AudioServiceSandbox` requirement, WebGPU (`apple/metal-3`) in Playwright-launched windows, hidden-window rendering and screenshots, `node:sqlite` in both runtimes, Electron's bundled Node 24. HIGH.
- Playwright Electron API: https://playwright.dev/docs/api/class-electron (experimental, Electron v21+, `nodeCliInspect` fuse caveat, `evaluate` in main). HIGH.
- Fake audio is one file per browser instance and can't be swapped mid-flow: https://docs.qawolf.com/qawolf/web-audio-injection . MEDIUM.
- Fake-mic flag usage in Playwright configs: https://huggingface.co/spaces/mindmime/gradio/blob/main/.config/playwright.config.js ; getUserMedia override pattern: https://zenn.dev/fatricepaddyy/articles/playwrightvoicetests . LOW (pattern reference only).
- Prior research this builds on: `research/voice_pipeline.md`, `research/avatar_shell.md`.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
