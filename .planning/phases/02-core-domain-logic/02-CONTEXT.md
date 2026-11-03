# Phase 2: Core Domain Logic - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning
**Mode:** Smart discuss, auto-accepted. The user is asleep and asked Claude to "choose the best path forward".

<domain>
## Phase Boundary

This phase builds pure, framework-free TypeScript modules in `src/main/domain/` and `src/shared/`, test-first, with no Electron imports:
- **Case loader:** produces the main-only InterviewerBrief, the candidate-safe CaseCard, the deck text and the STT vocabulary prompt.
- **Interview state machine:** a reducer of the form `(state, event) → {state, effects}`.
- **Section catalog:** maps sections to rubric rows.
- **Text utilities:** the leak guard, the speakable() normaliser and lexicon, the sentence splitter, and the canonical number parser.
- **Metrics:** brevity bands.

This phase adds no UI and no IPC wiring. Phase 3 wires these modules up.
</domain>

<decisions>
## Implementation Decisions

### Case loader
- **Source path:** the library root defaults to `~/Documents/Projects/lead_edge_mock_cases`. It is a parameter, so tests can point at a fixture root.
- **Data sources:**
  - Read `_work/data/case_NN.json`, which is the generated file with `tokens[k].s` formatted values. Resolve every `{token}` in strings recursively.
  - An unresolved token is an error in tests.
  - Read the interviewee deck text from the interviewee PDF using `pdftotext`, which is already installed at /opt/homebrew/bin. The plain-text output is cached next to userData later; for now it's a pure function over a provided text.
  - Do not read the interviewer PDF. It duplicates the JSON.
- **Inspecting the data:**
  - Start with `_work/content/CONTENT_SCHEMA.md` (in `_work/spec/`) plus the top-level keys of `data/case_02.json` and `content/case_02.json`. Map each brief field to a JSON path explicitly.
  - Do NOT copy case content into this repo. Tests read the real library when it's present, and skip with a clear message otherwise.
  - For deterministic CI, add a small hand-written `case_99_fixture` under `tests/fixtures/cases/case_99_fixture/`. It has the same shape but tiny, fictional content.
- **CaseCard (candidate-safe):** `{ id, number, slug, company, vertical, level, intervieweePdfPath }` only. Enforce this by type (a separate type with no interviewer fields) and by a runtime zod `.strict()` parse.
- **InterviewerBrief (main-only):** contains:
  - business in plain English and glossary;
  - deck facts and deck text;
  - Lead Edge 8 answer key rows;
  - flags (primary, secondary, distractors, with page refs);
  - must-pull-outs;
  - comps and precedents;
  - tailwinds and headwinds;
  - back-solve numbers and the price ladder;
  - pushback scripts;
  - rubric;
  - the 60-second ideal answer;
  - numbers to memorize;
  - traps.

  These fields come from the generated JSON wherever possible.
- **STT vocabulary prompt:** at most about 200 tokens. Combine the company name, the vertical's glossary terms and the finance vocabulary (ARR, NRR, GRR, CAGR, EV, NTM, pre-money, post-money, MOIC, Rule of 40, burn multiple).

### Interview state machine
- **Phases, in order:** `idle → warmup (optional, skippable) → review → presentation → extraction → grilling → wrapup → scoring → reviewMode`. The `warmupPosition` default is `'before'`.
- **Section catalog (ids):** `business`, `lead_edge_8`, `retention`, `industry` (qualitative and quantitative, including comps), `diligence`, `valuation` (work back to 3x), `call`.
- **Section order:**
  - The order comes from the `SECTION_PLAN_SET` event (the extraction output in Phase 6).
  - Missing catalog sections are appended at the end and recorded as omissions.
  - `call` is always last.
- **Turn caps:**
  - The soft cap is computed from the grilling budget: `budgetMin` defaults to 25, with about 75 s per turn, spread over the sections. Clamp the result to the range 3–6.
  - The hard cap is soft + 2.
  - `section_status: 'sufficient'` from the LLM is ignored on a section's first turn.
  - At the hard cap, the machine force-advances.
  - An invalid `next_section` (not in the plan, or already done) is rejected, and the machine falls back to the plan order.
- **Hint policy:** `hint_allowed` becomes true only after 2 failed probes in the current section (as reported by `interview_control`).
- **Interrupts:**
  - The presentation phase never emits an interrupt effect.
  - In grilling, an `ANSWER_TICK` past 90 s emits an `INTERRUPT_SUGGESTED` effect, once per answer.
