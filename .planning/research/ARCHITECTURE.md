# Architecture Research

**Domain:** Local voice-agent desktop app (Electron): push-to-talk STT → Claude interviewer → local TTS → 3D lip-synced avatar, plus a proctored case flow and a separate reviewer agent
**Researched:** 2026-11-02
**Confidence:** HIGH on process split, Claude tool-use mechanics, and the case-data shape (verified against official docs and the real files). MEDIUM on the interrupt and history handling with always-on thinking, and on the Electron fake-mic flags.

Builds on `research/voice_pipeline.md` and `research/avatar_shell.md`. Those two files settle the libraries (HeadTTS/Kokoro, whisper.cpp turbo, TalkingHead, react-pdf, `@anthropic-ai/sdk`, JSON-file storage). This file settles the boundaries, contracts, state machine, and test seams. Where I disagree with them, I say so.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────── MAIN PROCESS (Node, trusted) ─────────────────────────────┐
│  Composition root (adapters.ts): picks real | fake adapter per port from env           │
│                                                                                        │
│  ┌──────────────┐   ┌────────────────────┐   ┌──────────────────┐  ┌────────────────┐  │
│  │ CaseLibrary  │──▶│ SessionRunner      │──▶│ InterviewerAgent │─▶│ LlmPort        │──┼─▶ Anthropic API
│  │ (scan, brief,│   │ (executes effects  │   │ (prompt, tool,   │  │ (stream turn,  │  │
│  │  redaction)  │   │  of pure reducer)  │   │  sentence split) │  │  abort)        │  │
│  └──────────────┘   │   ▲  interview-    │   └──────────────────┘  └────────────────┘  │
│  ┌──────────────┐   │   │  machine.ts    │   ┌──────────────────┐                      │
│  │ SessionStore │◀──│   │  (pure)        │──▶│ ReviewerAgent    │─▶ LlmPort (separate) │
│  │ (JSON files) │   └───┼────────────────┘   │ (scorecard,trend)│                      │
│  └──────────────┘       │                    └──────────────────┘                      │
│  Clock port · KeySource (env / ~/.config/keys) · app:// protocol (interviewee PDF only) │
└────────▲──────────────────────────┬─────────────────────────────▲──────────────────────┘
         │ MessagePort (PCM in,     │ typed IPC (preload           │
         │ transcript out)          │ contextBridge window.api)    │
┌────────┴───────────────┐  ┌───────▼────────────────────────────── RENDERER (sandboxed) ─┐
│ UTILITY PROCESS: STT   │  │ React screens: Library · Review(PDF+timer) · Interview ·    │
│ whisper.cpp binding    │  │   ReviewMode                                                │
│ (Metal), turbo final,  │  │ MicPort (AudioWorklet 16 kHz, push-to-talk) ─▶ PCM to main  │
│ base.en partials (opt) │  │ TtsPort ─▶ HeadTTS Web Worker (Kokoro WebGPU)               │
│ crash-isolated         │  │ AvatarPort ─▶ TalkingHead (three.js) speak queue            │
└────────────────────────┘  │ webcam <video> tile (same getUserMedia stream)              │
                            └─────────────────────────────────────────────────────────────┘
