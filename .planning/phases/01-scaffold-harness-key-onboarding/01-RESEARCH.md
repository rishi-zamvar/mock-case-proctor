# Phase 1: Scaffold, Harness & Key Onboarding - Research

**Researched:** 2026-11-03
**Domain:** An Electron 45 security baseline, electron-builder ad-hoc packaging, a Vitest/Playwright harness, Anthropic SDK test seams, and macOS safeStorage
**Confidence:** HIGH. Most claims were verified by reading the installed or packed package source. The few MEDIUM or LOW items are flagged inline.

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

**Test harness**
- **Vitest:** `test.projects` with `main` (node; `src/main`, `src/shared`) and `renderer` (jsdom; `src/renderer`). Coverage via v8.
- **Playwright:**
  - Launch `out/main/index.js` via `_electron.launch` with `env: { E2E: '1', ANTHROPIC_BASE_URL, USER_DATA_DIR: tmp }`.
  - When E2E=1, main sets a userData override (isolated profile per test) and these Chromium switches before ready: `use-fake-ui-for-media-stream`, `use-fake-device-for-media-stream`, `use-file-for-fake-audio-capture=<wav>`, and `disable-features=AudioServiceSandbox`.
  - `workers: 1`.
- **Fake audio check.** The E2E harness test proves non-silent audio. It generates a WAV with `say` and `afconvert` in globalSetup. The renderer test page reads the peak via the AudioContext analyser through an E2E-only `window.__e2e` hook, and the test asserts peak > 0.1. The hook is exposed only when E2E=1.
- **Replay server.** About 60 lines of `node:http` serving recorded SSE/JSON fixtures keyed by scenario plus request index. `RECORD=1` proxies to the real API and tees the traffic to fixtures. The API key is stripped from saved request JSON, and a test asserts it.
- **Packaged smoke.** A Playwright test with `executablePath` pointing at `release/mac-arm64/*.app` launches and sees the first window. It is tagged `@packaged`; run it at the phase gate.
- **Secret scan.** A Vitest test runs `git ls-files`, greps tracked contents for `sk-ant-`, and fails on any match.

**Visual direction (app-wide)**
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
| FND-01 | Dev launch plus a packaged, ad-hoc-signed arm64 `.app` | §Scaffold procedure, §electron-builder config (verified that `identity: "-"` takes an ad-hoc branch in app-builder-lib 26.18.0, and that the output dir is `release/mac-arm64/`) |
| FND-02 | Private repo, gitignore, secret-scan test | `.gitignore` already covers `.env`, models and sessions. `origin` remote already set. §Secret scan (regex caveat) |
| FND-03 | Vitest projects, Playwright on the built app with fake media, replay server with RECORD | §Vitest 5 projects (verified in the d.ts), §Playwright launch (verified that `env` replaces `process.env`), §Replay server (verified SDK baseURL path concatenation) |
| FND-04 | Entitlements in both plists, usage strings, test | §Entitlements, `plutil -convert json`-based test, post-package `codesign -d --entitlements` |
| FND-05 | Sandbox, context isolation, CSP, no Node, no general file IPC, `app://` | §app:// protocol, §CSP, §Preload (sandbox forbids externalized deps, verified in electron-vite) |
| KEY-01 | Settings paste, live probe, safeStorage encrypt | §KeyStore, §Probe (`claude-haiku-5-5`), §safeStorage (use the async API; sync is deprecated in 45 and removed in 46) |
| KEY-02 | Auto-fill from env or `.env` (keymgr) | §keymgr registration (note: `export` does NOT create the symlink), §dotenv gating under E2E |
| KEY-03 | Key never in renderer, logs, fixtures or git | §Key-leak canary E2E, §Logger, §Replay strips `authorization` (the SDK 1.4.0 sends `Authorization: Bearer`, not `x-api-key`) |
| KEY-04 | Replace and Clear | §IPC surface (`key:save`, `key:clear`) |
| QA-01 | TDD | §Validation Architecture: every pure module has a RED test first. Pure core plus a thin electron adapter, because `import 'electron'` under Vitest returns a path string |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- macOS Apple Silicon only, Node 22 dev, Electron latest stable (45.2.1).
- The only paid dependency is the Claude API. The key comes from `~/.config/keys` keymgr. **The API key is never in the renderer or logs.**
- TDD: every feature gets automated tests AND a live E2E run in the real app.
- Use the STACK.md pins. No TS 7. No `three@latest` (later phases). No `pdfjs-dist` direct (later phases).
- Dependencies are injected as plain function parameters (no DI framework).
- GSD workflow: edits go through `/gsd:execute-phase`.
- User memory rules that apply here:
  - Never hardcode credentials. Use env first.
  - API frugality: fixtures are the default, and live calls only at gates.
  - Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Summary

This is a greenfield phase on a repo that holds only `.planning/`, `research/`, `CLAUDE.md` and `.gitignore`. The fastest correct path is to scaffold the `react-ts` template **into a scratch directory**, copy it in and modify about ten files. Running the scaffold in place with `--skip` calls `emptyDir(root)`, which deletes `.git` and `.planning`. That was verified in create-electron 1.0.31 `index.js`.

The template is insecure by default (`sandbox: false`, generic `electronAPI` exposure, `loadFile`, no `mac.entitlements`, no identity). The security work is mostly deletion:
- remove `@electron-toolkit/preload`;
- flip `sandbox` to true;
- replace `loadFile` with `app://bundle/index.html`;
- add three entitlement keys and a second plist.

Electron 45 changes two things that matter here:
- The **sync safeStorage API is deprecated, and removed in 46**, so use `isAsyncEncryptionAvailable` / `encryptStringAsync` / `decryptStringAsync`.
- `protocol.handle` requests carry `request.initiatorOrigin`.

The Anthropic SDK 1.4.0 has three properties that shape the design:
- It sends the key as `Authorization: Bearer <key>`, not `x-api-key`. The replay recorder must strip `authorization`.
- It reads `ANTHROPIC_BASE_URL` by default and concatenates paths, so `http://127.0.0.1:PORT/s/<scenario>` works as a per-launch scenario selector.
- If no `apiKey` is passed, it silently falls back to env and on-disk profiles. Always pass `apiKey` explicitly.

The keychain risk under E2E is real. Electron's own test suite added `--use-mock-keychain` in September 2026, because unsigned apps launched by tests get keychain prompts that hang the tests. Ad-hoc-signed rebuilds change the code hash, so the keychain re-prompts after every rebuild. Plan for this:
- `use-mock-keychain` when E2E=1;
- a `cipher` parameter on KeyStore so unit tests never touch Electron.

**Primary recommendation:**
- Build a pure, parameter-injected `KeyStore`, `probeKey`, `redact`, `resolveSafePath` and `parseDotenv`, each unit-tested first.
- Write thin Electron adapters (`safeStorage` cipher, `protocol.handle`, IPC router) in one composition root.
- Cover the adapters with one Playwright E2E suite launched on `out/` with a *minimal explicit env*, a replay server and a random canary key.

## Standard Stack

