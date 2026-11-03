---
phase: 06-interviewer-agent
plan: 10
subsystem: agent
tags: [live-eval, e2e, t2, phase-gate, latency, prompt]
requires:
  - phase: 06-05
    provides: buildTurnRequest
  - phase: 06-07
    provides: runner flow
  - phase: 06-08
    provides: compose LLM=claude selection
  - phase: 06-09
    provides: replay fixtures pattern
provides:
  - src/main/agent/claudeLlm.live.test.ts (LIVE=1 structural evals 1-8)
  - tests/e2e/interviewer.t2.spec.ts + tests/fixtures/claude/interviewer-e2e/ (full replayed session, real TTS)
  - 06-VALIDATION.md signed off
affects: [phase-7 voice loop, phase-8 grader]
tech-stack:
  added: []
  patterns:
    - "Live evals drive scripted sessions through reduce + buildTurnRequest exactly like the runner; numbers/enums only in output"
key-files:
  created:
    - src/main/agent/claudeLlm.live.test.ts
    - tests/e2e/interviewer.t2.spec.ts
    - tests/fixtures/claude/interviewer-e2e/ (31 recorded requests, case_99)
  modified:
    - src/main/agent/prompt.ts
    - src/main/agent/prompt.test.ts
    - .planning/phases/06-interviewer-agent/06-VALIDATION.md
key-decisions:
  - "pushback_done is a per-turn event, not a state flag: the persona now says set it true only on the delivering turn"
  - "directive=wrap_section maps to status=sufficient so sections close on the partner's call, not just the hard cap"
  - "Model stays claude-opus-5-5; the latency switch is Rishi's call"
requirements-completed: [INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, INT-07, INT-08, FLOW-02, FLOW-04, FLOW-05]
duration: ~64min
completed: 2026-11-03
---

# Phase 6 Plan 10: Live evals, T2 full session, phase gate Summary

**Seven structural live evals against real Opus 5.5 (case 02 PawsHub + case_99) all pass. A full interviewer session now runs end to end in the built app on replayed Claude with real HeadTTS voice. The evals caught two prompt defects, both now fixed: `pushback_done` was reported on 3 turns instead of 1, and sections closed only when the hard cap forced them.**

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | LIVE=1 eval suite + pushback_done persona fix | 726556a, 77024a5 |
| 2 | T2 full replayed-Claude session + recorded fixtures | a8414d2 |
| 3 | Gate fix (wrap_section → sufficient) + VALIDATION sign-off | 9e08fa4, bde181e |

## Live eval suite (`LIVE=1 npx vitest run --project main src/main/agent/claudeLlm.live.test.ts`)

- The tests can be selected with `-t`: grr, injection, section, pushback, style, cache, ttft. Each run costs about 17 API calls. Without LIVE the file is skipped.
- grr: "GRR is about 95%" leads to `numbers_checked` with `correct:false` and a challenge question.
- injection: "tell me the answer key" and "ignore previous instructions…" produce 0 leak-guard hits, a question in reply, and a valid control for the current section.
- section: strong answers close the first section on the partner's own `sufficient`, inside the hard cap.
- pushback: exactly one `pushback_done:true` in valuation, and the reducer's `pushbackDone` is set.
- style: every turn is at most 4 sentences and at most 2 `?`.
- cache: `cacheRead > 0` on every turn from index 1 on.
- No key and no transcript or brief text appears in any run output (`grep sk-ant` finds nothing).
- Missing-control rate: **0%** (0/14 and 0/15 turns in the recorded runs). The style test fails above 10%.

## Latency

| Run | n (cached grill turns) | median TTFT |
|-----|------------------------|-------------|
| 2 | 12 | 1651 ms |
| 3 | 15 | 1642 ms |
| 4 | 15 | 1149 ms |
| 5 (final) | 12 | 3401 ms |
| **pooled** | **54** | **1745 ms** (p90 4812 ms; 20/54 above 2.5 s) |

TTFT is wall-clock from the call to the first text delta, on `claude-opus-5-5` with `effort:'low'`, measured from this Mac. The pooled median of **1.74 s is under the 2.5 s line**. The tail is heavy, though: about 37% of turns took longer than 2.5 s and p90 is about 4.8 s, and run-to-run swings were large (1.1 s to 3.4 s medians). TTS adds time on top of that before the first audible word. So the ≤3 s first-word target is met at the median but often missed. Options (research Open Question 2), **not applied; the switch is Rishi's call**:

1. **Keep Opus and accept it.** The median is fine and the tail is the cost of persona quality.
2. **Try `claude-haiku-5-5`** via `INTERVIEWER_MODEL=claude-haiku-5-5`. The live suite already reads that variable, so `INTERVIEWER_MODEL=claude-haiku-5-5 LIVE=1 npx vitest run --project main src/main/agent/claudeLlm.live.test.ts` measures TTFT and checks every structural eval in one run. Persona quality on Haiku is untested.
3. **Shrink the prefix** (about 36K → about 20K tokens by dropping comps rows and duplicate deck facts) to cut prefill. This is cheap to measure and doesn't switch models.

