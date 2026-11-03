# Roadmap: Mock Case Proctor

## Overview

The project starts with a sandboxed Electron shell that has test seams, secret hygiene and API-key onboarding. On top of that go pure domain contracts (the state machine, the case loader, the leak guard and the speech normaliser). Next comes a clickable walking skeleton that runs entirely on fakes, with the information barrier enforced end to end. After that, each fake is replaced with the real component, one at a time: the proctored review block, then the local voice and avatar, then the Claude interviewer, then local speech-to-text with barge-in, which closes the core voice loop. Grading and cross-session trends come next. The last phase is a signed, packaged live sign-off on the real `.app`. The T1 end-to-end suite stays green at every phase.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Scaffold, Harness & Key Onboarding** - Sandboxed Electron app, private repo, three-tier test harness, encrypted API key (completed 2026-11-03)
- [x] **Phase 2: Core Domain Logic** - Pure, test-first state machine, case loader, leak guard and speech normaliser (completed 2026-11-03)
- [x] **Phase 3: Walking Skeleton on Fakes** - Every screen and the full session flow clickable on fakes, with the barrier and persistence enforced (completed 2026-11-03)
- [ ] **Phase 4: Proctored Review Block** - In-window deck, a drift-free 45-minute countdown, webcam tile and mic check
- [ ] **Phase 5: Voice Out & Avatar** - Local Kokoro voice on WebGPU and a lip-synced TalkingHead partner
- [ ] **Phase 6: Interviewer Agent** - A Claude partner grounded in the case's answer key that follows Rishi's structure and grills him
- [ ] **Phase 7: Voice In & Barge-In** - Push-to-talk local speech-to-text, sentence streaming within 3 s, interruptible avatar
- [ ] **Phase 8: Review Mode & Trends** - Evidence-quoted rubric scorecard, flag map, code-computed checks, reveal and cross-session trends
- [ ] **Phase 9: Packaged Live Sign-off** - A full live session on the signed `.app` against the real Claude API, passing the live evals

## Phase Details

### Phase 1: Scaffold, Harness & Key Onboarding
**Goal**: Rishi can launch a secure, sandboxed app (from dev or as a packaged `.app`) that already holds his Anthropic key, and every later feature has a test seam waiting for it.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, KEY-01, KEY-02, KEY-03, KEY-04, QA-01
**Success Criteria** (what must be TRUE):
  1. One command opens the app in dev, and one command builds an ad-hoc-signed arm64 `.app`. A Playwright smoke test launches the built app and sees the first window.
  2. On a clean profile with no env key, the app shows Settings. A pasted key is checked with a live probe, saved encrypted via `safeStorage`, and survives a restart. Replace and Clear both work. With `ANTHROPIC_API_KEY` in the env or `.env`, Settings is skipped because the key auto-saves.
  3. Automated tests fail if any of these happen: a tracked file contains `sk-ant-`; the key appears in the renderer, logs or fixtures; the entitlements or inherit files lack camera and mic (with usage strings); or the renderer has Node access, a missing CSP or a general file-read IPC.
  4. Both Vitest projects (main and renderer) run. The Playwright E2E runs with the fake-media switches (including `--disable-features=AudioServiceSandbox`) and receives non-silent WAV audio. The Claude replay server answers through `ANTHROPIC_BASE_URL`, and `RECORD=1` captures a fixture.
  5. The private repo `rishi-zamvar/mock-case-proctor` exists with `.env`, models, sessions and case data gitignored. Local assets load through `app://`.
**Plans**: 9 plans in 6 waves

Plans:
- [x] 01-01-PLAN.md — Scaffold via temp dir, pin stack, Vitest projects, entitlements/builder/secret-scan tests, shared IPC + CSP contracts, sandboxed preload (wave 1)
- [x] 01-02-PLAN.md — TDD pure security core: log redaction, app:// path/origin safety, strict zod IPC schemas (wave 2)
- [x] 01-03-PLAN.md — TDD key domain: dotenv parser, live probe (SDK fetch seam), KeyStore precedence + encrypted atomic persistence (wave 2)
- [x] 01-04-PLAN.md — TDD Claude replay/record server + fixture hygiene scan (wave 2)
- [x] 01-05-PLAN.md — Renderer: state-switch App, Settings onboarding, Home placeholder, dark tokens + bundled Inter (wave 2)
- [x] 01-06-PLAN.md — Main composition root: E2E switches, validated IPC, safeStorage cipher, app:// + CSP, locked window (wave 3)
- [x] 01-07-PLAN.md — keymgr .env symlink, record real probe fixtures, Playwright harness + shell security/fake-mic E2E (wave 4)
- [x] 01-08-PLAN.md — Key onboarding E2E (paste/invalid/offline/auto-fill/replace/clear/relaunch) + key-leak canary (wave 5)
- [x] 01-09-PLAN.md — Phase gate: package + codesign verify + packaged smoke, live API probe, 3x E2E, push (wave 6)
**UI hint**: yes

