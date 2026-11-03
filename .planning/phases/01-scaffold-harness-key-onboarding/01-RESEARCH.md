# Phase 1: Scaffold, Harness & Key Onboarding - Research

**Researched:** 2026-11-03
**Domain:** Building a secure Electron 45 shell (electron-vite 6), packaging it as an ad-hoc-signed arm64 app with electron-builder 26, safeStorage key storage, the Anthropic SDK 1.4.0 probe, and a Vitest 5 + Playwright `_electron` harness
**Confidence:** HIGH. Almost every claim below was run on this Mac today: a scaffold with the pinned stack, a packaged ad-hoc app, Playwright launching both the built and the packaged app, safeStorage, `app://` with CSP, and a live probe. Unverified items are flagged.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scaffold & stack**
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

**Security baseline**
- BrowserWindow settings: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, `backgroundThrottling: false`.
- The preload exposes only named, typed methods. It never exposes generic `ipcRenderer` or `invoke(channel)`. There is no fs or general file-read channel.
- `app://` is registered as privileged (standard, secure, supportFetchAPI, stream) before ready, and serves only from allowlisted roots: the renderer bundle, plus `assets/`, which later phases extend.
- CSP via meta and response headers. It allows `default-src 'self' app:` and `script-src 'self' 'wasm-unsafe-eval'`, plus `worker-src`, `media-src blob: app:` and `connect-src` for the HF hub. No `unsafe-eval` and no inline scripts.
- Entitlements:
  - `build/entitlements.mac.plist` and `build/entitlements.mac.inherit.plist` both carry `com.apple.security.device.audio-input` and `com.apple.security.device.camera`, plus the JIT and unsigned-memory keys Electron needs.
  - `NSMicrophoneUsageDescription` and `NSCameraUsageDescription` go in `extendInfo`.
  - A Vitest test parses both plists and the builder config and asserts all of this.

**API key onboarding**
- KeyStore service (main only). Precedence:
  1. A key already stored in `safeStorage` (encrypted file in userData).
  2. Otherwise `process.env.ANTHROPIC_API_KEY`.
  3. Otherwise `.env` in the project root in dev. This is the keymgr symlink, read with a minimal parser: no dotenv dependency, just a few lines.

  If the key comes from the env or `.env`, it is probed, auto-saved and Settings is skipped. Register the project in keymgr: add `[projects.mock-case-proctor]` with `needs_shared = ["ANTHROPIC_API_KEY"]` to `~/.config/keys/projects.toml`, then `keymgr export mock-case-proctor`. That creates the `.env` symlink. Never print the key.
- Probe. A minimal live call: `messages.create` with `max_tokens: 1`, on the cheapest current model (look up IDs via the claude-api skill). Statuses:
  - 401 → invalid;
  - network error → "couldn't verify". The user may save anyway.
  - In tests, the probe goes through the replay server.
- Renderer API. The renderer sees only `{ hasKey: boolean, source: 'stored'|'env'|'dotenv'|'none', last4?: never }`. It never sees the key or any part of it. Settings shows a masked "Key saved ✓".
- Settings screen:
  - a paste field (password type), plus Save & verify, Replace and Clear buttons;
  - status text and error states.
- Routing. On first run with no key, the app routes to Settings. Otherwise it routes to a placeholder Home screen ("Case library coming in Phase 3").
- Logging. One main-process logger with a redaction function that masks `sk-ant-[A-Za-z0-9_-]+`. It is unit-tested.

**Test harness**
- Vitest: `test.projects` with `main` (node; `src/main`, `src/shared`) and `renderer` (jsdom; `src/renderer`). Coverage via v8.
- Playwright:
  - Launch `out/main/index.js` via `_electron.launch` with `env: { E2E: '1', ANTHROPIC_BASE_URL, USER_DATA_DIR: tmp }`.
  - When E2E=1, main sets a userData override (isolated profile per test) and these Chromium switches before ready: `use-fake-ui-for-media-stream`, `use-fake-device-for-media-stream`, `use-file-for-fake-audio-capture=<wav>`, and `disable-features=AudioServiceSandbox`.
  - `workers: 1`.
- Fake audio check. The E2E harness test proves non-silent audio. It generates a WAV with `say` and `afconvert` in globalSetup. The renderer test page reads the peak via the AudioContext analyser through an E2E-only `window.__e2e` hook, and the test asserts peak > 0.1. The hook is exposed only when E2E=1.
- Replay server. About 60 lines of `node:http` serving recorded SSE/JSON fixtures keyed by scenario plus request index. `RECORD=1` proxies to the real API and tees the traffic to fixtures. The API key is stripped from saved request JSON, and a test asserts it.
- Packaged smoke. A Playwright test with `executablePath` pointing at `release/mac-arm64/*.app` launches and sees the first window. It is tagged `@packaged`; run it at the phase gate.
- Secret scan. A Vitest test runs `git ls-files`, greps tracked contents for `sk-ant-`, and fails on any match.

**Visual direction (app-wide, set here; later phases extend it)**
- A calm, professional video-call aesthetic, dark by default. Think Zoom or Linear, not a game.
- Tokens: background #0B0F14, surface #121821, elevated #1A2230, text #E6EDF3, muted #8B98A5. The accent is teal #19A7A0. Danger #E5484D, warning #F5A524.
- Type: Inter (bundled locally, no Google Fonts fetch), 14 px base, tabular numbers for timers.
- Layout: an 8 px grid, 12 px radii, no gradients, subtle 1 px borders.
- CSS variables in `src/renderer/styles/tokens.css`, plain CSS modules. No UI framework.

### Claude's Discretion
- Exact file names, module boundaries inside `src/main`, the replay fixture format, and the React router choice. Prefer a plain state switch over a router library.

