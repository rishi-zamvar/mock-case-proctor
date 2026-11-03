---
phase: 5
slug: voice-out-avatar
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-03
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (projects `main` node, `renderer` jsdom) + Playwright 1.64.1 `_electron` against the built `out/` |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (workers 1) |
| **Quick run command** | `npx vitest run --project renderer src/renderer/src/speech src/renderer/src/avatar` |
| **Full suite command** | `npm test && npm run lint && npm run typecheck && npm run test:e2e` |
| **T2 command (real voice)** | `npm run test:e2e:t2` (runs `scripts/fetch-voice-assets.sh` first; idempotent) |
| **Estimated runtime** | quick < 5 s; full ~3-5 min; T2 ~2-3 min |

---

## Sampling Rate

- **After every task commit:** the task's `<automated>` command (targeted Vitest, < 5 s)
- **After every plan wave:** `npm test && npm run typecheck`
- **Last wave only (05-08):** build + `npm run test:e2e:t2`, `npm run test:e2e`, `npm run test:packaged`
- **Before `/gsd:verify-work`:** everything above green
- **Max feedback latency:** 5 seconds (unit); E2E only in wave 4

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | VOUT-01 | unit | `npx vitest run src/shared/schemas.test.ts src/main/ipc.test.ts` | ✅ extend | ⬜ pending |
| 5-01-02 | 01 | 1 | VOUT-01 | unit | `npx vitest run src/main/session` | ❌ W1 (runner.voice.test.ts) | ⬜ pending |
| 5-01-03 | 01 | 1 | VOUT-01 | unit | `npx vitest run src/main/compose.test.ts` | ✅ extend | ⬜ pending |
| 5-02-01 | 02 | 1 | VOUT-01, VOUT-03 | unit | `npx vitest run src/main/protocol.test.ts src/main/appProtocol.test.ts src/shared/csp.test.ts` | ✅ extend / ❌ csp.test.ts | ⬜ pending |
| 5-02-02 | 02 | 1 | VOUT-01 | unit (config) | `npx vitest run tests/config/deps.test.ts tests/config/vendor-voice.test.ts` | ✅ extend / ❌ vendor-voice | ⬜ pending |
| 5-02-03 | 02 | 1 | VOUT-01, VOUT-03 | script | `bash scripts/fetch-voice-assets.sh` (twice; 2nd all `skip`) | ❌ W1 | ⬜ pending |
| 5-03-01 | 03 | 1 | VOUT-01, VOUT-03 | unit (TDD) | `npx vitest run --project renderer src/renderer/src/speech/speechQueue.test.ts` | ❌ W1 | ⬜ pending |
| 5-04-01 | 04 | 1 | VOUT-01 | unit (TDD) | `npx vitest run --project renderer src/renderer/src/speech/headtts.test.ts` | ❌ W1 | ⬜ pending |
| 5-04-02 | 04 | 1 | VOUT-03 | unit (TDD) | `npx vitest run --project renderer src/renderer/src/avatar/behaviour.test.ts` | ❌ W1 | ⬜ pending |
| 5-05-01 | 05 | 2 | VOUT-03 | typecheck/lint (E2E in 5-08-01) | `npm run typecheck:web && npx eslint src/renderer/src/avatar` | ❌ W2 | ⬜ pending |
| 5-05-02 | 05 | 2 | VOUT-01, VOUT-03 | unit (TDD) | `npx vitest run --project renderer src/renderer/src/speech` | ❌ W2 (voice.test.ts) | ⬜ pending |
| 5-06-01 | 06 | 2 | VOUT-03 | component | `npx vitest run --project renderer src/renderer/src/avatar/AvatarStage.test.tsx` | ❌ W2 | ⬜ pending |
| 5-06-02 | 06 | 2 | VOUT-03 | component | `npx vitest run --project renderer src/renderer/src/screens/Session.test.tsx` | ✅ extend | ⬜ pending |
| 5-07-01 | 07 | 3 | VOUT-01, VOUT-03 | component | `npx vitest run --project renderer src/renderer/src/App.test.tsx` | ✅ extend | ⬜ pending |
| 5-08-01 | 08 | 4 | VOUT-01, VOUT-03 | E2E T2 (`@t2`) | `npm run test:e2e:t2` | ❌ W4 (voice.t2.spec.ts) | ⬜ pending |
| 5-08-02 | 08 | 4 | VOUT-01 | E2E `@audition` + full gate | `npm run audition && npm test && npm run test:e2e && npm run test:packaged` | ❌ W4 (audition.spec.ts) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Success criterion → proof

| ROADMAP criterion | Unit proof | E2E proof (T2) |
|---|---|---|
| 1. Sentence spoken by HeadTTS + lip-synced; speaking state, visemes > 0, non-blank canvas | 5-03-01, 5-05-02 | 5-08-01 test 1 |
| 2. Startup asserts WebGPU; forced fallback shows banner | 5-04-01, 5-07-01 | 5-08-01 tests 1 and 4 |
| 3. Idle/listening/thinking visibly switch; one instance; 30 fps | 5-04-02, 5-06-01, 5-06-02 | 5-08-01 test 1 (stateLog, instances) |
| 4. Ordered per-sentence acks; cancel by turn id with no stale audio | 5-03-01, 5-01-02 | 5-08-01 test 2 |
| (extra) T-10 warning spoken when TTS=headtts | 5-01-02, 5-01-03 | 5-08-01 test 3 |

---

## Wave 0 Requirements

Test scaffolds are created inside each TDD task (RED commit first), so there is no separate Wave 0 plan:

- [ ] `src/main/session/runner.voice.test.ts` (5-01-02)
- [ ] `src/shared/csp.test.ts` (5-02-01)
- [ ] `tests/config/vendor-voice.test.ts` (5-02-02)
- [ ] `src/renderer/src/speech/speechQueue.test.ts` with a TalkingHead-faithful fake head (5-03-01)
- [ ] `src/renderer/src/speech/headtts.test.ts` with a fake HeadTTS factory and fake `navigator.gpu` (5-04-01)
- [ ] `src/renderer/src/avatar/behaviour.test.ts` (5-04-02)
- [ ] `src/renderer/src/speech/voice.test.ts` (5-05-02)
- [ ] `src/renderer/src/avatar/AvatarStage.test.tsx` (5-06-01)
- [ ] `tests/e2e/voice.t2.spec.ts`, `tests/e2e/audition.spec.ts` (5-08)
- [ ] `scripts/fetch-voice-assets.sh` run once (5-02-03); T2 fails loudly if assets are missing
- [ ] jsdom never imports `@met4citizen/*` or `three` (only `avatarEngine.ts` and the HeadTTS loader touch them; both are E2E-covered)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Voice naturalness / voice choice | VOUT-01 | Subjective listening | Play `.planning/phases/05-voice-out-avatar/audition/<voice>-<n>.wav` (25 files). To switch, change `VOICE` in `src/renderer/src/speech/voice.ts`. |
| Avatar framing, lighting, "Zoom partner" feel | VOUT-03 | Subjective visual | Open the stage screenshot artefact from the T2 run in `test-results/`, or run `npm run dev` and start a case with warm-up. |

Not blocking: both are judged by Rishi after the overnight run. All functional behaviours have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
