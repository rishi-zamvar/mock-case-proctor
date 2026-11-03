---
phase: 2
slug: core-domain-logic
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-03
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0, project `main` (node env) |
| **Config file** | `vitest.config.ts` (existing; `src/main/**/*.test.ts` and `src/shared/**/*.test.ts` already included) |
| **Quick run command** | `npx vitest run --project main src/main/domain` |
| **Full suite command** | `npm test && npm run typecheck` |
| **Estimated runtime** | ~2 seconds (real-library tests add ~2 s for 12 pdftotext runs) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <task test files>` (listed per task below)
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** `npm test && npm run typecheck` green, and `git check-ignore tests/fixtures/cases/_work/data/case_99.json` prints nothing
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | LIB-03 | fixture/config | `git check-ignore tests/fixtures/cases/_work/data/case_99.json` (empty) | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | LIB-03 | unit + real | `npx vitest run src/main/domain/cases/resolve.test.ts src/main/domain/cases/resolve.real.test.ts src/main/domain/cases/deckText.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 1 | FLOW-06 | unit (table) | `npx vitest run src/main/domain/machine/sections.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 1 | FLOW-01, FLOW-06 | unit (table) | `npx vitest run src/main/domain/machine` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 1 | VOUT-02 | unit + real census | `npx vitest run src/main/domain/text/speakable.test.ts src/main/domain/text/speakable.real.test.ts` | ❌ W0 | ⬜ pending |
| 2-04-02 | 04 | 1 | VOUT-02 | unit | `npx vitest run src/main/domain/text/sentenceSplitter.test.ts` | ❌ W0 | ⬜ pending |
| 2-05-01 | 05 | 1 | BAR-03 | unit (table) | `npx vitest run src/main/domain/text/leakGuard.test.ts` | ❌ W0 | ⬜ pending |
| 2-05-02 | 05 | 1 | (REV-03 prep) | unit (table) | `npx vitest run src/main/domain/text/numbers.test.ts src/main/domain/metrics.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | LIB-03 | unit | `npx vitest run src/shared/schemas.test.ts && npm run typecheck:web` | ✅ (extend) | ⬜ pending |
| 2-02-02 | 02 | 2 | LIB-03 | unit (fixture) | `npx vitest run src/main/domain/cases/library.test.ts src/main/domain/cases/sttPrompt.test.ts && npm run typecheck:node` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 2 | LIB-03, BAR-03 | integration (real, skipIf) | `npx vitest run src/main/domain/cases/library.real.test.ts && npm test && npm run typecheck` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Each TDD task writes its own failing test first (RED commit), so there is no separate Wave 0 plan.
- [ ] `.gitignore` negation for `tests/fixtures/cases/` (02-01 Task 1)
- [ ] `tests/fixtures/cases/_work/data/case_99.json` + `tests/fixtures/cases/case_99_fixture/deck.txt` (02-01 Task 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pronunciation quality of lexicon entries (kagger, moyk, ee-bit-dah) | VOUT-02 | Needs an ear audition with Kokoro | Deferred to Phase 5 voice work; text output is automated here |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 2s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
