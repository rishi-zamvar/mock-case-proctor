# Phase 3: Walking Skeleton on Fakes - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning
**Mode:** Smart discuss, auto-accepted. The user is asleep and asked Claude to "choose the best path forward".

<domain>
## Phase Boundary

Wire the Phase 2 domain into a full, clickable app running on fake adapters. The pieces:
- SessionStore (zod, atomic writes, quarantine).
- SessionRunner, which executes the reducer's effects.
- Ports and adapters (LLM, STT, TTS, clock), each with a fake implementation plus a composition root that selects adapters by env.
- IPC: a redacted ViewState push, plus intents.
- All screens: Library, Session (warm-up, review, presentation and grilling share a layout), and ReviewMode with a fake scorecard.
- Greyed-out completed cases with Retake.
- Crash-resume.
- The IPC-tap redaction E2E test.
- `app://` refusal of interviewer PDFs and invalid case IDs.
- The T1 Playwright suite.

Out of scope here: real PDF rendering, webcam and mic UI (Phase 4), real voice and avatar (Phase 5), real Claude (Phase 6) and the real grader (Phase 8). Each of these gets a placeholder that has the final layout slot.
</domain>

<decisions>
## Implementation Decisions

### Ports & composition root
- Ports live in `src/main/ports/`:
  - `LlmPort` with `streamTurn(req) → AsyncIterable<{type:'text',delta}|{type:'control',payload}|{type:'done'}>`, plus `extractPlan`, `scoreSession` and `warmupTurn`.
  - `SttPort` with `transcribe(pcm16k) → {text}`.
  - `ClockPort` with `now()` and timers.
  - TTS and avatar are renderer-side. Main only emits `speak:sentence` events with a seq number, and the renderer acks them. In Phase 3 the renderer's fake speech queue acks after `words × 60 ms` with no audio.
- **Fakes.** `FakeLlm` is scripted. It produces deterministic interviewer lines per section and a valid `interview_control` payload, and moves to `sufficient` after N turns. `FakeStt` returns canned text keyed by turn index, or text injected by E2E. `FakeClock` has a speed multiplier (`E2E_TIME_SCALE`, so the 45-minute review can finish in seconds).
- **Selection.** `ADAPTERS=fake` is the default for E2E and, in Phase 3, for dev too. Later phases flip each adapter to its real implementation through `LLM=claude`, `STT=whisper` and `TTS=headtts`.
- **Composition root.** `src/main/compose.ts` is the only place that constructs adapters. No other module reads `process.env`.

### SessionStore
- Layout: `userData/sessions/<sessionId>/session.json`. The sessions root is overridable via the `SESSIONS_DIR` env, or the userData override under E2E.
- `session.json` schema (zod, versioned `schemaVersion: 1`): `{ id, caseId, startedAt, endedAt?, status: 'active'|'completed'|'abandoned', machineState, transcript: Turn[], controlLog: Control[], timings: TurnTiming[], scorecard? }`.
- Atomic write: write `session.json.tmp`, fsync, rename. Writes happen after every turn and every phase change.
- A file that fails zod validation or JSON parsing is moved to `sessions/_quarantine/<id>-<ts>.json` and never loaded. The Library reports it once.
- `listSessions()` derives per-case completion: the latest completed session per caseId, with date and score.

### Crash-resume
- On launch, if a session with `status:'active'` exists, the Library shows a banner: "Resume your <Company> session from <phase>?" with Resume and Discard buttons. Discard marks the session abandoned.
- Resume rehydrates `machineState` and continues from the last saved turn. A turn that was in flight is re-requested.
- E2E: kill the app with `app.process().kill('SIGKILL')` mid-grilling, relaunch, choose Resume, and assert the transcript length is preserved and the flow continues.

### Redaction & IPC
- Renderer IPC API, using typed channels only:
  - `session.start(caseId, {warmup:boolean})`, `session.intent(intent)` and `session.resume(id)`;
  - `library.list()`;
  - `onView(cb)` for ViewState pushes and `onSpeak(cb)` for sentence events;
  - `speak.ack(seq)`.
- `ViewState` is a type built ONLY from candidate-safe fields: phase, timers, card, the candidate's own transcript, spoken interviewer lines (only what was said), section label and status flags. Before `reviewMode` it has no field that can hold brief content. In `reviewMode` it adds a `reveal` object (scorecard, ideal answer, key numbers, flag map).
- **The redaction test is an E2E IPC tap.**
  - A preload-side E2E hook records every payload received on every channel.
  - After a full T1 run up to wrap-up, the test asserts that none of the payloads contains any 8-gram from the brief's leak sources or any banned term.
  - After review mode opens, the reveal is allowed.
