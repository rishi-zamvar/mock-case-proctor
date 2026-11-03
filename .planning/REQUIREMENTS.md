# Requirements: Mock Case Proctor

**Defined:** 2026-11-03
**Core Value:** It must feel like a real conversation with a Lead Edge partner. Rishi speaks, and a believable avatar answers out loud within a few seconds, follows his structure, and pushes on exactly the things the case's answer key says matter.

## v1 Requirements

### Foundation (FND)

- [x] **FND-01**: The app launches as a macOS (Apple Silicon) Electron app, with one command for development and one command for a packaged, ad-hoc-signed `.app`.
- [x] **FND-02**: The code lives in the private GitHub repo `rishi-zamvar/mock-case-proctor`. `.env`, models, sessions and case data are gitignored, and an automated secret-scan test fails if any `sk-ant-` string is tracked.
- [x] **FND-03**: The test harness runs from day one:
  - Vitest unit/integration projects, one for the main process and one for the renderer.
  - Playwright end-to-end tests against the built Electron app, using fake media switches. On macOS this means `--use-file-for-fake-audio-capture` plus `--disable-features=AudioServiceSandbox`.
  - A Claude replay server reached through `ANTHROPIC_BASE_URL`, with a `RECORD=1` mode that captures fixtures.
- [x] **FND-04**: The packaged app's camera and mic entitlements appear in both the entitlements file and the inherited entitlements file, along with the usage strings. A test asserts this.
- [x] **FND-05**: The renderer is sandboxed: context isolation and a CSP. It has no Node access and no general file-read IPC. Local assets are served through a custom `app://` protocol.

### API Key (KEY)

- [x] **KEY-01**: On first run, if no key is stored, a Settings screen asks for an Anthropic API key, checks it with a live call, and saves it encrypted via Electron `safeStorage`.
- [x] **KEY-02**: If `ANTHROPIC_API_KEY` is set in the environment or in the gitignored `.env` (symlinked by keymgr), the key is filled in and saved automatically, so Rishi never has to paste it.
- [x] **KEY-03**: The key never reaches the renderer, logs, fixtures or git. Tests assert this.
- [x] **KEY-04**: Rishi can replace or clear the key from Settings.

### Case Library (LIB)

- [x] **LIB-01**: The library screen lists all 12 cases from `~/Documents/Projects/lead_edge_mock_cases` (the path is configurable). Each entry shows only candidate-safe fields: number, company name, vertical and level.
- [x] **LIB-02**: Completed cases are greyed out, with the date and score. An explicit "Retake" starts a fresh session.
- [x] **LIB-03**: The case loader builds two things for each case:
  - A main-process-only interviewer brief from `_work/data/case_NN.json`, with every `{token}` resolved. Zero unresolved tokens across all 12 cases, tested.
  - A candidate-safe card, plus the text of the interviewee deck.

### Information Barrier (BAR)

- [x] **BAR-01**: No interviewer-package content (flags, answer key, rubric, ideal answer, prep brief) crosses to the renderer before review mode. An end-to-end test taps every IPC message and fails on any leak.
- [x] **BAR-02**: `app://` never serves `*_interviewer_package.pdf`.
- [x] **BAR-03**: A leak guard checks every interviewer utterance before it reaches the voice. It blocks answer-key phrasing (n-grams of 8 or more tokens, plus banned terms such as "rubric" and "answer key").

### Session Flow (FLOW)

- [x] **FLOW-01**: A pure, code-owned state machine runs the phases in order: warm-up, review, presentation, grilling, wrap-up, scoring, review mode.
- [x] **FLOW-02**: Optional warm-up: a 5–10 minute casual chat with the partner before "here is the project". It can be skipped.
- [x] **FLOW-03**: Proctored review:
  - The interviewee PDF is shown in the window.
  - A 45-minute countdown runs against a fixed deadline, so it doesn't drift.
  - The partner gives a spoken 10-minute warning.
  - A "Ready" button skips ahead.
- [x] **FLOW-04**: Presentation. Rishi gives a one-sentence recap, a recommendation, and considerations for and against. It is timed and never interrupted by the avatar.
- [x] **FLOW-05**: A structured call extracts the section order from Rishi's opening. Standard sections he didn't raise are appended at the end, and the omission is recorded.
- [x] **FLOW-06**: The grilling has a target of about 25 minutes, configurable. Each section has a soft and a hard turn cap enforced in code. The interviewer's "section sufficient" signal is ignored on a section's first turn.
- [x] **FLOW-07**: The session is saved atomically after every turn and can be resumed after a crash or restart.
- [x] **FLOW-08**: Rishi can end a session early, and the partial session is still scored.

