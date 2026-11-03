---
phase: 8
slug: review-mode-trends
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-03
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (projects `main` node + `renderer` jsdom), Playwright 1.64.1 `_electron` |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (globalSetup starts the Claude replay server) |
| **Quick run command** | `npx vitest run --project main src/main/review` (or `--project renderer src/renderer/src/screens/review`) |
| **Full suite command** | `npm run lint && npm run typecheck && npm test` |
| **E2E (last wave only)** | `npm run test:e2e` (T1, fakes), `npm run test:e2e:t2` (replayed Claude + real TTS) |
| **Live (gate only)** | `LIVE=1 npx vitest run --project main src/main/review/review.live.test.ts` |
| **Estimated runtime** | ~8 s quick; full vitest ~60 s; T1 E2E ~5 min; T2 ~7 min |

---

## Sampling Rate

- **After every task commit:** the task's `<automated>` command (scoped vitest file/dir)
- **After every plan wave:** `npx vitest run && npm run typecheck`
- **Before `/gsd:verify-work`:** full suite + T1 ×3 + T2 + live review evals green (08-11)
- **Max feedback latency:** 8 seconds (scoped vitest)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | REV-01, REV-04 | unit (schemas) | `npx vitest run --project main src/shared src/main/store/sessionSchema.test.ts` | ✅ (extend) | ✅ green |
| 8-01-02 | 01 | 1 | REV-01, REV-04 | unit (fake, view, UI) | `npx vitest run && npm run typecheck` | ✅ (extend) | ✅ green |
| 8-02-01 | 02 | 1 | REV-03, REV-02 | unit (tables) | `npx vitest run --project main src/main/review/checks.test.ts src/main/domain/cases` | ❌ W0 (created in task, RED first) | ✅ green |
| 8-02-02 | 02 | 1 | REV-01 | unit (tables) | `npx vitest run --project main src/main/review/evidence.test.ts` | ❌ W0 (RED first) | ✅ green |
| 8-03-01 | 03 | 2 | REV-01, REV-02, REV-03 | unit | `npx vitest run --project main src/main/review && npm run typecheck:node` | ❌ W0 (RED first) | ✅ green |
| 8-03-02 | 03 | 2 | REV-01, REV-03 | unit | `npx vitest run && npm run typecheck` | ✅ (extend) | ✅ green |
| 8-04-01 | 04 | 2 | REV-06 | unit + SDK stub | `npx vitest run --project main src/main/review/trends.test.ts src/main/store` | ❌ W0 (RED first) | ✅ green |
| 8-04-02 | 04 | 2 | REV-06 | unit (fs) | `npx vitest run --project main src/main/review/trends.test.ts && npm run typecheck:node` | ❌ W0 | ✅ green |
| 8-05-01 | 05 | 2 | REV-01..04 | component | `npx vitest run --project renderer src/renderer/src/screens/review` | ❌ W0 (RED first) | ✅ green |
| 8-05-02 | 05 | 2 | REV-04 | component | `npx vitest run --project renderer && npm run typecheck:web` | ✅ (extend) | ✅ green |
| 8-06-01 | 06 | 2 | REV-01 | unit (runner) | `npx vitest run --project main src/main/session && npm run typecheck:node` | ❌ W0 (runner.score.test.ts) | ✅ green |
| 8-06-02 | 06 | 2 | REV-01 | component | `npx vitest run --project renderer src/renderer/src/screens/Session.test.tsx` | ✅ (extend) | ✅ green |
| 8-07-01 | 07 | 3 | REV-01, REV-04 | unit (prompt) | `npx vitest run --project main src/main/review/grader.test.ts src/main/agent/prompt.test.ts` | ❌ W0 | ✅ green |
| 8-07-02 | 07 | 3 | REV-01 | integration (real SDK, fetch stub) | `npx vitest run --project main src/main/review && npm run typecheck:node` | ❌ W0 | ✅ green |
| 8-08-01 | 08 | 3 | REV-06 | component | `npx vitest run --project renderer src/renderer/src/screens/review/Trends.test.tsx` | ❌ W0 | ✅ green |
| 8-08-02 | 08 | 3 | REV-06 | component | `npx vitest run --project renderer && npm run typecheck:web` | ❌ W0 | ✅ green |
| 8-09-01 | 09 | 4 | REV-01, REV-06 | integration (compose + replay server) | `npx vitest run --project main src/main/compose && npm run typecheck:node` | ❌ W0 (compose.review.test.ts) | ✅ green |
| 8-09-02 | 09 | 4 | REV-06 | unit (IPC, isolation type+runtime+imports) | `npx vitest run --project main src/main/ipc.test.ts src/main/review/isolation.test.ts && npm run typecheck` | ❌ W0 | ✅ green |
| 8-10-01 | 10 | 4 | REV-01, REV-04, REV-06 | replay integration (recorded Opus, case_99) | `npx vitest run --project main src/main/review/review.replay.test.ts tests/config/fixture-hygiene.test.ts tests/config/secret-scan.test.ts` | ❌ W0 (+ RECORD=1 once) | ✅ green |
| 8-10-02 | 10 | 4 | REV-01, REV-04 | live (LIVE=1, skipped otherwise) | `npx vitest run --project main src/main/review/review.live.test.ts` | ❌ W0 | ✅ green |
| 8-11-01 | 11 | 5 | REV-01..04, REV-06 | E2E T1 (built app, fakes, seeded sessions) | `npm run test:e2e -- tests/e2e/reviewmode.spec.ts tests/e2e/flow.spec.ts tests/e2e/barrier.spec.ts tests/e2e/leak.spec.ts` | ❌ W0 | ✅ green |
| 8-11-02 | 11 | 5 | REV-01 | E2E T2 (replayed Claude, real scorecard) | `npm run test:e2e:t2 -- tests/e2e/interviewer.t2.spec.ts && npx vitest run --project main tests/config` | ✅ (extend) | ✅ green |
| 8-11-03 | 11 | 5 | all | gate | `npm run lint && npm run typecheck && npm test` (+ T1 ×3, T2, live, packaged) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Strict TDD: every new test file is written RED inside its own task before the implementation, so no separate Wave 0 plan is needed. Existing infrastructure covers the rest:

- [x] Vitest main/renderer projects, Playwright `_electron`, replay server with RECORD=1 (Phase 1)
- [x] `src/main/agent/sse.harness.ts` (sseFetch, jsonMessage) for SDK-parser tests (Phase 6)
- [x] `src/main/session/runner.harness.ts` (case_99 brief, manual clock) (Phase 3)
- [x] case_99 fixture case (Fixturely) for all recorded fixtures — never real case content
- [x] `tests/replay/recordOne.test.ts` (env-gated) — created in 08-11 task 2 to record the single T2 reviewer fixture

---

## Manual-Only Verifications

All phase behaviors have automated verification. (Unattended run: no human steps.)

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 8s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-03 (08-11 gate: lint, typecheck, vitest, T1 ×3, T2 ×2, live review evals, packaged smoke)
