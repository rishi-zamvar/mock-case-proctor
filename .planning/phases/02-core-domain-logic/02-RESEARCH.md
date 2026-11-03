# Phase 2: Core Domain Logic - Research

**Researched:** 2026-11-03
**Domain:** Pure TypeScript domain modules: case loader, interview reducer, text utilities (leak guard, speakable, splitter, number parser), metrics
**Confidence:** HIGH. The case data was inspected directly across all 12 cases, and the repo conventions were read from the source.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Case loader**
- The library root defaults to `~/Documents/Projects/lead_edge_mock_cases`. It is a parameter, so tests can point at a fixture root.
- Read `_work/data/case_NN.json`, which is the generated file with `tokens[k].s` formatted values. Resolve every `{token}` in strings recursively. An unresolved token is an error in tests.
- Read the interviewee deck text from the interviewee PDF using `pdftotext`, which is already installed at /opt/homebrew/bin. The plain-text output is cached next to userData later; for now it's a pure function over a provided text.
- Do not read the interviewer PDF. It duplicates the JSON.
- Start with `_work/content/CONTENT_SCHEMA.md` (in `_work/spec/`) plus the top-level keys of `data/case_02.json` and `content/case_02.json`. Map each brief field to a JSON path explicitly.
- Do NOT copy case content into this repo. Tests read the real library when it's present, and skip with a clear message otherwise.
- For deterministic CI, add a small hand-written `case_99_fixture` under `tests/fixtures/cases/case_99_fixture/`. It has the same shape but tiny, fictional content.
- CaseCard (candidate-safe) is `{ id, number, slug, company, vertical, level, intervieweePdfPath }` only. Enforce this by type (a separate type with no interviewer fields) and by a runtime zod `.strict()` parse.
- InterviewerBrief (main-only) contains:
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
- The STT vocabulary prompt is at most about 200 tokens. It combines the company name, the vertical's glossary terms and the finance vocabulary (ARR, NRR, GRR, CAGR, EV, NTM, pre-money, post-money, MOIC, Rule of 40, burn multiple).

**Interview state machine**
- Phases, in order: `idle → warmup (optional, skippable) → review → presentation → extraction → grilling → wrapup → scoring → reviewMode`. The `warmupPosition` default is `'before'`.
- Section catalog ids: `business`, `lead_edge_8`, `retention`, `industry` (qualitative and quantitative, including comps), `diligence`, `valuation` (work back to 3x), `call`.
- The section order comes from the `SECTION_PLAN_SET` event (the extraction output in Phase 6). Missing catalog sections are appended at the end and recorded as omissions. `call` is always last.
- Turn caps:
  - The soft cap is computed from the grilling budget: `budgetMin` defaults to 25, with about 75 s per turn, spread over the sections. Clamp it to the range 3–6.
  - The hard cap is soft + 2.
  - `section_status: 'sufficient'` from the LLM is ignored on a section's first turn.
  - At the hard cap, the machine force-advances.
  - An invalid `next_section` (not in the plan, or already done) is rejected, and the machine falls back to the plan order.
- Hint policy: `hint_allowed` becomes true only after 2 failed probes in the current section, as reported by `interview_control`.
- Interrupts: the presentation phase never emits an interrupt effect. In grilling, an `ANSWER_TICK` past 90 s emits an `INTERRUPT_SUGGESTED` effect, once per answer.
- Timers are data. The reducer receives `now` in events and keeps deadlines (the review deadline is 45 min). It never calls `Date.now()`.
- Effects are a discriminated union, for example `SAY`, `START_TIMER`, `REQUEST_LLM_TURN`, `PERSIST`, `INTERRUPT_SUGGESTED` and `PHASE_CHANGED`.

**Leak guard**
- `checkUtterance(text, brief) → {ok} | {ok:false, reason, match}`.
- It blocks any run of 8 or more tokens copied from the answer-key fields: flags' "what they should say", the ideal answer, rubric text, and the prep brief "what it tests".
- It also blocks banned terms, case-insensitive: "rubric", "answer key", "flag map", "interviewer package", "ideal answer", "scoring sheet".
- Normalise text before comparing: lowercase, strip punctuation, collapse whitespace.
- Ordinary probing questions must pass, including ones that mention numbers that are in the deck.

**Speech normaliser and sentence splitter**
- Normaliser rules (table-driven):

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

- Acronym lexicon: ARR → "A R R", NRR, GRR, CAGR → "kagger", EV → "E V", NTM → "N T M", LTM, SaaS → "sass", Rule of 40, PIMS → "pims", EBITDA → "ee-bit-dah", MOIC → "moyk".
- Sentence splitter:
  - Splits on `.?!` followed by whitespace and a capital letter or the end of text.
  - Never splits inside a decimal (`4.1x`, `$1.5B`, `48.2%`), after `e.g.`, `i.e.`, `vs.`, `approx.` or `U.S.`, or inside quotes.
  - It is streaming-friendly: `push(chunk) → sentences[]`, then `flush()`.
  - The first chunk may be emitted early at 6 or more words (for latency) only when it ends at a comma or clause boundary.