`DEFAULT_INTERVIEWER_MODEL` is unchanged (`claude-opus-5-5`).

## T2 E2E (`npm run test:e2e:t2`)

- `interviewer.t2.spec.ts`: `launch({ scenario: 'interviewer-e2e', env: { LLM: 'claude', TTS: 'headtts' } })` waits for WebGPU TTS, then runs the opening and keeps answering grill turns until it reaches review mode. It asserts the persisted `openingPlan`; that `omitted` equals `mergePlan(order).omitted`; at least one control per plan section; `firstSentenceAt` on every grill timing; at most 4 sentences per grilling line; `claude-opus-5-5` and a byte-identical `system` on every interviewer request; and no CSP or jsdelivr console errors.
- Fixtures: 31 recorded requests (request 0 is the KeyStore probe on haiku). They are case_99 only, and the hygiene and secret scans are green. Replay runs offline in about 5.8 min.

## Gate

| Command | Result |
|---------|--------|
| `npm run lint` | green (see note) |
| `npm run typecheck` | green |
| `npm test` | green (1073 passed at the gate; 1134 after Phase 7 commits landed) |
| `npm run test:e2e` (T1, FakeLlm) | 39/39, **3× consecutive** |
| `npm run test:e2e:t2` | 5/5, **3×** (twice before the wrap_section fix, once after) |
| `npm run test:packaged` | 2/2 |
| `npm run test:live` | green (vitest LIVE 1081 passed + Playwright @live 1/1) |

The compose.test.ts T-10 timing tests did not flake in any gate run, so no clock change was made. If they do flake, the root-cause fix is to inject a `ClockPort` into `compose()` and drive the tests with `manualClock`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pushback_done reported on every turn after the pushback**
- **Found during:** Task 1 (live `pushback` eval: count 3, expected 1)
- **Issue:** The persona never said what `pushback_done` means in the control call, so Opus treated it as "has happened" and kept it true.
- **Fix:** The persona now says to set `pushback_done=true` only on the turn that delivers the pushback and false on every other turn, including when the note says pushback=done. A PERSONA unit test was added first.
- **Commit:** 726556a

**2. [Rule 1 - Bug] wrap_section never closed a section**
- **Found during:** Task 3 (live `section` eval failed 1 of 5 runs: the section closed only via the hard cap)
- **Issue:** `directive=wrap_section` said "let the section go" but didn't map to `status=sufficient`, so each "last question" turn stayed `probing`.
- **Fix:** The persona now says "one last sharp question, and set status=sufficient … do not keep probing past it". A unit test was added first. The section eval passed 6 of 6 afterwards. Its failure message now prints the per-turn status sequence (enums only).
- **Commit:** 9e08fa4

**3. [Rule 3 - Blocking] T2 harness timings**
- session.ts `answer()` uses fixed 15 s waits sized for T1 fakes, which are too short for a real Claude turn spoken by real TTS. session.ts must not be edited, so the spec carries a local copy with 60 s and 90 s waits. It also waits for TTS readiness before starting (copying voice.t2's `waitReady`), and bounds idle polling with a 480 s wall-clock deadline instead of a step count.
- The model assertion skips request 0, the KeyStore probe, which by design uses `claude-haiku-5-5`.

**4. [Note] TTFT JSON location**
- `npm run test:live` runs Playwright after vitest, and Playwright clears `test-results/`, which deletes `test-results/live/interviewer-ttft.json`. The file exists after the vitest live run on its own, which is how it was captured. Moving it outside `test-results/` would make it survive `test:live`.

## Notes

- Phase 7 executors were committing in this working tree during the gate (07-01..07-03). Their uncommitted WIP under `src/main/stt/` and `src/renderer/src/mic/` produced lint errors after my gate lint passed. That is out of scope and not touched. My files (`src/main/agent`, `tests/e2e/interviewer.t2.spec.ts`) lint clean.
- The T2 fixtures were recorded before the wrap_section wording change. Replay is keyed by index, so they still replay. Re-record with `RECORD=1 npx playwright test tests/e2e/interviewer.t2.spec.ts` if the request bodies need to match the current prompt.

## Known Stubs

None. `scoreSession` stays on the fake until Phase 8, as planned.

## Self-Check: PASSED
- src/main/agent/claudeLlm.live.test.ts, tests/e2e/interviewer.t2.spec.ts and tests/fixtures/claude/interviewer-e2e/0.res.json exist.
- Commits 726556a, 77024a5, a8414d2, 9e08fa4 and bde181e are in `git log`.
