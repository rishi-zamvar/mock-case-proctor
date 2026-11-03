---
phase: 9
slug: packaged-live-sign-off
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-11-03
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.1.0 (unit, LIVE=1 live evals) + Playwright 1.64.1 `_electron` (T1 / T2 / @packaged / @t3) |
| **Config file** | vitest.config.ts, playwright.config.ts (global-setup renders `say` WAV fixtures) |
| **Quick run command** | `npx vitest run src/main/session/latency.test.ts` |
| **Full suite command** | `npm run lint && npm run typecheck && npm test && npm run test:e2e` |
| **Gate commands (spend / package)** | `npm run test:t3` (package + verify + @packaged + @t3 live), `npm run test:live` |
| **Estimated runtime** | quick ~3 s; full ~6 min; test:t3 ~25-40 min; test:live ~10 min |

---

## Sampling Rate

- **After every task commit:** Run the quick command (or the task's `<automated>` verify)
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite + `npm run test:t3` + `npm run test:live` green
- **Max feedback latency:** 60 seconds for unit feedback (packaged/live runs are gate-only)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | QA-04 | unit (TDD) | `npx vitest run src/main/session/latency.test.ts` | ✅ (extended) | ⬜ pending |
| 9-01-02 | 01 | 1 | QA-04 | e2e regression (T1 + T2 replay) | `npm run test:e2e -- tests/e2e/barrier.spec.ts && npm run test:e2e:t2 -- tests/e2e/voiceloop.t2.spec.ts` | ✅ | ⬜ pending |
| 9-01-03 | 01 | 1 | QA-04 | e2e (compile/list) | `npx playwright test --list --grep @t3` | ❌ created by task | ⬜ pending |
| 9-02-01 | 02 | 2 | QA-04 | e2e T3 packaged live + offline + soak | `npm run test:t3` | ✅ after 9-01-03 | ⬜ pending |
| 9-02-02 | 02 | 2 | QA-04 | live evals + report | `npm run test:live` | ✅ | ⬜ pending |
| 9-03-01 | 03 | 3 | QA-04 | docs (grep) | README.md grep checks | ❌ rewritten | ⬜ pending |
| 9-03-02 | 03 | 3 | QA-04 | docs (grep) | every REQ ID in docs/SIGNOFF.md | ❌ created | ⬜ pending |
| 9-03-03 | 03 | 3 | QA-04 | full gate + push | `npm run lint && npm run typecheck && npm test && npm run test:e2e` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. The only new spec (`tests/e2e/signoff.t3.spec.ts`) is created in 9-01-03 before 9-02-01 runs it.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mic + camera permissions re-prompt in the packaged app after a TCC reset | QA-04 (ROADMAP Phase 9 criterion 3) | Real TCC dialogs cannot be clicked unattended, and `tccutil reset` changes the user's system permissions, so it is never run by an agent. The automatable part is covered by `src/main/media.test.ts` (asks only on `not-determined`) and `scripts/verify-package.sh` (entitlements + usage strings). | 1. `tccutil reset Microphone com.rishizamvar.mockcaseproctor` 2. `tccutil reset Camera com.rishizamvar.mockcaseproctor` 3. Open the packaged app from Finder 4. Expect two prompts (Microphone, Camera); grant both; start a case and see the webcam tile and mic check. Result: `human_needed`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for unit feedback
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