**Number parser and metrics**
- `parseNumbers(text) → [{value, unit: 'usd'|'pct'|'x'|'count'|'bps', scale, raw}]`. It handles "$184M", "184 million", "4.1x", "48 percent" and "three x" (number words up to twenty).
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
- The internal file layout under `src/main/domain/`, helper names, and test organisation. Use table-driven tests (`it.each`).

### Deferred Ideas (OUT OF SCOPE)
- The LLM prompts themselves belong to Phase 6, and the grader to Phase 8.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIB-03 | Interviewer brief from `data/case_NN.json` with every `{token}` resolved (zero unresolved across all 12 cases, tested); a candidate-safe card plus the deck text | Field map; token and `{fn:}` resolution rules; the regex pitfall; deck text via pdftotext with `\f` page markers |
| FLOW-01 | A pure, code-owned state machine runs the phases in order | Reducer pattern and the event and effect unions below |
| FLOW-06 | About 25 min of grilling (configurable), soft and hard caps per section, "sufficient" ignored on turn 1 | Cap formula (default soft cap 3, hard cap 5), next-section validation, hint counter |
| BAR-03 | The leak guard blocks 8+-token n-grams from the answer key and banned terms | The answer-key n-gram source list; subtracting deck n-grams (measured overlap: 0, 0 and 1 eight-grams) |
| VOUT-02 | Normalise money, x, %, bps and acronyms before speech | The token `.s` shape census (every format the cases actually print) as the test corpus |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TDD: tests are written before the logic for every pure module (QA-01).
- Test names are table-driven `it.each`, run in the Vitest `main` project (node env). Test files go under `src/main/**/*.test.ts` or `src/shared/**/*.test.ts`. `tests/fixtures/**` is not in any include glob; that's fine because it holds data only.
- No Electron imports in `src/main/domain/`. Dependencies are passed as plain parameters, the Phase 1 pattern.
- Case content never enters the repo. The secret scan already exists (`tests/config/secret-scan.test.ts`, `fixture-hygiene.test.ts`).
- Privacy: interviewer materials must never be candidate-visible. Keep `InterviewerBrief` under `src/main/domain/`. `tsconfig.web.json` includes only `src/renderer/**` and `src/shared/**`, so the renderer cannot even type-import the brief. That gives a compile-time barrier for free.
- `src/shared/ipc.ts` has "NO runtime imports" because the preload bundles it. The `CaseCard` *type* goes there, and the `CaseCardSchema` (zod) goes in `src/shared/schemas.ts`, mirroring the existing `KeyStatus` compile-time-guard pattern.
- Stack is locked: zod 4.6.7, vitest 5.1.0, Node 22.20.0, TypeScript 5.9. **No new dependencies are needed for this phase.**

## Summary

Everything is plain TypeScript plus `node:fs` and zod. The real work is getting the case data shape right. I inspected all 12 `data/case_NN.json` files directly. Three findings change the plan compared with the earlier architecture research:

1. **The token regex must be `\w+`, not `[a-z_0-9]+`.** Case 04 has an uppercase token, `exA_breakeven_pre`, used 5 times. A lowercase regex silently leaves it unresolved and *also* fails to detect it, so a naive "zero unresolved" test passes vacuously. The reference implementation (`_work/scripts/build_interviewer.js` R()) uses `/\{(\w+)\}/g`.
2. **A second placeholder kind, `{fn:<slide>.<note id>}`, appears 14 times**, in cases 05, 06, 10 and 12, in flag-map notices, pushback answers, prep-brief tests, pull-outs and annotations. It must resolve to `note (1)` or `note (a)` exactly as the deck prints it. The rule is mirrored from `build_interviewer.js` fnRef: look up the index in `deck.<slide>.notes.numbered[]` by `id`. Bank house `H3` (case 06) uses alpha markers; H1 and H2 use numeric markers.
3. **`.gitignore` line 17 `cases/` ignores `tests/fixtures/cases/case_99_fixture/`.** I verified this with `git check-ignore`. Add `!tests/fixtures/cases/` (and keep its contents trackable), or the CI fixture will silently never be committed.

pdftotext 26.09.0 is installed. It takes 0.1 s per PDF in raw mode. The output is 35–39 KB and 30–31 pages per case, separated by `\f` (form feed), with a trailing empty element after the last `\f`. PDF page 1 is the case prompt, so **deck page N = PDF page N+1**, the same rule the case pipeline prints in its page key.

**Primary recommendation:** write `resolveDeep(obj, tokens, deck, house)`, which handles `{fn:…}` first and then `{\w+}`, throws on unknown names, and walks objects and arrays. Build the brief by picking fields from `data.interviewer.*` and `data.answer_key.*` per the field map below. Test it over the 12 real cases plus a fixture that includes an uppercase token and an `{fn:}` reference.

