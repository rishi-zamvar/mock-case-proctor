# Phase 1: Scaffold, Harness & Key Onboarding - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning
**Mode:** Smart discuss, auto-accepted. The user is asleep and asked Claude to "choose the best path forward", so the recommended answers were taken.

<domain>
## Phase Boundary

The end state for this phase:
- An electron-vite + React + TypeScript app that is secure and sandboxed. It launches in dev and as a packaged, ad-hoc-signed arm64 `.app`.
- The full test harness: Vitest with main and renderer projects; Playwright `_electron` against the built `out/` with the fake-media switches; a Claude replay server via `ANTHROPIC_BASE_URL` with a `RECORD=1` capture mode.
- The `app://` protocol and a CSP.
- The Anthropic API key onboarding flow (Settings: paste, live probe, `safeStorage`; auto-fill from env or `.env`; Replace and Clear).
- Security tests: secret scan, key never in the renderer or logs, entitlements, no Node in the renderer, CSP present, no general file IPC.

There are no interview features in this phase.
</domain>

<decisions>
## Implementation Decisions

### Scaffold & stack
- Scaffold with `npm create @quick-start/electron@latest -- --template react-ts`, then pin per `.planning/research/STACK.md`:
  - electron 45.2.1, electron-vite 6, vite 8, react 19;
  - TypeScript ^5.9.3. Never TS 7.
  - `@anthropic-ai/sdk` 1.4.0, zod 4.6.7, vitest 5.1, `@playwright/test` 1.64.1, electron-builder 26.
- Directory layout:
  - `src/main/` holds services, the IPC router, the composition root and adapters.
  - `src/preload/` holds a typed, minimal `contextBridge` API.
  - `src/renderer/` holds React.
  - `src/shared/` holds IPC types and zod schemas.
  - `tests/e2e/` holds Playwright tests; `tests/fixtures/` holds the audio and Claude fixtures.
- Package manager: npm.
- Scripts:
  - `npm run dev`, `npm run build`, `npm run package` (electron-builder `--mac --arm64`, ad-hoc `identity: "-"`);
  - `npm test` (vitest run), `npm run test:e2e` (build, then playwright);
  - `npm run test:live` (opt-in, `@live` tag).

### Security baseline
- BrowserWindow settings: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, `backgroundThrottling: false`.
- The preload exposes only named, typed methods. It never exposes generic `ipcRenderer` or `invoke(channel)`. There is no fs or general file-read channel.
- `app://` is registered as privileged (standard, secure, supportFetchAPI, stream) before ready, and serves only from allowlisted roots: the renderer bundle, plus `assets/`, which later phases extend.
- CSP via meta and response headers. It allows `default-src 'self' app:` and `script-src 'self' 'wasm-unsafe-eval'`, plus `worker-src`, `media-src blob: app:` and `connect-src` for the HF hub. No `unsafe-eval` and no inline scripts.
- Entitlements:
  - `build/entitlements.mac.plist` and `build/entitlements.mac.inherit.plist` both carry `com.apple.security.device.audio-input` and `com.apple.security.device.camera`, plus the JIT and unsigned-memory keys Electron needs.
  - `NSMicrophoneUsageDescription` and `NSCameraUsageDescription` go in `extendInfo`.
  - A Vitest test parses both plists and the builder config and asserts all of this.

### API key onboarding
- **KeyStore service (main only).** Precedence:
  1. A key already stored in `safeStorage` (encrypted file in userData).
  2. Otherwise `process.env.ANTHROPIC_API_KEY`.
  3. Otherwise `.env` in the project root in dev. This is the keymgr symlink, read with a minimal parser: no dotenv dependency, just a few lines.

  If the key comes from the env or `.env`, it is probed, auto-saved and Settings is skipped. Register the project in keymgr: add `[projects.mock-case-proctor]` with `needs_shared = ["ANTHROPIC_API_KEY"]` to `~/.config/keys/projects.toml`, then `keymgr export mock-case-proctor`. That creates the `.env` symlink. Never print the key.
- **Probe.** A minimal live call: `messages.create` with `max_tokens: 1`, on the cheapest current model (look up IDs via the claude-api skill). Statuses:
  - 401 → invalid;
  - network error → "couldn't verify". The user may save anyway.
  - In tests, the probe goes through the replay server.