All versions verified with `npm view` on 2026-11-03.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 45.2.1 | Shell | Latest stable; spike-proven with Playwright. The template pins ^44.7.2, so bump it |
| electron-vite | 6.0.0 | main/preload/renderer build | Template; `build.externalizeDeps` defaults to true |
| vite | ^8.3.5 | Bundler | electron-vite 6 peer |
| @vitejs/plugin-react | ^6.1.2 (template) | React | Injects an **inline** refresh preamble in dev (see the CSP pitfall) |
| react / react-dom | ^19.3.0 | UI | Template |
| typescript | ^5.9.3 | Types | Keep the template pin |
| @anthropic-ai/sdk | 1.4.0 | Probe now, the interviewer later | **Goes in `dependencies`** (main externalizes deps, and electron-builder ships only `dependencies`) |
| zod | 4.6.7 | IPC input validation in main | **`dependencies`** |
| electron-builder | 26.18.0 | Package `.app` | Template |

### Test stack (devDependencies)
| Library | Version | Purpose |
|---------|---------|---------|
| vitest | 5.1.0 | Unit and integration |
| @vitest/coverage-v8 | 5.1.0 | Coverage |
| jsdom | 30.1.3 | Renderer project environment |
| @testing-library/react / @testing-library/dom / @testing-library/user-event | 16.3.3 / ^10 / ^14.6.8 | Settings component tests |
| @playwright/test | 1.64.1 | `_electron` E2E (no `playwright install` needed) |
| @fontsource-variable/inter | 5.3.0 | Inter woff2 bundled by Vite into `out/renderer/assets` (no network). A `devDependency` is enough because Vite inlines it at build |

### Remove from the template
- `@electron-toolkit/preload`. It exposes generic `ipcRenderer`, which breaks a locked decision. It is also an externalized dep, which **cannot be `require`d from a sandboxed preload**.
- `@electron-toolkit/utils` is optional. `is.dev` is `!app.isPackaged`, which is **true under E2E of `out/`**, so never gate security on it. The lazy choice is to drop it and use `process.env.ELECTRON_RENDERER_URL` to detect dev.

**Installation:**
```bash
npm i -E electron@45.2.1 && npm i -D -E vitest@5.1.0 @vitest/coverage-v8@5.1.0 jsdom@30.1.3 @playwright/test@1.64.1 @testing-library/react@16.3.3 @testing-library/dom @testing-library/user-event @fontsource-variable/inter
npm i -E @anthropic-ai/sdk@1.4.0 zod@4.6.7
npm uninstall @electron-toolkit/preload @electron-toolkit/utils
```
Electron must stay in devDependencies; that is template-correct. Note that `npm i -E electron` may move it, so check `package.json` afterwards.

## Scaffold Procedure (exact)

The template output (create-electron 1.0.31, `react-ts` plus `base`):
```
.editorconfig .prettierignore .prettierrc.yaml .vscode/ _gitignore(→.gitignore)
build/entitlements.mac.plist build/icon.{icns,ico,png}  resources/icon.png
electron-builder.yml electron.vite.config.ts eslint.config.mjs package.json
tsconfig.json tsconfig.node.json tsconfig.web.json
src/main/index.ts  src/preload/index.ts  src/preload/index.d.ts
src/renderer/index.html  src/renderer/src/{main.tsx,App.tsx,env.d.ts}
src/renderer/src/assets/{base.css,main.css,electron.svg,wavy-lines.svg}
src/renderer/src/components/Versions.tsx
```

**Do this.** The scratch path is any temp dir. NEVER run with `--skip` inside the project root.
```bash
cd "$(mktemp -d)" && npm create @quick-start/electron@latest mcp -- --template react-ts --skip
rsync -a --exclude .gitignore --exclude node_modules mcp/ /Users/rishizamvar/Documents/Projects/mock-case-proctor/
# then: merge "*.log*" and ".eslintcache" into the existing .gitignore by hand
```
`--skip` also skips the updater prompt (no `electron-updater` is added) and the mirror prompt.

**Files to modify:**
| File | Change |
|------|--------|
| `package.json` | Set `name: "mock-case-proctor"` and add `"productName": "Mock Case Proctor"`. Without `productName`, dev and packaged builds get *different* userData dirs and keychain item names. Do NOT add `"type": "module"`, because electron-vite would emit an ESM preload and a sandboxed preload must be CJS. Update the pins and scripts (below). |
| `electron-builder.yml` | Replace it with **`electron-builder.json`** (auto-detected), so the config test needs no YAML parser. Contents below. |
| `build/entitlements.mac.plist` | Add device audio-input, camera and `cs.disable-library-validation` |
| `build/entitlements.mac.inherit.plist` | **New**, with the same keys |
| `src/main/index.ts` | Rewrite as the composition root (security, protocol, E2E switches, IPC) |
| `src/preload/index.ts` and `index.d.ts` | Rewrite: `contextBridge.exposeInMainWorld('api', {...named methods})` |
| `src/renderer/index.html` | Delete the template meta CSP. It is injected at build time from one constant (see the CSP section) |
| `src/renderer/src/*` | Delete `Versions.tsx`, the template CSS and the SVGs. Add `App.tsx` (state switch), `screens/Settings.tsx`, `screens/Home.tsx`, `styles/tokens.css` |
| `electron.vite.config.ts` | Add a `transformIndexHtml` CSP plugin to the renderer (`apply: 'build'`) |
| new: `vitest.config.ts`, `playwright.config.ts`, `tests/e2e/*`, `tests/replay/server.ts`, `tests/config/*.test.ts` | Harness |

CONTEXT says `src/renderer/` holds React. The template nests it at `src/renderer/src/`. Keeping the template nesting avoids changing tsconfig and alias paths, so keep it, and put tokens at `src/renderer/src/styles/tokens.css`.

**Scripts:**
```json
"dev": "electron-vite dev",
"build": "npm run typecheck && electron-vite build",
"package": "electron-vite build && electron-builder --mac --arm64",
"test": "vitest run",
"test:e2e": "electron-vite build && playwright test --grep-invert \"@live|@packaged\"",
"test:packaged": "npm run package && playwright test --grep @packaged",
"test:live": "LIVE=1 vitest run && playwright test --grep @live"
```
Keep `postinstall: install-electron && electron-builder install-app-deps`. `install-electron` is Electron 45's own lazy-download bin (verified in electron/package.json `bin`).

## electron-builder Config (verified against app-builder-lib 26.18.0 source)

```json
{
  "appId": "com.rishizamvar.mockcaseproctor",
  "productName": "Mock Case Proctor",
  "directories": { "buildResources": "build", "output": "release" },
  "files": ["!**/.vscode/*","!src/*","!tests/*","!electron.vite.config.{js,ts,mjs,cjs}",
            "!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,README.md}",
            "!{.env,.env.*,.npmrc}","!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}",
            "!{.planning,research,release,test-results,playwright-report,coverage}/**"],
  "asarUnpack": ["resources/**", "**/*.node"],
  "npmRebuild": false,
  "mac": {
    "target": [{ "target": "dir", "arch": ["arm64"] }],
    "identity": "-",
    "hardenedRuntime": true,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.inherit.plist",
    "extendInfo": {
      "NSMicrophoneUsageDescription": "Mock Case Proctor listens to your answers during a mock interview.",
      "NSCameraUsageDescription": "Mock Case Proctor shows your webcam as a self-view tile. It is never recorded.",
      "NSDocumentsFolderUsageDescription": "Mock Case Proctor reads your mock case library in Documents."
    },
    "notarize": false
  }
}
```

