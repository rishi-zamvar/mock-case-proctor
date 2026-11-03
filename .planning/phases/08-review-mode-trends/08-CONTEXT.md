# Phase 8: Review Mode & Trends - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning
**Mode:** Smart discuss, auto-accepted. The user asked Claude to pick the best path and not wait. The user chose "Rubric scorecard" and "Trends across cases" for review mode.

<domain>
## Phase Boundary

This phase replaces the scoring stub (FakeLlm or the 06-06 stub `scoreSession`) with a real ReviewerAgent. It also completes Review mode: a rubric scorecard with verified evidence quotes, a flag map, deterministic checks, the reveal, and a Trends tab driven by a separate trends agent that reads past scorecard summaries.

The interviewer never sees past sessions. This is enforced by construction, because the interviewer factory gets no store handle.
</domain>

<decisions>
## Implementation Decisions

### Rubric (from the user's playbook, verbatim)
- Six dimensions, each scored 1 to 5, for a total out of 30.

  | Dimension | 5 looks like | 1 looks like |
  |---|---|---|
  | Clear call | Leads with invest / pass / invest-at-a-price in the first sentence | No call, or a call only when asked |
  | Lead Edge 8 | Scores all 8 accurately, names the weakest and why it matters | Doesn't reference the framework |
  | Retention insight | Computes or estimates GRR, separates it from NRR, finds the buried flag | Quotes NRR only |
  | Valuation & comps | Anchors the ask to a growth bucket and a vertical peer, adjusts for quality | Never mentions price |
  | Return back-solve | Gets required exit ARR and CAGR, judges believability | No return logic |
  | Business quality & poise | Names the tailwind and moat; defends under pushback without folding or bluffing | Pure number-reading; folds on first pushback |

- Each case may also carry its own rubric rows (brief `rubric`, tuples of [dim, 5-looks-like, 1-looks-like]). Use the case rows when present, otherwise the generic ones above.
- Score bands: 26 to 30 is "Ready". 20 to 25 is "Close, one fix". Under 20 is "Run another Level 1 case".
- **Depth of insight**, which the user emphasised: also produce an "Insight" note. It covers what he called out that the deck did not show (the deliberate omissions), and what he missed. This is qualitative and sits inside Business quality and Retention, not a 7th dimension, so the score stays out of 30.

### ReviewerAgent (one structured call)
- Model: a config value, `REVIEWER_MODEL`, default `claude-opus-5-5`, with `effort: 'high'` (quality over latency here).
- Output via `messages.parse` and `zodOutputFormat()`. Schema:
  - `dimensions[{id, score 1-5, evidence_quotes: string[1-3], answer_key_item, rationale (≤40 words)}]`
  - `keep` (one thing to keep)
  - `fix` (one thing to fix)
  - `insight {called_out: string[], missed: string[]}`
  - `summary` (≤60 words)
- **Inputs:** the full brief including the evaluation key, the full transcript with turn timings, the `interview_control` log, the opening plan, and the deterministic checks computed first. The `<candidate_said>` data rule still applies.
- **Evidence verification in code.** Each evidence quote must be a normalised substring of the candidate's transcript lines; reuse leakGuard `normalizeForGuard`.
  - Quotes that don't match are dropped.
  - If a dimension has no verified quotes left, its score is capped at 2 and it is flagged "unverified evidence".
  - Record the counts.
- Save `graderModel`, `graderPromptVersion` (a constant hash of the prompt template) and `scoredAt` with the scorecard. A scorecard is immutable once written.
- **Score ordering eval.** Hand-write three fictional case_99 transcripts: strong, average and weak. Record them as replay fixtures, then assert `strong.total > average.total > weak.total` in replay. A live test does the same at the gate.