### Voice In (VIN)

- [x] **VIN-01**: Push-to-talk. Rishi presses a button (or Space) to start and presses again to stop each answer. A visible timer runs for each answer.
- [x] **VIN-02**: Local speech-to-text (whisper.cpp large-v3-turbo on Metal), seeded with the case glossary and finance vocabulary.
- [ ] **VIN-03**: The text of each answer is shown after it is transcribed.
- [ ] **VIN-04**: Near-silent recordings are treated as "no answer". Whisper's typical hallucinations ("Thank you.") and repeated phrases are filtered out.
- [x] **VIN-05**: A mic check (level meter) runs before the session starts.

### Interviewer Agent (INT)

- [x] **INT-01**: The interviewer is Claude (one config value, default `claude-opus-5-5`), with the case's interviewer brief cached as the system prefix.
- [x] **INT-02**: Persona: a chill but sharp Lead Edge partner.
  - Speaks in short turns (1–3 sentences, one question).
  - Interrupts during the grilling when an answer runs past about 90 s.
  - Sometimes hints at the answer, but only after 2 failed probes, by code policy.
  - Calls out obvious BS and wrong numbers, checked against the case data.
  - Is not an idealized scrutinizer.
- [x] **INT-03**: For each section the interviewer opens with a high-level framing question ("let's dive into why you want to invest first"). It stays until the section's probe checklist has been sufficiently tested or the cap is hit, then moves on in Rishi's order.
- [x] **INT-04**: Sections cover:
  - the Lead Edge 8 (gross retention first);
  - a qualitative and quantitative view of the industry, including public comps as the anchor;
  - whether the business is interesting (tailwind, system of record, switching cost);
  - what he would diligence;
  - price, by working backwards to 3x with basic math;
  - the call.
- [x] **INT-05**: The interviewer probes what the deck does NOT show. The mandatory "You said X. I think it's the opposite. Convince me" pushback is used on every case.
- [x] **INT-06**: Each turn ends with a record-only `interview_control` tool call (section, status, evidence, flags surfaced, hint given). Code validates it.
- [x] **INT-07**: Rishi's text is wrapped and treated as data, so prompt injection from the transcript can't change the interviewer's rules.
- [x] **INT-08**: Each case gets a fresh interviewer with no memory of other sessions.

### Voice Out & Avatar (VOUT)

- [x] **VOUT-01**: The interviewer speaks with a lifelike local voice that costs nothing to run (HeadTTS/Kokoro on WebGPU). Startup asserts WebGPU is in use and shows a banner if it falls back.
- [x] **VOUT-02**: Text is normalised for speech before it reaches the voice: $184M, 4.1x, 48.2%, bps, acronyms such as ARR, NRR, GRR, CAGR.
- [x] **VOUT-03**: A 3D talking-head avatar (TalkingHead.js) lip-syncs to the voice and has idle, listening and thinking behaviour.
- [x] **VOUT-04**: Claude's reply streams one sentence at a time into the voice. Measured over a session, the median time from Rishi pressing stop to the avatar's first word is at most 3 s, logged per stage.
- [x] **VOUT-05**: Barge-in. Pressing Talk while the avatar is speaking stops it immediately and cancels the stream. Only what was actually spoken is kept in the history.
- [x] **VOUT-06**: A webcam self-view tile (mirrored, never recorded) appears Zoom-style next to the avatar.

### Review Mode (REV)

- [ ] **REV-01**: The rubric scorecard uses the playbook's 6 dimensions, scored out of 30 with bands. Every score quotes evidence from the transcript, and the quote is checked against the transcript.
- [ ] **REV-02**: The flag map shows each case flag as found, found after a hint, or missed.
- [ ] **REV-03**: Deterministic checks, computed in code rather than by the LLM:
  - whether the numbers Rishi stated match the case data;
  - brevity of each answer (30–60 s ideal, over 90 s flagged);
  - whether he led with a call;
  - which sections he omitted.
- [ ] **REV-04**: Reveal. Review mode shows the 60-second ideal answer next to Rishi's opening, the key numbers, and the full transcript.
- [x] **REV-05**: Every session (transcript, timings, control log, scorecard) is stored in a local session library.
- [ ] **REV-06**: Trends across cases. A separate review agent reads the summaries of past scorecards and reports recurring weaknesses, progress by dimension, and the carried-forward "one fix".