Facts checked in the source:
- **`identity: "-"`**: `MacTargetHelper.findSigningIdentity` has `if (qualifier === "-")`, which builds `new Identity("-")`. With `hardenedRuntime` on (the default for non-MAS builds), it **warns that ad-hoc signing plus hardened runtime requires `com.apple.security.cs.disable-library-validation` to prevent launch failures.** So add that key. [V]
- **Output dir:** `macPackager.js` uses `${target.name}${getArchSuffix(arch, defaultArch)}`, which gives `release/mac-arm64/Mock Case Proctor.app` for arm64. [V]
- **Entitlements defaults:** the defaults are `build/entitlements.mac.plist` and `build/entitlements.mac.inherit.plist` when they exist. Set them explicitly anyway, so the config test can assert them. [V]
- `NSDocumentsFolderUsageDescription` is kept because Phase 3 reads `~/Documents/Projects/lead_edge_mock_cases`. A packaged app hits TCC Documents protection there.
- Use the `dir` target only. It is fastest, and `release/mac-arm64/*.app` is all the smoke test needs. Add a dmg later if ever wanted.
- **Do not set `electronFuses.enableNodeCliInspectArguments: false`**, because Playwright `_electron` launch then fails.

**Entitlements (both plists, identical):**
```xml
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
<key>com.apple.security.cs.disable-library-validation</key><true/>
<key>com.apple.security.device.audio-input</key><true/>
<key>com.apple.security.device.camera</key><true/>
```
The template also has `allow-dyld-environment-variables`. Drop it, since nothing needs it.

**Post-package verification (phase gate):**
```bash
APP="release/mac-arm64/Mock Case Proctor.app"
codesign -dv "$APP" 2>&1 | grep -q "Signature=adhoc"
codesign -d --entitlements - --xml "$APP" | plutil -convert json -o - - | grep -q audio-input
codesign -d --entitlements - --xml "$APP/Contents/Frameworks/Mock Case Proctor Helper (Renderer).app" | plutil -convert json -o - - | grep -q camera
plutil -extract NSMicrophoneUsageDescription raw "$APP/Contents/Info.plist"
```
These are MEDIUM. The `--xml` flag exists on recent macOS codesign. If it is rejected, fall back to `--entitlements :-`.

## Architecture Patterns

### Recommended structure (minimal; the planner may rename)
```
src/main/
  index.ts           # composition root: switches, protocol, window, IPC wiring (only file that imports electron broadly)
  e2e.ts             # applyE2ESwitches(app, env): userData override + Chromium switches (pure-ish, takes app)
  protocol.ts        # resolveSafePath(root, pathname) (pure) + registerAppProtocol() (adapter)
  csp.ts → src/shared/csp.ts  # one CSP string used by vite plugin + response header
  log.ts             # redact() + log.{info,warn,error}
  keys/keyStore.ts   # createKeyStore({cipher, readFile, writeFile, rm, env, dotenvPath, probe}) — pure
  keys/probe.ts      # probeKey(key, {baseURL?, fetch?}) → 'valid'|'invalid'|'unverified'
  keys/dotenv.ts     # parseDotenv(text) → Record<string,string>
  keys/cipher.ts     # safeStorage adapter (async API)
  ipc.ts             # registerIpc(ipcMain, keyStore) — zod-validated handlers
src/preload/index.ts # contextBridge 'api' (+ '__e2e' when --e2e arg)
src/shared/ipc.ts    # channel names + KeyStatus/SaveResult types + zod schemas
src/renderer/src/    # App.tsx (state switch), screens/Settings.tsx, screens/Home.tsx, styles/tokens.css
tests/config/        # entitlements.test.ts, builder.test.ts, secret-scan.test.ts (main project)
tests/replay/server.ts
tests/e2e/           # global-setup.ts, launch.ts, shell.spec.ts, key.spec.ts, packaged.spec.ts
tests/fixtures/claude/<scenario>/<n>.res.json ; tests/fixtures/audio/ (generated, gitignored)
```

### Pattern 1: Pure core, thin Electron adapter
Under Vitest (Node), `import { safeStorage } from 'electron'` resolves to the npm `electron` package, which exports **the binary path string**. Any module that imports Electron APIs at top level is therefore untestable in Vitest. Only `index.ts`, `cipher.ts`, `protocol.ts`'s adapter function and `ipc.ts` import `electron`. Everything else takes parameters.

### Pattern 2: E2E switches before ready
```ts
// src/main/e2e.ts — call at top of index.ts, before app.whenReady()
export function applyE2ESwitches(app: Electron.App, env = process.env): boolean {
  if (env.E2E !== '1') return false
  if (env.USER_DATA_DIR) app.setPath('userData', env.USER_DATA_DIR)
  app.commandLine.appendSwitch('use-mock-keychain')            // no keychain prompts (see safeStorage)
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  if (env.FAKE_AUDIO_WAV) {
    app.commandLine.appendSwitch('use-file-for-fake-audio-capture', env.FAKE_AUDIO_WAV)
    app.commandLine.appendSwitch('disable-features', 'AudioServiceSandbox') // REQUIRED or samples are all zero [spike-verified]
  }
  return true
}
```
The spike `main.js` used exactly these switch names; they are verified working on Electron 45.2.1. Only one `disable-features` switch is honoured. If later phases need more features disabled, comma-join them in one call.

### Pattern 3: app:// protocol, path-safe
```ts
// before ready (module top level):
protocol.registerSchemesAsPrivileged([{ scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

// pure, unit-tested:
export function resolveSafePath(root: string, urlPathname: string): string | null {
  let p: string
  try { p = decodeURIComponent(urlPathname) } catch { return null }
  if (p.includes('\0')) return null
  const abs = path.resolve(root, '.' + p)
  const rel = path.relative(root, abs)
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? abs : null
}

// after ready:
const ROOTS: Record<string, string> = {
  bundle: join(__dirname, '../renderer'),
  assets: join(app.getAppPath(), 'resources', 'assets'),   // later phases extend
}
protocol.handle('app', async (req) => {
  const { host, pathname } = new URL(req.url)
  const root = ROOTS[host]
  const file = root && resolveSafePath(root, pathname === '/' ? '/index.html' : pathname)
  if (!file) return new Response('Not found', { status: 404 })
  const res = await net.fetch(pathToFileURL(file).toString())
  const headers = new Headers(res.headers); headers.set('Content-Security-Policy', CSP)
  return new Response(res.body, { status: res.status, headers })
})
// production load:
win.loadURL(process.env.ELECTRON_RENDERER_URL ?? 'app://bundle/index.html')
```
The `resolve`/`relative`/`isAbsolute` safety check mirrors the official Electron `protocol.handle` docs example. `request.initiatorOrigin` is available in 45 [V, d.ts] if Phase 3 wants origin checks.
- `resources/assets/` must exist. Commit a `.gitkeep`. `asarUnpack: resources/**` keeps it a real directory in the packaged app, so `net.fetch(file://)` works.
- If ES module loads from `app://` ever fail with CORS errors (workers and WASM in Phase 5), add `corsEnabled: true`. That fix is LOW confidence and only needed if the error appears.