```

**Direction of authority:** main owns all state and all secrets. The renderer is a view plus the media I/O (mic, speakers, GPU TTS, avatar), because those only exist in Chromium. The renderer sends *intents* (`talk:start`, `talk:stop`, `interrupt`, `ready`) and *media* (PCM). Main sends *view state* (redacted) and *sentences to speak*.

### Component Responsibilities

| Component | Process | Owns | Talks to |
|---|---|---|---|
| **interview-machine.ts** | main (pure TS, no I/O) | Phase transitions, section bookkeeping, caps, timers *as data* | Nothing. It's a function `(state, event) → {state, effects[]}` |
| **SessionRunner** | main | Executes effects (call LLM, persist, push view state, schedule timer), feeds events back into the reducer | machine, InterviewerAgent, ReviewerAgent, SessionStore, Clock, IPC |
| **CaseLibrary** | main | Scan the case folders, resolve `{tokens}`, build the **InterviewerBrief** (main-only) and the **CaseCard** (candidate-safe), extract deck text | fs, pdfjs-dist (Node build) |
| **InterviewerAgent** | main | System prompt + cached brief, `interview_control` tool, per-turn proctor note, streaming → sentence splitter → speakable normalizer | LlmPort |
| **ReviewerAgent** | main | Scorecard (structured output) per session; trends over prior scorecards | LlmPort, SessionStore (read-only on history) |
| **Metrics** | main (pure) | Deterministic numbers: answer durations, words/min, brevity vs. target, filler count | Called by the runner at turn end and by the reviewer |
| **SessionStore** | main | `userData/sessions/<id>/session.json`, atomic writes, completed-case set | fs |
| **SttPort (real = whisper utility process)** | utilityProcess | PCM in → final transcript (+ optional partials) | main via MessagePort |
| **MicPort** | renderer | Push-to-talk capture of 16 kHz mono Float32, sends one buffer per answer | getUserMedia (AEC on), IPC |
| **TtsPort / AvatarPort** | renderer (HeadTTS in a worker) | Synthesize sentence → audio + visemes → `head.speakAudio`/stream queue; report `spoken(seq)` back | IPC |
| **Screens** | renderer | Render `ViewState` only. No business logic | `window.api` |

---

## Recommended Project Structure

```
src/
├── shared/                  # imported by main, preload, renderer: types only, zero runtime deps
│   ├── ipc.ts               # channel names + payload types (THE contract)
│   ├── view-state.ts        # candidate-safe ViewState union
│   └── sections.ts          # fixed section catalog (ids, labels, rubric row mapping)
├── main/
│   ├── index.ts             # app lifecycle, window, protocol, permissions
│   ├── adapters.ts          # composition root: env → real|fake per port
│   ├── ports.ts             # LlmPort, SttPort, Clock, KeySource interfaces
│   ├── machine/
│   │   ├── interview-machine.ts      # pure reducer
│   │   └── interview-machine.test.ts
│   ├── session-runner.ts    # effect executor
│   ├── cases/
│   │   ├── case-library.ts  # scan + token resolve + brief/card split
│   │   └── deck-text.ts     # pdfjs-dist text extraction, cached
│   ├── agents/
│   │   ├── interviewer.ts   # prompt assembly, tool schema, proctor notes
│   │   ├── sentence-splitter.ts
│   │   ├── speakable.ts     # "$45.0M" → "45 million dollars", "4.1x" → "4.1 times"
│   │   └── reviewer.ts
│   ├── metrics.ts
│   ├── store/session-store.ts
│   └── adapters/
│       ├── llm-anthropic.ts  llm-fake.ts  llm-replay.ts
│       ├── stt-whisper-host.ts  stt-fake.ts
│       └── clock-real.ts  clock-fake.ts
├── stt-worker/whisper.ts    # utilityProcess entry
├── preload/index.ts         # contextBridge window.api, typed from shared/ipc.ts
└── renderer/
    ├── screens/  Library.tsx  Review.tsx  Interview.tsx  ReviewMode.tsx
    ├── media/
    │   ├── mic.ts            # MicPort real (AudioWorklet) + fixture (WAV file → same stream API)
    │   ├── tts.ts            # TtsPort: HeadTTS worker | fake (silent buffer, estimated word times)
    │   └── avatar.ts         # AvatarPort: TalkingHead | fake (DOM caption only)
    └── speech-queue.ts       # seq-ordered sentence queue, interrupt, spoken() acks
