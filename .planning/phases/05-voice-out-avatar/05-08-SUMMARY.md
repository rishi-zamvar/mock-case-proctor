---
phase: 05-voice-out-avatar
plan: 08
subsystem: e2e-gate
tags: [voice, avatar, e2e, t2, audition, packaging, phase-gate]
requires: ["05-02 vendored voice stack + local models", "05-07 App voice wiring + window.__voice probe"]
provides:
  - "@t2 Playwright suite: real HeadTTS + TalkingHead in the built app under the real CSP"
  - "@audition WAV generator (25 files, gitignored)"
  - "Packaging that survives the shipped Kokoro model.onnx"
affects: [06]
tech-stack:
  added: []
  patterns: ["npm overrides to pin a transitive dep of electron-builder", "keyed window.__voice reads (no eval under CSP)"]
key-files:
  created:
    - tests/e2e/voice.t2.spec.ts
    - tests/e2e/audition.spec.ts
    - tests/fixtures/signing/onnx-header.bin
  modified:
    - tests/e2e/shell.spec.ts
    - tests/config/deps.test.ts
    - package.json
    - package-lock.json
    - src/renderer/src/screens/Session.module.css
    - .planning/phases/05-voice-out-avatar/05-VALIDATION.md
decisions:
  - "VOICE = 'bm_george' stays the locked default; am_fenrir/am_michael grade one notch higher (C+ vs C), so Rishi can switch the one constant after listening"
  - "Pin @electron/osx-sign's isbinaryfile to 5.0.7 via npm overrides (4.0.10 crashes on model.onnx)"
  - "Models ship inside the packaged .app (703 MB) under app.asar.unpacked/resources/assets/models"
metrics:
  duration: 21min
  completed: 2026-11-03
  tasks: 2
  files: 9
---

# Phase 5 Plan 08: T2 Real Voice/Avatar E2E and Phase Gate Summary

Real Kokoro speech on WebGPU, TalkingHead lip-sync, cancel, the spoken T-10 warning and the CPU-fallback banner are all proven in the built app from `app://` under the production CSP. 25 audition WAVs are generated. The packaged app builds and passes its smoke test again, after an `isbinaryfile` override that stops osx-sign crashing on the shipped ONNX model.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| pre | Lint cleanup (prettier warnings, unused `.ring`) | bc4c691 |
| 1 | T2 real-voice E2E | 1b77470 |
| 2 | Audition WAVs, gate, validation | 8f1558b (RED), ce06f58 (GREEN fix), 14878ae, 3efa0e2, 5c04f12 |

## Gate

| Command | Result |
|---|---|
| `npm test` | 919 passed, 2 skipped |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | clean |
| `npm run test:e2e` (T1) | 39/39, 3 consecutive runs |
| `npm run test:e2e:t2` | 4/4, 4 consecutive runs (~37 s each) |
| `npm run audition` | 25 WAVs, 24 kHz mono PCM16, 5 distinct voices (e.g. line 1 is 7.4 to 8.1 s) |
| `npm run test:packaged` | package OK, 2/2 |

`out/renderer/vendor/headtts/modules/headtts.mjs` is present in the build.

## T2 findings

- The first real run of HeadTTS + TalkingHead in the built app passed without any app code changes. The browser console had no CSP `Refused to`, no `jsdelivr` and no page errors (checked with a temporary dump).
- `ready` (WebGPU connect + warm-up synth) is reached within the first test's 30 s poll. Test 1 takes 18 to 20 s end to end, the cancel test ~6 s, the T-10 test ~10 s, and the fallback test ~3 s.
- Skip-warmup cancel: `isSpeaking` goes false well under the 200 ms bound, with no stale seq in the 2 s after.
- Fallback: `addInitScript` on `app.context()` does reach the Electron window after `page.reload()`. `ttsDevice` was `wasm`, and the banner read "Voice is running on CPU — replies will be slow".
- Stage screenshot: `test-results/voice.t2-speaks-a-sentence-lip-synced-on-WebGPU-t2/avatar-stage.png`. The avatar renders and is lit, but the framing sits low: the head is in the lower half with a lot of headroom. This is a polish item (camera/`retarget.origin` in avatarEngine.ts). It does not block the gate.

## Voice choice

- `VOICE = 'bm_george'` in `src/renderer/src/speech/voice.ts` is the locked default.
- `am_fenrir` and `am_michael` grade one notch higher (C+ vs C). Listen to `.planning/phases/05-voice-out-avatar/audition/<voice>-<n>.wav` and change that one constant to switch.
- Avatar: `avatarsdk.glb` wears a "METAPERSON AVATARS" branded T-shirt (visible in the screenshot). `brunette.glb` (CC BY-NC) is the alternative; a suited avatar is v2.

## Deviations from Plan

**1. [Rule 3 - Blocking] Packaging crashed on the shipped model.onnx**
- **Found during:** Task 2 (`npm run test:packaged`)
- **Issue:** `@electron/osx-sign` runs `isbinaryfile` on every file in the .app before applying `signIgnore`. Its pinned `isbinaryfile` 4.0.10 decodes a garbage protobuf varint from the ONNX header and keeps reading past EOF, which throws `RangeError: Invalid array length`. 5.x stops on error.
- **Fix:** `"overrides": { "@electron/osx-sign": { "isbinaryfile": "5.0.7" } }` (the same version app-builder-lib already uses), plus removal of the stale lock entry. A regression test in `tests/config/deps.test.ts` uses the real 512-byte ONNX header (`tests/fixtures/signing/onnx-header.bin`, graph metadata only).
- **Commits:** 8f1558b, ce06f58

**2. [Rule 1 - Bug] Stale shell.spec api surface assertion**
- **Found during:** Task 2 (T1 run 1)
- **Issue:** 05-01 added `config` and `onSpeakCancel` to `window.api`, but the exact-key assertion in shell.spec still listed the Phase 4 keys.
- **Fix:** I added both keys and kept the exact equality, plus a new check that `api.config` is `{ tts: 'fake' }` under E2E.
- **Commit:** 14878ae

**3. Probe reads are keyed `page.evaluate` calls, not function sources.** Sending a function body to the page would need `new Function`, which the CSP blocks (`unsafe-eval`) and which would log a `Refused to` line itself.

**4. The screenshot is saved with `outputPath` + `path`.** An attachment `body` is not written to `test-results/`, so the plan's artefact check needs `path`.

Carried-forward naming deviations from earlier plans: the probe is `window.__voice`, not `__e2e`; models live under `resources/assets/models/` and are local-only (no Hugging Face fallback).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: tests/e2e/voice.t2.spec.ts, tests/e2e/audition.spec.ts, tests/fixtures/signing/onnx-header.bin, 25 audition WAVs (gitignored)
- FOUND: bc4c691, 1b77470, 8f1558b, ce06f58, 14878ae, 3efa0e2, 5c04f12