- **Timers as data:** the reducer receives `now` in events and keeps deadlines (the review deadline is 45 min). It never calls `Date.now()`.
- **Effects:** a discriminated union, for example `SAY`, `START_TIMER`, `REQUEST_LLM_TURN`, `PERSIST`, `INTERRUPT_SUGGESTED` and `PHASE_CHANGED`.

### Leak guard
- `checkUtterance(text, brief) → {ok} | {ok:false, reason, match}`.
- It blocks:
  - any run of 8 or more tokens copied from the answer-key fields (flags' "what they should say", the ideal answer, rubric text, the prep brief "what it tests");
  - banned terms, case-insensitive: "rubric", "answer key", "flag map", "interviewer package", "ideal answer", "scoring sheet".
- Normalise text before comparing: lowercase, strip punctuation, collapse whitespace.
- Ordinary probing questions must pass, including ones that mention numbers that are in the deck.

### Speech normaliser and sentence splitter
- **Normaliser rules (table-driven):**

  | Input | Spoken as |
  |---|---|
  | `$184M` | "184 million dollars" |
  | `$1.5B` | "1.5 billion dollars" |
  | `$7.5K` | "7.5 thousand dollars" |
  | `4.1x` | "4.1 times" |
  | `48.2%` | "48.2 percent" |
  | `+30%` | "plus 30 percent" |
  | `25 bps` | "25 basis points" |
  | `$158M–$200M` | "158 to 200 million dollars" |
  | `FY2026A` | "fiscal 2026" |
  | `FY27E` | "fiscal 2027 estimate" |
  | `~` | "about" |

  Acronyms follow a lexicon: ARR → "A R R", NRR, GRR, CAGR → "kagger", EV → "E V", NTM → "N T M", LTM, SaaS → "sass", Rule of 40, PIMS → "pims", EBITDA → "ee-bit-dah", MOIC → "moyk".
- **Sentence splitter:**
  - Splits on `.?!` followed by whitespace and a capital letter or the end of text.
  - Never splits inside a decimal (`4.1x`, `$1.5B`, `48.2%`), after `e.g.`, `i.e.`, `vs.`, `approx.` or `U.S.`, or inside quotes.
  - It is streaming-friendly: `push(chunk) → sentences[]`, then `flush()`.
  - The first chunk may be emitted early at 6 or more words (for latency) only when it ends at a comma or clause boundary.

### Number parser and metrics
- `parseNumbers(text) → [{value, unit: 'usd'|'pct'|'x'|'count'|'bps', scale, raw}]`.
  - It handles "$184M", "184 million", "4.1x", "48 percent" and "three x" (number words up to twenty).
  - `matches(a, b, tolerance)` compares with a relative tolerance, 2% by default.
- Brevity bands:

  | Answer length | Band |
  |---|---|
  | under 15 s | `short` |
  | 15–30 s | `brief` |
  | 30–60 s | `ideal` |
  | 60–90 s | `long` |
  | over 90 s | `flagged` |

### Claude's Discretion
- Internal file layout under `src/main/domain/`, helper names, and test organisation. Use table-driven tests (`it.each`).
</decisions>

<code_context>
## Existing Code Insights

- Phase 1 established `src/shared/schemas.ts` (zod) and `src/shared/ipc.ts`, the Vitest `main` project (node env, covering `src/main/**` and `src/shared/**`), and the pattern of dependencies passed in as plain parameters.
- Case data: `/Users/rishizamvar/Documents/Projects/lead_edge_mock_cases/_work/{content,data}/case_NN.json` and `_work/spec/CONTENT_SCHEMA.md`. Architecture research verified zero unresolved tokens across all 12 cases via `data/case_NN.json` `tokens[k].s`.
- Research: `.planning/research/ARCHITECTURE.md` (reducer, brief/card split, tool schema), `.planning/research/PITFALLS.md` (splitter, normaliser, leak guard).
</code_context>

<specifics>
## Specific Ideas
- The interview format follows Saar: non-technical, gross retention first, comps as the anchor, "is the business interesting", work back to 3x.
- The user wants the grilling to test depth of insight and calling out what the deck does NOT show, rather than heavy number crunching. The brief must therefore carry the deck's deliberate omissions (`flag_map` / "Deliberate omissions") so Phase 6 can probe them.
</specifics>

<deferred>
## Deferred Ideas
- The LLM prompts themselves belong to Phase 6, and the grader to Phase 8.
</deferred>