### Deterministic checks (code, not LLM)
- **Numbers.** Parse every number the candidate stated with `parseNumbers` and match it against the case data tokens (deck facts plus answer-key numbers) via `matches` at 2% tolerance, with unit awareness. For each stated number, report `{claim, matched_token?, correct: bool | 'unverifiable'}`. Only numbers that plausibly refer to a case metric count: keyword proximity to ARR, GRR, NRR, growth, margin, price, multiple, CAGR, burn. Everything else is 'unverifiable', not wrong.
- **Brevity.** For each answer: duration, band (30–60 s ideal, >90 s flagged), plus a summary (counts per band).
- **Led with a call.** The first sentence of the opening contains invest, pass or "at a price" (or the extraction's `recommendation !== 'unclear'`) AND it comes within the first ~20 words.
- **Omitted sections** come from the opening plan's omissions.
- **Flag map.** For each brief flag: `found` / `found_after_hint` / `missed`, from the control log `flags_surfaced` (`by: candidate` vs `hint`), consistent with that log. Pure code.

### Review mode UI (already scaffolded in Phase 3)
- **Header.** Total /30 with the band badge, the case name and date, then keep and fix.
- **Scorecard rows.** Dimension, score dots, rationale, evidence quotes (a quote click scrolls to it in the transcript), and the answer-key item.
- **Flag map card.** Each flag with its status chip (found / after hint / missed) and the page where it was in the deck.
- **Checks card.**
  - A numbers table: claim, then ✓/✗/?, then the correct value when wrong.
  - A brevity strip: per-answer bars, coloured by band.
  - Led-with-call ✓/✗.
  - Omitted sections.
- **Insight card.** Called out and missed.
- **Reveal.** Rishi's opening next to the 60-second ideal answer, the numbers to memorize, the intended read and back-solve, and the full transcript with timestamps (search, highlight evidence).
- **Trends tab.** See below.
- The debrief script is reflected in the order: what you got right → flags revealed → intended read → scores → keep/fix.

### Trends (separate agent and code)
- **Deterministic trends.** Built from all completed scorecards in the session store, as compact summaries:

  `{caseId, date, total, band, dimension scores, flags found ratio, brevity summary, numbers accuracy, fix}`

  - A dimension-over-time sparkline per dimension.
  - Total over time.
  - Flag-found rate.
  - Average answer length.
  - Number accuracy.
- **TrendsAgent.** One structured call over the summaries only, never raw transcripts. It outputs:
  - `recurring_weaknesses[]`
  - `progress_by_dimension[{id, direction: up/flat/down, note}]`
  - `carried_forward_fix` (did the last session's fix improve?)
  - `next_case_suggestion` (an unseen case id whose weakness profile fits)
  - `readiness` (vs the 26-point band)
- Recompute when a new scorecard lands. Cache it in a `trends.json` artifact.
- **Isolation by construction.** Only the reviewer and trends factories receive the store's `listSummaries()`. The interviewer factory signature has no store parameter, and a test asserts this (type-level plus runtime).

### Scoring flow
- After wrap-up, the runner calls ReviewerAgent. It shows "Scoring…" with the avatar idle, then persists the scorecard and transitions to reviewMode. On failure it retries once, then shows a "Scoring failed — retry" button. The transcript is safe.
- Ending early still scores, over the partial transcript.

### Testing
- **Unit.**
  - Evidence verification.
  - Numbers check: proximity and tolerance tables.
  - Brevity, led-with-call and flag-map derivation.
  - Band mapping.
  - Trend computations.
  - Prompt builder.
  - Isolation test.
- **Replay integration** through the real SDK. Record reviewer and trends fixtures on case_99 only: the three graded transcripts and one trends run.
- **Live** (`LIVE=1`, at the gate):
  - Score ordering on the three fixtures, live.
  - Every evidence quote verifies, with a dropped-quote rate under 20%.
  - Scorecard schema valid.
- **T1 E2E.** The review mode screens render the fake scorecard, and the Trends tab renders with 2 or more seeded sessions.
- **T2.** A replayed full session ends in a real (replayed) scorecard render.

### Claude's Discretion
- Exact prompt wording.
- Visual details (follow tokens.css).
- Chart implementation: inline SVG sparklines, no chart library.
- File layout under `src/main/review/` and `src/renderer/src/screens/review/`.
</decisions>

<code_context>
## Existing Code Insights
- `LlmPort.scoreSession` already exists (fake plus the 06-06 stub). `src/main/session/view.ts` `buildReveal`/`toViewState` reviewMode reveal (03-05), with `checks.numbers` currently [] pending this phase. ReviewMode screen is `src/renderer/src/screens/ReviewMode.tsx` (03-07; Trends tab placeholder).
- Domain helpers: `numbers.ts` (`parseNumbers`/`matches`), `metrics.ts` (`brevityBand`, now also `src/shared/brevity.ts`), `leakGuard.ts` (`normalizeForGuard`), brief fields (`rubric`, `flags`, `idealAnswer`, numbers to memorize, `intendedRead`, back-solve).
- Session store: `src/main/store/sessionStore.ts` (`listSessions`, `libraryView`). Session schema holds the scorecard, controlLog, timings and openingPlan.
- Agent infrastructure from Phase 6: `claudeLlm.ts`, the replay server with RECORD=1, the `live.test` pattern, and case_99 fixtures.
- Playbook rubric and debrief script: `~/Downloads/Lead Edge Mock Case Playbook.md` lines 286–305.
</code_context>

<specifics>
## Specific Ideas
- Honest and evidence-backed: every score quotes what he actually said.
- Grade depth of insight and calling out what the deck does not show, more than raw numbers.
</specifics>

<deferred>
## Deferred Ideas
- Audio replay of answers (v2).
- A spoken debrief (v2).
- Filler-word metrics (v2).
</deferred>