### Deferred Ideas (OUT OF SCOPE)
- None. Interview features belong to later phases.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | One command for dev, one for a packaged ad-hoc arm64 `.app` | Scaffold flow (§Scaffold); `electron-builder.json` built and launched today (§Code Examples); `args:['.']` vs `out/main/index.js` finding (Pitfall 4) |
| FND-02 | Private repo, gitignore, secret-scan test | Repo verified PRIVATE via `gh`; the bare `sk-ant-` scan already fails on 3 tracked planning docs, so use a key-shaped regex (Pitfall 6) |
| FND-03 | Vitest main/renderer projects, Playwright with fake media, replay server with RECORD | Vitest 5 `test.projects` run today; the fake-media switches merge with Playwright's own `disable-features` (Pitfall 7); replay server design (§Pattern 4) |
| FND-04 | Camera and mic entitlements in main and inherit plists, plus usage strings, tested | Built and inspected with `codesign -d --entitlements`; `disable-library-validation` is required for ad-hoc (Pitfall 2) |
| FND-05 | Sandbox, context isolation, CSP, no Node, no general file IPC, `app://` | Prototype verified: no `require`/`process`/`electron` globals, CSP header and violations, `%2f` traversal returns 403; the toolkit preload breaks under sandbox (Pitfall 3) |
| KEY-01 | Settings: paste, live probe, safeStorage | Live probe of `claude-haiku-5-5` with `max_tokens:1` measured; error classes verified; async safeStorage API (sync one deprecated) |
| KEY-02 | Auto-fill from env or `.env` (keymgr) | keymgr source read: `export` does **not** create the symlink (Pitfall 9); E2E must not read the real `.env` (Pitfall 8) |
| KEY-03 | Key never in renderer, logs, fixtures or git | Redaction regex; SDK log redaction verified; replay strips `authorization` (the SDK sends `Authorization: Bearer`, not `x-api-key`) |
| KEY-04 | Replace and clear | KeyStore API; the replay server records the last bearer in memory so E2E can prove the new key is used |
| QA-01 | TDD | Pure modules with injected deps; injected `fetch` seam verified for the probe; test-first task ordering |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Platform: macOS Apple Silicon, Node 22 (22.20.0 installed), Electron latest stable (45.2.1).
- The only paid dependency is the Claude API. The key comes from `~/.config/keys` keymgr. The key never goes in the renderer or logs.
- TDD is mandatory. Every feature needs automated tests **and** a live E2E run in the real app.
- Follow the STACK.md pins:
  - TS `^5.9.3` (never 7), `three@0.186.1` later, and never install `pdfjs-dist` directly.
  - JSON + zod for persistence, no native modules (N-API only).
  - Don't flip the `EnableNodeCliInspectArguments` fuse (Playwright needs it).
- E2E runs against the **built** output, never `electron-vite dev`. Run one packaged-`.app` smoke test per phase gate.
- API frugality: fixtures are the default, and live calls happen only at phase gates (`@live`).
- Work goes through GSD commands. Push to `origin` (`rishi-zamvar/mock-case-proctor`, private) after the phase.
- From the user's global memory:
  - Never hardcode credentials.
  - Never force-delete user files; use trash.
  - Tests come before logic.

## Summary

The pinned stack scaffolds, builds, packages and E2E-launches cleanly on this machine. I reproduced the whole Phase 1 skeleton in the scratchpad:
- `npm create @quick-start/electron@latest scaf -- --template react-ts --skip`, then electron 45.2.1, vitest 5.1.0 and @playwright/test 1.64.1.
- A sandboxed window loading `app://bundle/index.html`, with a CSP response header.
- A Vitest config with two projects, both passing.
- An ad-hoc-signed arm64 `.app` with camera and mic entitlements in both plists.
- Playwright launching both `.` and the packaged executable.
- safeStorage round-tripping across a restart under a mock keychain.
- A live `claude-haiku-5-5` probe: 578 ms, `stop_reason: max_tokens`, 10 input and 1 output tokens.

The phase is mostly assembly, and the risk sits in about ten non-obvious traps, each of which this research hit for real. In order of severity:
1. Running the scaffolder with `--skip` into `.` **wipes the repo, including `.git` and `.planning/`**.
2. The template preload `require`s `@electron-toolkit/preload`, which **fails under `sandbox: true`**. The template also exposes generic `window.electron.ipcRenderer`, which violates FND-05.
3. An ad-hoc signature with hardened runtime needs `com.apple.security.cs.disable-library-validation`.
4. The packaged app under Playwright **wrote a real keychain item** until main explicitly appended `use-mock-keychain` when E2E=1.
5. A bare `sk-ant-` secret scan fails today, because the planning docs contain the regex text.
6. `keymgr export` does not create the `.env` symlink.
7. The real `.env` would leak into E2E unless dotenv loading is gated.

**Primary recommendation:**
1. Scaffold into a temp dir and copy the files in.
2. Replace the template's main, preload, App and builder config with the hardened versions in §Code Examples.
3. Build every main-process unit (KeyStore, probe, redaction, `app://` resolver, dotenv parser, replay server) as a pure module with injected dependencies, writing the test first.
4. Make the E2E fixture strip `ANTHROPIC_*` from the inherited env and always set `E2E=1`, `USER_DATA_DIR`, and a per-test replay server URL.

## Standard Stack

All versions were checked with `npm view` on 2026-11-03.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 45.2.1 | Shell (Node 24.22.1, Chromium 156) | Locked; the template pins ^44.7.2, so bump it |
| electron-vite | 6.0.0 | main/preload/renderer build; dev spawns `electron .` | Locked; template default |
| vite | 8.3.5 | Bundler | Peer of electron-vite 6 |
| react / react-dom | ^19.3.0 (template) | Renderer | Locked |
| typescript | ^5.9.3 (template; 5.9.3 is the latest 5.x) | Types | Locked; TS 7 breaks typescript-eslint |
| @anthropic-ai/sdk | 1.4.0 (2026-11-02) | Probe now, interviewer later (main only) | Locked; `fetch`/`baseURL` seams verified |
| zod | 4.6.7 | IPC input validation, persisted-file schemas | Locked |
| electron-builder | 26.18.0 | `.app` packaging (template ^26.15.3, so bump it) | Locked; flat `mac.identity` etc. in 26.18 |
| @electron-toolkit/utils | ^4.0.0 (template) | `is.dev`, `optimizer` | Keep. It is externalized in main, which is fine |

### Supporting (dev)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 5.1.0 | Unit and integration tests | `test.projects`, verified today |
| @vitest/coverage-v8 | 5.1.0 | Coverage | Root `coverage` config |
| jsdom | 30.1.3 | Renderer project environment | Verified today |
| @testing-library/react | 16.3.3 | Component tests | Verified today |
| @testing-library/dom | 10.4.2 | Required peer | Install explicitly |
| @testing-library/user-event | 14.6.8 | Typing and clicking in the Settings tests | Settings component tests |
| @playwright/test | 1.64.1 | `_electron` E2E | `import { _electron } from '@playwright/test'` works |
| @fontsource-variable/inter | 5.3.0 | Local Inter woff2, bundled by Vite | Meets "Inter bundled locally"; `font-src 'self'` covers it |

**Remove from the template:**
- `@electron-toolkit/preload`: it breaks the sandboxed preload and exposes generic IPC.
- `electron-builder.yml`: replace it with `electron-builder.json`, so the config test can `JSON.parse` it without adding a YAML dependency.
- The `build:win` and `build:linux` scripts, the `publish` block, `Versions.tsx`, and the svgs.

**No new dependencies for:**
- plist parsing: use `plutil -convert json -o - <file>`, a macOS system tool.
- dotenv: about 8 lines of code.
- The replay server: `node:http`.
- WAV generation: `say`.

**Installation (after scaffold):**
```bash
npm uninstall @electron-toolkit/preload
npm i @anthropic-ai/sdk@1.4.0 zod@4.6.7            # runtime deps MUST be in "dependencies" (electron-vite externalizes them; builder packages them)
npm i -D electron@45.2.1 electron-builder@26.18.0 vitest@5.1.0 @vitest/coverage-v8@5.1.0 jsdom@30.1.3 \
  @testing-library/react@16.3.3 @testing-library/dom@10.4.2 @testing-library/user-event@14.6.8 \
  @playwright/test@1.64.1 @fontsource-variable/inter@5.3.0
```
No `npx playwright install` is needed, because the tests drive the electron binary. Keep the template's `postinstall: install-electron && electron-builder install-app-deps`. Electron 45 no longer downloads its binary on install, so `install-electron` (or the first `electron` run) fetches it.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `messages.create` probe (locked) | `models.list()` | It's free, but the probe is locked and costs about $0.0000015 per call |
| Page-level `page.evaluate` peak check | `window.__e2e` hook (locked) | `page.evaluate` needs no app code. If you keep the hook, gate it via `additionalArguments` (§Pattern 5) |