tests/
├── fixtures/  audio/*.wav  llm/*.json  cases/case_99_fixture/  (tiny synthetic case)
└── e2e/       *.spec.ts (Playwright _electron)
```

**Rationale:** `shared/` is types only, so the IPC contract is checked by the compiler on both sides. The reducer, splitter, speakable normalizer, metrics, and case library are pure or fs-only, which puts most of the logic in plain Node unit tests (vitest) with no Electron. Each port has exactly two implementations, real and fake. That's the one place an interface is justified: tests need it.

---

## Architectural Patterns

### Pattern 1: Pure reducer + effect executor (the interview state machine)

**What:** All interview logic is one pure function. It returns the next state plus a list of effects (data). `SessionRunner` performs the effects and turns their results into events. No XState: about 8 phases and about 12 events fit in a discriminated union, and the reducer is trivially testable with table-driven tests.

```ts
type Phase =
  | { kind: 'warmup' }                                            // optional, skippable
  | { kind: 'review'; deadline: number }                          // 45 min, no LLM calls
  | { kind: 'presentation' }                                      // one long candidate turn
  | { kind: 'grilling'; plan: SectionId[]; idx: number; turnsInSection: number }
  | { kind: 'wrapup' }
  | { kind: 'scoring' }                                           // reviewer running
  | { kind: 'reviewMode' }                                        // interviewer content now revealable
  | { kind: 'aborted' };

type Event =
  | { t: 'START'; warmup: boolean; now: number }
  | { t: 'READY' } | { t: 'TIMER_EXPIRED' } | { t: 'SKIP_WARMUP' }
  | { t: 'ANSWER_FINAL'; text: string; startedAt: number; endedAt: number }
  | { t: 'AGENT_TURN_DONE'; spokenText: string; control: Control | null; interrupted: boolean }
  | { t: 'CANDIDATE_END_REQUESTED' } | { t: 'SCORED' } | { t: 'ABORT' };

type Effect =
  | { e: 'llm.interviewer'; userContent: UserContent }   // tool_result(s) + answer + proctor note
  | { e: 'llm.reviewer' } | { e: 'persist' } | { e: 'view'; state: ViewState }
  | { e: 'timer.set'; at: number; fire: 'TIMER_EXPIRED' } | { e: 'timer.clear' };
```

**Trade-off:** It's a little more ceremony than if/else in a handler. In exchange you can replay any transcript through the reducer and assert the exact phase path with no mocks.

**Phase order:** the PROJECT.md requirement and the Saar playbook put the warm-up **before** the 45-minute review ("short chat, then here is the project"). The milestone brief lists it after. Make it a reducer input (`warmupPosition`) and default to *before review* to match the playbook. The requirements step should confirm this.

### Pattern 2: Speak in text, steer with a record-only tool (section control)

**What:** Each interviewer turn streams **plain text** (sent to TTS sentence by sentence), then ends with one call to a strict client tool, `interview_control`. The tool is *record-only*: main applies it to state and **does not make a follow-up API call**. Its `tool_result` rides along at the start of the *next* user message, ahead of the candidate's transcribed answer. That avoids a second round-trip per turn, which would add 1 s or more of latency.

```ts
const interviewControl = {
  name: 'interview_control', strict: true,
  description: 'Call exactly once at the END of every turn, after you have finished speaking. Records where the interview is. Your spoken words must already contain your next question.',
  input_schema: { type: 'object', additionalProperties: false,
    required: ['section_id', 'status', 'evidence', 'flags_surfaced'],
    properties: {
      section_id:   { enum: SECTION_IDS },                  // lead_edge_8 | retention | comps_valuation | back_solve | business_quality | diligence | the_call
      status:       { enum: ['probing', 'sufficient', 'moving_on_unresolved'] },
      next_section: { enum: [...SECTION_IDS, null] },       // only when status != probing
      plan:         { type: 'array', items: { enum: SECTION_IDS } }, // first grilling turn only: order from candidate's opening
      evidence:     { type: 'string' },                     // short: what he showed / failed to show
      flags_surfaced: { type: 'array', items: { type: 'string' } },  // hidden_flags anchors he found, e.g. "grr_footnote"
      end_interview: { type: 'boolean' } } } };
```

Next user message: `[tool_result(toolu_x, "ok"), text("<proctor>section=retention turn=3/6 elapsed=41m</proctor>"), text(answerTranscript)]`.

**Why this shape (verified):**
- **Text before tool_use in one response** is normal Claude behaviour.
- **`tool_result` blocks must come first in the user message; text after them is allowed.** This is quoted from the official docs, which show a `tool_result` followed by a text block.
- **Opus 5.5 and Sonnet 5.5 return 400 on `tool_choice` `any`/`tool`.** Forced tool use is out, so use `auto` + `strict: true` + prompt instruction.
  - Code treats a missing tool call as `{status: 'probing', section_id: current}`.
- **Hard guards in the reducer, not the prompt:**
  - Max turns per section (start at 6); at the cap, force advance with a proctor note.
  - Ignore `sufficient` on turn 1 of a section.
  - Validate `next_section` against the remaining plan.
  - Total grilling time budget; when exceeded, the proctor note says "wrap up".
- **Section catalog maps to the case rubric.** The real `s8_scoring.rubric` rows are Clear call / Lead Edge 8 / Retention insight / Valuation and comps / Return back-solve / Business quality and poise. `diligence` comes from PROJECT.md. That makes each section's sufficiency gradeable against a rubric row.

**Rejected alternative:** the milestone's `{say, section_status, next_section}` as one JSON object (structured output or tool input). `say` would arrive as a partial JSON string, so you'd need incremental JSON parsing before the first sentence can reach TTS. That costs latency and adds a parser. The text-then-tool split gives the same information with zero parsing.

**Proctor notes vs. mid-conversation `role: "system"` messages:** the docs confirm mid-conversation system messages for Opus 5 / Opus 4.8 / Fable / Mythos. The page I found does **not** list Opus 5.5 (LOW confidence either way). `avatar_shell.md` assumed they work, so treat that as unverified. Put phase directives in a tagged text block after the `tool_result` instead. That works on every model and keeps the history append-only, so the cached prefix holds. Switch to system messages only after a 5-minute check against the docs or the API.

### Pattern 3: Ports with real + fake adapters, chosen at one composition root

**What:** Five ports: `LlmPort`, `SttPort`, `TtsPort`, `AvatarPort`, `MicPort`, plus `Clock` and `KeySource`. Adapters are chosen in `main/adapters.ts` (and in a mirrored `renderer/media/*` factory) from env, for example `PROCTOR_LLM=fake|replay|anthropic`, `PROCTOR_STT=fake|whisper`, `PROCTOR_TTS=fake|headtts`, `PROCTOR_MIC=fixture|device`, `PROCTOR_TIME_SCALE=60`.

```ts
export interface LlmPort {
  streamTurn(req: TurnRequest, signal: AbortSignal): AsyncIterable<
    | { k: 'text'; delta: string } | { k: 'tool'; name: string; id: string; input: unknown }
    | { k: 'done'; stopReason: string; usage: Usage }>;
  structured<T>(req: StructuredRequest<T>): Promise<T>;   // reviewer
}
export interface SttPort { transcribe(pcm: Float32Array, prompt: string): Promise<{ text: string; ms: number }> }
export interface Clock { now(): number; setTimer(at: number, cb: () => void): () => void }
```

| Port | Real | Fake (unit / E2E-fast) | Recorded (E2E-realistic) |
|---|---|---|---|
| LlmPort | `@anthropic-ai/sdk` `messages.stream` | Scripted turns from `fixtures/llm/<script>.json`: text chunks + tool input, with configurable chunk delay | `replay`: real request/response recorded once with `PROCTOR_LLM_RECORD=1`, replayed by turn index |
| SttPort | whisper.cpp in utilityProcess | Returns the transcript paired with the fixture WAV (by filename/hash) | Real whisper on the fixture WAVs |
| TtsPort | HeadTTS worker | Silent `AudioBuffer` sized from word count + estimated `wtimes` | Real HeadTTS |
| AvatarPort | TalkingHead | DOM caption element `data-testid="avatar-caption"` | Real TalkingHead (screenshot smoke only) |
| MicPort | getUserMedia AudioWorklet | WAV fetched via `app://fixtures/` → `AudioBufferSourceNode` → same worklet. Push-to-talk start/stop driven by the test | Chromium `--use-file-for-fake-audio-capture` (see note) |
| Clock | `Date.now` / `setTimeout` | Manual clock, `advance(ms)` exposed on a test-only IPC channel | `PROCTOR_TIME_SCALE` compresses 45 min to 45 s |

**Fake-mic note:** Chromium's `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=x.wav` is documented for Playwright-on-Chromium. I found nothing confirming it under `_electron.launch` (LOW confidence). It's plausible via `app.commandLine.appendSwitch` before `ready`. The in-app `MicPort` fixture doesn't depend on that, so make it the primary E2E path and the Chromium flag a bonus test of the real getUserMedia path.

**E2E tiers:**

| Tier | Adapters | Runs | Proves |
|---|---|---|---|
| T1 | all fake, fake clock | every commit, about 30 s | Every screen, the phase path, persistence, redaction, greyed cases, retake |
| T2 | real STT + real TTS + replay LLM + fixture mic | every phase gate | Voice loop mechanics: PCM → transcript, sentence → audio, barge-in timing, latency budget asserted from `turn.metrics` |
| T3 | everything real, including Claude and the avatar | manual / pre-ship, key required | Prompt quality, cache hits (`cache_read_input_tokens > 0`), end-to-end feel |

### Pattern 4: Redaction by type, enforced at the IPC boundary

**What:** `CaseLibrary.load(id)` returns `{ card: CaseCard, brief: InterviewerBrief }`. Only `card`, `ViewState`, and the sentences being spoken ever cross IPC. `ViewState` for every phase before `reviewMode` is a type with no field that could hold brief content. The reviewer's output, flags, and answer key enter `ViewState` only in `reviewMode`.

**Also:**
- The `app://` protocol handler serves `case_NN_*/…_interviewee_package.pdf` and avatar/model assets only, behind a path-normalization guard. It never serves `*_interviewer_package.pdf`.
- Validate `caseId` with `/^\d{2}$/` before any fs path join.
- **Test:** a T1 E2E taps every IPC message sent to the renderer (a test-mode `webContents.send` wrapper writing to a log). It asserts that none of the fixture case's `hidden_flags[].flag` strings, `intended_read_sentence`, or `s7_model_answer` text appear before `reviewMode`. This makes "never expose interviewer content" a failing test, not a code-review hope.
- **Caveat:** sentences the interviewer *speaks* are by definition candidate-visible. That's correct, since a real partner may feed answers. The test covers the data channels, not the persona.

---

## Data Flow

### Turn flow (the core loop)

```
[Rishi presses TALK]                 renderer: MicPort.start(); if avatar speaking → INTERRUPT (below)
        │ audio frames (AudioWorklet, 16 kHz Float32)
