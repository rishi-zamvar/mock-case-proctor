---
phase: 7
slug: voice-in-barge-in
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-03
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (projects `main`=node, `renderer`=jsdom); Playwright 1.64.1 `_electron` (workers 1) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run src/main/stt src/main/session src/main/agent src/renderer/src/mic src/renderer/src/speech src/renderer/src/screens` |
| **Full suite command** | `npx vitest run && npm run test:e2e && npm run test:e2e:t2` |
| **Estimated runtime** | quick ~20 s (includes real base.en whisper); full ~15 min (T2 is real STT+TTS) |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command (always under 60 s, never builds).
- **After every plan wave:** `npx vitest run` (both projects) and `npm run typecheck`.
- **Before `/gsd:verify-work`:** the full suite, plus `SLOW=1` turbo and `npm run test:packaged`, must be green (07-10).
- **Max feedback latency:** 60 seconds per task. Builds and E2E only in wave 4.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | VIN-02 | script | `bash scripts/fetch-voice-assets.sh` (2× skip whisper) + shasum | ✅ (extended) | ✅ green |
| 7-01-02 | 01 | 1 | VIN-02 | integration | `npx vitest run --project main src/main/stt/whisper.int.test.ts` (+ `SLOW=1 -t turbo`) | ✅ | ✅ green |
| 7-02-01 | 02 | 1 | VIN-04 | unit | `npx vitest run --project main src/main/stt/gate.test.ts src/main/stt/clean.test.ts` | ✅ | ✅ green |
| 7-02-02 | 02 | 1 | VIN-04, VOUT-04 | unit | `npx vitest run --project main src/main/stt` | ✅ | ✅ green |
| 7-03-01 | 03 | 1 | VIN-01, VOUT-04 | unit (jsdom) | `npx vitest run src/renderer/src/mic/accumulator.test.ts` | ✅ | ✅ green |
| 7-03-02 | 03 | 1 | VIN-01 | unit (jsdom) | `npx vitest run src/renderer/src/mic` | ✅ | ✅ green |
| 7-04-01 | 04 | 2 | VIN-02 | unit (fake child) | `npx vitest run --project main src/main/stt/whisperStt.test.ts` | ✅ | ✅ green |
| 7-04-02 | 04 | 2 | VIN-02 | typecheck | `npm run typecheck:node` (build output checked in 7-10-02) | n/a | ✅ green |
| 7-05-01 | 05 | 2 | VOUT-05 | unit (real SDK, SSE stub) | `npx vitest run --project main src/main/agent` | ✅ | ✅ green |
| 7-06-01 | 06 | 2 | VOUT-04 | unit | `npx vitest run --project main src/shared src/main/session/latency.test.ts src/main/session/view.test.ts src/main/store` | ✅ | ✅ green |
| 7-06-02 | 06 | 2 | VIN-03, VIN-04, VOUT-04 | unit | `npx vitest run --project main src/main/session src/main/stt` | ✅ | ✅ green |
| 7-07-01 | 07 | 3 | VOUT-05 | unit | `npx vitest run --project main src/main/session src/main/agent` | ✅ | ✅ green |
| 7-08-01 | 08 | 3 | VIN-02 | unit | `npx vitest run --project main src/main/compose.test.ts src/main/ipc.test.ts` | ✅ (extended) | ✅ green |
| 7-08-02 | 08 | 3 | VIN-01, VIN-02 | typecheck | `npm run typecheck && npx vitest run --project main src/main` | n/a | ✅ green |
| 7-09-01 | 09 | 3 | VOUT-04 | unit (jsdom) | `npx vitest run src/renderer/src/speech` | ✅ | ✅ green |
| 7-09-02 | 09 | 3 | VIN-01, VIN-03, VOUT-05 | unit (jsdom) | `npx vitest run src/renderer/src/screens` | ✅ | ✅ green |
| 7-09-03 | 09 | 3 | VIN-01, VOUT-05 | unit (jsdom) | `npx vitest run src/renderer && npm run typecheck:web` | ✅ | ✅ green |
| 7-10-01 | 10 | 4 | QA-03 | listing | `npx playwright test --list --grep "@t2\|@livevoice\|@packaged"` | ✅ | ✅ green |
| 7-10-02 | 10 | 4 | QA-03, VOUT-04, VOUT-05, VIN-01..04 | E2E T1 + T2 | `npm run test:e2e && npx playwright test tests/e2e/voiceloop.t2.spec.ts --grep @t2 && npm run test:e2e:t2` | ✅ | ✅ green |
| 7-10-03 | 10 | 4 | VIN-02 | packaged E2E | `npm run test:packaged` (+ `LIVE_VOICE=1 … --grep @livevoice`, report-only) | ✅ (extended) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every "❌ W0" file is created test-first by the task that owns it (strict TDD: RED commit before GREEN). No separate scaffold wave is needed, because every test runs on the existing Vitest and Playwright infrastructure.

- [x] `whisper-cpp-node@0.2.12` installed, and whisper models in place via `scripts/fetch-voice-assets.sh` (07-01)
- [x] `src/main/stt/{gate,clean,filtered,answers}.test.ts` (07-02), `whisperStt.test.ts` (07-04), `whisper.int.test.ts` (07-01)
- [x] `src/renderer/src/mic/{accumulator,capture}.test.ts` (07-03)
- [x] `src/main/agent/claudeLlm.bargein.test.ts` (07-05); `src/main/session/{runner.stt,runner.bargein,latency}.test.ts`, `src/shared/schemas.voice.test.ts` (07-06/07)
- [x] `src/renderer/src/speech/speechQueue.started.test.ts`, `screens/Session.voice.test.tsx`, `App.voice.test.tsx` (07-09)
- [x] `tests/e2e/voiceFixtures.ts` + `say` WAVs in global-setup, and `tests/e2e/voiceloop.t2.spec.ts` (07-10)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| q5_0 accuracy on Rishi's own voice and accent (beyond `say` fixtures) | VIN-02 | Needs real human recordings; the build is unattended | Optional post-phase: record 3–5 answers and drop them in tests/fixtures/audio. If misses appear, switch `STT_MODEL` to q8_0 (one constant). |
| Chromium AEC/AGC with a real room mic | VIN-01, VIN-04 | Verified with the fake device only; the mic is gated during avatar speech, so the risk is low | Use the app once with a real mic. `voicedMs` is logged per turn, so the 0.02 gate knob can be tuned. |

All phase success criteria have automated verification. The two rows above are tuning checks, not gates.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s per task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-03 (automated)