## Architecture Patterns

### Recommended Project Structure (template paths preserved)
```
electron-builder.json            # replaces electron-builder.yml
electron.vite.config.ts          # template; add @shared alias
vitest.config.mts                # .mts avoids Vite's "ESM in CJS" warning; do NOT add "type":"module"
playwright.config.ts
build/entitlements.mac.plist + entitlements.mac.inherit.plist
src/
├── shared/ipc.ts                # channel names + payload types + zod schemas (KeyStatus, SaveKeyResult)
├── main/
│   ├── index.ts                 # composition root: E2E switches, protocol, permissions, window, IPC wiring
│   ├── window.ts                # WINDOW_PREFS constant (unit-asserted) + createWindow
│   ├── app-protocol.ts          # resolveAppUrl(url, roots) pure + CSP constant  (+ .test.ts)
│   ├── key-store.ts             # precedence, save/clear, injected crypto/fs  (+ .test.ts)
│   ├── key-probe.ts             # probeKey(key, {fetch?}) → 'valid'|'invalid'|'unverified'  (+ .test.ts)
│   ├── dotenv.ts                # parseDotenv(text) (+ .test.ts)
│   ├── log.ts                   # redact() + logger writing userData/logs/main.log  (+ .test.ts)
│   └── ipc.ts                   # handle(channel, schema, fn): validates input; records outbound in E2E
├── preload/index.ts             # imports ONLY 'electron' + `import type` from shared
└── renderer/
    ├── index.html               # meta CSP (same string as main's header)
    └── src/ main.tsx App.tsx screens/{Settings,Home}.tsx styles/tokens.css
tests/
├── unit/                        # secret-scan, gitignore, entitlements/builder config, csp-parity
├── support/replay-server.ts     # used by Playwright fixture AND its own vitest test
├── fixtures/claude/<scenario>/000.json
└── e2e/ fixtures.ts smoke.spec.ts security.spec.ts key.spec.ts harness.spec.ts packaged.spec.ts
```
Note that the template's renderer lives at `src/renderer/src/`, with `index.html` at `src/renderer/`. CONTEXT asks for `src/renderer/styles/tokens.css`. Put it at `src/renderer/src/styles/tokens.css` so it stays inside `tsconfig.web.json`'s include and under the `@renderer` alias, or extend the include. Also add `src/shared/**/*` to the includes in **both** `tsconfig.node.json` and `tsconfig.web.json`.

### Pattern 1: Composition root with the E2E block before ready
**What:** Every Chromium switch and the userData override run at module top level, before `app.whenReady()`. `protocol.registerSchemesAsPrivileged` also runs at top level.
**Verified:** `app.setPath('userData')` before ready works, and the merged `disable-features` contained both Playwright's list and `AudioServiceSandbox`.

### Pattern 2: `app://` path-safe serving
**What:** Map hosts to roots: `app://bundle/*` goes to `out/renderer`, and `app://assets/*` goes to `resources/`. Run `decodeURIComponent`, then `path.resolve`, then require the result to start with `root + sep`. Anything else gets a 403. A missing file makes `net.fetch` **reject**, so catch it and return 404, or the renderer sees an opaque "Failed to fetch". Add the CSP header to every response.
**Verified:**
- `app://bundle/..%2fmain.js` reaches the handler and is turned away with 403 only by the guard. The standard scheme normalizes a literal `../` but not `%2f`.
- Module scripts with `crossorigin` load fine same-origin.
- Packaged loading from inside `app.asar` works.

### Pattern 3: KeyStore with injected dependencies (pure, Vitest-testable without Electron)
- `init()`, called after ready and **before** `createWindow`:
  1. Read the stored blob. If it decrypts, use it with source `stored`.
  2. Otherwise read `env.ANTHROPIC_API_KEY` (source `env`), or the dotenv file if `dotenvPath` is set (source `dotenv`).
  3. If a candidate exists, probe it. If the result is `valid`, encrypt and save it.
  4. If decryption fails (ACL change, keychain deny, corrupt file), treat it as "no stored key" and fall through. Never crash, and never fall back to plaintext.
- `status()` returns `{hasKey, source}` only.
- `save(key, {force})`:
  1. Trim and validate the input with zod (string, 20–300 chars).
  2. Probe it.
  3. On `valid`, or on `unverified` with `force`, encrypt and atomically write `userData/anthropic-key.bin` (tmp file + rename, mode 0600).
  4. Return `{result}`.
- **Replace** is just `save()`. The old key stays until the new one passes.
- `clear()` deletes the file and sets status to `none`.
- `getKey()` is **main-only** and has no IPC exposure.
- **crypto:** `{ available: () => safeStorage.isAsyncEncryptionAvailable(), encrypt: s => safeStorage.encryptStringAsync(s), decrypt: async b => (await safeStorage.decryptStringAsync(b)).result }`. The sync `encryptString`/`decryptString`/`isEncryptionAvailable` are **deprecated in Electron 45** (verified in `electron.d.ts`). If `available()` is false, don't persist: hold the key in memory and show "Keychain unavailable".

### Pattern 4: Replay server (`tests/support/replay-server.ts`)
- `startReplay({ dir, scenario, record, upstream })` listens on `127.0.0.1:0` and returns `{ url, requests, lastAuth, close }`.
- **Fixture format:**
  - Responses go in `tests/fixtures/claude/<scenario>/<NNN>.json` as `{status, headers, body}`. `body` is the raw string, either JSON or SSE text.
  - Requests go in `<NNN>.req.json` as `{method, url, headers (minus secrets), body}`.
- **Replay:** serve fixture `i++` for each request. If it's missing, return **418** with `no fixture <scenario>/<NNN>`. A 4xx isn't retried by the SDK, so the test fails fast and loud.
- **Record (`RECORD=1`):**
  1. Forward to `upstream` (default `https://api.anthropic.com`) with the incoming headers, minus `host` and `content-length`.
  2. Save the response **without** `content-encoding`, `content-length`, `transfer-encoding`, `connection` or `anthropic-organization-id`. Node `fetch` already decompressed the body, so replaying `content-encoding: gzip` would break the client.
  3. Strip `authorization`, `x-api-key` and `proxy-authorization` from the saved request.
  4. Before writing, **assert** that neither file matches the key regex.
- The app needs **zero changes**: the SDK reads `ANTHROPIC_BASE_URL` when the client is constructed. So construct the client per probe call, not as a module singleton at import time.
- Test RECORD mode deterministically by pointing `upstream` at a second tiny local `node:http` "fake Anthropic". The criterion "RECORD=1 captures a fixture" is then proved for free. An optional `@live` run records `probe-valid` against the real API.

