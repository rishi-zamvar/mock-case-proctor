---
phase: 1
slug: scaffold-harness-key-onboarding
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (projects `main` node, `renderer` jsdom) + Playwright 1.64.1 `_electron` on built `out/` |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (none yet — plans 01-01 and 01-07 install) |
| **Quick run command** | `npx vitest run --project main` (+ `--project renderer` when UI changed) |
| **Full suite command** | `npm test && npm run test:e2e` |
| **Phase gate** | `npm run test:packaged && npm run test:live`, 3x `npm run test:e2e`, push |
| **Estimated runtime** | ~5 s unit; ~60-120 s E2E |

---

## Sampling Rate

- **After every task commit:** quick run command
- **After every plan wave:** full suite command (E2E from wave 4 onward)
- **Before `/gsd:verify-work`:** full suite + phase gate green
- **Max feedback latency:** 5 s (unit), 120 s (E2E)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | FND-01, FND-03 | meta/build | `npx vitest run --project renderer && npx vitest run --project main && npx electron-vite build` | ❌ W1 | ⬜ pending |
| 1-01-02 | 01 | 1 | FND-02, FND-04, QA-01 | unit | `npx vitest run tests/config` | ❌ W1 | ⬜ pending |
| 1-01-03 | 01 | 1 | FND-05 | build | `npm run typecheck && npx electron-vite build && npm test` | ❌ W1 | ⬜ pending |
| 1-02-01 | 02 | 2 | KEY-03 | unit | `npx vitest run src/main/log.test.ts` | ❌ W2 | ⬜ pending |
| 1-02-02 | 02 | 2 | FND-05 | unit | `npx vitest run src/main/protocol.test.ts` | ❌ W2 | ⬜ pending |
| 1-02-03 | 02 | 2 | KEY-03 | unit | `npx vitest run src/shared/schemas.test.ts` | ❌ W2 | ⬜ pending |
| 1-03-01 | 03 | 2 | KEY-02 | unit | `npx vitest run src/main/keys/dotenv.test.ts` | ❌ W2 | ⬜ pending |
| 1-03-02 | 03 | 2 | KEY-01 | unit (SDK fetch seam) | `npx vitest run src/main/keys/probe.test.ts` | ❌ W2 | ⬜ pending |
| 1-03-03 | 03 | 2 | KEY-01, KEY-02, KEY-03, KEY-04 | unit | `npx vitest run src/main/keys/` | ❌ W2 | ⬜ pending |
| 1-04-01 | 04 | 2 | FND-03 | integration (real SDK) | `npx vitest run tests/replay/server.test.ts` | ❌ W2 | ⬜ pending |
| 1-04-02 | 04 | 2 | KEY-03 | unit | `npx vitest run tests/config/fixture-hygiene.test.ts` | ❌ W2 | ⬜ pending |
| 1-05-01 | 05 | 2 | KEY-01, KEY-04 | component | `npx vitest run --project renderer` | ❌ W2 | ⬜ pending |
| 1-05-02 | 05 | 2 | KEY-01 | build | `npm run typecheck:web && npx electron-vite build` | ❌ W2 | ⬜ pending |
| 1-06-01 | 06 | 3 | FND-03, FND-05 | unit | `npx vitest run src/main/e2e.test.ts src/main/ipc.test.ts` | ❌ W3 | ⬜ pending |
| 1-06-02 | 06 | 3 | FND-01, FND-05, KEY-01 | build | `npm run build && npm test` | ❌ W3 | ⬜ pending |
| 1-07-01 | 07 | 4 | FND-03, KEY-02, KEY-03 | record + hygiene | `npx vitest run tests/config tests/replay` | ❌ W4 | ⬜ pending |
| 1-07-02 | 07 | 4 | FND-01, FND-03, FND-05 | e2e | `npm run test:e2e -- tests/e2e/shell.spec.ts` | ❌ W4 | ⬜ pending |
| 1-08-01 | 08 | 5 | KEY-01, KEY-02, KEY-04 | e2e | `npm run test:e2e -- tests/e2e/key.spec.ts` | ❌ W5 | ⬜ pending |
| 1-08-02 | 08 | 5 | KEY-03 | e2e | `npm run test:e2e -- tests/e2e/leak.spec.ts` | ❌ W5 | ⬜ pending |
| 1-09-01 | 09 | 6 | FND-01, FND-04 | packaged e2e + codesign | `npm run test:packaged` | ❌ W6 | ⬜ pending |
| 1-09-02 | 09 | 6 | KEY-01, KEY-02 | live | `npm run test:live` | ❌ W6 | ⬜ pending |
| 1-09-03 | 09 | 6 | FND-02, QA-01 | gate | `npm test && git fetch origin && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Greenfield: plan 01-01 (wave 1) installs Vitest + config and a trivial test per project; plan 01-07 installs Playwright config, global setup and the launch helper. Every TDD task writes its RED test in the same task before implementation, so no separate stub wave is needed.

---

## Manual-Only Verifications

All phase behaviors have automated verification. (Informational only: the first Finder launch of each rebuilt ad-hoc `.app` may show one Keychain "Safe Storage" prompt; E2E avoids it via `use-mock-keychain`.)

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 5 s (unit) — confirm during execution
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
