# Mock Case Proctor

A macOS desktop app (Electron) that runs a full, proctored Lead Edge Capital growth-equity case interview against the 12-case mock library. You pick a case, read the interviewee deck in-window for 45 minutes, then present by voice to a 3D talking-head partner. The partner is driven by Claude and speaks with a local voice. It interrupts, probes and grills you section by section. At the end you get a rubric scorecard and trends across all your past sessions.

## Requirements

- An Apple Silicon Mac. The app is built for arm64 only, and whisper runs on Metal while the voice runs on WebGPU.
- Node 22 (developed on 22.20).
- About 2 GB of free disk for the models and the packaged app (the `.app` is about 1.2 GB). Packaging needs a few GB of headroom on top of that.
- An Anthropic API key. Claude is the app's only paid dependency.

## Install

```bash
npm ci                 # dependencies (postinstall fetches the Electron binary)
npm run fetch:voice    # Kokoro voice model, voices, avatar GLB, whisper turbo + base.en → resources/assets/models/ (gitignored, idempotent)
npm run package        # → release/mac-arm64/Mock Case Proctor.app
open "release/mac-arm64/Mock Case Proctor.app"
```

The app is ad-hoc signed, not notarized, so open it the first time with right-click → Open. You can copy the `.app` into `/Applications` and then delete `release/` to free the space.

To run without packaging, use `npm run dev`.

## First run and the API key

The key is looked up in this order: the stored key, then the `ANTHROPIC_API_KEY` environment variable, then the project `.env`. In this repo `.env` is the keymgr symlink into `~/.config/keys`. The project `.env` is read only when you run from the repo (`npm run dev`); the packaged app does not read it.

The first time a key is found and passes a probe, the app encrypts it with Electron `safeStorage` and writes it to `anthropic-key.enc` in the app's userData folder. After that it never needs the env var again. The key is never logged and never sent to the renderer. For the packaged app, either:

- paste the key in **Settings**, or
- launch the app once from a shell that has the key set: `ANTHROPIC_API_KEY=... open "release/mac-arm64/Mock Case Proctor.app"`.

macOS asks for Microphone and Camera access once, the first time a session starts.

## Choosing a voice

The voice is set by one constant, `VOICE`, in `src/renderer/src/speech/voice.ts`. It defaults to `'bm_george'`.

1. Listen to the audition clips in `.planning/phases/05-voice-out-avatar/audition/<voice>-<n>.wav`. There are five clips for each of bm_george, bm_lewis, am_michael, am_fenrir and af_heart. To regenerate them, run `npm run audition`.
2. In the audition grading, `am_fenrir` and `am_michael` scored one notch higher than the default (C+ vs C).
3. Change `VOICE`, then run `npm run package` again.

## Interviewer model and latency

| Env var | Default | What it does |
|---|---|---|
| `INTERVIEWER_MODEL` | `claude-opus-5-5` | The live interviewer, run with `effort: 'low'` |
| `REVIEWER_MODEL` | `claude-opus-5-5` | The end-of-session scorecard grader |

The target is 3 s from pressing Done to the avatar's first audible word. In the packaged live run (`.planning/phases/09-packaged-live-sign-off/LATENCY.md`), Opus missed it:

- **The median was 4.98 s** (p90 8.6 s, n=12). Excluding the slow first turn after the opening, the median was 4.25 s.
- Local STT and TTS take about 1.6 s combined. The rest is Claude time-to-first-token, with a median of 3.2 s in the app.

Your options:

1. **Keep Opus** (the default) and accept about 4-5 s of latency. This keeps the current persona quality.
2. **Use Haiku**, which should be faster but has an untested persona. Check it once:
   ```bash
   INTERVIEWER_MODEL=claude-haiku-5-5 LIVE=1 npx vitest run --project main src/main/agent/claudeLlm.live.test.ts
   ```
   To use it, set `INTERVIEWER_MODEL=claude-haiku-5-5` in the environment you launch from (`npm run dev`, or `open` from a shell).
3. **Trim the cached prefix**, or **overlap the first grill turn with the opening extraction**. Both are code changes, described in LATENCY.md.

## Cases root

`CASES_ROOT` defaults to `~/Documents/Projects/lead_edge_mock_cases`. The app expects this layout:

```
<CASES_ROOT>/
  case_NN_slug/          # per-case folder with the interviewee deck PDF
  _work/data/case_NN.json  # case data (interviewer materials, answer key)
```

Session history is stored in `sessions/` inside the app's userData folder. Set `SESSIONS_DIR` to store it somewhere else.

## Privacy

- Speech-to-text (whisper large-v3-turbo) and text-to-speech (Kokoro via HeadTTS) run **locally**.
- The only traffic that leaves the machine is Claude API calls to `api.anthropic.com`. The packaged network tap in `@t3` verified this.
- No audio or video is recorded. The webcam is a self-view tile only. Session transcripts, timings and scorecards are saved locally so the app can show trends.
- Interviewer materials, such as the answer key and the grill points, appear only in review mode, after the interview. Before that they never reach the renderer, and leak guards enforce this.
- The API key is stored encrypted, kept out of the renderer, and never logged.

## Tests

| Command | What it runs | Cost |
|---|---|---|
| `npm test` | Vitest unit and integration tests (main + renderer) | Free, offline |
| `npm run lint` / `npm run typecheck` | ESLint / tsc | Free |
| `npm run test:e2e` | T1: Playwright on the built app with fake STT/TTS and replayed Claude | Free, offline |
| `npm run test:e2e:t2` | T2: real whisper and HeadTTS with fake-mic WAVs and replayed Claude | Free, offline (after `fetch:voice`) |
| `npm run test:live` | Live Claude evals (`LIVE=1` Vitest) plus the `@live` Playwright specs | Small Claude spend |
| `npm run test:packaged` | Packages the app, runs `verify-package.sh` and the `@packaged` smoke tests | Free; needs disk for `release/` |
| `npm run test:t3` | The packaged app driven live through full cases, plus a network tap and a memory soak | Small Claude spend; run `rm -rf release` afterwards |

The milestone sign-off, which maps each requirement to its tests, is in `docs/SIGNOFF.md`.