### Pattern 5: E2E launch fixture
- Launch with `electron.launch({ args: ['.'], cwd: ROOT, env })`, not with `out/main/index.js`. The two resolve to the same built file through `package.json` `main`, but `args:['.']` gives `app.getAppPath()` = repo root and `app.getName()` = productName. A direct file path gives appPath `out/main` and name "Electron" (verified).
- Build `env` from `process.env` **minus** `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_PROFILE` and `ANTHROPIC_LOG`. Then add `E2E=1`, `USER_DATA_DIR=<mkdtemp>`, `FAKE_WAV`, `ANTHROPIC_BASE_URL=<replay.url>`, plus per-test extras. Playwright's `env` *replaces* the environment ("Defaults to process.env"), so you must spread it yourself.
- Use one replay server per test, created in the fixture. With `workers: 1` this is simplest and needs no global state.
- globalSetup only generates the WAV: `say -o <tmp>/fixture.wav --data-format=LEI16@48000 "…"`. This was verified to produce a WAVE 48 kHz Int16 file; `afconvert` isn't needed.
- To read app files, use Node `fs` in the **test** process against the known `USER_DATA_DIR`. `electronApp.evaluate()` has **no `require`** (verified: ReferenceError). It receives only the electron module.
- If you keep the locked `window.__e2e` hook, pass `webPreferences.additionalArguments: ['--e2e']` only when E2E=1 and expose the hook in the preload only if `process.argv.includes('--e2e')`. The simpler, equally valid route is to run the analyser in `page.evaluate`, as the spike did, with no app code.

### Pattern 6: IPC router as the single choke point
`handle(channel, inputSchema, fn)` wraps `ipcMain.handle`. It zod-parses the renderer input (a trust boundary) and returns `fn`'s result. When E2E=1 it also pushes `{channel, result}` to `globalThis.__ipcOut`, which the tests read via `electronApp.evaluate(() => globalThis.__ipcOut)` and scan for the key. Phase 3's BAR-01 IPC-tap extends this same seam.

Phase 1 channels are `key:status`, `key:save {key, force?}` and `key:clear`. The preload exposes exactly `window.api.key.{status, save, clear}`.

### Anti-Patterns to Avoid
- **`contextBridge.exposeInMainWorld('electron', electronAPI)`** (template): generic `ipcRenderer.send/invoke/on`. Delete it.
- **Template `setWindowOpenHandler` → `shell.openExternal(any url)`**: deny everything (`{action:'deny'}`) and block `will-navigate` away from `app://bundle`.
- **Importing a runtime value (zod, sdk, anything from node_modules) into the preload**: electron-vite externalizes it to `require('x')`, which throws in a sandboxed preload. Use `import type` only. Shared constants are fine, because relative imports get bundled.
- **Asserting CSP with `page.evaluate(() => eval('1'))`**: CDP-evaluated code bypasses CSP, and the eval "ran" in the test. Instead, inject a `<script>` element or run eval inside `setTimeout`, and listen for `securitypolicyviolation` (verified: blocked, with violations reported).
- **A module-level `new Anthropic()`**: it captures env at import time and hides the replay seam.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Encrypting the key at rest | Custom AES or a keychain wrapper (`keytar` is archived) | `safeStorage.encryptStringAsync` / `decryptStringAsync` | Uses the OS keychain key; locked |
| Mapping HTTP status to error | Status-code parsing | SDK classes `AuthenticationError`, `PermissionDeniedError`, `APIConnectionError` (named exports) | Verified with an injected `fetch` |
| Intercepting Claude HTTP in unit tests | MSW or nock | SDK `fetch` constructor option | Verified: 401→AuthenticationError, TypeError→APIConnectionError, 200→message |
| Intercepting Claude in E2E | Monkey-patching main | `ANTHROPIC_BASE_URL` + replay server | The real code path runs |
| Parsing plists | A plist npm package | `plutil -convert json -o - file` | System tool |
| Ad-hoc signing | Manual `codesign` scripts | electron-builder `mac.identity: "-"` | Signs the app and helpers with entitlements |
| Fake microphone | getUserMedia stubs | Chromium fake-media switches + WAV | Spike-proven |
| Avoiding keychain prompts in tests | Stubbing safeStorage in E2E | `--use-mock-keychain` switch (Electron ≥45.0.0-alpha.6) | Verified: no keychain item, and decrypt works across restarts |

## Common Pitfalls

### Pitfall 1: The scaffolder empties the target directory
**What goes wrong:** `npm create @quick-start/electron@latest . -- --template react-ts --skip` deletes `.git`, `.planning/`, `research/` and `CLAUDE.md`.
**Why:** In create-electron 1.0.31 source, `shouldOverwrite = skip` leads to `emptyDir(root)`, and `emptyDir` walks recursively with no exclusions.
**How to avoid:**
1. Scaffold into a temp dir: `npm create @quick-start/electron@latest <scratch>/scaf -- --template react-ts --skip`. It's non-interactive; verified.
2. Copy into the repo with `rsync -a --exclude .gitignore <scratch>/scaf/ ./`.
3. Merge the template's `.gitignore` lines (`.eslintcache`, `*.log*`) into the existing one.
4. Run `npm pkg set name=mock-case-proctor productName="Mock Case Proctor"`.
**Warning sign:** `git status` shows deleted planning files.

### Pitfall 2: An ad-hoc-signed app fails to launch (library validation)
**What goes wrong:** With hardened runtime (on by default) and `identity: "-"`, Electron Framework's Team ID doesn't match, and the app crashes at launch.
**How to avoid:**
- Put `com.apple.security.cs.disable-library-validation` in **both** plists, alongside allow-jit, allow-unsigned-executable-memory, device.audio-input and device.camera.
- electron-builder 26.18 prints the "ad-hoc signing with hardenedRuntime enabled requires …" warning **even when the key is present**. That's expected, so ignore it.
- Verified: `codesign -dv` shows `flags=0x10002(adhoc,runtime)`, and both the app and `Helper (Renderer).app` carry all 5 entitlements.

### Pitfall 3: The template preload breaks under `sandbox: true`
**What goes wrong:**
- The built `out/preload/index.js` contains `require("@electron-toolkit/preload")`. Sandboxed preloads can only require `electron` and a few built-ins, so the API never appears.
- The template's `App.tsx` and `Versions.tsx` read `window.electron.*`, so the renderer crashes on mount. In the prototype this was a blank page and the selector timed out.

**How to avoid:**
- Rewrite the preload to `import { contextBridge, ipcRenderer } from 'electron'` only, and rewrite App.
- Add a test asserting that the built preload's only `require(` is `"electron"`. Run it after the build, in the e2e or security spec.

### Pitfall 4: Launching `out/main/index.js` directly changes the app name, userData and appPath
**What goes wrong:** You get `app.getName()` = "Electron" and `getAppPath()` = `out/main`, so `.env` lookup and the default userData differ from dev and packaged runs.
**How to avoid:** Launch with `args: ['.']` (dev also spawns `electron .`), and set `productName` in package.json. Verified: the name is "Mock Case Proctor" in dev-style launches and packaged runs alike.