[Rishi presses STOP]                 renderer: one Float32Array (~64 KB per 1 s; a 2-min answer is ~7.7 MB, fine over IPC)
        │ ipc invoke 'answer:submit' {turnId, pcm (transferable), startedAt, endedAt}
main SessionRunner ── MessagePort ──▶ STT utility: whisper turbo + finance initial_prompt (from brief glossary)
        │ ◀── {text, ms}
reducer(ANSWER_FINAL) → effects: persist, view(transcript), llm.interviewer(userContent)
        │
InterviewerAgent: LlmPort.streamTurn(system[cached brief] + messages + userContent, abortSignal)
        │ text deltas → SentenceSplitter (min 6 words first chunk, abbrev list, "$1.5B"-safe)
        │             → speakable() → ipc 'speak:sentence' {turnId, seq, text}
        │ tool delta  → held until stream done
renderer speech-queue: TtsPort.synth(text) → AvatarPort.play(audio, visemes) in seq order
        │ ipc 'speak:spoken' {turnId, seq} as each sentence FINISHES playing
main: stream done + all seqs spoken → reducer(AGENT_TURN_DONE{spokenText, control}) → persist, view
```

**Latency path:** STT final (0.3–0.9 s) + Claude TTFT + first sentence (6 words) + first TTS chunk (0.4–0.7 s). Push-to-talk removes the 0.4–1.4 s end-of-turn wait in `voice_pipeline.md`'s budget. That's the main margin for Opus 5.5's always-on thinking, which raises TTFT even at `effort: low`. Record `t_stop`, `t_transcript`, `t_first_delta`, `t_first_audio` per turn in `session.json`. T2 asserts the median against the 3 s target.

### Barge-in flow

```
renderer: TALK pressed while speech-queue non-empty
   ├─ immediately: AvatarPort.stop(); drop queued + in-flight TTS jobs   (local, <50 ms, no IPC wait)
   ├─ MicPort.start()                                                    (the press is also a new answer)
   └─ ipc send 'speak:interrupt' {turnId, lastSpokenSeq}
