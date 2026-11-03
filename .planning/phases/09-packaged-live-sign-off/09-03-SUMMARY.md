---
phase: 09-packaged-live-sign-off
plan: 03
subsystem: docs
tags: [readme, signoff, validation, qa-04]
requires:
  - phase: 09-packaged-live-sign-off
    provides: "t3-results.json + LATENCY.md (09-02)"
provides:
  - README.md user docs
  - docs/SIGNOFF.md milestone sign-off (52 requirements + Looks-Done checklist + Needs Rishi)
  - approved 09-VALIDATION.md
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - docs/SIGNOFF.md
  modified:
    - README.md
    - .planning/phases/09-packaged-live-sign-off/LATENCY.md
    - .planning/phases/09-packaged-live-sign-off/09-VALIDATION.md
key-decisions:
  - "Keep claude-opus-5-5 as interviewer: Haiku live eval was not faster (TTFT 1.99 s vs 1.90 s) and leaked 1 answer-key n-gram (guard-flagged)"
  - "VOUT-04 reported honestly as streaming pass / 3 s target missed live (4.98 s median)"
  - "TCC re-prompt is the single human_needed item; tccutil never run"
metrics:
  duration: ~25min
  completed: 2026-11-03
  tasks: 3
  files: 4
---

# Phase 9 Plan 03: README, sign-off, final gate Summary

This plan replaced the boilerplate README with user docs that match the real scripts and env vars. It added `docs/SIGNOFF.md`, which maps all 52 v1 requirements to their proving tests and last results and works through the 12-item "Looks Done But Isn't" checklist. It also lists exactly three items that need Rishi. The final gate is green, and the work is pushed.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | README.md | fff1238 (+ 357e542 Haiku data) |
| 2 | docs/SIGNOFF.md | d69dc52 |
| 3 | Final gate + VALIDATION sign-off + push | 9681674 |

## Final gate

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 (node + web) |
| `npm test` | 99 files passed / 4 skipped; 1407 tests passed / 13 skipped |
| `npm run test:e2e` (T1) | 41/41 passed (4.4 min) |
| `test ! -d release` | holds |
| `git diff --cached \| grep -c sk-ant` | 0 |

## human_needed (for the verifier)

There is exactly one item: the **TCC re-prompt in the packaged app**. The steps are in `docs/SIGNOFF.md` under "Needs Rishi" item 1. `tccutil` was not run. The automatable part is proven by `src/main/media.test.ts` and `scripts/verify-package.sh`.

The other two "Needs Rishi" items are choices, not verification gaps: picking the voice, and the interviewer model and latency trade-off.

## Deviations from Plan

**1. [Orchestrator data] Haiku comparison added.** The orchestrator ran one live eval with `INTERVIEWER_MODEL=claude-haiku-5-5` and asked for the results to be recorded in three places:
- the README's model section;
- `docs/SIGNOFF.md`;
- a new "Haiku comparison (2026-11-03)" section in LATENCY.md.

The results: Haiku's TTFT median was 1.99 s against Opus's 1.90 s, and it passed 6 of 7 evals, failing the injection eval. The recommendation is to keep Opus. The default model was not changed. Commit 357e542.

**2. [Accuracy] README key section.** The README now states that the packaged app does not read the project `.env`: `resolveDotenvPath` returns null when the app is packaged. It documents the two working routes for the packaged app, Settings paste or a one-time launch with `ANTHROPIC_API_KEY` set, after which the key is persisted encrypted.

**3. [Hygiene]** The company name of case 02 was removed from SIGNOFF.md, so the file contains no case content.

## Known Stubs

None.

## Self-Check: PASSED