## Standard Stack

| Library | Version (installed) | Purpose | Why |
|---------|---------|---------|-----|
| zod | 4.6.7 | `CaseCardSchema.strict()`, and an optional shape check of the data JSON | Already in use in `src/shared/schemas.ts`. `z.object().strict()` still works in v4, as Phase 1 already uses it. |
| vitest | 5.1.0 | Table-driven tests, `describe.skipIf` | The pattern exists in `src/main/keys/probe.live.test.ts` |
| node:fs / node:path / node:os / node:child_process | Node 22.20 | Read JSON; `execFileSync('pdftotext', [pdf, '-'])` only in tests and Phase 3 glue | stdlib |
| pdftotext (poppler) | 26.09.0, `/opt/homebrew/bin` | Deck text extraction | Locked decision. Replaces the pdfjs-dist idea from ARCHITECTURE.md. |

**Don't add:** XState, a number-words library, compromise or nlp.js, or a sentence-boundary library. Each of these is under about 80 lines of table-driven code, and the abbreviation and decimal rules are domain-specific anyway.

## Case Library Facts (verified 2026-11-03)

**Layout** (`ROOT = ~/Documents/Projects/lead_edge_mock_cases`):
```
ROOT/
├── 00_INDEX.md, lead_edge_mock_cases.zip       # ignore
├── case_NN_<slug>/                             # 12 dirs, regex /^case_(\d{2})_([a-z0-9]+)$/
│   ├── case_NN_<slug>_interviewee_package.pdf  # candidate deck (30–31 pages)
│   └── case_NN_<slug>_interviewer_package.pdf  # NEVER read, NEVER served
└── _work/
    ├── data/case_NN.json      # USE THIS (resolved-ready, has tokens). Also contains comps_master_v2.json: filter by /^case_\d{2}\.json$/
    ├── content/case_NN.json   # authoring source; uses interviewer.cover/flag_map/... names. Do not use.
    └── spec/CONTENT_SCHEMA.md # §9-12, §15, §19.2 are the relevant sections
```
Slugs: claimpath, pawshub, buildledger, carecadence, ledgerloop, shipstream, clinicflow, fieldwise, gridsense, coursely, vaultlane, harvestiq.

**Placeholder census (data JSON, excluding `tokens` and `params`):** 544–790 `{token}` references per case, spread across interviewer (about 5,000), deck (about 1,800), answer_key (about 800), annotations, company, inserts and intended_read_sentence. There are 196–283 tokens per case. **No token `.s` value itself contains a placeholder,** so a single pass is enough. Recursive means walking the object tree, not iterating substitution. Under the `\w+` regex there are 0 unresolved tokens across all 12 cases, and there are 14 `{fn:}` references.

**Token object:** `tokens[name] = { v: number, fmt: string, s: string }`. Always substitute `.s`.

## Field Map: InterviewerBrief → JSON path (in `data/case_NN.json`)

`iv = data.interviewer`, `ak = data.answer_key`, `pb = iv.prep_brief`. All strings must go through `resolveDeep`.