main: abortController.abort() on the stream (if still open)
      spokenText = sentences[0..lastSpokenSeq] (+ partial marker)
      reducer(AGENT_TURN_DONE{interrupted:true, spokenText, control: tool if already received else null})
      history append: assistant = spokenText only; next user content starts with
      "<proctor>candidate interrupted you after: '…'</proctor>"
```

Barge-in is **button-driven** because PROJECT.md chose button-to-stop turns. VAD becomes optional: voice-activated barge-in can come later as a renderer-only change that emits the same `speak:interrupt`. Skipped for now: vad-web, Smart Turn, and the echo-threshold tuning in `voice_pipeline.md` §3. Add them when hands-free interrupt is wanted.

**History truthfulness under always-on thinking (MEDIUM confidence, verify in phase research):** the stored assistant message for an interrupted turn is rebuilt from spoken text and drops the thinking blocks and any unanswered `tool_use`. Because the proctor note carries the authoritative state every turn, the model never depends on seeing its own earlier tool calls. Verify that the API accepts a text-only assistant turn after earlier thinking turns. If not, keep the original assistant blocks and add the "you were interrupted after X" note.

### Case → brief flow (main only)

```
lead_edge_mock_cases/case_NN_<slug>/ (two PDFs)     _work/data/case_NN.json (184 KB, generated, superset of content/)
        │                                                   │
        │ pdfjs-dist (Node legacy build) on                 │ resolveTokens(): /\{([a-z_0-9]+)\}/ → tokens[k].s
        │ interviewee PDF only → deckText (~37 KB)          │ (verified: 0 unresolved across all 12 cases)
        ▼                                                   ▼
                 InterviewerBrief = { company, vertical, level, intended_read_*, hidden_flags,
                   answer_key (lead_edge_8, weakest, accepted_calls, back_solve, scores),
                   interviewer.{s1_cover, s2_answer_key, s3_flag_map, s4_back_solve, s5_comps,
                   s6_pushback, s7_model_answer, s8_scoring.rubric, prep_brief}, deckText, sttPrompt }
                 cached → userData/briefs/case_NN.<sha of inputs>.json
                 CaseCard = { id, slug, companyName, vertical, completed }   ← only this reaches the renderer
