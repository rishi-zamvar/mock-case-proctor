---
phase: 06-interviewer-agent
plan: 04
subsystem: agent/prompt
tags: [persona, prompt-cache, proctor-note, leak-guard, warmup]
requires: [06-01]
provides:
  - PERSONA, FEW_SHOT, SECTION_GOALS
  - buildSystem(brief) (4 frozen blocks, cache_control on last, WeakMap-memoised)
  - buildWarmupSystem(), proctorNote(req, brief), warmupNote(n), probeLabels(brief, section)
affects: [claudeLlm adapter / InterviewerAgent plans in phase 6]
tech-stack:
  added: []
  patterns: [explicit allowlist object for the evaluation key, deep-frozen memoised system prefix]
key-files:
  created:
    - src/main/agent/prompt.ts
    - src/main/agent/prompt.test.ts
  modified: []
decisions:
  - "Evaluation key is an explicit allowlist (no idealAnswer/modelAnswer/rubric/flags.map[].say/leakSources/deckPages/whatItTests/memorize), JSON.stringified once"
  - "Flags route to sections by keyword on flag text (retention regex -> retention, rest -> diligence)"
  - "proctorNote with no section defaults to 'call'; with no proctor facts, directive is framing on turn 0 else probe, budget 25m"
metrics:
  duration: ~12min
  completed: 2026-11-03
  tasks: 2
  files: 2
---

# Phase 6 Plan 04: Interviewer persona, cached prefix and proctor note Summary

The interviewer prompt layer: a chill-but-sharp Lead Edge partner persona in the user's own words (interrupts, calls out BS, may or may not feed the answer, tests understanding, prizes insight and what the deck does not show over number drills; Saar's GRR-first / public comps / tailwind-system of record-switching cost / back to 3x lens). It is cached as a 4-block system prefix that is byte-stable per brief, and each turn gets a key=value `<proctor>` note carrying the state that code owns.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Cached system prefix + warm-up prompt | 5b76efe (RED), 069a105 (GREEN) |
| 2 | Proctor note, section goals, probe checklists | 9eb4c8a (RED), 4e32d80 (GREEN) |

## Verification

- `npx vitest run --project main src/main/agent/prompt.test.ts`: 40 passed. The real-library leak-guard check ran against every case in `~/Documents/Projects/lead_edge_mock_cases`; it was not skipped.
- `npm run typecheck:node`: clean
- `npx eslint` on prompt.ts and prompt.test.ts: clean
- `grep "\.say" src/main/agent/prompt.ts`: no matches

## Deviations from Plan

- I added a fifth few-shot line, a "why would a customer never rip this out?" understanding test, because the plan's four did not cover testing understanding. It is within CONTEXT's 3-5 range.
- Real-case few-shot leak checks load briefs with `deckText=''`. That is the stricter setting, because no deck grams are subtracted from the banned set.

## Known Stubs

None.

## Self-Check: PASSED
