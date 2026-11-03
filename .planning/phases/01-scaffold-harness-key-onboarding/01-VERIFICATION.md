---
phase: 01-scaffold-harness-key-onboarding
verified: 2026-11-03T02:15:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 1: Scaffold, Harness & Key Onboarding Verification Report

**Phase Goal:** Rishi can launch a secure, sandboxed app (dev or packaged `.app`) that already holds his Anthropic key, and every later feature has a test seam waiting.
**Status:** passed. **Re-verification:** No.

## Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One command for dev, one for an ad-hoc arm64 `.app`; smoke test launches built app | VERIFIED | `dev` and `package` scripts exist. `release/mac-arm64/Mock Case Proctor.app` is `Signature=adhoc`. `scripts/verify-package.sh` printed "package OK". The E2E `shell.spec` launch test passes. |
| 2 | Clean profile shows Settings; pasted key is probed, saved encrypted, survives restart; Replace and Clear work; env/.env auto-saves | VERIFIED | The 7 E2E tests in `key.spec.ts` pass. They cover paste, relaunch as stored, invalid key, offline, env auto-fill, .env auto-fill, rejected env key, and Replace/Clear. |
| 3 | Tests fail on tracked `sk-ant-`, key in renderer/logs/fixtures, missing entitlements, or renderer Node access / no CSP / file-read IPC | VERIFIED | `secret-scan.test.ts` and `fixture-hygiene.test.ts` exist and pass. E2E `leak.spec` (canary key never leaves main) passes. `shell.spec` passes the webPreferences, CSP, no-Node and app:// traversal checks. `git ls-files` has no `sk-ant-[A-Za-z0-9_-]{20,}` match. Entitlements are checked in `verify-package.sh`. |
| 4 | Two Vitest projects; Playwright with fake media (incl. AudioServiceSandbox) gets non-silent WAV; replay server via ANTHROPIC_BASE_URL; RECORD=1 | VERIFIED | `fake audio reaches the page` and `replay server answers through ANTHROPIC_BASE_URL` pass. `src/main/e2e.test.ts` asserts `disable-features=AudioServiceSandbox`. `tests/replay/record.test.ts` exists. |
| 5 | Private repo exists with .env/models/sessions/cases gitignored; assets via app:// | VERIFIED | `gh repo view` shows `rishi-zamvar/mock-case-proctor` with isPrivate=true. The origin remote is set. `.gitignore` has `.env*`, `models/`, `sessions/`, `cases/`. No `.env` or `sessions/` files are tracked. E2E app:// tests pass. |

**Score:** 5/5

## Real Test Results

| Command | Result |
|---------|--------|
| `npx vitest run` | 17 files passed, 1 skipped. 120 tests passed, 2 skipped (the skipped ones are the live tests). |
| `npm run typecheck` | node and web both clean. |
| `npm run build` | Succeeded (typecheck plus electron-vite build). |
| `npx playwright test --grep-invert "@live\|@packaged"` | 16/16 passed. |

## Requirements Coverage

Every ID in the PLAN frontmatter appears in REQUIREMENTS.md. Each is marked Complete and mapped to Phase 1. No orphaned requirements.

| ID | Status | Evidence |
|----|--------|----------|
| FND-01 | SATISFIED | dev and package scripts; adhoc-signed arm64 `.app` exists. |
| FND-02 | SATISFIED | Private GitHub repo; gitignore; secret-scan test. |
| FND-03 | SATISFIED | Vitest, Playwright, replay server, fake audio. |
| FND-04 | SATISFIED | `verify-package.sh` ("package OK") checks entitlements and usage strings. A config test is in the Vitest suite. |
| FND-05 | SATISFIED | `shell.spec` passes: sandbox, CSP, no Node, app:// protocol. |
| KEY-01 | SATISFIED | E2E paste, probe, save, relaunch as stored. |
| KEY-02 | SATISFIED | E2E env and .env auto-fill tests. |
| KEY-03 | SATISFIED | `leak.spec`, log masking tests, fixture hygiene. |
| KEY-04 | SATISFIED | E2E Replace and Clear test. |
| QA-01 | SATISFIED | Co-located tests for each pure module. I did not audit the commit order, so test-before-code was not verified. |

## Anti-Patterns

None blocking. Tracked files containing the string `sk-ant-` are docs, the log masker and its tests, and the scan tests. None hold a real key.

## Notes (non-blocking)

- Packaged-app E2E (`@packaged`) was not run, because the instructions say not to launch the packaged app outside the harness. The `.app` was verified statically (codesign and `verify-package.sh`).
- Live API probe (`@live`) was not run. The replay server stands in for it.

_Verified: 2026-11-03_
_Verifier: Claude (gsd-verifier)_