```

**What the real data looks like (inspected `case_02`):**
- `_work/content/case_NN.json` and `_work/data/case_NN.json` share `schema_version: "1.1"`.
- `data/` adds the resolved numbers:
  - `tokens` (about 200 entries, each `{v, fmt, s}`)
  - `arr_history`, `cohorts`, `top_customers`, `projections`
  - `answer_key.back_solve` and `answer_key.scores`
  - `interviewer.s1…s10` and `prep_brief`
- Strings in both still contain `{token}` placeholders, about 430 in `data.interviewer` for case 02. **The loader must resolve them**, or Claude reads `GRR is {grr}`.
- **Use `data/` only.** `content/` is the unresolved authoring source.
- **Skip the interviewer PDF text entirely.** It's about 200 KB of layout text duplicating s1–s10 and would bloat the cached prefix. Keep it only as a fallback if a `data/` JSON is missing.

**Size:** `data.interviewer` is about 83 K chars, plus answer_key about 9 K and deck text about 37 K, so roughly 130 K chars, or about 30–35 K tokens. That's one cached system prefix, well within limits. Trim `s10_calibration` and `s9_annotations` if the cache-write cost matters.

**Other loader details:**
- `deckText` is in the brief because the persona must "call out what is NOT shown in the deck". The model needs the literal deck the candidate saw.
- `data.deck` (49 KB structured) is an alternative. Prefer the PDF text because it is exactly what was rendered.
- **Unit test:** load all 12 real cases plus one tiny synthetic `case_99_fixture` and assert no unresolved `{...}`, no missing sections, and that the card has no brief fields.

### Reviewer flow

```
reducer(wrapup done | CANDIDATE_END_REQUESTED) → phase scoring → effect llm.reviewer
ReviewerAgent.scorecard: LlmPort.structured(schema) with
   brief.s8_scoring.rubric + answer_key + hidden_flags + full transcript (with per-answer durations)
   + interview_control log (per-section evidence/flags) + Metrics (brevity, wpm, durations)
   → scorecard.json {rubric:[{row, score 1-5, evidence_quote, fix}], flags:[{anchor, found, when}],
                     numbers:[{claim, correct, expected}], brevity, overall, drills[3]}
ReviewerAgent.trends: LlmPort.structured over ALL prior scorecard summaries (not transcripts)
   → trends.json {recurring_weaknesses[], improving[], next_focus}
reducer(SCORED) → reviewMode → ViewState now includes scorecard + revealed flags + model answer
```

- **Two calls, not one.** The scorecard is case-grounded and immutable once written. Trends recompute cheaply over small summaries whenever review mode opens, including after retakes.
- **Memory = files injected by us.** This keeps the "interviewer has no cross-case memory" rule structural: `InterviewerAgent` receives no `SessionStore` handle at all, so a test can assert that by construction.
- **Deterministic metrics are computed in code, not by the model.** Brevity, durations, and numbers-vs-`deck_numbers` lookup candidates are testable, and the model only *judges* them.

---

## Session Storage Schema

```
userData/
  settings.json                       # avatar, voice, warmupPosition, mic device
  briefs/case_NN.<hash>.json          # cache, safe to delete
  sessions/<ISO-ts>_case_NN/
    session.json                      # rewritten atomically (tmp + rename) after every turn
    scorecard.json                    # written once by reviewer
    llm/NNN.json                      # only when PROCTOR_LLM_RECORD=1 → becomes replay fixtures
  trends.json                         # latest cross-session trend report