### Pattern 4: Window and session lockdown
```ts
new BrowserWindow({ show: false, width: 1280, height: 800, backgroundColor: '#0B0F14',
  webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true,
    sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false,
    additionalArguments: e2e ? ['--e2e'] : [] } })
win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://bundle/') && !isDevUrl(url)) e.preventDefault() })
session.defaultSession.setPermissionRequestHandler((_wc, perm, cb, d) =>
  cb(perm === 'media' && isAppOrigin(d.requestingUrl)))
session.defaultSession.setPermissionCheckHandler((_wc, perm, origin) => perm === 'media' && isAppOrigin(origin))
```
Here `isAppOrigin` accepts `app://bundle` plus the dev `ELECTRON_RENDERER_URL` origin. Without a media allow, the fake-audio E2E fails.

### Pattern 5: Preload (sandboxed, CJS, only `electron` import)
```ts
import { contextBridge, ipcRenderer } from 'electron'
import { CH, type KeyStatus, type SaveResult } from '../shared/ipc'   // relative → bundled, OK
const api = {
  key: {
    status: (): Promise<KeyStatus> => ipcRenderer.invoke(CH.keyStatus),
    save: (key: string, opts?: { force?: boolean }): Promise<SaveResult> => ipcRenderer.invoke(CH.keySave, key, opts),
    clear: (): Promise<KeyStatus> => ipcRenderer.invoke(CH.keyClear),
  },
}
contextBridge.exposeInMainWorld('api', api)
if (process.argv.includes('--e2e')) contextBridge.exposeInMainWorld('__e2e', { micPeak: (ms: number) => /* getUserMedia + AnalyserNode loop as in spike index.html */ })
```
- `additionalArguments` ends up in `process.argv` in the renderer and preload. This is documented Electron behaviour, and `process.argv` is in the sandboxed preload's `process` subset. MEDIUM; the E2E test proves it.
- A simpler equivalent of the `__e2e` hook: the test can run the spike's probe via `page.evaluate(...)`, because CDP evaluation bypasses page CSP. Either satisfies the requirement. The hook is what CONTEXT asked for, and it costs about 10 lines.

### Pattern 6: KeyStore (pure)
```ts
type Source = 'stored' | 'env' | 'dotenv' | 'none'
export type KeyStatus = { hasKey: boolean; source: Source }   // nothing else, ever
createKeyStore({ cipher, file, fs, env, dotenvPath /* null when packaged or E2E */, probe, log })
  .init(): Promise<KeyStatus>       // stored → env → dotenv; env/dotenv: probe; valid|unverified → save as 'stored'; invalid → none + lastError
  .status(): KeyStatus
  .save(key, {force}): Promise<{ status: KeyStatus; result: 'valid'|'invalid'|'unverified'|'unavailable' }>
  .clear(): Promise<KeyStatus>      // rm file, drop in-memory key
  .getKey(): string | null          // MAIN ONLY — never wired to IPC
```
- Trim the pasted key and reject empty input. Write the file atomically (write to tmp, then `rename`) with mode `0o600`.
- A decrypt failure (keychain denied, file corrupt, key rotated) means "no stored key", so fall through to env. Never crash.
- If `cipher.available()` is false, return `'unavailable'` and do NOT write plaintext.
- `dotenvPath = !app.isPackaged && process.env.E2E !== '1' ? join(app.getAppPath(), '.env') : (process.env.E2E_DOTENV_PATH ?? null)`.
- Allow a fixture `.env` in E2E via `E2E_DOTENV_PATH`, so KEY-02's dotenv path is E2E-tested without touching the real symlink.

### Anti-Patterns to Avoid
- **Spreading `process.env` into `_electron.launch({env})`.** Playwright *replaces* the environment with the `env` option (verified in coreBundle: `options.env ? envArrayToObject(options.env) : process.env`). Spreading `process.env` would hand the real `ANTHROPIC_API_KEY` from the developer shell to the app under test. Pass a minimal explicit env: `PATH`, `HOME`, `E2E`, `USER_DATA_DIR`, `ANTHROPIC_BASE_URL`, `FAKE_AUDIO_WAV`, plus per-test additions.
- **Gating anything on `is.dev` / `!app.isPackaged`.** Both are true in E2E of `out/`.
- **`new Anthropic()` without `apiKey`.** SDK 1.4.0 then reads `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_PROFILE` and the on-disk active profile [V client.d.ts]. Always pass `apiKey: keyStore.getKey()`.
- **Exposing `ipcRenderer` or `invoke(channel)`** from the preload, as the template's `electronAPI` does.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Plist parsing in tests | XML regex | `execFileSync('plutil', ['-convert','json','-o','-', file])` | macOS native, exact |
| YAML builder config parsing | add `yaml` dep | `electron-builder.json` | Zero dependencies |
| Claude HTTP mocking in unit tests | MSW / nock | `new Anthropic({ apiKey:'t', fetch: async () => new Response(...) })` | The SDK seam; the real error classes get thrown |
| Claude in E2E | patching the SDK via `electronApp.evaluate` | `ANTHROPIC_BASE_URL` to the replay server | The production code path runs unchanged |
| Keychain encryption | custom AES / keytar | `safeStorage.encryptStringAsync` | keytar is archived; this is the platform API |
| dotenv | `dotenv` dep | an 8-line `parseDotenv` | Locked decision |
| Audio fixtures | recording | `say -o x.aiff "…" && afconvert -f WAVE -d LEI16@48000 x.aiff x.wav` | Verified on this Mac (1 ch, 48 kHz, Int16). `say -o x.wav --data-format=LEI16@48000` also produces WAVE [V] |
| Error classification | status-code sniffing | `instanceof Anthropic.AuthenticationError` etc. | The SDK's typed errors |

## Probe (KEY-01)

The cheapest current model is **`claude-haiku-5-5`** at $0.10/$0.50 per MTok, from the claude-api skill `shared/models.md`, cached 2026-10-06. The skill says never to downgrade *the interviewer* for cost. A probe is not the interviewer, and CONTEXT explicitly asks for the cheapest model, so this does not conflict. The interviewer stays `claude-opus-5-5` (INT-01, Phase 6).

```ts
// src/main/keys/probe.ts
import Anthropic from '@anthropic-ai/sdk'
export const PROBE_MODEL = 'claude-haiku-5-5'
export async function probeKey(apiKey: string, opts: { baseURL?: string; fetch?: typeof fetch } = {}) {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 10_000, ...opts })
  try {
    await client.messages.create({ model: PROBE_MODEL, max_tokens: 1,
      thinking: { type: 'disabled' },   // Haiku 5.5 thinks by default; max_tokens caps thinking+text
      messages: [{ role: 'user', content: 'ping' }] })
    return 'valid' as const
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'invalid' as const
    if (e instanceof Anthropic.RateLimitError) return 'valid' as const   // 429 ⇒ auth passed
    return 'unverified' as const   // APIConnectionError/Timeout, 5xx/529, unexpected 400
  }
}
```
- `baseURL` defaults to `process.env.ANTHROPIC_BASE_URL` [V], so E2E needs no code change.
- `maxRetries: 0` prevents the default 2 retries, which would add seconds to an offline probe.
- The error class names AuthenticationError, PermissionDeniedError, RateLimitError, APIConnectionError, APIConnectionTimeoutError and InternalServerError were verified in `core/error.js`. Check `APIConnectionError` before `APIError`, since it is a subclass.
- `thinking: {type:'disabled'}` is accepted on Haiku 5.5 at effort high or below; the default effort is medium (skill docs). MEDIUM confidence. If the SDK types reject it, remove it. Recording the `probe-ok` fixture with RECORD=1 confirms the 200 either way.
- Cost per probe is about 10 tokens, effectively $0. The `@live` test calls it once.