### Pitfall 5: Packaged E2E touches the real login keychain
**What goes wrong:** The packaged app launched by Playwright with `executablePath` created a **real** `Mock Case Proctor Safe Storage` keychain item. Playwright's loader lists `--use-mock-keychain`, but that didn't take effect for the packaged launch.
- Each ad-hoc rebuild changes the code signature, so the next access to that item can raise a keychain dialog. That would hang an unattended run.
- I deleted the test-created item afterwards.

**How to avoid:** When `E2E === '1'`, main **explicitly** calls `app.commandLine.appendSwitch('use-mock-keychain')`. Verified: no item was created, and an encrypted blob decrypted after a restart under the mock key.
**Real-use consequence (not a test issue):**
- Dev (`electron .`) and the packaged app share userData (`~/Library/Application Support/Mock Case Proctor`) but have different signatures. The packaged app reading a blob that dev saved, or the reverse after a rebuild, can therefore prompt "wants to use your confidential information". Rishi clicks Always Allow.
- If he clicks Deny, the decrypt fails. KeyStore must then fall back to env or Settings and must not crash (Pattern 3).

### Pitfall 6: The bare `sk-ant-` secret scan fails on day one
**What goes wrong:** `git ls-files | xargs grep -l sk-ant-` already matches `.planning/REQUIREMENTS.md`, `ROADMAP.md` and `01-CONTEXT.md`, which contain the regex text. The test files would match themselves too.
**How to avoid:**
- Scan for **key-shaped** strings: `/sk-ant-[A-Za-z0-9_-]{20,}/`. That matched zero tracked files today.
- Scan `git ls-files` plus `git ls-files --others --exclude-standard`, so it catches files before they're committed.
- In tests, build fake keys at runtime: `'sk-ant-' + 'test-' + 'x'.repeat(24)`. A source literal would trip the scanner.
- Planner note: this refines the locked "greps for `sk-ant-`" so it's implementable. The intent, failing on any tracked key, is preserved.

### Pitfall 7: The `disable-features` switch overwrites Playwright's list
**What goes wrong:** Playwright's loader appends `--disable-features=<18 features>` first. A plain `appendSwitch('disable-features','AudioServiceSandbox')` in main then replaces that value.
**How to avoid:** Merge the values: `[app.commandLine.getSwitchValue('disable-features'), 'AudioServiceSandbox'].filter(Boolean).join(',')`. Verified that the merged value contains both.

### Pitfall 8: E2E picks up the real key
**What goes wrong:**
- The repo-root `.env` is the keymgr symlink holding the **real** key. With `args:['.']`, appPath is the repo root, so a dev-mode dotenv lookup would load it in every E2E run and send it to the replay server, or upstream in RECORD mode.
- An `ANTHROPIC_API_KEY` exported in the shell would leak into the app the same way.

**How to avoid:**
- `dotenvPath = process.env.MCP_DOTENV_PATH ?? (E2E || app.isPackaged ? null : join(app.getAppPath(), '.env'))`. The E2E dotenv test sets `MCP_DOTENV_PATH` to a temp file holding a fake key.
- The E2E fixture strips `ANTHROPIC_*` from the inherited env. These are unset in Rishi's shell today, but strip them anyway.

### Pitfall 9: `keymgr export` does not create the symlink
**What goes wrong:** CONTEXT says export "creates the `.env` symlink". The keymgr source (`render_slice`) only writes `~/.config/keys/.envs/<project>.env` (mode 0600). `keymgr ls` shows ✗ until you link it yourself.
**How to avoid (exact steps; never `cat` the files):**
1. `cp ~/.config/keys/projects.toml ~/.config/keys/backup/projects.toml.$(date +%Y%m%d%H%M%S)`
2. Append to `~/.config/keys/projects.toml`:
   ```toml

   [projects.mock-case-proctor]
   path = "/Users/rishizamvar/Documents/Projects/mock-case-proctor/.env"
   needs_shared = ["ANTHROPIC_API_KEY"]
   secrets_enc = false
   ```
3. `~/.local/bin/keymgr export mock-case-proctor` prints only `rendered: <path>`.
4. `ln -s ~/.config/keys/.envs/mock-case-proctor.env /Users/rishizamvar/Documents/Projects/mock-case-proctor/.env`
5. Verify with `keymgr ls | grep mock-case-proctor` (it should show ✓) and `git check-ignore -q .env && echo ignored`. Don't run `keymgr probe`: it prints a body excerpt and is unnecessary.
- The rendered slice has `#` comment lines and unquoted `KEY=value` lines. The parser must skip comments and blank lines and split on the first `=`.

### Pitfall 10: GUI-launched apps have no shell env, and the packaged app can't see `.env`
**What goes wrong:** KEY-02's env and `.env` paths work only for `npm run dev` or terminal launches. A Finder-launched `.app` gets no `ANTHROPIC_API_KEY`, and the `.env` lookup is disabled when packaged.
**How to avoid:** Nothing more is needed. Dev auto-saves into safeStorage, and the packaged app shares userData (see the Pitfall 5 prompt caveat). Document this in the Settings help text.

### Pitfall 11: The SDK credential chain and auth header
- SDK 1.4.0 sends `apiKey` as **`Authorization: Bearer <key>`**, not `x-api-key`. Verified from source and from an injected fetch. The replay recorder and any log scrubbing must strip `authorization`.
- With no `apiKey`, SDK 1.x resolves a credential chain: `ANTHROPIC_PROFILE`, workload identity, and on-disk profiles. Always pass `apiKey` explicitly, and never construct a client when there is no key.
- `ANTHROPIC_LOG=debug` logging redacts `authorization` and `x-api-key` (`internal/utils/log.js`). Still, never log request options or raw errors. Pass them through `redact()`.

### Pitfall 12: The adaptive-thinking model with `max_tokens: 1`
- Haiku 5.5 has adaptive thinking on by default. The live probe with `max_tokens: 1` returned **200**, `stop_reason: "max_tokens"` and `content: []`. Don't assert on content.
- Classify results this way:
  - Resolved means `valid`.
  - `AuthenticationError` or `PermissionDeniedError` means `invalid`.
  - Anything else (connection, timeout, 429, 5xx, 400) means `unverified`, and Settings offers "Save anyway".
- Use `maxRetries: 0` and `timeout: 10_000`.

## Code Examples

All of these were verified in the scratchpad prototype on 2026-11-03 unless noted.