### Quality (QA)

- [x] **QA-01**: TDD. Tests are written before the logic for every pure module and service.
- [x] **QA-02**: Tier-1 end-to-end tests (every component faked) cover every screen and the full session flow, and run on every change.
- [ ] **QA-03**: Tier-2 end-to-end tests use real speech-to-text and voice, replayed Claude responses, and WAV fixtures fed in as the mic. They cover the real voice loop.
- [ ] **QA-04**: Tier-3 live run: a full session on the packaged `.app` against the real Claude API. Live evals: no leaks, pushback when given a wrong GRR, sections completing within their cap.

## v2 Requirements

- **V2-01**: Interrupting mid-answer based on streaming transcription, and hands-free voice detection or Smart Turn.
- **V2-02**: A spoken debrief from the partner.
- **V2-03**: A suited avatar converted from Rocketbox.
- **V2-04**: Replaying audio of Rishi's own answers.
- **V2-05**: Filler-word and pace metrics.
- **V2-06**: An upgrade to a Python-sidecar voice (higher quality).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Paid TTS/avatar APIs (ElevenLabs, HeyGen) | User chose local and free |
| Live hints, on-screen scoring or a copilot during the interview | It would destroy the realism of the mock |
| Webcam recording or analysis | Privacy; the self-view is only there for feel |
| Spoken "mm-hm" backchannels | They would leak into the mic |
| Interviewer memory across cases | User: a fresh proctor for each case |
| Multi-user, cloud sync, Windows/Linux, mobile | Single-user personal tool on one Mac |
| Authoring cases in the app | Cases come from the existing pipeline |
| DCF/LBO deep dives | Saar: non-technical; basic math only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Complete |
| FND-02 | Phase 1 | Complete |
| FND-03 | Phase 1 | Complete |
| FND-04 | Phase 1 | Complete |
| FND-05 | Phase 1 | Complete |
| KEY-01 | Phase 1 | Complete |
| KEY-02 | Phase 1 | Complete |
| KEY-03 | Phase 1 | Complete |
| KEY-04 | Phase 1 | Complete |
| LIB-01 | Phase 3 | Complete |
| LIB-02 | Phase 3 | Complete |
| LIB-03 | Phase 2 | Complete |
| BAR-01 | Phase 3 | Complete |
| BAR-02 | Phase 3 | Complete |
| BAR-03 | Phase 2 | Complete |
| FLOW-01 | Phase 2 | Complete |
| FLOW-02 | Phase 6 | Complete |
| FLOW-03 | Phase 4 | Complete |
| FLOW-04 | Phase 6 | Complete |
| FLOW-05 | Phase 6 | Complete |
| FLOW-06 | Phase 2 | Complete |
| FLOW-07 | Phase 3 | Complete |
| FLOW-08 | Phase 3 | Complete |
| VIN-01 | Phase 7 | Complete |
| VIN-02 | Phase 7 | Complete |
| VIN-03 | Phase 7 | Pending |
| VIN-04 | Phase 7 | Pending |
| VIN-05 | Phase 4 | Complete |
| INT-01 | Phase 6 | Complete |
| INT-02 | Phase 6 | Complete |
| INT-03 | Phase 6 | Complete |
| INT-04 | Phase 6 | Complete |
| INT-05 | Phase 6 | Complete |
| INT-06 | Phase 6 | Complete |
| INT-07 | Phase 6 | Complete |
| INT-08 | Phase 6 | Complete |
| VOUT-01 | Phase 5 | Complete |
| VOUT-02 | Phase 2 | Complete |
| VOUT-03 | Phase 5 | Complete |
| VOUT-04 | Phase 7 | Complete |
| VOUT-05 | Phase 7 | Complete |
| VOUT-06 | Phase 4 | Complete |
| REV-01 | Phase 8 | Pending |
| REV-02 | Phase 8 | Pending |
| REV-03 | Phase 8 | Pending |
| REV-04 | Phase 8 | Pending |
| REV-05 | Phase 3 | Complete |
| REV-06 | Phase 8 | Pending |
| QA-01 | Phase 1 | Complete |
| QA-02 | Phase 3 | Complete |
| QA-03 | Phase 7 | Pending |
| QA-04 | Phase 9 | Pending |

**Coverage:** 52/52 v1 requirements mapped, 0 unmapped

---
*Requirements defined: 2026-11-03*
*Traceability updated: 2026-11-03 after roadmap creation*