## safeStorage under E2E (keychain prompts)

**Behaviour:**
- On macOS the encryption key lives in a Keychain item named for the app (`<app name> Safe Storage`).
- The creating binary gets silent access. A binary with a *different code signature* triggers the "wants to use your confidential information stored in … Safe Storage" dialog.
- Ad-hoc signatures carry no team identity, so **every rebuild of the packaged app re-prompts**. So does switching between the dev build (Electron.app's signature) and the packaged app.
- The Electron docs say: "the app should be code signed … without a consistent signature Keychain may re-prompt on each update". The sync API "can block the current thread to collect user input".
- A hidden modal prompt hangs an E2E run.

**Override (recommended, two layers):**
1. **Unit:** `KeyStore` takes `cipher: { available(): Promise<boolean>; encrypt(s): Promise<Buffer>; decrypt(b): Promise<string> }`. Vitest passes a fake cipher (for example base64 with a `fake:` prefix). The tests never touch Electron.
2. **E2E:** when `E2E=1`, `app.commandLine.appendSwitch('use-mock-keychain')` before ready.
   - This is the switch Electron's own test suite adopted, in electron/electron PR #53790, backported into 45.0.0-alpha.6, to stop keychain prompts timing out tests.
   - GitGrove and OpenWork use it the same way for ad-hoc builds.
   - The mock keychain is plaintext-backed, so it is E2E-only.
   - The real `safeStorage` adapter still runs end to end.
   - **MEDIUM.** The PR describes the network-service cookie key, not safeStorage explicitly, though both go through Chromium OSCrypt's keychain. Wave 0 must include one E2E assertion that save → relaunch with the same `USER_DATA_DIR` → `status().source === 'stored'` passes with no dialog within 10 s. If that fails, fall back to an `E2E_FAKE_CIPHER=1` branch in `cipher.ts` and document that the real safeStorage is verified only in the `@packaged` gate.
- Electron 45 adapter: use `safeStorage.isAsyncEncryptionAvailable()`, `encryptStringAsync()` and `decryptStringAsync()`, which returns `{ result, shouldReEncrypt }`; re-encrypt when it is true. The sync `encryptString`, `decryptString` and `isEncryptionAvailable` are `@deprecated` in the 45.2.1 d.ts and "will be removed in Electron 46" (docs) [V].
- Real-world expectation for Rishi: the first packaged launch after a rebuild may show one Keychain prompt. "Always Allow" is fine for a personal tool. Note it in the phase SUMMARY.

## CSP

One constant, `src/shared/csp.ts`:
```
default-src 'self' app:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self';
img-src 'self' app: data: blob:; font-src 'self' app:; media-src 'self' app: blob: mediastream:;
worker-src 'self' app: blob:; connect-src 'self' app: https://huggingface.co https://*.huggingface.co https://*.hf.co;
object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
```
- **Pitfall:** `@vitejs/plugin-react` 6 injects an **inline `<script>` refresh preamble in dev** (verified: `transformIndexHtml` with `children: getPreambleCode(...)`). The template's static meta CSP (`script-src 'self'`) would therefore block HMR in dev.
- Fix: inject the meta only in build, with a renderer plugin `{ name:'csp', apply:'build', transformIndexHtml: h => h.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${CSP}">`) }`. Production also gets the response header from `protocol.handle`. Dev runs without CSP, but on loopback only.
- `style-src 'self'` works in production because Vite extracts the CSS. React `style={{}}` uses CSSOM and is not blocked.
- Add `mediastream:` because the Phase 4 webcam `<video srcObject>` doesn't need it, but some code paths set blob/mediastream URLs. It is harmless.
- E2E check: read the `content` attribute of `<meta http-equiv=Content-Security-Policy>`. Also check the header: `page.evaluate(() => fetch(location.href).then(r=>r.headers.get('content-security-policy')))`, which works because `supportFetchAPI` is set.

## Replay Server (FND-03)

Design (about 60 lines, `tests/replay/server.ts`, started in Playwright `globalSetup` and also importable from Vitest):
- **URL scheme:** `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>/s/<scenario>`. The SDK builds `baseURL + path` (verified in `buildURL`: `new URL(baseURL + path)`), so requests arrive at `/s/<scenario>/v1/messages`. The scenario is fixed per app launch. This is stateless and needs no control endpoint.
- **Counter:** an in-memory `Map<scenario, n>`; the response is `tests/fixtures/claude/<scenario>/<n>.res.json` = `{ "status": 200, "headers": {"content-type": "..."}, "body": "<raw text: JSON or SSE bytes>" }`.
  - SSE fixtures are served by writing `body` as-is with `content-type: text/event-stream`. Chunked writing is unnecessary for Phase 1.
  - A missing fixture gets a 599 with a JSON error, so the test fails loudly.
- **Request log:** each request writes `<n>.req.json` = `{ method, path, body: JSON.parse(reqBody) }`. **No headers are saved at all.** Saving none is simpler and safer than stripping them, and SDK 1.4.0 puts the key in `Authorization: Bearer …` [V], so an `x-api-key`-only strip would leak it.
  - In replay mode, write logs to `test-results/replay/` (gitignored). In RECORD mode, write them next to the fixtures.
  - A `GET /__log/<scenario>` endpoint returns the requests the server saw. The E2E test uses it to assert the probe hit `/v1/messages` with `model: claude-haiku-5-5` and `max_tokens: 1`. It also lets the canary test assert the server received `authorization: Bearer <canary>`. Return a boolean `sawCanary`, never the header value.
- **RECORD=1:** forward to `https://api.anthropic.com` + path (after stripping `/s/<scenario>`) using global `fetch`. Copy only `anthropic-version`, `anthropic-beta`, `content-type` and `authorization` upstream. Read the full text, save `<n>.res.json`, and return it.
- **Phase 1 scenarios:**
  - `probe-ok`: record once with the real key (`RECORD=1`).
  - `probe-401`: record once with a bogus key that does not start with `sk-ant-`, for example `invalid-key-e2e`.
  - Network error: point `ANTHROPIC_BASE_URL` at `http://127.0.0.1:9` (a closed port). No fixture needed.
- **Fixture hygiene test (Vitest, main project):** read every file under `tests/fixtures/claude/**`. Assert no `/sk-ant-[A-Za-z0-9_-]{20,}/`, no `"authorization"` key, and no `x-api-key`.