### main/index.ts security skeleton
```ts
import { app, BrowserWindow, net, protocol, session } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { CSP, resolveAppUrl } from './app-protocol'

const E2E = process.env.E2E === '1'
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])
if (E2E) {
  if (process.env.USER_DATA_DIR) app.setPath('userData', process.env.USER_DATA_DIR)
  app.commandLine.appendSwitch('use-mock-keychain')               // Pitfall 5
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  if (process.env.FAKE_WAV) app.commandLine.appendSwitch('use-file-for-fake-audio-capture', process.env.FAKE_WAV)
  const prev = app.commandLine.getSwitchValue('disable-features') // Pitfall 7
  app.commandLine.appendSwitch('disable-features', [prev, 'AudioServiceSandbox'].filter(Boolean).join(','))
}
const ROOTS = { bundle: join(__dirname, '../renderer'), assets: join(__dirname, '../../resources') }

app.whenReady().then(async () => {
  protocol.handle('app', async (req) => {
    const file = resolveAppUrl(req.url, ROOTS)          // pure; null = forbidden
    if (!file) return new Response('forbidden', { status: 403 })
    try {
      const r = await net.fetch(pathToFileURL(file).toString())
      const h = new Headers(r.headers); h.set('Content-Security-Policy', CSP)
      return new Response(r.body, { status: r.status, headers: h })
    } catch { return new Response('not found', { status: 404 }) }   // net.fetch rejects on ENOENT
  })
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) =>
    cb(perm === 'media' && wc.getURL().startsWith('app://bundle/')))
  // await keyStore.init()  ← before the window, so status is ready on first IPC
  const win = new BrowserWindow({ show: false, webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://bundle/')) e.preventDefault() })
  win.once('ready-to-show', () => win.show())
  await win.loadURL('app://bundle/index.html')  // dev: is.dev && ELECTRON_RENDERER_URL → loadURL(that) instead
})
```

### app-protocol.ts (pure)
```ts
import { resolve, sep } from 'path'
export const CSP = [
  "default-src 'self' app:", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: app:", "font-src 'self' app:", "media-src 'self' blob: app:", "worker-src 'self' blob:",
  "connect-src 'self' app: https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "object-src 'none'", "base-uri 'none'"
].join('; ')
export function resolveAppUrl(url: string, roots: Record<string, string>): string | null {
  const u = new URL(url)
  const root = roots[u.host]
  if (!root) return null
  let p: string
  try { p = resolve(root, '.' + decodeURIComponent(u.pathname)) } catch { return null } // malformed %-escape
  return p.startsWith(root + sep) ? p : null
}
```
- `'unsafe-inline'` applies to **style** only. React's `style={{}}` uses CSSOM and isn't affected, but Vite dev injects `<style>` tags.
- Dev HMR works with the meta CSP because the react-refresh preamble is injected `head-prepend`, before the meta tag.
- The HF hosts in `connect-src` are LOW confidence; Phase 5 must confirm them.
- Unit-test that `src/renderer/index.html`'s meta `content` equals `CSP`. One constant, one parity test.

### key-probe.ts
```ts
import Anthropic, { AuthenticationError, PermissionDeniedError } from '@anthropic-ai/sdk'
export const PROBE_MODEL = 'claude-haiku-5-5'   // cheapest current model ($0.10/$0.50 per MTok), released 2026-10-07
export type ProbeResult = 'valid' | 'invalid' | 'unverified'
export async function probeKey(apiKey: string, opts: { fetch?: typeof fetch } = {}): Promise<ProbeResult> {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 10_000, ...opts }) // baseURL ← ANTHROPIC_BASE_URL
  try {
    await client.messages.create({ model: PROBE_MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
    return 'valid'
  } catch (e) {
    return e instanceof AuthenticationError || e instanceof PermissionDeniedError ? 'invalid' : 'unverified'
  }
}
```
For unit tests, inject `fetch` returning `new Response(JSON.stringify({type:'error',error:{type:'authentication_error',message:'invalid x-api-key'}}),{status:401,headers:{'content-type':'application/json'}})`. A 200 needs a full message body: `{id,type:'message',role:'assistant',model,content:[],stop_reason:'max_tokens',stop_sequence:null,usage:{input_tokens:10,output_tokens:1}}`. For the network case, throw `new TypeError('fetch failed')`.

### dotenv + redact
```ts
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('='); if (i < 1) continue
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}
export const redact = (s: string): string => s.replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***')
```

### electron-builder.json (verified: builds in about 14 s; output `release/mac-arm64/Mock Case Proctor.app`)
```json
{
  "appId": "com.rishizamvar.mockcaseproctor",
  "productName": "Mock Case Proctor",
  "directories": { "buildResources": "build", "output": "release" },
  "files": ["out/**", "package.json"],
  "asarUnpack": ["**/*.node", "resources/**"],
  "npmRebuild": false,
  "mac": {
    "target": [{ "target": "dir", "arch": ["arm64"] }],
    "identity": "-",
    "hardenedRuntime": true,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.inherit.plist",
    "extendInfo": {
      "NSMicrophoneUsageDescription": "Mock Case Proctor listens to your answers during the mock interview.",
      "NSCameraUsageDescription": "Mock Case Proctor shows your webcam as a self-view tile. Video is never recorded."
    },
    "notarize": false
  }
}
```
- The `files` whitelist kept `.planning/`, `tests/`, `.env` and `CLAUDE.md` out of the asar. Production `node_modules` were still added automatically (verified with `@electron/asar list`).
- If you keep the template's `resources/icon.png?asset` import, it needs `resources/**` in `files` too.
- The default `output` is `dist`, so set `release` explicitly.
- Electron-builder 26.18 uses **flat** keys (`mac.identity`, `mac.entitlements`…). The docs site shows `mac.sign.identity`, which is a newer schema that 26.18's `macOptions.d.ts` doesn't have.

### Entitlements plist (both files identical)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
  <key>com.apple.security.device.audio-input</key><true/>
  <key>com.apple.security.device.camera</key><true/>
</dict></plist>
```

### Entitlements config test (tests/unit/entitlements.test.ts)
```ts
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
const plist = (f: string) => JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', f], { encoding: 'utf8' }))
const REQUIRED = ['com.apple.security.device.audio-input', 'com.apple.security.device.camera',
  'com.apple.security.cs.allow-jit', 'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.disable-library-validation']