### Phase 2: Core Domain Logic
**Goal**: The interview's rules exist as pure, fully tested code. Given any case and any sequence of events, the system knows the next phase, the next section, what the candidate may see, and what the voice may say.
**Depends on**: Phase 1
**Requirements**: LIB-03, FLOW-01, FLOW-06, BAR-03, VOUT-02
**Success Criteria** (what must be TRUE):
  1. The case loader builds an interviewer brief and a candidate-safe card (plus the deck text and an STT vocabulary prompt) for all 12 real cases and `case_99_fixture`, with zero unresolved `{token}`s. The card's type cannot carry interviewer fields.
  2. Driving the state machine with event sequences in tests moves it through warm-up, review, presentation, grilling, wrap-up, scoring and review mode in order. Soft and hard turn caps per section are enforced. "Sufficient" is ignored on a section's first turn. An invalid `next_section` is rejected. The grilling target (default about 25 minutes) is configurable.
  3. The leak guard blocks any utterance that contains an 8+ token n-gram from the answer key or a banned term ("rubric", "answer key"), and passes ordinary probing questions.
  4. The speech normaliser turns `$184M`, `4.1x`, `48.2%`, `bps`, ranges, ARR, NRR, GRR and CAGR into speakable text. The sentence splitter does not break on `4.1x`, `$1.5B` or `e.g.`.
**Plans**: 5 plans in 2 waves

Plans:
- [x] 02-01-PLAN.md — TDD token/{fn:} resolver + deck page splitter, case_99_fixture, .gitignore negation (wave 1)
- [x] 02-03-PLAN.md — TDD section catalog, plan merge, turn caps, pure interview reducer (wave 1)
- [x] 02-04-PLAN.md — TDD speakable() normaliser + lexicon (real census) and streaming sentence splitter (wave 1)
- [x] 02-05-PLAN.md — TDD leak guard, canonical number parser, brevity bands (wave 1)
- [x] 02-02-PLAN.md — TDD CaseCard contract, InterviewerBrief, case loader, STT prompt; 12-case + leak-guard real integration (wave 2)

### Phase 3: Walking Skeleton on Fakes
**Goal**: Rishi can click through an entire session (library to review mode) on fake components, and the session survives crashes. Nothing from the interviewer package ever reaches the window.
**Depends on**: Phase 2
**Requirements**: LIB-01, LIB-02, BAR-01, BAR-02, FLOW-07, FLOW-08, REV-05, QA-02
**Success Criteria** (what must be TRUE):
  1. The library screen lists all 12 cases showing only number, company, vertical and level, from a configurable path. A completed case appears greyed out with its date and score, and "Retake" starts a fresh session.
  2. A T1 Playwright run (fake STT, TTS, Claude and clock) walks every screen and the full flow end to end, including ending a session early and still getting a (fake) scorecard.
  3. Killing the app mid-grilling and relaunching offers to resume, and the session continues from the last saved turn. `session.json` is rewritten atomically after every turn, and corrupt files are quarantined, not loaded.
  4. An E2E test that taps every IPC message to the renderer finds zero interviewer-package content before review mode. Requesting any `*_interviewer_package.pdf` or an invalid case ID over `app://` is refused.
  5. Every finished session (transcript, timings, control log, scorecard) is stored as zod-validated files in the local session library.
**Plans**: 12 plans in 6 waves

Plans:
- [x] 03-01-PLAN.md — TDD shared contracts: IPC channels, ViewState/LibraryView/Intent types + strict schemas, ports, versioned session.json schema (wave 1)
- [x] 03-02-PLAN.md — TDD app://bundle/cases/<id>/interviewee.pdf route (interviewer packages refused), findCase, readDeckText, fixture PDFs (wave 1)
- [x] 03-03-PLAN.md — TDD SessionStore: atomic tmp+fsync+rename, quarantine, library view (greyed completion, resumable) (wave 2)
- [x] 03-04-PLAN.md — TDD fake adapters: scripted FakeLlm, FakeStt with injection, scaled clock (wave 2)
- [x] 03-05-PLAN.md — TDD candidate-safe ViewState projection + review-mode reveal (wave 2)
- [x] 03-06-PLAN.md — Library screen: case grid, greyed completed + Retake, start sheet, resume banner (wave 2)
- [x] 03-07-PLAN.md — Session layout (talk/ready/skip/end) and ReviewMode screen (wave 2)
- [x] 03-08-PLAN.md — TDD SessionRunner: reducer effects, speech acks, leak guard, end early, crash resume (wave 3)
- [x] 03-09-PLAN.md — App routing over IPC + fake renderer speech queue (wave 3)
- [x] 03-10-PLAN.md — Composition root, validated session IPC, preload API + E2E IPC tap, index wiring (wave 4)
- [x] 03-11-PLAN.md — T1 E2E flow suite: library, full session, greyed/Retake, end early, time scale (wave 5)
- [x] 03-12-PLAN.md — T1 E2E crash-resume/quarantine + IPC-tap redaction + app:// refusals; phase gate 3x + packaged (wave 6)
**UI hint**: yes