| Brief field | JSON path(s) | Notes |
|---|---|---|
| `caseId`, `level` | `case_id` (`"02"`), `level` (int 1–3) | |
| `company` | `company.name`, plus `company.one_liner`, `company.tagline` for context | `company.legal_name` is also present |
| `vertical` | `vertical` | |
| `intendedRead` | `intended_read_short`, `intended_read_bucket` (`invest`/`pass`/`conditional`), `intended_read_sentence`, `ak.intended_read` | Answer key: main-only |
| `business` | `pb.business` (≤ 80 words), `pb.business_facts[]{label,text}` | |
| `glossary` | `pb.glossary[]{term,def}` (6–10 items) | Also feeds the STT prompt |
| `deckFacts` | `deck_numbers[]` (12–16 printed key figures), `iv.s2_answer_key.snapshot[8]{label,value}` | `deck_numbers` are what the candidate can see, and are allowed in probes |
| `deckText` | pdftotext of the interviewee PDF (argument) | Pages split on `\f` |
| `leadEdge8` | `ak.lead_edge_8[8]{n,key,criterion,bar,value,blueprint,le_strict_ebitda,le_strict_fcf,slides[],note,...}`, `ak.weakest`, `ak.weakest_why`, `ak.scores`, `iv.s2_answer_key.{weakest_line,ntm_line,boundary_line,rule_of_40,lifetime_burn}` | Keys in site order: revenue, growth, margins, profitability, recurring, retention, customer_base, capital_efficiency. Verdicts are `Pass`, `Soft` or `Miss`. |
| `flags.hidden` | `hidden_flags[]{flag,type:'primary'\|'secondary',kind:'buried'\|'bait',where_buried,anchor}` | 2–3 per case. Primary comes first. Cases 08, 11 and 12 have a **bait** primary. |
| `flags.map` | `iv.s3_flag_map.rows[]{id,flag,kind,role,templates[],anchor,notice,say}` | Roles: `primary`, `secondary`, `supporting`, `FCF quality`, `distractor`. Case 12 also has `price test`, so type `role` as `string`, not an enum. `say` = "what they should say" (candidate voice). `templates[]` holds the page refs (S-ids such as `S12`, `A3`). |
| `flags.deliberateOmissions` | `iv.s3_flag_map.deliberate_omissions` (str) | **Present in all 12 cases.** This is the "what the deck does NOT show" input for Phase 6. |
| `flags.bankerRationale` | `iv.s3_flag_map.banker_rationale`, `banker_rationale_why` (nullable; L2–3 only) | |
| `mustPullOuts` | `pb.pull_outs[]{fact,pages[],why,primary?}` (6–10) | The first one is `primary: true` |
| `whatItTests` | `pb.tests[]{skill,evidence}` (3–5) | The leak-guard source "what it tests" |
| `comps` | `iv.s5_comps.{rows[],placement,bucket_vs_peer,subject,backdrop_line}`, `pb.comps[]{key,anchor?,retention,use}`, `pb.comps_rows[]` | Exactly one `anchor: true` in `pb.comps` |
| `precedents` | `pb.precedents[]{date,deal,ev,multiple,lesson}` | |
| `kpis` | `pb.kpis[]{kpi,company,benchmark,read}` | |
| `tailwinds` / `headwinds` | `pb.tailwinds[]` / `pb.headwinds[]` `{driver,number,source}` | |
| `exitBuyers` | `pb.exit_buyers[]{buyer,why}` | Optional |
| `backSolve` | `ak.back_solve` (same as `iv.s4_back_solve`): `moic`, `years`, `dilution`, `exit_multiple`, `steps[8]{id,label,v,fmt}`, `required_cagr`, `underwrite_cagr`, `breakeven_pre`, `works_at_pre`, `sensitivity`, `le_band_check`, `formula_ignores` | Numbers are raw (`v`) and need a `fmt`. Prefer the matching tokens (`required_cagr`, `breakeven_pre` and so on) for spoken values. |
| `priceLadder` | `ak.accepted_calls[]{call,price_range}`, `ak.accepted_calls_condition`, `ak.accepted_calls_label?`, `iv.s1_cover.accepted_calls_header`, plus `back_solve.breakeven_pre`/`works_at_pre`/`cushion_pre` | |
| `pushback` | `iv.s6_pushback.questions[5–7]{id,q,must_ask,strong,weak,follow_up,only_if_raised?,follow_up_strong?}`, `iv.s1_cover.must_ask[3]` (question ids), `iv.s1_cover.convince_me{if_invest,if_pass}`, `iv.s6_pushback.convince_me_strong`, `do_not_use_unless_raised[]`, `generic_bank[]` (strings) | `convince_me` = the mandatory "I think it's the opposite" (INT-05) |
| `rubric` | `iv.s8_scoring.rubric[6]` = **tuples** `[dimension, fiveLooksLike, oneLooksLike]`, `rubric_5{dim:str}`, `rubric_3?`, `rubric_1?`, `bonus[]`, `debrief[]`, `notes` | The dimensions are identical in all 12 cases: `Clear call`, `Lead Edge 8`, `Retention insight`, `Valuation and comps`, `Return back-solve`, `Business quality and poise`. Map each tuple to `{dimension, five, one}`. |
| `idealAnswer` | `pb.ideal_answer` (110–170 words, the 60 s version) | `iv.s7_model_answer{call,what,le8,retention,price,risks,close}` is the full ≤ 560-word version; include both |
| `memorize` | `pb.memorize[]{label,text}` (Deal · Company · Back-solve · Comps · Industry) | |
| `traps` | `pb.traps[]` (strings) | |
| `annotations` | `iv.s9_annotations[]{n,template,anchor,title,body}` | Optional. About 4 KB. |
| *(skip)* | `iv.s10_calibration` | **36.6 KB of the 83 KB interviewer blob** is the sources list. Keep `notes[]` only, if anything. This keeps the cached prefix lean. |

**CaseCard:** `id` = `case_id` (`"02"`, matching `/^\d{2}$/`), `number` = `parseInt`, `slug` from the folder name, `company` = `company.name`, `vertical` = `vertical`, `level` = `level`, `intervieweePdfPath` = `<root>/case_NN_<slug>/case_NN_<slug>_interviewee_package.pdf`. Build it with an explicit object literal (never by spreading the data object), then call `CaseCardSchema.parse()`.

**STT prompt:** `company.name` + `pb.glossary[].term` + the finance list. The case 02 glossary has 10 short terms (for example PIMS, DVM, GPV, Take rate), so the total is comfortably under 200 tokens. Use a word-count proxy: assert `split(/\s+/).length <= 150`.