### Key-leak canary E2E (KEY-03)
Launch with `ANTHROPIC_API_KEY=canary-<randomUUID>` and the `probe-ok` scenario. Then assert:
1. The app routes to Home with `source:'stored'` (auto-saved from env).
2. The replay server saw the canary (`sawCanary: true`).
3. The canary appears nowhere it shouldn't:
   - in `page.content()`;
   - in `JSON.stringify(await page.evaluate(() => window.api.key.status()))`;
   - in `localStorage` / `sessionStorage` dumps;
   - in collected `page.on('console')` text;
   - in `electronApp.process().stdout` / `stderr`;
   - in any file under `USER_DATA_DIR` (read them as binary and search for the canary bytes). The key file is ciphertext, so the plaintext canary must not appear.
4. `Object.keys(window.api)` deep-equals `['key']` and `Object.keys(window.api.key)` equals `['status','save','clear']`.
5. The renderer has no Node: `typeof require === 'undefined' && typeof process === 'undefined' && typeof module === 'undefined'`.

## Vitest 5 projects (verified in vitest 5.1.0 d.ts)

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  test: {
    coverage: { provider: 'v8', include: ['src/main/**', 'src/shared/**'] },
    projects: [
      { extends: true, test: { name: 'main', environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts', 'tests/config/**/*.test.ts', 'tests/replay/**/*.test.ts'] } },
      { extends: true, plugins: [react()], test: { name: 'renderer', environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'] } },
    ],
  },
})
```
- `test.projects?: TestProjectConfiguration[]` [V]. Inline entries are `UserWorkspaceConfig & { extends?: string | boolean }`, and `extends` **defaults to true** [V], so `extends: true` is explicit but redundant. Inline projects cannot declare nested `projects`.
- Run one project with `npx vitest run --project main`.
- `@vitest/coverage-v8` must match exactly (5.1.0).
- `tests/e2e/**` must stay out of the Vitest includes, because Playwright specs would crash Vitest.

## Playwright

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: 'tests/e2e', workers: 1, fullyParallel: false, timeout: 60_000,
  globalSetup: './tests/e2e/global-setup.ts', reporter: [['list']], use: { trace: 'retain-on-failure' } })

// tests/e2e/launch.ts
import { _electron as electron } from '@playwright/test'
export async function launch(o: { scenario?: string; env?: Record<string,string>; executablePath?: string } = {}) {
  const userData = o.env?.USER_DATA_DIR ?? await mkdtemp(join(tmpdir(), 'mcp-e2e-'))
  const app = await electron.launch({
    ...(o.executablePath ? { executablePath: o.executablePath, args: [] } : { args: ['.'], cwd: ROOT }),
    env: { PATH: process.env.PATH!, HOME: process.env.HOME!, E2E: '1', USER_DATA_DIR: userData,
           FAKE_AUDIO_WAV: join(ROOT, 'tests/fixtures/audio/tone.wav'),
           ANTHROPIC_BASE_URL: `${process.env.REPLAY_URL}/s/${o.scenario ?? 'none'}`, ...o.env } })
  return { app, page: await app.firstWindow(), userData }
}
```
- `args: ['.']` runs `package.json#main` = `out/main/index.js`, which satisfies "launch out/main/index.js". It also keeps `productName` as the app name. Passing the script path directly can make Electron fall back to the default name "Electron".
- `globalSetup`:
  1. generate the WAV with `say` plus `afconvert` into `tests/fixtures/audio/` (gitignored);
  2. start the replay server on port 0;
  3. set `process.env.REPLAY_URL` (Playwright propagates env set in globalSetup to workers);
  4. return a teardown that closes the server.
- Tags: `test('launches packaged', { tag: '@packaged' }, …)`. `--grep @packaged` matches tags.
- Packaged smoke: `executablePath: join(ROOT, 'release/mac-arm64/Mock Case Proctor.app/Contents/MacOS/Mock Case Proctor')`.
- Hidden windows work (spike). Wait with `await page.waitForSelector('[data-screen=home]')`. Never use `waitForTimeout`.
- Close in `finally`: `await app.close()`.

## keymgr Registration (KEY-02), verified against `~/.local/bin/keymgr`

```toml
# append to ~/.config/keys/projects.toml
[projects.mock-case-proctor]
path = "/Users/rishizamvar/Documents/Projects/mock-case-proctor/.env"
needs_shared = ["ANTHROPIC_API_KEY"]
secrets_enc = false

[projects.mock-case-proctor.project_config]
```
```bash
keymgr export mock-case-proctor        # renders ~/.config/keys/.envs/mock-case-proctor.env (mode 600) — prints only the path
ln -s ~/.config/keys/.envs/mock-case-proctor.env /Users/rishizamvar/Documents/Projects/mock-case-proctor/.env
keymgr ls | grep mock-case-proctor     # ✓ column confirms symlink
test -L .env && git check-ignore -q .env
```
- **`keymgr export` does NOT create the symlink.** `cmd_export` only calls `render_slice`, and the README's "Adding a new project" step does `ln -s` by hand. CONTEXT's "that creates the .env symlink" is inaccurate, so the plan needs the explicit `ln -s` step.
- The master `.env` has `ANTHROPIC_API_KEY` (presence checked by line count; the value was not read). `ANTHROPIC_API_KEY` is **not** set in this shell's env, so dev auto-fill will come from `.env`.
- Never `cat` the slice or `.env`. Verify presence with `grep -c '^ANTHROPIC_API_KEY=' .env`.

## Logger

```ts
const KEY_RE = /sk-ant-[A-Za-z0-9_-]+/g
export const redact = (s: string) => s.replace(KEY_RE, 'sk-ant-***')
export const log = { info: (...a: unknown[]) => console.log(fmt(a)), warn: …, error: … }  // fmt = redact(a.map(x => x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x)).join(' '))
```
- Also redact errors from `process.on('uncaughtException')`.
- The canary key does not match `sk-ant-`. That is the point: the E2E canary proves the key never reaches logs by **design**, and `redact` is only the safety net. Unit-test both.

## Secret Scan (FND-02)

Matching the literal `sk-ant-` "anywhere" would self-trigger. The logger regex, this RESEARCH.md, CONTEXT.md and the scan test itself all contain `sk-ant-`. Use `/sk-ant-[A-Za-z0-9_-]{20,}/` over `git ls-files -z`. Real keys run to about 100 characters; regex sources (`sk-ant-[A`) and prose don't match. Skip binary files: if a file has a NUL in its first 8 KB, skip it.
- Also run the scan in a Vitest self-check: write a temp string containing a fake 30-character key into the test's memory and assert the matcher finds it, so the regex can't silently rot.
- Test fake keys anywhere in the repo must not take the form `sk-ant-` plus 20 or more characters.

## Common Pitfalls

### Pitfall 1: Scaffolding in place wipes the repo
**What goes wrong:** `npm create … -- --skip` in a non-empty dir runs `emptyDir(root)`, which deletes `.git`, `.planning` and `research/`. [V index.js]
**How to avoid:** Scaffold in a temp dir and rsync it over, excluding `.gitignore`.

### Pitfall 2: Silent mic/camera denial in the packaged app
**How to avoid:** Put device entitlements in **both** plists, add usage strings, add a config test, and check `codesign -d --entitlements` on the Helper (Renderer).

### Pitfall 3: Ad-hoc signing plus hardened runtime fails to launch
**What goes wrong:** Library validation rejects frameworks.
**How to avoid:** Add `cs.disable-library-validation`. electron-builder itself warns about this [V].
**Warning sign:** The packaged smoke test times out on `firstWindow`.

### Pitfall 4: Sandboxed preload `require` failure
**What goes wrong:** electron-vite externalizes deps by default [V], so `import '@electron-toolkit/preload'` becomes a runtime `require`, which the sandbox refuses ("module not found").
**How to avoid:** The preload imports only `electron` plus relative `src/shared`. Keep CJS output by not setting `"type": "module"`.

### Pitfall 5: The real key leaks into E2E
**What goes wrong:** The test spreads `process.env`, or the app reads the real `.env` symlink because the E2E cwd is the project root.
**How to avoid:** Use an explicit minimal env, and a `dotenvPath` that is null when `E2E=1` unless `E2E_DOTENV_PATH` is set.

### Pitfall 6: Keychain prompt hangs E2E, and the packaged app re-prompts after each rebuild
**How to avoid:** Use `use-mock-keychain` under E2E, a cipher parameter in unit tests, and accept "Always Allow" on the packaged app. A decrypt failure falls through to env without crashing.

### Pitfall 7: Main-process deps missing in the packaged app
**What goes wrong:** `@anthropic-ai/sdk` or `zod` ends up in devDependencies. Externalized `require` fails only in the packaged `.app`.
**How to avoid:** Keep them in `dependencies`. The packaged smoke test triggers a probe (scenario `probe-ok`) so the SDK actually loads.

### Pitfall 8: Strict CSP breaks dev HMR
**What goes wrong:** The inline plugin-react preamble is blocked.
**How to avoid:** Inject the meta CSP only in build. Production carries the header as well.

### Pitfall 9: `fake-audio` gives silence
**How to avoid:** `disable-features=AudioServiceSandbox` is required [spike]. Only one `disable-features` switch counts. Assert peak > 0.1, not just that the track is `live`.

### Pitfall 10: Vitest imports `electron`
**What goes wrong:** You get a path string instead of the APIs, causing confusing `undefined is not a function` errors.
**How to avoid:** Use the pure-core/adapter split (Pattern 1).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `safeStorage.encryptString` (sync) | `encryptStringAsync` / `decryptStringAsync` / `isAsyncEncryptionAvailable` | The sync API is deprecated in 45 and removed in 46 | Use the async API now |
| `protocol.registerFileProtocol` / `loadFile` | `protocol.handle` + `net.fetch` | Electron 25+ | `request.initiatorOrigin` is available in 45 |
| `x-api-key` header | `Authorization: Bearer <key>` in SDK 1.4.0 | SDK 1.x | Replay key stripping must handle `authorization` |
| vitest `workspace` file | `test.projects` inline | Vitest 3.2+, and the only option in 5 | Use one config file |
| `externalizeDepsPlugin()` | `build.externalizeDeps` (default true) | electron-vite 5/6 | The plugin is deprecated; don't add it |

## Open Questions

1. **Does `use-mock-keychain` cover `safeStorage` (async OSCrypt) in Electron 45?**
   - What we know: Electron's own tests adopted it for keychain prompts, and others use it for "Safe Storage" dialogs.
   - Unclear: the async path is not stated explicitly anywhere.
   - Recommendation: make the save-relaunch-stored E2E test the first harness test. Fall back to `E2E_FAKE_CIPHER` if it hangs.
2. **Does `thinking: {type:'disabled'}` type-check in SDK 1.4.0 for Haiku 5.5?**
   - Recommendation: try it. If `tsc` rejects it, drop the field. The probe's 200 vs 401 behaviour doesn't depend on it.
3. **`app://` module scripts and `crossorigin`.** Vite emits `<script type="module" crossorigin>`. This is a same-origin load from `app://bundle`, so it is expected to work with `standard`+`secure`. Add `corsEnabled: true` if the built app shows a blank window with CORS console errors (LOW).
4. **Packaged app and `.env`.** The packaged app has no `.env`, and a Finder launch has no shell env. The first packaged launch uses the stored key (after one Keychain prompt) or Settings. This is by design.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | everything | ✓ | 22.20.0 (needs ^22.12 for vitest 5 and electron install) | — |
| npm | scaffold/install | ✓ | 10.9.3 | — |
| keymgr | KEY-02 | ✓ | `~/.local/bin/keymgr` (Python) | Settings paste |
| master `ANTHROPIC_API_KEY` | KEY-02, RECORD, @live | ✓ (present in `~/.config/keys/.env`) | — | — |
| `ANTHROPIC_API_KEY` in shell env | — | ✗ (unset) | — | `.env` symlink (intended path) |
| say / afconvert | WAV fixtures | ✓ | system | — |
| codesign / plutil | ad-hoc sign, plist test | ✓ | system | — |
| gh + `origin` remote | FND-02 push | ✓ | `rishi-zamvar/mock-case-proctor` | — |
| Electron 45.2.1 binary | E2E | downloads on `npm i` (already cached by the spike) | — | — |
| Network to api.anthropic.com | RECORD and @live only | assumed | — | Replay fixtures; mark live tests skipped |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.1.0 (projects `main` and `renderer`) + Playwright 1.64.1 `_electron` |
| Config files | `vitest.config.ts`, `playwright.config.ts` (both Wave 0) |
| Quick run command | `npx vitest run --project main` (< 5 s) |
| Full suite command | `npm test && npm run test:e2e` |
| Phase gate | `npm run test:packaged && npm run test:live`, then the codesign checks |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-01 | The built app launches and the first window shows Settings or Home | e2e | `npm run test:e2e -- tests/e2e/shell.spec.ts -g "launches"` | ❌ Wave 0 |
| FND-01 | The packaged ad-hoc arm64 `.app` launches | e2e @packaged + shell | `npm run test:packaged` then `codesign -dv "release/mac-arm64/Mock Case Proctor.app" 2>&1 \| grep Signature=adhoc` | ❌ |
| FND-02 | No `sk-ant-` plus 20+ characters in tracked files; `.env` ignored | unit | `npx vitest run tests/config/secret-scan.test.ts` (also asserts `git check-ignore .env models/x sessions/x`) | ❌ |
| FND-03 | The Vitest projects both run | meta | `npx vitest run --project renderer` (one trivial App test) | ❌ |
| FND-03 | The fake mic delivers non-silent audio | e2e | `npm run test:e2e -- -g "fake audio"` (asserts `__e2e.micPeak(2500) > 0.1`) | ❌ |
| FND-03 | Replay serves by scenario and index; RECORD strips headers; fixtures are clean | unit + integration | `npx vitest run tests/replay/` (starts the server on port 0, hits it with the real SDK `baseURL`, checks the `.req.json` has no headers, and the fixture-hygiene scan) | ❌ |
| FND-04 | Both plists have audio-input, camera, jit, unsigned-mem and disable-library-validation; the builder JSON has identity `-`, entitlements, entitlementsInherit, both usage strings and target arm64 | unit | `npx vitest run tests/config/entitlements.test.ts` (`plutil -convert json`) | ❌ |
| FND-05 | `resolveSafePath` rejects `..`, `%2e%2e`, encoded `/`, NUL, absolute paths and bad percent-encoding | unit | `npx vitest run src/main/protocol.test.ts` | ❌ |
| FND-05 | No Node globals; `window.api` keys are exactly the allowlist; CSP meta and header present and equal to the constant; `app://bundle/../` gets a 404; `window.open` denied | e2e | `npm run test:e2e -- tests/e2e/shell.spec.ts` | ❌ |
| FND-05 | BrowserWindow webPreferences | e2e | `electronApp.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences())` asserts sandbox, contextIsolation, `!nodeIntegration` and webSecurity | ❌ |
| KEY-01 | KeyStore precedence, save, encrypt, atomic write, decrypt-failure fallthrough, `unavailable` | unit | `npx vitest run src/main/keys/keyStore.test.ts` | ❌ |
| KEY-01 | Probe maps 200 to valid, 401/403 to invalid, 429 to valid, network/5xx to unverified, and sends `max_tokens:1` with `claude-haiku-5-5` | unit (SDK `fetch` seam) | `npx vitest run src/main/keys/probe.test.ts` | ❌ |
| KEY-01 | Settings: a paste field of type password, Save & verify, error states, force-save on unverified | component | `npx vitest run --project renderer` | ❌ |
| KEY-01 | First run with no key goes to Settings; paste, then `probe-ok`, then Home; relaunch with the same userData gives `source:'stored'` and no prompt | e2e | `npm run test:e2e -- tests/e2e/key.spec.ts -g "paste"` | ❌ |
| KEY-01 | `probe-401` shows "invalid" and stays on Settings; closed port shows "couldn't verify" and Save-anyway works | e2e | `npm run test:e2e -- tests/e2e/key.spec.ts -g "invalid\|offline"` | ❌ |
| KEY-02 | Env key auto-saved and Settings skipped; dotenv via `E2E_DOTENV_PATH` likewise | unit + e2e | `npx vitest run src/main/keys/` ; `npm run test:e2e -- -g "auto-fill"` | ❌ |
| KEY-02 | keymgr symlink present and ignored | shell (gate) | `test -L .env && keymgr ls \| grep -q 'mock-case-proctor' && git check-ignore -q .env` | n/a |
| KEY-03 | Redaction | unit | `npx vitest run src/main/log.test.ts` | ❌ |
| KEY-03 | Canary key absent from DOM, IPC returns, storage, console, main stdio and userData plaintext; present at the replay server | e2e | `npm run test:e2e -- -g "canary"` | ❌ |
| KEY-03 | `KeyStatus` has exactly `{hasKey, source}` (zod `.strict()`) | unit | `npx vitest run src/shared/` | ❌ |
| KEY-04 | Clear removes the file and goes back to Settings; Replace overwrites; a relaunch reflects it | unit + e2e | `npx vitest run src/main/keys/keyStore.test.ts` ; `npm run test:e2e -- -g "replace\|clear"` | ❌ |
| KEY-01 (live) | A real key probes as `valid` against the real API | live | `npm run test:live` (reads `.env` via `parseDotenv` in the test; skipped if absent) | ❌ |
| QA-01 | TDD order | process | Each plan task commits the RED test before the implementation. The verifier checks `git log` order per module | n/a |

### Sampling Rate
- **Per task commit:** `npx vitest run --project main` (plus `--project renderer` when the UI changed).
- **Per wave merge:** `npm test && npm run test:e2e`.
- **Phase gate:**
  - the full suite;
  - `npm run test:packaged`;
  - the codesign/plutil checks;
  - `npm run test:live` (one probe);
  - three consecutive green `test:e2e` runs (flake check);
  - then push to `origin`.

### Wave 0 Gaps
- [ ] Scaffold, pins, `productName`, remove `@electron-toolkit/*`
- [ ] `vitest.config.ts` (projects) + one trivial test per project
- [ ] `playwright.config.ts`, `tests/e2e/global-setup.ts` (WAV + replay server), `tests/e2e/launch.ts`
- [ ] `tests/replay/server.ts` + record `probe-ok` / `probe-401` fixtures (`RECORD=1`, one-time real call)
- [ ] `.gitignore` additions: `tests/fixtures/audio/*.wav`, `*.log*`, `.eslintcache`
- [ ] The mock-keychain save → relaunch test runs first (Open Question 1)

## Sources

### Primary (HIGH confidence)
- create-electron 1.0.31 tarball (`index.js`, `template/base`, `template/react-ts`): the file list, `--skip` → `emptyDir`, the template configs.
- app-builder-lib 26.18.0 tarball: `mac/MacTargetHelper.js` (the `"-"` ad-hoc branch, the disable-library-validation warning, the entitlements defaults) and `macPackager.js` (the arch-suffixed output dir).
- electron 45.2.1 `electron.d.ts` (spike node_modules): the SafeStorage async API and sync deprecation, the `CustomScheme` privileges, `protocol.handle`, `initiatorOrigin`.
- @anthropic-ai/sdk 1.4.0 tarball: `client.js` (the Bearer auth header, the `ANTHROPIC_BASE_URL` default, `buildURL` concatenation, the env/profile fallback) and `core/error.js` (the error classes).
- vitest 5.1.0 tarball d.ts: `projects`, `TestProjectInlineConfiguration.extends` (default true).
- electron-vite 6.0.0 d.ts: `externalizeDeps` defaults to true, plus the sandbox note. @vitejs/plugin-react 6: the inline dev preamble.
- playwright-core (spike): the `env` option replaces `process.env`.
- `~/.local/bin/keymgr` source and `~/.config/keys/README.md`: export renders only; the symlink is manual.
- claude-api skill `shared/models.md` / `SKILL.md`: `claude-haiku-5-5` pricing and thinking defaults, `claude-opus-5-5`.
- Local runs: `say`/`afconvert` WAV output; spike `main.js`/`run2.mjs` fake-media switches.
- https://www.electronjs.org/docs/latest/api/safe-storage: async API, re-prompt on inconsistent signature, sync removal in 46.

### Secondary (MEDIUM confidence)
- https://releases.electronjs.org/pr/53790: `--use-mock-keychain` for test keychain prompts, backported to 45.0.0-alpha.6.
- https://github.com/danipen/gitgrove/pull/17 and https://instagit.com/different-ai/openwork/openwork-electron-desktop-app-architecture/: mock keychain against Safe Storage dialogs on ad-hoc builds.

### Tertiary (LOW confidence)
- Whether `corsEnabled` is needed for `app://` module scripts; untested.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Every version was checked with `npm view` today, and the template was inspected.
- Architecture and security patterns: HIGH. They come from d.ts and source reads plus the official doc pattern.
- safeStorage under E2E: MEDIUM. The mock-keychain coverage of async safeStorage is inferred, and a Wave 0 test resolves it.
- Pitfalls: HIGH. Most were verified in source; the rest are spike-proven.

**Research date:** 2026-11-03
**Valid until:** 2026-12-03 (Electron and the SDK move monthly; re-check if bumping majors)
