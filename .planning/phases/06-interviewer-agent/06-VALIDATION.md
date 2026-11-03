---
phase: 6
slug: interviewer-agent
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-03
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.1.0 (`main` node project + `renderer` jsdom project); Playwright 1.64.1 `_electron` for E2E |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (existing; nothing to install) |
| **Quick run command** | `npx vitest run --project main src/main/agent src/main/domain/machine src/main/session src/main/store` |
| **Full suite command** | `npm test` (then `npm run test:e2e` in the last wave only) |
| **Live gate** | `LIVE=1 npx vitest run --project main src/main/agent/claudeLlm.live.test.ts` (part of `npm run test:live`) |
| **Estimated runtime** | quick ~6 s; full `npm test` ~30 s; E2E T1 several minutes; T2 + live at the gate only |

---

## Sampling Rate

- **After every task commit:** the quick run command
- **After every plan wave:** `npm test` + `npm run typecheck`
- **Before `/gsd:verify-work`:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run test:e2e:t2`, `npm run test:packaged`, `npm run test:live` all green (06-10 Task 3)
- **Max feedback latency:** 6 seconds for the quick loop

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | INT-06 | unit | `npx vitest run --project main src/main/store && npm run typecheck:node` | ✅ extend `sessionSchema.test.ts` | ✅ green |
| 6-01-02 | 01 | 1 | INT-05, FLOW-02, INT-03 | unit | `npx vitest run --project main src/main/domain/machine src/main/session` | ✅ extend `interviewMachine.test.ts`, `runner.test.ts` | ✅ green |
| 6-02-01 | 02 | 1 | INT-02, INT-07 | unit | `npx vitest run --project main src/main/agent/turnText.test.ts` | ❌ W0 (created in task) | ✅ green |
| 6-02-02 | 02 | 1 | INT-07 | unit | `npx vitest run --project main src/main/agent/messages.test.ts` | ❌ W0 (created in task) | ✅ green |
| 6-03-01 | 03 | 2 | INT-06 | unit | `npx vitest run --project main src/main/agent/control.test.ts` | ❌ W0 (created in task) | ✅ green |
| 6-03-02 | 03 | 2 | FLOW-05 | unit | `npx vitest run --project main src/main/agent/extraction.test.ts` | ❌ W0 (created in task) | ✅ green |
| 6-04-01 | 04 | 2 | INT-01, INT-02, INT-07, FLOW-02 | unit | `npx vitest run --project main src/main/agent/prompt.test.ts` | ❌ W0 (created in task) | ✅ green |
| 6-04-02 | 04 | 2 | INT-03, INT-04, INT-05 | unit | `npx vitest run --project main src/main/agent/prompt.test.ts` | ❌ W0 (created in task) | ✅ green |
| 6-05-01 | 05 | 2 | INT-03, INT-05 | unit | `npx vitest run --project main src/main/session/turnRequest.test.ts` | ❌ W0 (created in task) | ✅ green |
| 6-05-02 | 05 | 2 | INT-02, FLOW-05 (+ timings) | unit | `npx vitest run --project main src/main/session` | ❌ W0 `runner.agent.test.ts` (created in task) | ✅ green |
| 6-06-01 | 06 | 3 | INT-01, INT-06, INT-07 | unit (real SDK via `fetch` stub) | `npx vitest run --project main src/main/agent/claudeLlm.test.ts` | ❌ W0 `claudeLlm.test.ts` + `sse.harness.ts` | ✅ green |
| 6-06-02 | 06 | 3 | INT-08, FLOW-02, FLOW-05 | unit (real SDK via `fetch` stub) | `npx vitest run --project main src/main/agent` | ❌ W0 | ✅ green |
| 6-07-01 | 07 | 3 | FLOW-04, FLOW-02, INT-03 (interrupt) | unit | `npx vitest run --project main src/main/session/runner.flow6.test.ts` | ❌ W0 (created in task) | ✅ green |
| 6-07-02 | 07 | 3 | (G9 failure path) | unit | `npx vitest run --project main src/main/session` | ❌ W0 | ✅ green |
| 6-08-01 | 08 | 4 | INT-01, INT-08 | unit/integration | `npx vitest run --project main src/main/compose.test.ts` | ✅ extend | ✅ green |
| 6-08-02 | 08 | 4 | INT-01 | typecheck + suite | `npm run typecheck:node && npx vitest run --project main src/main` | ✅ | ✅ green |
| 6-09-01 | 09 | 4 | INT-01, INT-06, INT-07, FLOW-05 | integration (recorded SSE, real SDK) | `npx vitest run --project main src/main/agent/claudeLlm.replay.test.ts tests/config/fixture-hygiene.test.ts` | ❌ W0 test + fixtures (RECORD=1 once, case_99 only) | ✅ green |
| 6-10-01 | 10 | 5 | INT-02..INT-07 (live evals 1-8) | live | `LIVE=1 npx vitest run --project main src/main/agent/claudeLlm.live.test.ts` | ❌ W0 (created in task) | ✅ green |
| 6-10-02 | 10 | 5 | all (full session) | e2e T2 | `npm run test:e2e:t2` | ❌ W0 `interviewer.t2.spec.ts` + `interviewer-e2e` fixtures | ✅ green |
| 6-10-03 | 10 | 5 | gate | all tiers | `npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run test:e2e:t2 && npm run test:packaged && npm run test:live` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement → evidence

| Req | Unit | Integration (replay) | Live | E2E |
|-----|------|----------------------|------|-----|
| INT-01 | prompt (frozen prefix, cache_control), claudeLlm (request shape), compose (model config) | cacheRead > 0 from turn 2; byte-identical system/tools | cache, ttft | T2 request log: model + identical system |
| INT-02 | turnText (≤4 sentences, banned phrases), prompt (persona, few-shot leak-clean) | — | style | T2 ≤4 sentences per line |
| INT-03 | reducer (caps, turn-1 sufficient ignored), turnRequest (framing / wrap_section), prompt (goals) | framing turn recorded | section | T2 reaches review mode in order |
| INT-04 | prompt (all 7 sections have goals + probe labels) | — | — | T2 control per section |
| INT-05 | reducer (pushback not_yet→now→done), prompt (pushback rule, deck-omission probe) | — | pushback | — |
| INT-06 | control (strict schema, zod, null → probing), sessionSchema (persist) | control chunk after text; stop_reason tool_use | grr (numbers_checked correct:false) | T2 controlLog |
| INT-07 | turnText (escapeTags), messages (wrapping, invariants), prompt (data rule) | candidate text wrapped in request log | injection | — |
| INT-08 | claudeLlm (two sessions share nothing), compose (client per session) | — | — | — |
| FLOW-02 | reducer + runner (10-min timer, skip, resume), prompt (case-free warm-up), runner (closing line) | warm-up request has no brief | — | — |
| FLOW-04 | runner.flow6 (no tick/interject in presentation) | — | — | T2 presentation → extraction |
| FLOW-05 | extraction (order from considerations, fallback), runner (openingPlan persisted, fallback on failure) | extraction fixture | — | T2 openingPlan persisted |

---

## Wave 0 Requirements

Test files are created inside the TDD tasks that need them (RED first), so there is no separate scaffold wave:

- [x] `src/main/agent/{turnText,messages,control,extraction,prompt,claudeLlm}.test.ts` — unit suites (06-02, 06-03, 06-04, 06-06)
- [x] `src/main/agent/sse.harness.ts` — slow-chunk SSE `fetch` stub for abort/TTFT tests (06-06, research Pitfall 8)
- [x] `src/main/session/{turnRequest,runner.agent,runner.flow6}.test.ts` (06-05, 06-07)
- [x] `src/main/agent/claudeLlm.replay.test.ts` + `tests/fixtures/claude/interviewer-{grill,warmup}/` recorded on case_99 (06-09)
- [x] `src/main/agent/claudeLlm.live.test.ts` (06-10)
- [x] `tests/e2e/interviewer.t2.spec.ts` + `tests/fixtures/claude/interviewer-e2e/` (06-10)

Framework install: none needed.

---

## Manual-Only Verifications

All phase behaviours have automated verification. Persona "feel" beyond the structural live evals is judged by Rishi in his own sessions; it is not a gate.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 6s (quick loop)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-03 (06-10 gate: lint, typecheck, npm test, T1 E2E 3x, T2 E2E 3x, packaged smoke, test:live all green)