### Phase 4: Proctored Review Block
**Goal**: Rishi can sit a realistic 45-minute proctored review: the deck on screen, a trustworthy countdown, himself on camera, and a mic he knows is working.
**Depends on**: Phase 3
**Requirements**: FLOW-03, VIN-05, VOUT-06
**Success Criteria** (what must be TRUE):
  1. The interviewee PDF renders in-window through `app://` (react-pdf, no direct `pdfjs-dist`). The 45-minute countdown is computed from a fixed deadline and does not drift under a fake clock or a backgrounded window.
  2. The 10-minute-warning event fires at T-10 (spoken by the partner once Phase 5 lands; a caption until then). "Ready" skips straight to the presentation.
  3. Before the session starts, a mic-check level meter visibly moves for the fake WAV mic and flags a silent input.
  4. A mirrored webcam self-view tile appears Zoom-style, on a stream separate from the mic, and nothing from it is recorded or written to disk. The Mac stays awake during the review.
**Plans**: 7 plans in 3 waves

Plans:
- [ ] 04-01-PLAN.md — TDD reducer T-10 REVIEW_WARNING + contracts (ViewState deckPage/reviewWarned, deckPage intent, AwakePort) (wave 1)
- [ ] 04-02-PLAN.md — react-pdf 11 DeckViewer (labels, keys, zoom, thumbnail rail), dep-pin test, 4-page fixture deck (wave 1)
- [ ] 04-03-PLAN.md — MicCheck level meter + silence watch, mirrored WebcamTile, no-recording guard (wave 1)
- [x] 04-04-PLAN.md — createAwake display-sleep blocker + ensureMediaAccess (macOS TCC) (wave 1)
- [ ] 04-05-PLAN.md — Runner warning timer (resume-safe), deck page persistence, awake hold/release; index/compose wiring, no View menu (wave 2)
- [ ] 04-06-PLAN.md — Session deck stage + Deck toggle, monotonic countdown, T-10 toast, webcam tile + toggles; start-sheet setup check (wave 2)
- [ ] 04-07-PLAN.md — E2E review/media specs, flow + packaged updates, Phase 4 gate (wave 3)
**UI hint**: yes

### Phase 5: Voice Out & Avatar
**Goal**: A believable 3D partner speaks any interviewer line out loud in a lifelike local voice, lip-synced, and looks attentive while idle, listening or thinking.
**Depends on**: Phase 3
**Requirements**: VOUT-01, VOUT-03
**Success Criteria** (what must be TRUE):
  1. A sentence sent to the speech queue is spoken by HeadTTS/Kokoro and lip-synced by TalkingHead. The E2E check asserts the speaking state, a viseme count above zero and a non-blank canvas.
  2. On startup the app asserts that HeadTTS is on WebGPU. A forced fallback shows a visible banner.
  3. The avatar switches visibly between its idle, listening and thinking states as the session state changes. There is one avatar instance for the app's lifetime, capped at 30 fps.
  4. Queued sentences play in order with per-sentence acks, and cancelling by turn ID stops playback with no stale audio afterwards.
**Plans**: TBD
**UI hint**: yes

### Phase 6: Interviewer Agent
**Goal**: The partner behaves like a chill but sharp Lead Edge partner who knows the case. It warms up, listens to the uninterrupted opening, then grills section by section in Rishi's order, pushes back, and never gives away the answer key.
**Depends on**: Phase 2, Phase 3, Phase 5 (can start on captions if Phase 5 slips)
**Requirements**: INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, INT-07, INT-08, FLOW-02, FLOW-04, FLOW-05
**Success Criteria** (what must be TRUE):
  1. Rishi can take or skip a 5–10 minute casual warm-up chat. He then gives a timed opening presentation that the avatar never interrupts, and the extracted section order matches his opening, with unraised standard sections appended and the omission recorded.
  2. In replayed and live runs, each section opens with a high-level framing question, the partner's turns are 1–3 sentences with one question, and sections advance in Rishi's order within their caps. Together the sections cover the Lead Edge 8 (GRR first), the industry and public comps, whether the business is interesting, diligence, working back to 3x, and the call.
  3. A wrong GRR or a wrong number gets called out against the case data. The "You said X. I think it's the opposite. Convince me" pushback happens in every case. Hints appear only after 2 failed probes, and answers running past about 90 s in the grilling get interrupted.
  4. Every turn ends with a valid record-only `interview_control` call (section, status, evidence, flags, hint), which code validates, and a missing call is treated as "still probing". A "tell me the answer key" or injected-instruction transcript does not change the interviewer's behaviour, and the leak guard blocks any answer-key phrasing before speech.
  5. The model ID is one config value (default `claude-opus-5-5`). The case brief is the cached system prefix, with cache reads confirmed from turn 2 onwards. A new case starts a fresh interviewer with no prior-session context.