```

```ts
interface SessionFile {
  schema: 1; id: string; caseId: string; startedAt: number; endedAt?: number;
  status: 'in_progress' | 'scoring' | 'graded' | 'aborted';
  phases: { kind: Phase['kind']; at: number }[];
  plan?: SectionId[];
  turns: {
    turnId: string; role: 'candidate' | 'interviewer'; phase: Phase['kind']; section?: SectionId;
    text: string; startedAt: number; endedAt: number; interrupted?: boolean;
    control?: Control;                                   // interviewer turns
    metrics?: { sttMs?: number; firstDeltaMs?: number; firstAudioMs?: number; words?: number };
  }[];
  llmMessages: unknown[];      // exact Anthropic message array, for resume + replay fixtures
}
```

- "Completed = greyed" is `status === 'graded'` for any session with that caseId.
- Resuming after a crash is free: `turns` + `llmMessages` restore everything except the in-flight turn.
- Storing `llmMessages` verbatim (not re-deriving them from `turns`) is what lets the cache prefix and history survive a restart.

---

## IPC Contract (`shared/ipc.ts`)

| Channel | Dir | Kind | Payload |
|---|---|---|---|
| `cases:list` | R→M | invoke | → `CaseCard[]` |
| `session:start` | R→M | invoke | `{caseId, retake: boolean}` → `{sessionId}` |
| `session:ready` / `session:skipWarmup` / `session:end` | R→M | send | `{}` |
| `answer:submit` | R→M | invoke | `{turnId, pcm: Float32Array, startedAt, endedAt}` → `{text}` |
| `speak:spoken` | R→M | send | `{turnId, seq}` |
| `speak:interrupt` | R→M | send | `{turnId, lastSpokenSeq}` |
| `view:state` | M→R | event | `ViewState` (redacted union keyed by phase) |
| `speak:sentence` | M→R | event | `{turnId, seq, text}` |
| `speak:end` | M→R | event | `{turnId, lastSeq}` |
| `transcript:partial` | M→R | event | `{turnId, text}` (optional feature) |
| `review:get` / `trends:get` | R→M | invoke | → scorecard / trends (main refuses unless status graded) |
| `test:*` (clock advance, IPC tap dump) | R→M | invoke | registered only when `PROCTOR_TEST=1` |

Validate at the trust boundary: `caseId` pattern, PCM length cap (for example 10 min), and seq integers. Use plain type guards; Zod for 6 payloads is optional.

---

## Build Order (dependency-driven)

| # | Component | Depends on | Why this position |
|---|---|---|---|
| 1 | `shared/` types, section catalog, **interview-machine reducer** (TDD), Metrics, SentenceSplitter, speakable | nothing | Pure logic, the fastest TDD wins, and every later piece plugs into these contracts |
| 2 | **CaseLibrary** (scan, token resolve, brief/card split, deck text) + tests over all 12 real cases | 1 | Interviewer and screens both need it; the redaction type split must exist before any UI |
| 3 | **Walking skeleton:** electron-vite shell, preload, composition root, SessionStore, SessionRunner, **all-fake adapters**, four screens rendering ViewState, Playwright T1 harness + IPC-tap redaction test | 1, 2 | The whole flow, clickable and E2E-tested on fakes, before any risky media work. Every later phase swaps one adapter and must keep T1 green |
| 4 | Review screen for real: react-pdf of interviewee PDF via `app://`, deadline timer on Clock, webcam tile, permissions/entitlements | 3 | Independent of voice; validates `app://` + TCC early |
| 5 | **TTS + avatar adapters** (HeadTTS worker, TalkingHead, speech-queue with seq/acks) | 3 | Highest visual/packaging risk (voice_pipeline.md agrees); text in → avatar speaks |
| 6 | **Real LlmPort + InterviewerAgent** (prompt, cached brief, `interview_control`, proctor notes, record/replay) | 2, 3, 5 | Core value; needs a voice to judge the persona |
| 7 | **Mic + STT adapters** (AudioWorklet push-to-talk, whisper utilityProcess, finance prompt) + T2 with WAV fixtures | 3 | Closes the loop; T2 latency assertions start here |
| 8 | Barge-in (renderer-local stop + `speak:interrupt` + truthful history) | 5, 6, 7 | Needs all three live parts |
| 9 | ReviewerAgent (scorecard + trends) + ReviewMode reveal | 6, store | Needs real transcripts to tune; fake-reviewer UI already exists from 3 |
| 10 | Packaged-app T3 run: asarUnpack native/model files, signing, mic/camera prompts | all | `voice_pipeline.md`: verify Metal/WebGPU/TCC in the packaged app, not `electron .` |

Phases 4, 5, and 7 can run in parallel after 3 because they touch disjoint adapters. 6 can start on the fake TTS (captions) if 5 slips.

---

## Performance Budget (in place of scaling: single user, one machine)