- `app://`:
  - Only allowlisted roots are served: `bundle`, plus `cases/<validCaseId>/interviewee.pdf`, mapped to the real path through the CaseLibrary.
  - Any `*_interviewer_package.pdf`, path traversal, or unknown or invalid caseId returns 404.
  - Unit tests cover these cases, and E2E covers them too.

### Screens (UI)
- Visual direction comes from Phase 1 CONTEXT: a dark, calm video-call look, teal accent and Inter.
- **Library.** A grid of 12 case cards showing number, company, vertical and level. Completed cards are greyed out (about 45% opacity), show "Completed <date> · <score>/30", and have a Retake button. Other cards have a Start button. The Start flow is a small sheet with a "Include 5–10 min warm-up chat" toggle (default on) and a Start button. A settings gear sits top-right. The resume banner sits at the top.
- **Session layout (shared by warm-up, review, presentation and grilling).**
  - Left, about 62%: the main stage. During review it shows the PDF panel (placeholder "Deck viewer — Phase 4" in Phase 3). During warm-up, presentation and grilling it shows the avatar stage (placeholder "Interviewer" with a speaking indicator ring, since the real avatar arrives in Phase 5).
  - Right column: the webcam tile at the top (placeholder in Phase 3), then the phase header with the countdown timer, then the live transcript list (interviewer lines and the candidate's answers).
  - Bottom bar: a large Talk/Done button (Space toggles it), the per-answer timer, phase-specific buttons ("Ready — start presenting" during review; "Skip warm-up" during warm-up), and End session, which confirms before ending.
  - In Phase 3 the Talk button submits fake STT text. E2E injects the text through `window.__e2e.say(text)`.
- **ReviewMode.**
  - A scorecard with 6 rubric rows, each showing a score, an evidence quote and the answer-key item; in Phase 3 the fake scorecard fills these.
  - A flag map with found, hinted or missed for each flag.
  - Deterministic checks (numbers, brevity, led-with-call, omissions).
  - The reveal: the ideal answer next to the opening, plus the key numbers.
  - The transcript.
  - A "Trends" tab, which is a placeholder until Phase 8.
  - Back to library.
- Accessibility basics: focus rings, buttons that can be operated by keyboard, an `aria-live` region for interviewer lines, and colour contrast of at least 4.5:1.

### T1 E2E suite
Run on the built app with fakes and a time scale. The suite covers:
- library rendering, with all 12 cases from the real library path (configurable via `CASES_ROOT`) and the fixture case under E2E;
- the start sheet;
- warm-up, then skip;
- review, then Ready;
- presentation (one answer);
- grilling (several sections, sufficient → next);
- wrap-up, scoring, then review mode;
- back to the library, with the case greyed out, then Retake;
- ending early from grilling, which still produces a scorecard;
- crash-resume;
- the redaction tap;
- `app://` refusals;
- a quarantined corrupt session.

### Claude's Discretion
- Internal file layout and component breakdown, CSS module structure, and exact copy text.
</decisions>

<code_context>
## Existing Code Insights
- Phase 1: secure shell; `app://` resolver (`src/main/protocol.ts`, `appProtocol.ts`); IPC router with zod (`src/main/ipc.ts`, `src/shared/schemas.ts`, `src/shared/ipc.ts`); preload API; KeyStore; Playwright harness (`tests/e2e/launch.ts`, `global-setup.ts`); replay server; E2E switches (`src/main/e2e.ts`); `window.__e2e` hooks; tokens.css; plain state-switch `App.tsx` with Settings and Home screens.
- Phase 2: `src/main/domain/` with cases (`library.ts` listCases/loadCase, `brief.ts`, `sttPrompt.ts`, `resolve.ts`, `deckText.ts`), machine (`interviewMachine.ts`, `sections.ts`), text (`leakGuard.ts`, `speakable.ts`, `sentenceSplitter.ts`, `numbers.ts`) and `metrics.ts`. Shared `CaseCard` schema.
- Fixture case: `tests/fixtures/cases/` (`case_99`).
</code_context>

<specifics>
## Specific Ideas
- Completed cases are greyed out, and each new case gets a fresh interviewer. Only the reviewer reads past results (Phase 8); design the store so the reviewer can list summaries.
</specifics>

<deferred>
## Deferred Ideas
- Real deck, webcam and mic → Phase 4. Voice and avatar → Phase 5. Claude → Phase 6. STT → Phase 7. Real grader and trends → Phase 8.
</deferred>
