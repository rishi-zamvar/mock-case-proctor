---
phase: 05-voice-out-avatar
plan: 02
subsystem: voice-infra
tags: [protocol, csp, vendoring, headtts, transformers, assets]
requires: []
provides:
  - "app://bundle/res/* same-origin route to resources/assets (resolveResRequest)"
  - "Content-Length + JS/wasm MIME on every app:// response"
  - "CSP connect-src blob:"
  - "copyVoiceVendor + vendor-voice renderer plugin -> src/renderer/public/vendor/"
  - "tf-shim.mjs (local ORT, no wasm cache, local-only models)"
  - "scripts/fetch-voice-assets.sh + assets on disk"
affects: [05-03, 05-04, 05-05]
tech-stack:
  added: ["@met4citizen/talkinghead 1.8.2", "three 0.186.1", "@met4citizen/headtts 1.3.0", "@huggingface/transformers 4.3.2"]
  patterns: ["raw-path + parsed-path traversal check (same as case route)", "size-checked .part download + atomic mv"]
key-files:
  created:
    - scripts/vendorVoice.ts
    - scripts/fetch-voice-assets.sh
    - src/renderer/vendor/tf-shim.mjs
    - src/shared/csp.test.ts
    - tests/config/vendor-voice.test.ts
    - resources/assets/NOTICE
  modified:
    - src/main/protocol.ts
    - src/main/appProtocol.ts
    - src/shared/csp.ts
    - electron.vite.config.ts
    - package.json
    - package-lock.json
    - tsconfig.node.json
    - eslint.config.mjs
    - .gitignore
    - .prettierignore
decisions:
  - "Voice/model asset URLs: /res/models/voices/<v>.bin and /res/models/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/..., on disk under resources/assets/models/ (gitignored)"
  - "Models local-only (allowRemoteModels=false): a missing file fails loudly"
  - "Voice packages are devDependencies (renderer bundled; avoids shipping sharp/onnxruntime-node)"
metrics:
  duration: 4min
  completed: 2026-11-03
---

# Phase 5 Plan 02: Voice stack loadable from app:// offline Summary

The renderer can now load everything HeadTTS and TalkingHead fetch from `app://bundle`, offline. That covers the HeadTTS modules, transformers.min.js, the exact ORT asyncify wasm build, the Kokoro model, the voices and the GLB. Every response is same-origin, carries Content-Length, and passes the project CSP.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Content-Length + MIME, /res route, CSP blob: | cd462c0 (RED), 31f4d66 (GREEN) |
| 2 | Pinned deps, vendor plugin, tf-shim, ignores, scripts | ea48176 (RED), 8280939 (GREEN) |
| 3 | Asset fetch script, NOTICE, run it | 4be802e |

## Asset layout (orchestrator path note)

On disk under `resources/assets/models/` (gitignored), which the renderer reaches as `/res/models/...`:
- `onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/{config.json,tokenizer.json,tokenizer_config.json,onnx/model.onnx}`: model.onnx is 325532171 bytes
- `voices/{bm_george,bm_lewis,am_michael,am_fenrir,af_heart}.bin`: these are at `/res/models/voices/<v>.bin`, the path 05-04's HeadTTS adapter loads from (not `/res/voices`)
- `avatars/avatarsdk.glb`: 12284040 bytes, from TalkingHead v1.8.2 commit 46b32ee5

The first run downloaded everything in 14 s. The second run printed only `skip` lines.

## Deviations from Plan

**1. [Rule 1 - Test fix] appProtocol /res traversal test**
- **Found during:** Task 1 GREEN
- **Issue:** `new Request('app://bundle/res/%2e%2e/index.html')` normalises the URL to `app://bundle/index.html` before the handler sees it, so the test was asking for a legitimate bundle file. Electron does the same for standard schemes.
- **Fix:** the handler-level test now uses a NUL-byte `/res` URL, which hits the deny path. The raw `..` and `%2e%2e` traversal cases are tested on `resolveResRequest` directly in protocol.test.ts.
- **Commit:** 31f4d66

**2. Deps pin tests were green at RED.** The plan installs the packages (step 1) before it adds the pin tests (step 2). The RED commit for Task 2 therefore fails only on vendor-voice.

## Notes

- The headtts postinstall creates an empty `node_modules/@met4citizen/headtts/node_modules/@huggingface/transformers/.cache` directory. Because of it, `npm ls` reports an "invalid" nested transformers. This is harmless: nothing resolves through that directory, and the vendor step uses the top-level 4.3.2. ORT resolves to the top-level `onnxruntime-web@1.31.0-dev.20260914-8d85527a0`, which matches the transformers pin.
- The dev-server `/res` middleware in electron.vite.config.ts is marked `ponytail:` as dev-only and untested. E2E runs the built app.
- Nothing has been built yet (parallel wave). Whether `out/renderer/vendor` gets populated is verified at the final-wave build.
- Avatar branding: avatarsdk.glb wears a "METAPERSON AVATARS" T-shirt. It is non-commercial use only, which NOTICE records.
- `npm run lint` shows 0 errors. The warnings are prettier issues in files other plans own.

## Known Stubs

None.

## Self-Check: PASSED