| Concern | Budget | What breaks first | Fix |
|---|---|---|---|
| Stop → first audible word | ≤ 3 s median | Opus 5.5 TTFT with mandatory thinking | `effort: low`; keep the brief cached; model is config in LlmPort (Haiku/Sonnet 5.5 swap is one env var, user's call) |
| GPU contention | — | whisper (Metal) + HeadTTS (WebGPU) + three.js at once | They don't overlap under push-to-talk: STT runs while the avatar is idle. Don't run partials while the avatar speaks |
| Cache-write cost | ~30–35 K-token prefix per session | Any volatile byte in `system` | Volatile state lives only in proctor notes; assert `cache_read_input_tokens > 0` from turn 2 in T3 |
| Session file growth | ~100 turns | Rewrite per turn is O(n) | Fine at this size. `ponytail:` full rewrite; move to append-only NDJSON if sessions exceed a few MB |

---

## Anti-Patterns

### Interview logic in React state or in IPC handlers
**What people do:** `useState` phases in the renderer, or `if (phase===...)` inside `ipcMain.handle`.
**Why it's wrong:** You can't test it without Electron, it leaks phase-gated content into the renderer, and a reload loses the session.
**Do this instead:** Use the pure reducer in main. The renderer renders `ViewState`.

### Streaming a JSON `{say: ...}` envelope to TTS
**Why it's wrong:** You need a partial-JSON parser before the first sentence can play, escapes leak into speech, and a malformed tail loses the whole turn.
**Do this instead:** Stream text, then a strict record-only tool (Pattern 2).

### Round-tripping the control tool
**What people do:** Return `tool_result` immediately and let the model continue.
**Why it's wrong:** It's a second API call per turn (+1–2 s), and the model often re-speaks.
**Do this instead:** Piggyback the `tool_result` on the next user message.

### Trusting the model to bound a section
**Why it's wrong:** It loops on a favourite topic or declares "sufficient" after one answer.
**Do this instead:** Enforce caps and minimums in the reducer; the model proposes, code disposes.

### Sending interviewer PDFs as `document` blocks
**Why it's wrong:** It duplicates the structured JSON at several times the tokens, and the placeholders are already resolved only in our loader.
**Do this instead:** Build a resolved JSON brief plus the interviewee deck text.

### Native GPU code in the main process
**Why it's wrong:** A whisper/Metal crash kills the window and the session.
**Do this instead:** Run it in a `utilityProcess` and restart on exit; the session survives because it's persisted per turn.

### Mocking the SDK in tests
**Why it's wrong:** Tests break on SDK internals.
**Do this instead:** Fake the `LlmPort` boundary, and record/replay real responses for realism.

---

## Integration Points

### External / native

| Service | Pattern | Notes |
|---|---|---|
| Anthropic Messages API | `messages.stream` in main, AbortController per turn, `strict` tool, `tool_choice: auto` | Forced tool_choice returns 400 on Opus/Sonnet 5.5 (verified). Key from env or `~/.config/keys` via KeySource; never in the renderer or logs |
| whisper.cpp binding | `utilityProcess.fork`, MessagePort with transferable Float32Array | `initial_prompt` built from the brief's glossary + deck numbers, so it's case-specific |
| HeadTTS / TalkingHead | renderer worker + canvas | Warm up (dummy synth) during the 45-minute review phase |
| Case library | read-only fs at a configured path | Never write into it; brief cache lives in userData |

### Internal boundaries

| Boundary | Communication | Notes |
|---|---|---|
| Renderer ↔ main | typed IPC via contextBridge | Intents + PCM up; ViewState + sentences down. Redaction test taps this |
| Main ↔ STT utility | MessagePort | Restartable; request/response by turnId |
| Reducer ↔ runner | function call, effects as data | The only place side effects happen is the runner |
| InterviewerAgent ↔ ReviewerAgent | none directly, only through SessionStore files | Enforces no cross-case interviewer memory |

---

## Sources

- Claude docs, tool definitions and forced tool_choice restrictions (Opus 5.5 returns 400 on `any`/`tool`), HIGH: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
- Claude docs, handling tool calls (tool_result first, text after allowed), HIGH: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
- Claude docs, mid-conversation system messages (listed for Opus 5 / 4.8 / Fable / Mythos; Opus 5.5 not confirmed), LOW for 5.5: https://platform.claude.com/docs/en/build-with-claude/working-with-messages
- Claude release notes (Opus 5.5 launched 2026-09-22; thinking can't be disabled), MEDIUM: https://platform.claude.com/docs/release-notes/overview
- Fake-mic Chromium flags in Playwright, LOW for Electron: https://omarelb.substack.com/p/til-2-set-up-playwright-with-fake , https://zenn.dev/fatricepaddyy/articles/playwrightvoicetests , https://docs.qawolf.com/qawolf/web-audio-injection
- Local inspection (HIGH):
  - `lead_edge_mock_cases/_work/data/case_02.json` and `content/case_02.json` key structure
  - Token-coverage check across all 12 `data/` files (0 unresolved)
  - pdftotext sizes: interviewer PDF about 203 KB, interviewee about 37 KB
- Prior project research: `research/voice_pipeline.md`, `research/avatar_shell.md` (libraries, latency budget, packaging pitfalls)

---
*Architecture research for: Electron local voice-agent mock-interview proctor*
*Researched: 2026-11-02*