## Architecture Patterns

### Recommended layout
```
src/shared/
  ipc.ts              # + CaseCard type (no runtime imports)
  schemas.ts          # + CaseCardSchema (.strict()) + compile-time guards
src/main/domain/
  cases/
    resolve.ts        # resolveDeep, fnRef
    brief.ts          # InterviewerBrief type + buildBrief(data, deckText)
    library.ts        # listCases(root), loadCase(root, id, deckText) -> {card, brief}
    deckText.ts       # splitPages(raw) -> string[]; (pure)
    sttPrompt.ts
  machine/
    sections.ts       # SECTION_CATALOG, rubric mapping, mergePlan()
    interviewMachine.ts
  text/
    leakGuard.ts  speakable.ts  sentenceSplitter.ts  numbers.ts
  metrics.ts          # brevityBand(ms)
tests/fixtures/cases/case_99_fixture/   # needs .gitignore negation
  case_99_fixture_interviewee_package.pdf? -> NO: ship deck.txt only
  _work/data/case_99.json (or flatten; see Pitfall 3)
```
The fixture needs the same *root* shape as the real library, so that `listCases(root)` runs unchanged. That means the fixture root is `tests/fixtures/cases/` containing `case_99_fixture/` (where the PDF would be) and `_work/data/case_99.json`. Supply the deck text from a `.txt` file in tests. Don't commit a PDF.

### Pattern: reducer `(state, event) => { state, effects }`
- Events: `START{now, config}`, `WARMUP_DONE`, `WARMUP_SKIPPED`, `READY`, `REVIEW_DEADLINE{now}`, `PRESENTATION_DONE{now}`, `SECTION_PLAN_SET{order: SectionId[]}`, `ANSWER_TICK{now, answerId, elapsedMs}`, `ANSWER_FINAL{now, answerId, text, ms}`, `AGENT_TURN_DONE{now, control: InterviewControl | null}`, `WRAPUP_DONE`, `END_REQUESTED`, `SCORED`.
- Minimal `InterviewControl` (Phase 6 adds the zod schema): `{section, section_status: 'continue'|'sufficient', next_section?, probe_failed?: boolean, hint_given?: boolean, flags_surfaced?: string[]}`. Define it now in the machine module. Phase 6 must conform to it.
- State holds `phase`, `plan: SectionId[]`, `omitted: SectionId[]`, `done: Set→SectionId[]` (use arrays, so the state stays JSON-persistable for FLOW-07), `current`, `turnsInSection`, `failedProbes`, `hintAllowed`, `reviewDeadline = now + 45*60_000`, and `interruptedAnswerId`.
- **Cap formula** (pin this in a test): `turns = round(budgetMin*60/75)`, `soft = clamp(round(turns / sections.length), 3, 6)`, `hard = soft + 2`. With the defaults (25 min, 7 sections): 20 turns / 7 ≈ 2.86, which gives **soft 3, hard 5**. Note that the default always clamps to 3. That is intended, but write the test so a 60-minute budget gives `round(48/7)=7`, which clamps to 6.
- **`mergePlan(order)`:** dedupe, drop unknown ids, drop `call`, append the missing catalog sections in catalog order (recorded as `omitted`), then push `call` last. Note: `call` that Rishi doesn't raise is still appended, and it should *also* count as omitted if he never stated a call (REV-03 "led with a call" is separate).
- **Advance rule** on `AGENT_TURN_DONE`: increment `turnsInSection`. Then:
  - if it's at or past the hard cap, force-advance;
  - else if `section_status === 'sufficient'` and `turnsInSection > 1`, advance to `next_section` if it is valid (in the plan and not done), otherwise to the next section in plan order;
  - after the last section, go to `wrapup`.

  `probe_failed` increments `failedProbes`. `hintAllowed = failedProbes >= 2`. Reset both on section change.
- `ANSWER_TICK`: only in `grilling`, when `elapsedMs > 90_000` and `interruptedAnswerId !== answerId`, emit `INTERRUPT_SUGGESTED` and remember the `answerId`.