- **Renderer API.** The renderer sees only `{ hasKey: boolean, source: 'stored'|'env'|'dotenv'|'none', last4?: never }`. It never sees the key or any part of it. Settings shows a masked "Key saved ✓".
- **Settings screen:**
  - a paste field (password type), plus Save & verify, Replace and Clear buttons;
  - status text and error states.
- **Routing.** On first run with no key, the app routes to Settings. Otherwise it routes to a placeholder Home screen ("Case library coming in Phase 3").
- **Logging.** One main-process logger with a redaction function that masks `sk-ant-[A-Za-z0-9_-]+`. It is unit-tested.

### Test harness
- **Vitest:** `test.projects` with `main` (node; `src/main`, `src/shared`) and `renderer` (jsdom; `src/renderer`). Coverage via v8.
- **Playwright:**
  - Launch `out/main/index.js` via `_electron.launch` with `env: { E2E: '1', ANTHROPIC_BASE_URL, USER_DATA_DIR: tmp }`.
  - When E2E=1, main sets a userData override (isolated profile per test) and these Chromium switches before ready: `use-fake-ui-for-media-stream`, `use-fake-device-for-media-stream`, `use-file-for-fake-audio-capture=<wav>`, and `disable-features=AudioServiceSandbox`.
  - `workers: 1`.
- **Fake audio check.** The E2E harness test proves non-silent audio. It generates a WAV with `say` and `afconvert` in globalSetup. The renderer test page reads the peak via the AudioContext analyser through an E2E-only `window.__e2e` hook, and the test asserts peak > 0.1. The hook is exposed only when E2E=1.
- **Replay server.** About 60 lines of `node:http` serving recorded SSE/JSON fixtures keyed by scenario plus request index. `RECORD=1` proxies to the real API and tees the traffic to fixtures. The API key is stripped from saved request JSON, and a test asserts it.
- **Packaged smoke.** A Playwright test with `executablePath` pointing at `release/mac-arm64/*.app` launches and sees the first window. It is tagged `@packaged`; run it at the phase gate.
- **Secret scan.** A Vitest test runs `git ls-files`, greps tracked contents for `sk-ant-`, and fails on any match.

### Visual direction (app-wide, set here; later phases extend it)
- A calm, professional video-call aesthetic, dark by default. Think Zoom or Linear, not a game.
- Tokens: background #0B0F14, surface #121821, elevated #1A2230, text #E6EDF3, muted #8B98A5. The accent is teal #19A7A0, matching the case decks' navy and teal. Danger #E5484D, warning #F5A524.
- Type: Inter (bundled locally, no Google Fonts fetch), 14 px base, tabular numbers for timers.
- Layout: an 8 px grid, 12 px radii, no gradients, subtle 1 px borders.
- CSS variables in `src/renderer/styles/tokens.css`, plain CSS modules. No UI framework.

### Claude's Discretion
- Exact file names, module boundaries inside `src/main`, the replay fixture format, and the React router choice. Prefer a plain state switch over a router library.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- A greenfield repo, apart from `.planning/` and `research/`. The spike code at `/private/tmp/claude-501/-Users-rishizamvar/b5aaa262-21e3-4b10-bb85-7693b3bc6956/scratchpad/spike/` proves the fake-media flags and WebGPU under Playwright, so reuse its launch args.

### Established Patterns
- Dependencies are injected as plain function parameters (no DI framework), per STACK.md.

### Integration Points
- Key manager: `~/.config/keys/` (`projects.toml`, `keymgr` CLI at `~/.local/bin/keymgr`).
- GitHub remote `origin` = `rishi-zamvar/mock-case-proctor` (private). Push after each phase.
</code_context>

<specifics>
## Specific Ideas
- The user explicitly wants this: the key is never hardcoded anywhere, the user pastes it in, and for Rishi's own machine it is filled in automatically.
- TDD is mandatory. Write a failing test, then the code.
- Live testing of every feature in the real app.
</specifics>

<deferred>
## Deferred Ideas
- None. Interview features belong to later phases.
</deferred>
