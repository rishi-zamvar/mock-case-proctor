---
phase: 3
slug: walking-skeleton-on-fakes
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-03
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (projects `main` = node, `renderer` = jsdom) + Playwright 1.64.1 `_electron` on the built app |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (workers 1, global setup builds the E2E cases root + replay server) |
| **Quick run command** | `npx vitest run <changed test file>` |
| **Full suite command** | `npx vitest run && npm run test:e2e` |
| **Estimated runtime** | ~3 s per quick run; ~15 s for the full Vitest run; ~2-3 min for `npm run test:e2e` (build + Phase 1 + T1 specs) |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command (a single Vitest file or directory, under 3 s)
- **After every plan wave:** Run `npx vitest run && npm run typecheck`. From wave 4 on, also run `npm run test:e2e`. Waves 1-3 run no E2E because parallel executors share one `out/` dir.
- **Before `/gsd:verify-work`:** `npm run lint && npm run typecheck && npx vitest run`, 3 consecutive green `npm run test:e2e` runs, and `npm run test:packaged` (plan 03-12 Task 3)
- **Max feedback latency:** 3 seconds for unit and component tasks. E2E tasks (03-10 T2, 03-11, 03-12) are the exception, at about 3 min, because they need a production build.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | BAR-01 | unit (schema) | `npx vitest run src/shared/schemas.test.ts` | ✅ (extended) | ⬜ pending |
| 3-01-02 | 01 | 1 | REV-05 | unit (schema) | `npx vitest run src/main/store/sessionSchema.test.ts` | ❌ created RED in task | ⬜ pending |
| 3-02-01 | 02 | 1 | BAR-02 | unit | `npx vitest run src/main/protocol.test.ts src/main/appProtocol.test.ts` | ✅ (extended) | ⬜ pending |
| 3-02-02 | 02 | 1 | BAR-02 | unit | `npx vitest run src/main/domain/cases` | ❌ deckSource.test.ts created RED | ⬜ pending |
| 3-03-01 | 03 | 2 | REV-05, FLOW-07 | unit (fs, tmp dir) | `npx vitest run src/main/store/sessionStore.test.ts` | ❌ created RED | ⬜ pending |
| 3-03-02 | 03 | 2 | LIB-02 | unit | `npx vitest run src/main/store` | ❌ created RED | ⬜ pending |
| 3-04-01 | 04 | 2 | QA-02 | unit | `npx vitest run src/main/adapters/fakeLlm.test.ts` | ❌ created RED | ⬜ pending |
| 3-04-02 | 04 | 2 | QA-02 | unit (fake timers) | `npx vitest run src/main/adapters` | ❌ created RED | ⬜ pending |
| 3-05-01 | 05 | 2 | BAR-01 | unit (barrier sweep) | `npx vitest run src/main/session/view.test.ts` | ❌ created RED | ⬜ pending |
| 3-06-01 | 06 | 2 | LIB-01, LIB-02 | component (RED) | `npx vitest run src/renderer/src/screens/Library.test.tsx` (expected to fail) | ❌ created in task | ⬜ pending |
| 3-06-02 | 06 | 2 | LIB-01, LIB-02 | component | `npx vitest run src/renderer/src/screens/Library.test.tsx` | ✅ after 3-06-01 | ⬜ pending |
| 3-07-01 | 07 | 2 | QA-02, FLOW-08 | component | `npx vitest run src/renderer/src/screens/Session.test.tsx` | ❌ created RED | ⬜ pending |
| 3-07-02 | 07 | 2 | QA-02 | component | `npx vitest run src/renderer/src/screens/ReviewMode.test.tsx` | ❌ created RED | ⬜ pending |
| 3-08-01 | 08 | 3 | FLOW-08, REV-05 | integration (real reducer + store + fakes) | `npx vitest run src/main/session/runner.test.ts` | ❌ created RED | ⬜ pending |
| 3-08-02 | 08 | 3 | FLOW-07 | integration | `npx vitest run src/main/session` | ❌ created RED | ⬜ pending |
| 3-09-01 | 09 | 3 | QA-02 | unit (fake timers) | `npx vitest run src/renderer/src/speech` | ❌ created RED | ⬜ pending |
| 3-09-02 | 09 | 3 | LIB-01, QA-02 | component | `npx vitest run --project renderer && npm run typecheck:web` | ✅ App.test.tsx (updated) | ⬜ pending |
| 3-10-01 | 10 | 4 | BAR-01, LIB-01 | unit | `npx vitest run src/main/compose.test.ts src/main/ipc.test.ts` | ❌ compose.test.ts created RED | ⬜ pending |
| 3-10-02 | 10 | 4 | BAR-01, BAR-02 | build + E2E regression | `npx vitest run && npm run build && npm run test:e2e` | ✅ (shell.spec updated) | ⬜ pending |
| 3-11-01 | 11 | 5 | QA-02 | E2E harness | `npx tsc --noEmit -p tsconfig.node.json --composite false && npx playwright test tests/e2e/shell.spec.ts` | ❌ session.ts created | ⬜ pending |
| 3-11-02 | 11 | 5 | QA-02, LIB-01, LIB-02, FLOW-08, REV-05 | E2E (T1) | `npm run test:e2e` | ❌ flow.spec.ts created | ⬜ pending |
| 3-12-01 | 12 | 6 | FLOW-07 | E2E (T1, SIGKILL) | `npx electron-vite build && npx playwright test tests/e2e/resume.spec.ts` | ❌ created | ⬜ pending |
| 3-12-02 | 12 | 6 | BAR-01, BAR-02 | E2E (IPC tap, app://) | `npx electron-vite build && npx playwright test tests/e2e/barrier.spec.ts` | ❌ created | ⬜ pending |
| 3-12-03 | 12 | 6 | QA-02 | gate (3x E2E + packaged) | `npm run lint && npm run typecheck && npx vitest run && for i in 1 2 3; do npm run test:e2e \|\| exit 1; done && npm run test:packaged` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements: Vitest (both projects), jsdom, Testing Library, Playwright `_electron`, the replay server and the `launch()` helper all landed in Phase 1. Every TDD task writes its own failing test first (a RED commit before GREEN), so no separate scaffold wave is needed.

---

## Manual-Only Verifications

All phase behaviors have automated verification. Visual polish (spacing, contrast feel) is not gated in Phase 3. The 4.5:1 contrast is set by token choice (teal `#19A7A0` with dark text, `#E6EDF3` on `#0B0F14`).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 3s (unit/component yes; the E2E tasks run ~3 min by nature)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