test.each(['build/entitlements.mac.plist', 'build/entitlements.mac.inherit.plist'])('%s has all keys', (f) => {
  const p = plist(f); for (const k of REQUIRED) expect(p[k], k).toBe(true)
})
test('builder config wires both plists, ad-hoc identity and usage strings', () => {
  const mac = JSON.parse(readFileSync('electron-builder.json', 'utf8')).mac
  expect(mac).toMatchObject({ identity: '-', entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist' })
  expect(mac.extendInfo.NSMicrophoneUsageDescription).toBeTruthy()
  expect(mac.extendInfo.NSCameraUsageDescription).toBeTruthy()
})
```
For the packaged gate, the matching artifact check is `codesign -d --entitlements - --xml "<app>"` and `"<app>/Contents/Frameworks/Mock Case Proctor Helper (Renderer).app"`, piped to `plutil -convert json -o - -`, plus `plutil -extract NSMicrophoneUsageDescription raw <app>/Contents/Info.plist`.

### vitest.config.mts (verified: both projects pass; `--project renderer` works)
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  test: {
    coverage: { provider: 'v8', include: ['src/main/**', 'src/shared/**'] },
    projects: [   // Vitest 5: inline projects inherit root config by default (extends: true)
      { test: { name: 'main', environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/support/**/*.test.ts'] } },
      { plugins: [react()], test: { name: 'renderer', environment: 'jsdom', include: ['src/renderer/**/*.test.{ts,tsx}'] } }
    ]
  }
})
```

### playwright.config.ts + fixture
```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: 'tests/e2e', workers: 1, fullyParallel: false, timeout: 60_000,
  globalSetup: './tests/e2e/global-setup.ts', reporter: [['list']], use: { trace: 'retain-on-failure' } })

// tests/e2e/fixtures.ts (sketch)
const STRIP = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_PROFILE', 'ANTHROPIC_LOG']
export async function launchApp(o: { userDataDir: string; replayUrl: string; env?: Record<string, string>; executablePath?: string }) {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v != null && !STRIP.includes(k))) as Record<string, string>
  const env = { ...base, E2E: '1', USER_DATA_DIR: o.userDataDir, ANTHROPIC_BASE_URL: o.replayUrl,
    FAKE_WAV: process.env.MCP_FAKE_WAV!, ...o.env }
  const app = o.executablePath
    ? await _electron.launch({ executablePath: o.executablePath, env })
    : await _electron.launch({ args: ['.'], cwd: ROOT, env })
  return { app, page: await app.firstWindow() }
}
```
Run the packaged smoke with `executablePath: 'release/mac-arm64/Mock Case Proctor.app/Contents/MacOS/Mock Case Proctor'` (verified: `isPackaged: true`, it loads `app://bundle/index.html`).

### Fake-audio peak (page.evaluate; spike-proven, peak 0.72)
```ts
const peak = await page.evaluate(async () => {
  const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
  const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 2048; ctx.createMediaStreamSource(s).connect(an)
  const buf = new Float32Array(2048); let p = 0; const t0 = performance.now()
  while (performance.now() - t0 < 2500) { an.getFloatTimeDomainData(buf); for (const v of buf) p = Math.max(p, Math.abs(v)); await new Promise(r => setTimeout(r, 50)) }
  return p
})
expect(peak).toBeGreaterThan(0.1)
```

### package.json scripts
```json
"dev": "electron-vite dev",
"build": "npm run typecheck && electron-vite build",
"package": "npm run build && electron-builder --mac --arm64",
"test": "vitest run",
"test:e2e": "electron-vite build && playwright test --grep-invert \"@packaged|@live\"",
"test:packaged": "npm run package && playwright test --grep @packaged",
"test:live": "electron-vite build && playwright test --grep @live && LIVE=1 vitest run"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `safeStorage.encryptString` / `decryptString` / `isEncryptionAvailable` (sync) | `encryptStringAsync`, `decryptStringAsync` (returns `{result, shouldReEncrypt}`), `isAsyncEncryptionAvailable` | Deprecated in the Electron 45 typings | Use async; re-encrypt when `shouldReEncrypt` |
| Electron downloads its binary on postinstall | `install-electron` bin (template postinstall) or lazy download on first run | Electron 44/45 era | Keep the template postinstall |
| SDK `x-api-key` header | SDK 1.4.0 sends `Authorization: Bearer <apiKey>` | SDK 1.x | Scrub `authorization` in fixtures |
| Vitest `workspace` / `extends: true` required | `test.projects`, inheriting the root by default | Vitest 5 docs | Simpler config |
| `protocol.registerFileProtocol` | `protocol.handle` + `net.fetch` | Electron 25+ | Used here |

## Open Questions

1. **Does Clear remove the key permanently if `.env` exists?**
   - What we know: precedence re-sources from env or `.env` at the next launch.
   - Recommendation: Clear deletes the stored blob only, and the Settings copy says "will be re-imported from .env on next launch" when `source` was `dotenv`. Don't build an opt-out flag (YAGNI).
2. **Which exact HF hub hosts does HeadTTS fetch from?** (LOW confidence) Phase 5 should confirm them, and the CSP `connect-src` should be tightened then.
3. **The keychain prompt when moving between dev and packaged builds** (real use, not tests). Expect one "Always Allow" per new ad-hoc build. It isn't avoidable without a stable signing identity, and that's acceptable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | everything | ✓ | 22.20.0 (Vitest needs ^22.12) | — |
| npm | package manager | ✓ | 10.9.3 | — |
| Electron binary | dev, E2E | ✓ (downloaded to the cache today) | 45.2.1 | — |
| git + gh (authed) | FND-02, push | ✓ | gh confirms the repo is PRIVATE | — |
| `say` | WAV fixtures | ✓ | macOS 26.6.2 | — |
| `plutil`, `codesign` | entitlement tests | ✓ | system | — |
| keymgr + master `ANTHROPIC_API_KEY` | KEY-02 | ✓ (key present, shape valid) | — | Paste in Settings |
| Network to api.anthropic.com | `@live` probe only | ✓ (live probe 200 in 578 ms) | — | Replay fixtures |
| Apple Silicon | arm64 target | ✓ | arm64 | — |

No missing dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.1.0 (projects `main`, `renderer`) + @playwright/test 1.64.1 `_electron` |
| Config file | `vitest.config.mts`, `playwright.config.ts` (both created in Wave 0) |
| Quick run command | `npx vitest run` (about 1 s today) |
| Full suite command | `npx vitest run && npm run test:e2e` |
| Phase gate | add `npm run test:packaged` (and optionally `npm run test:live`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-01 | The built app launches and the first window shows Settings or Home | e2e | `npx playwright test tests/e2e/smoke.spec.ts` | ❌ Wave 0 |
| FND-01 | The packaged ad-hoc `.app` launches (`isPackaged` true, `app://` loaded) | e2e @packaged | `npm run test:packaged` | ❌ Wave 0 |
| FND-01 | `npm run dev` opens a window | manual one-off (dev server is not an E2E target, per CLAUDE.md) | `npm run dev` | — |
| FND-02 | No key-shaped string in tracked or untracked-unignored files | unit | `npx vitest run tests/unit/secret-scan.test.ts` | ❌ Wave 0 |
| FND-02 | `.env`, `models/`, `sessions/`, `cases/` ignored | unit (`git check-ignore -q`) | `npx vitest run tests/unit/gitignore.test.ts` | ❌ Wave 0 |
| FND-02 | Repo private | one-off verify | `gh repo view rishi-zamvar/mock-case-proctor --json visibility` | — |
| FND-03 | Both Vitest projects run at least one test | unit | `npx vitest run --project main && npx vitest run --project renderer` | ❌ Wave 0 |
| FND-03 | Fake WAV reaches the page with peak > 0.1 | e2e | `npx playwright test tests/e2e/harness.spec.ts` | ❌ Wave 0 |
| FND-03 | Replay serves fixtures by scenario and index; 418 on missing; RECORD tees to a fake upstream, strips auth and drops content-encoding | integration | `npx vitest run tests/support/replay-server.test.ts` | ❌ Wave 0 |
| FND-04 | Both plists carry the 5 keys; builder JSON wires them, plus usage strings | unit | `npx vitest run tests/unit/entitlements.test.ts` | ❌ Wave 0 |
| FND-04 | Packaged app and Helper (Renderer) are signed with the entitlements; Info.plist has usage strings | e2e @packaged (codesign/plutil via execFileSync) | `npm run test:packaged` | ❌ Wave 0 |
| FND-05 | `resolveAppUrl` rejects `..`, `%2f`, unknown hosts and malformed escapes | unit | `npx vitest run src/main/app-protocol.test.ts` | ❌ Wave 0 |
| FND-05 | The meta CSP equals the `CSP` constant | unit | `npx vitest run tests/unit/csp-parity.test.ts` | ❌ Wave 0 |
| FND-05 | No `require`/`process`/`electron` globals; `Object.keys(window.api)` equals the allowlist; CSP header on `app://`; an injected inline script fires `securitypolicyviolation`; `app://bundle/..%2f…` returns 403; `app://assets/icon.png` returns 200; the built preload requires only `electron` | e2e | `npx playwright test tests/e2e/security.spec.ts` | ❌ Wave 0 |
| FND-05 | `WINDOW_PREFS` constant has the locked flags | unit | `npx vitest run src/main/window.test.ts` | ❌ Wave 0 |
| KEY-01 | Probe classification (200, 401, 403, TypeError, 429) | unit (injected fetch) | `npx vitest run src/main/key-probe.test.ts` | ❌ Wave 0 |
| KEY-01 | KeyStore save, encrypt, atomic write; decrypt-failure fallback; unavailable keychain means no persist | unit (fake crypto, tmp dir) | `npx vitest run src/main/key-store.test.ts` | ❌ Wave 0 |
| KEY-01 | Settings states (verifying, invalid, unverified with Save anyway, saved) | component (jsdom, mocked `window.api`) | `npx vitest run --project renderer` | ❌ Wave 0 |
| KEY-01 | Clean profile shows Settings; paste a fake key, replay 200, "Key saved", restart, Home | e2e | `npx playwright test tests/e2e/key.spec.ts -g onboarding` | ❌ Wave 0 |
| KEY-02 | Precedence: stored over env over dotenv; env and dotenv probe then auto-save | unit | `npx vitest run src/main/key-store.test.ts` | ❌ Wave 0 |
| KEY-02 | Env-launch skips Settings; `MCP_DOTENV_PATH` launch skips Settings | e2e | `npx playwright test tests/e2e/key.spec.ts -g auto` | ❌ Wave 0 |
| KEY-03 | `redact()` masks keys in strings and error messages | unit | `npx vitest run src/main/log.test.ts` | ❌ Wave 0 |
| KEY-03 | After all flows, the fake key is absent from `__ipcOut`, `page.content()`, `userData/logs/*` and the stored blob bytes (encrypted) | e2e | `npx playwright test tests/e2e/key.spec.ts -g leak` | ❌ Wave 0 |
| KEY-03 | No key in `tests/fixtures/**` | unit (covered by the secret scan) | `npx vitest run tests/unit/secret-scan.test.ts` | ❌ Wave 0 |
| KEY-04 | Replace: the new key is verified and saved, and the replay `lastAuth` equals `Bearer <new>` on the next probe; Clear: the file is gone and Settings is shown | e2e | `npx playwright test tests/e2e/key.spec.ts -g "replace|clear"` | ❌ Wave 0 |
| QA-01 | Tests precede logic | process (verifier: `git log --reverse` shows a failing-test commit before each implementation commit for each pure module) | `git log --oneline -- src/main` | — |

### Sampling Rate
- **Per task commit:** `npx vitest run` (under 5 s)
- **Per wave merge:** `npx vitest run && npm run test:e2e`
- **Phase gate:** the full suite, plus `npm run test:packaged`, plus one `@live` probe (about $0.0000015), all green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Scaffold via a temp dir (Pitfall 1); pin the deps; remove the toolkit preload, the yml and the template UI
- [ ] `vitest.config.mts`, `playwright.config.ts`, `tests/e2e/global-setup.ts` (the `say` WAV into `os.tmpdir()`, exported via `process.env.MCP_FAKE_WAV`)
- [ ] `tests/support/replay-server.ts` + `tests/fixtures/claude/{probe-valid,probe-invalid}/000.json` (hand-written, tiny)
- [ ] `tests/e2e/fixtures.ts` (env stripping, mkdtemp userData, per-test replay)
- [ ] `.gitignore` additions: `cases/`, `.eslintcache`, `*.log*`, `release/` (already present), `test-results/` (present)
- [ ] keymgr registration + manual `ln -s` (Pitfall 9)

## Sources

### Primary (HIGH confidence)
- Local prototype runs (2026-11-03, this Mac):
  - create-electron 1.0.31 source and template files.
  - electron-vite 6.0.0 dist (dev spawns `electron .`, externalized preload deps).
  - app-builder-lib 26.18.0 source (`MacTargetHelper.js` ad-hoc and entitlement defaults, `macOptions.d.ts`).
  - Electron 45.2.1 `electron.d.ts` (safeStorage async APIs, protocol, permissions).
  - Playwright 1.64.1 `loader.js` (Chromium switches) and its `types.d.ts` (`env` semantics).
  - `@anthropic-ai/sdk` 1.4.0 source (`client.d.ts` credential chain, `Authorization: Bearer`, log redaction, error exports).
  - keymgr source.
  - A live probe against `claude-haiku-5-5`.
- https://platform.claude.com/docs/en/about-claude/models/overview and https://platform.claude.com/docs/en/models/haiku-5-5/overview: model IDs and pricing. Haiku 5.5 is the cheapest, with adaptive thinking on by default.
- https://vitest.dev/guide/projects: v5.1.0 `test.projects` syntax.
- https://www.electron.build/docs/features/code-signing/code-signing-mac/: ad-hoc signing needs disable-library-validation.
- https://releases.electronjs.org/pr/53790: `--use-mock-keychain` landed in 45.0.0-alpha.6.

### Secondary (MEDIUM confidence)
- [gitgrove PR #17](https://github.com/danipen/gitgrove/pull/17) and [zero-agent PR #46](https://github.com/0-AI-UG/zero-agent/pull/46): community use of `use-mock-keychain` to suppress the Safe Storage dialog. Corroborated by the local test.
- `.planning/research/STACK.md`, `PITFALLS.md` and `ARCHITECTURE.md` (prior project research).

### Tertiary (LOW confidence)
- The HF hub hostnames for CSP `connect-src`, pending Phase 5.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Every version came from `npm view`, and the stack was installed and built today.
- Architecture: HIGH. A sandboxed `app://` build plus the packaged app were run under Playwright.
- Pitfalls: HIGH. Each was reproduced or read from the installed source. The exact mechanism behind Pitfall 5 (why Playwright's mock-keychain switch didn't apply to the packaged launch) is unknown, but the fix is verified.

**Research date:** 2026-11-03
**Valid until:** 2026-12-03 (Electron, SDK and Playwright move fast; re-check `npm view` if planning slips past that)