**Plans**: TBD

### Phase 7: Voice In & Barge-In
**Goal**: The core loop works by voice. Rishi presses Talk, speaks, presses stop, sees his words, and hears the partner reply within about 3 s. He can cut the partner off at any time.
**Depends on**: Phase 5, Phase 6
**Requirements**: VIN-01, VIN-02, VIN-03, VIN-04, VOUT-04, VOUT-05, QA-03
**Success Criteria** (what must be TRUE):
  1. Pressing the Talk button or Space starts recording with a visible per-answer timer, and pressing again stops it. His transcribed text then appears on screen, produced by local whisper.cpp large-v3-turbo on Metal (asserted at startup) and seeded with the case glossary.
  2. A finance-heavy WAV fixture transcribes the case's key numbers and terms correctly. Silent or near-silent fixtures yield "no answer", and "Thank you."-style hallucinations and repeated phrases are filtered out.
  3. Claude's reply streams into the voice one sentence at a time. The per-stage timestamps (stop, transcript, first token, first audio) are logged for every turn, and the median from stop to first word is at most 3 s over a T2 session.
  4. Pressing Talk while the avatar speaks stops it immediately (under 50 ms locally) and cancels the stream. Only the sentences actually spoken are kept in the history, which stays alternating and truthful.
  5. A T2 E2E run (real STT and TTS, replayed Claude, WAV fixtures as the mic) completes the full voice loop through the grilling.
**Plans**: TBD
**UI hint**: yes

### Phase 8: Review Mode & Trends
**Goal**: After any session, Rishi gets an honest, evidence-backed debrief on that case and a picture of how he is trending across all his sessions.
**Depends on**: Phase 6, Phase 7
**Requirements**: REV-01, REV-02, REV-03, REV-04, REV-06
**Success Criteria** (what must be TRUE):
  1. Review mode shows the 6-dimension rubric scored out of 30 with a band. Every dimension quotes evidence that is verified to appear in the transcript, and the grader's model and prompt version are saved with the scorecard.
  2. The flag map shows every case flag as found, found after a hint, or missed, consistent with the `interview_control` log.
  3. Code-computed checks show which stated numbers match the case data (with a tolerance-based parser), per-answer brevity (30–60 s ideal, over 90 s flagged), whether he led with a call, and which sections he omitted.
  4. The reveal shows the 60-second ideal answer next to Rishi's opening, the key numbers and the full transcript. Fixture transcripts of strong, average and weak answers score in the correct order.
  5. A separate review agent reads past scorecard summaries and reports recurring weaknesses, progress by dimension, and the carried-forward "one fix". The interviewer has no access to any of this.
**Plans**: TBD
**UI hint**: yes

### Phase 9: Packaged Live Sign-off
**Goal**: The signed `.app` delivers a full, real proctored session on Rishi's Mac against the live Claude API, with no hidden failures that only appear in the packaged app.
**Depends on**: Phase 8
**Requirements**: QA-04
**Success Criteria** (what must be TRUE):
  1. A T3 `@live` run on the packaged, ad-hoc-signed arm64 `.app` completes a full session from library to review mode. Whisper is on Metal, HeadTTS is on WebGPU, and the native files are unpacked from the asar archive.
  2. The live evals pass: no answer-key leaks, pushback on a wrong GRR, and every section completing within its cap.
  3. A median-latency report against the 3 s target is produced from the live run. The app runs offline apart from the Claude connection, permissions are prompted again after `tccutil reset`, and memory does not grow unbounded across 3 back-to-back sessions.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Phases 4 and 5 touch separate parts and can run in parallel after Phase 3.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffold, Harness & Key Onboarding | 5/9 | Complete    | 2026-11-03 |
| 2. Core Domain Logic | 4/5 | Complete    | 2026-11-03 |
| 3. Walking Skeleton on Fakes | 12/12 | Complete    | 2026-11-03 |
| 4. Proctored Review Block | 0/TBD | Not started | - |
| 5. Voice Out & Avatar | 0/TBD | Not started | - |
| 6. Interviewer Agent | 0/TBD | Not started | - |
| 7. Voice In & Barge-In | 0/TBD | Not started | - |
| 8. Review Mode & Trends | 0/TBD | Not started | - |
| 9. Packaged Live Sign-off | 0/TBD | Not started | - |