### Anti-Patterns
- **Building the CaseCard by `{...data}` or `pick` and then stripping fields.** Instead, use a literal with 7 fields, plus `.strict()` parse.
- **Putting `InterviewerBrief` in `src/shared/`.** It would then type-check in the renderer project, and you lose the compile-time barrier.
- **A `Set` in reducer state.** It breaks JSON persistence (FLOW-07 in Phase 3). Use arrays.
- **Running pdftotext inside `loadCase`.** The decision is a pure function over provided text. The `execFile` belongs in Phase 3 glue (with the cache), and in tests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| PDF text | a pdf.js parse | `pdftotext <pdf> -` (raw mode; `-layout` doubles the size to 74 KB with column padding, so don't use it) |
| Footnote labels | your own numbering guess | Mirror `build_interviewer.js` fnRef exactly: `deck[slide].notes.numbered.findIndex(x => x.id === id)`. Alpha markers apply when `bank.house === 'H3'` (from `_work/scripts/deck/tokens.js`: H1 and H2 are `num`, H3 is `alpha`). Bare `{fn:id}` must match exactly one slide, otherwise throw. Also scan `data.inserts[].notes`. |
| Card validation | manual key checks | zod `.strict()` |

## Common Pitfalls

### 1. The lowercase token regex passes vacuously
**What goes wrong:** `/\{([a-z_0-9]+)\}/` (from ARCHITECTURE.md) neither resolves nor detects `{exA_breakeven_pre}` (case 04). **How to avoid:** use `/\{fn:([\w.]+)\}/g` first, then `/\{(\w+)\}/g`. The leftover check in tests must be broad: `/\{[^{}\s]+\}/`. **Warning sign:** a "0 unresolved" result while using a narrow regex.

### 2. `{fn:...}` treated as an unknown token
If the loader throws on `fn:`, it throws on 4 cases. If it skips `fn:`, Claude reads raw `{fn:s12.grr}`. Resolve it. Fixture must contain one.

### 3. The fixture is gitignored
`.gitignore: cases/` matches `tests/fixtures/cases/`. Add `!tests/fixtures/cases/` and `!tests/fixtures/cases/**`. Verify with `git check-ignore -v tests/fixtures/cases/case_99_fixture/x` (expect no output), or put the fixture under another name. Note that the context locks this path, so use the negation.

### 4. Leak-guard false positives from deck phrasing
Answer-key text may quote the deck verbatim. I measured 8-gram overlap between the answer-key sources and the pdftotext deck: 0 (case 02), 0 (case 08) and 1 (case 12). **How to avoid:** `bannedGrams = answerKeyGrams − deckGrams`, so the interviewer can always repeat deck wording. Build the gram set once per brief (memoize it on the brief object or precompute it in `buildBrief`). With about 1,000–1,200 grams per case, a `Set<string>` of space-joined 8-grams is enough. Normalise both sides identically, and normalise *after* token resolution. Also run `speakable()` *after* the guard, never before: the guard compares written forms such as `$45.0M`.

### 5. Normaliser pattern coverage
The census of every token `.s` across 12 cases shows these forms:
- `$9.9M` (688 occurrences)
- `9%` (571)
- `9.9x` (229)
- `9.9%`
- `$9M`
- **`($9.9M)` negatives (99)**
- `1,100`
- `$9.9K`
- `$9.9B`
- **`(9%)`**
- `~1,100`
- `+9%`
- **`$9.9T`**
- **`n.a.`**
- **`<9%`**
- `9+`
- bare `9.9M`
- `9–9%` ranges
- `$1,234.5B` with commas
- `9% / 9% / 9%`

Beyond the locked table, the normaliser must handle `(…)` → "negative …", `T` → trillion, `n.a.` → "not available", `<` → "under", and comma thousands. Range rules must run before single-amount rules. The `x` suffix rule needs `\b\d+(\.\d+)?x\b`, so that "box" and "Fax" are left alone. Apply the acronyms with word boundaries and case-sensitively (`EV` but not "every"). **Best test:** feed every token `.s` from all 12 cases through `speakable()` and assert the output matches none of `/[$%~]|\d[MBKTx]\b|\bbps\b/`.

### 6. Splitter versus finance text
- `n.a.` and `Inc.` should be added to the abbreviation list. The locked list is a minimum.
- "U.S. Bank" is followed by a capital letter, which is exactly why the list exists.
- Treat a period between digits as never a boundary.
- Hold a trailing `.` at the end of a chunk until the next chunk arrives, because the next chunk could be a digit (`4.` | `1x`).
- Track quotes with a toggle on `"` and `“`/`”`.

### 7. Token values that are not numbers
Some `.s` values are `n.a.`, and some are `text`-format strings. `parseNumbers` on answer-key text must skip them without throwing.

### 8. Number words
"one eighty four million" is out of scope (number words only go up to twenty). Document it with a `ponytail:` comment, because Phase 8's grading will meet it.

## Code Examples

```ts
// resolve.ts — mirrors _work/scripts/build_interviewer.js R()/fnRef (single pass; token .s never nests)
type Tok = Record<string, { v: unknown; fmt: string; s: string }>
export function resolveString(s: string, tokens: Tok, fnRef: (k: string) => string): string {
  return s
    .replace(/\{fn:([\w.]+)\}/g, (_, k) => fnRef(k))
    .replace(/\{(\w+)\}/g, (_, k) => {
      if (!tokens[k]) throw new Error(`unresolved token {${k}}`)
      return tokens[k].s
    })
}
export const resolveDeep = <T>(o: T, f: (s: string) => string): T =>
  typeof o === 'string' ? (f(o) as T)
  : Array.isArray(o) ? (o.map((x) => resolveDeep(x, f)) as T)
  : o && typeof o === 'object'
    ? (Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolveDeep(v, f)])) as T)
    : o
```

```ts
// real-library gate (pattern from src/main/keys/probe.live.test.ts)
const ROOT = join(homedir(), 'Documents/Projects/lead_edge_mock_cases')
const HAS_LIB = existsSync(join(ROOT, '_work/data/case_01.json'))
describe.skipIf(!HAS_LIB)('real case library (skipped: library not at ' + ROOT + ')', () => {
  it.each(Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')))('case %s resolves', (id) => {
    const deck = execFileSync('pdftotext', [pdfPath(id), '-'], { encoding: 'utf8' })
    const { brief, card } = loadCase(ROOT, id, deck)
    expect(JSON.stringify(brief)).not.toMatch(/\{[^{}\s]+\}/)
    expect(Object.keys(CaseCardSchema.parse(card)).sort()).toEqual([...CARD_KEYS].sort())
  })
})
```

```ts
// deckText.ts
export const splitPages = (raw: string): string[] => raw.split('\f').filter((p, i, a) => i < a.length - 1 || p.trim())
// page index 0 = case prompt; deck page N = pages[N]
```

## State of the Art

| Old (ARCHITECTURE.md) | Now | Impact |
|---|---|---|
| pdfjs-dist for deck text | pdftotext CLI (locked) | No new dependency. 0.1 s per case. |
| token regex `[a-z_0-9]+` | `\w+`, plus `{fn:}` handling | Fixes case 04 and resolves cases 05, 06, 10 and 12 |
| CaseCard `{id, slug, companyName, vertical, completed}` | `{id, number, slug, company, vertical, level, intervieweePdfPath}` (locked) | `completed` is derived in Phase 3 from the SessionStore |
| Max 6 turns per section | soft cap from the budget, clamped 3–6, hard = soft + 2 | |

## Open Questions

1. **`intervieweePdfPath` in the card is an absolute path that the renderer sees.** The path itself is harmless, and Phase 3's `app://` handler maps it. The planner could instead store a relative path. Recommendation: keep it absolute per the lock. Phase 3's `app://` uses the case id anyway.
2. **What "probe failed" means.** The context says the count comes "as reported by `interview_control`". Recommendation: add `probe_failed?: boolean` to the control type now, and let Phase 6 finalise the schema.
3. **Should `call` be omitted when Rishi never states a call?** Recommendation: record omissions only for non-`call` sections in `mergePlan`. "Led with a call" is a Phase 8 metric.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| pdftotext | deck text (real-library tests) | ✓ | 26.09.0 `/opt/homebrew/bin` | The test skips if it is missing (`describe.skipIf`) |
| pdfinfo | (not needed) | ✓ | 26.09.0 | — |
| Node | all | ✓ | 22.20.0 | — |
| vitest | tests | ✓ | 5.1.0 | — |
| Case library | real-data tests | ✓ | 12 cases, 30–31 pp each | case_99_fixture |

There are no missing dependencies that block this phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.1.0, project `main` (node env) |
| Config file | `vitest.config.ts` (existing; `src/main/**/*.test.ts` is already included) |
| Quick run command | `npx vitest run --project main src/main/domain` |
| Full suite command | `npm test && npm run typecheck` |

### Phase Requirements → Test Map
| Req ID | Behavior | Type | Automated Command | File Exists? |
|---|---|---|---|---|
| LIB-03 | `resolveString` handles a token, an uppercase token, `{fn:slide.id}` (num and alpha), and throws on an unknown token or an ambiguous bare fn | unit | `npx vitest run src/main/domain/cases/resolve.test.ts` | ❌ Wave 0 |
| LIB-03 | `loadCase(fixtureRoot,'99')`: brief has every field in the map, 0 `/\{[^{}\s]+\}/` leftovers; card has exactly 7 keys; `CaseCardSchema.parse({...card, flags:[]})` throws | unit | `npx vitest run src/main/domain/cases/library.test.ts` | ❌ Wave 0 |
| LIB-03 | All 12 real cases: 0 leftovers, the card is strict, deckText has 30–31 pages, no brief string appears in `JSON.stringify(card)` | integration (skipIf no library) | `npx vitest run src/main/domain/cases/library.real.test.ts` | ❌ Wave 0 |
| LIB-03 | `listCases` ignores `_work`, the zip, the index and `comps_master_v2.json`, and returns 12 cards sorted by number | integration | same file | ❌ Wave 0 |
| LIB-03 | STT prompt includes the company and the glossary terms, has ≤ 150 words, and includes MOIC | unit | `npx vitest run src/main/domain/cases/sttPrompt.test.ts` | ❌ Wave 0 |
| FLOW-01 | Phase path: idle→warmup→review→presentation→extraction→grilling→wrapup→scoring→reviewMode; the skip-warmup path; the `warmupPosition:'after'` variant; `REVIEW_DEADLINE`/`READY` exit the review; no `Date.now` (lint: `grep -L "Date.now" src/main/domain`) | unit (table) | `npx vitest run src/main/domain/machine/interviewMachine.test.ts` | ❌ Wave 0 |
| FLOW-01 | Presentation never emits `INTERRUPT_SUGGESTED`; grilling emits it once at more than 90 s per answerId | unit | same | ❌ Wave 0 |
| FLOW-06 | Caps: (25 min, 7 sections) → 3/5; (60 min) → 6/8; (5 min) → 3/5. Force-advance at the hard cap; `sufficient` ignored on turn 1; an invalid `next_section` falls back; `hintAllowed` only after 2 `probe_failed`, reset on a section change | unit (table) | same | ❌ Wave 0 |
| FLOW-06 | `mergePlan`: dedupe, unknown ids dropped, missing sections appended plus recorded as omitted, `call` last | unit | `npx vitest run src/main/domain/machine/sections.test.ts` | ❌ Wave 0 |
| BAR-03 | Blocks a verbatim 8-gram from the ideal answer, a flag `say`, rubric text and `tests[].evidence`; blocks each banned term in any case; passes 10 ordinary probes including deck numbers; passes a phrase that appears in both the deck and the answer key | unit (table, fixture) plus real (every case's `pb.ideal_answer` first 10 words + 'so') | `npx vitest run src/main/domain/text/leakGuard.test.ts` | ❌ Wave 0 |
| VOUT-02 | Locked table plus negatives, T, n.a., `<`, commas, ranges, FY, acronyms; not "box"/"every" | unit (it.each) | `npx vitest run src/main/domain/text/speakable.test.ts` | ❌ Wave 0 |
| VOUT-02 | Every token `.s` in 12 real cases → no `$ % ~`, no `\d[MBKTx]\b` | integration (skipIf) | same file | ❌ Wave 0 |
| VOUT-02 (splitter) | Decimals, abbreviations, quotes, a `4.`\|`1x` chunk boundary, early first chunk at a comma with 6+ words, `flush` | unit | `npx vitest run src/main/domain/text/sentenceSplitter.test.ts` | ❌ Wave 0 |
| (REV-03 prep) | `parseNumbers`/`matches` table; brevity band boundaries at 15/30/60/90 s | unit | `npx vitest run src/main/domain/text/numbers.test.ts src/main/domain/metrics.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --project main src/main/domain`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test && npm run typecheck` green, plus `git check-ignore tests/fixtures/cases/case_99_fixture/_work/data/case_99.json` returns nothing.

### Wave 0 Gaps
- [ ] `.gitignore` negation for `tests/fixtures/cases/`
- [ ] `tests/fixtures/cases/case_99_fixture/` + `tests/fixtures/cases/_work/data/case_99.json`. It needs tiny fictional content with ≥ 1 uppercase token, 1 `{fn:}` (with `deck.<slide>.notes.numbered`, `bank.house`), every mapped path present, and a `deck.txt` with 3 `\f` pages.
- [ ] A shared test helper `realLibrary.ts` (ROOT, HAS_LIB, pdftotext presence check)

## Sources

### Primary (HIGH confidence)
- Direct inspection of `/Users/rishizamvar/Documents/Projects/lead_edge_mock_cases/_work/data/case_01..12.json`: shapes, placeholder census, rubric dimensions, flag roles, fn locations
- `_work/spec/CONTENT_SCHEMA.md` §1.1–1.2 (tokens and fmt codes), §9–12 (flags, answer_key, interviewer), §15 (data contract), §18.3 (fn refs), §19.2 (prep_brief)
- `_work/scripts/build_interviewer.js` lines 30–45 (reference resolver), `_work/scripts/deck/tokens.js` (house marker styles)
- pdftotext 26.09.0 run on all 12 interviewee PDFs (page counts, sizes, `\f` markers)
- Repo: `.gitignore` (checked with `git check-ignore`), `vitest.config.ts`, `tsconfig.web.json`, `src/shared/{ipc,schemas}.ts`, `src/main/keys/probe.live.test.ts`

### Secondary
- `.planning/research/ARCHITECTURE.md`, `PITFALLS.md`. Corrected in two places: the regex and pdfjs.

## Metadata
**Confidence breakdown:**
- Field map and data facts: HIGH. Measured, not inferred.
- Reducer design: HIGH. It follows the locked decisions; the only assumption is the `probe_failed` field name.
- Normaliser and splitter edge cases: HIGH for the patterns found (census); MEDIUM for pronunciations, which need an ear audition in Phase 5.

**Research date:** 2026-11-03
**Valid until:** until the case pipeline regenerates `data/` (re-run the census if `schema_version` changes from "1.1")
