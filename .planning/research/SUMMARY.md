# Project Research Summary

**Project:** Mock Case Proctor
**Domain:** A desktop app for mock interviews by voice, running locally (Electron, macOS on Apple Silicon, one user). Claude is the interviewer, the voice and avatar run on the Mac, and the content is Lead Edge growth-equity cases.
**Researched:** 2026-11-03
**Confidence:**
- HIGH for the stack, the test seams and the shape of the case data. These were checked against the npm registry, a live spike and the real case files.
- MEDIUM for persona quality, Opus 5.5 latency and offline packaging of HeadTTS.

## Executive Summary

Several pieces chain together:
- Rishi speaks with push-to-talk, and a local engine turns his speech into text.
- A Claude interviewer streams its reply.
- A local voice engine reads the reply out loud, and a 3D avatar lip-syncs to it.
- A proctored case flow wraps all of this, and a separate grader runs at the end.

No open-source app combines these, so the plan is to assemble well-maintained libraries and write the glue:
- **Libraries:** TalkingHead.js and HeadTTS (Kokoro on WebGPU) in the window, whisper.cpp in a background process, and the Anthropic SDK in the main process.
- **What we write:** the interview state machine, the prompts and grader, and the session library.

Commercial AI case tools share documented failures: flattery, leaked answers, little pushback, math errors and generic feedback. None of them is built for PE or growth equity. Our edge has three parts:
- a skeptical partner grounded in a hidden answer key;
- a domain rubric where every score cites evidence from the transcript;
- trends across sessions.

The avatar is how that edge is delivered, not the edge itself.

**The architecture rests on one rule: the main process owns all state and secrets, and code owns the interview flow.**
- **Flow control.** A pure function in code decides the next interview step and keeps track of sections.
- **Interviewer turns.** Claude streams plain text, which goes to the voice engine a sentence at a time. Each turn ends with one record-only `interview_control` tool call, and its result rides along with the next user message, so no extra API round-trip is needed.
- **Information barrier.** The window only ever receives a redacted screen state. Interviewer content can't reach it before review mode, and a test enforces that.
- **Testability.** Every external part (Claude, speech-to-text, voice, avatar, mic, clock) has a real version and a fake one. The spike proved the test seams work: the SDK's `fetch` option and an `ANTHROPIC_BASE_URL` replay server, Chromium's fake-media switches, and a WAV-file mic. So the overnight run can do strict TDD and full end-to-end tests with Playwright for Electron, with no person present and no macOS permission prompts.

**The main risks, in order:**
1. **Latency.** Opus 5.5 always thinks before answering, so replies may take longer than 3 s. Mitigations:
   - `effort: low`;
   - the case brief cached as a system prefix of about 30–35K tokens;
   - a 6-word first chunk sent to the voice engine;
   - push-to-talk, which removes the wait to detect the end of an answer;
   - timestamps for every stage.

   The model ID is one config value, so switching models is cheap if the measurements call for it.
2. **Answer-key leaks.** Mitigations: types that can't carry interviewer content, an end-to-end test that watches the messages to the window, and a word-overlap guard before speech.
3. **The model losing the section flow.** Mitigation: code owns the section plan, the turn caps and the minimums.
4. **Failures that only show up in the signed `.app`.** Examples:
   - the macOS permission entitlements missing from `entitlementsInherit`;
   - native files not unpacked from the app archive (`asarUnpack`);
   - the voice engine quietly falling back from WebGPU to WASM;
   - assets loaded from a CDN.

   Mitigations: an early smoke test of the packaged app, and checks at startup that each engine is on the expected backend.

## Resolved Decisions (orchestrator, 2026-11-03)

These close the open questions raised in FEATURES.md and ARCHITECTURE.md. They are locked requirements.

| Decision | Detail |
|---|---|
| Warm-up position | A 5–10 minute chat, skippable, **before** the 45-minute review (Saar's format). The default setting is `warmupPosition: 'before'`. |
| Presentation | **The avatar never interrupts** the opening presentation. Interruptions happen only during the grilling. |
| Grilling length | A target of about **25 minutes**, configurable per session. It sets the turn caps for each section. |
| Brevity | 30–60 s is ideal and anything over 90 s is flagged. During the grilling the avatar **may interrupt after about 90 s**. A timer in code triggers this, not live transcription. |
| Who controls the flow | **Code owns the section flow.** <br>– Section order comes from a structured extraction of Rishi's opening. <br>– Each section has a probe checklist and turn caps (soft cap about 4–6, plus a hard cap). <br>– Claude writes the spoken wording and calls `interview_control`. The model proposes; the code decides. |
| Turns and interrupting the avatar | Turns are driven by a button. Pressing Talk while the avatar speaks interrupts it. **No automatic speech detection in v1**: vad-web, Smart Turn and onnxruntime-web are not installed. |
| Storage | JSON files validated with zod. `session.json` is rewritten safely after every turn (written to a temp file, then renamed). `scorecard.json` is written once. |
| Interviewer model | `claude-opus-5-5`, with latency measured every turn. The model ID is a **single config value**. |
| API key | The user pastes the key in Settings. It is checked with a live test call and stored encrypted via `safeStorage`. In development it fills in automatically from the `ANTHROPIC_API_KEY` environment variable or `.env` (symlinked from keymgr). It is never hardcoded and lives only in the main process. |

## Key Findings

### Recommended Stack

Full version pins are in STACK.md. Every version was checked on 2026-11-03, and the key test claims were proven in a live Electron 45 + Playwright spike on this Mac.

**Core technologies:**
- **Electron 45.2.1 (the shell).**
  - Ships Chromium 156 with WebGPU on Metal.
  - The template pins version 44, so bump it.
  - Electron 45 runs Node 24, while the dev machine runs Node 22.
- **electron-vite 6, Vite 8, React 19, TypeScript ^5.9.3.** **Do not take TypeScript 7**: typescript-eslint only supports versions below 6.1.
- **`@anthropic-ai/sdk` 1.4.0 (main process only).**
  - `messages.stream()` for the interviewer and `zodOutputFormat()` for the grader.
  - Test seams are built in: the `fetch` option and the `ANTHROPIC_BASE_URL` environment variable.
- **`whisper-cpp-node` 0.2.12 (speech-to-text).**
  - A statically linked Metal build. **The same binary loads in Vitest (Node 22) and in Electron (Node 24) without a rebuild.**
  - Takes a finance-vocabulary `prompt`.
  - Fallback: Homebrew's `whisper-cli`, behind a single `transcribe()` function.
- **`@met4citizen/talkinghead` 1.8.2 with `three@0.186.1` exactly (the avatar).**
  - three 0.187, npm's latest, is outside TalkingHead's supported range.
  - Copy the module into the repo and import its English lip-sync file directly.
- **`@met4citizen/headtts` 1.3.0 (the voice).** Runs Kokoro-82M on WebGPU and returns mouth shapes and word timings. By default it downloads its models from Hugging Face.
- **react-pdf 11 (PDF display).** **Never install `pdfjs-dist` directly.** react-pdf pins version 6.3.289, and a mismatch breaks its worker.
- **zod 4.6.7.** One schema for each saved file and for each structured output from Claude.
- **Testing.** Vitest 5.1 (a `main` project in Node and a `renderer` project in jsdom), Testing Library, and Playwright 1.64.1 for Electron. Audio fixtures are generated with macOS `say`.
- **Avoid:**
  - better-sqlite3: needs a separate build for each Node version;
  - keytar: archived;
  - smart-whisper: not updated since 2024;
  - MSW and nock: the SDK's `fetch` option covers mocking;
  - loading three or HeadTTS from a CDN.

**End-to-end facts proven in the spike:**
- On macOS, `--use-file-for-fake-audio-capture` delivers **silence unless `--disable-features=AudioServiceSandbox` is also passed**.
- WebGPU works in windows launched by Playwright, including hidden ones.
- The fake-media UI flags skip the macOS permission prompts.

### Expected Features

**Must have:**
- **Case library.** All 12 cases, with completed ones greyed out. A retake is an explicit action that always starts a new session. The library shows only fields that are safe for the candidate to see.
- **Session flow.** Warm-up, then review, presentation, grilling, wrap-up, scoring and review mode. Saved after every turn and resumable after a crash.
- **A hard information barrier.** Interviewer data stays in the main process until review mode, and a test enforces it.
- **Proctored review.**
  - The interviewee PDF shown in the window.
  - A 45-minute countdown based on a fixed end time.
  - A spoken 10-minute warning.
  - A Ready button to skip ahead.
- **Presentation.** Timed and never interrupted. Afterwards, the section order is extracted from what he said. Standard sections he never raised are added at the end, and leaving them out counts against him.
- **Answers.** Push-to-talk with a timer for each answer, and local speech-to-text primed with the case glossary.
- **The partner.**
  - A voice that starts within 3 s.
  - Lip-sync, plus idle and listening behaviour (visual nods only).
  - A webcam self-view: mirrored and never recorded.
- **Grilling grounded in the answer key.**
  - Each section has a framing question, a probe checklist and turn caps.
  - The pushback moves come from the playbook, with rules against flattery.
  - It calls out BS and wrong numbers live, checked against the case data.
  - Pressing Talk interrupts the avatar, and the session closes naturally.
- **Review mode.**
  - The playbook's 6-part rubric, scored out of 30 with bands. Each score quotes evidence from the transcript and names the answer-key item it relates to.
  - A flag map: each flag found, missed, or found only after a hint.
  - Checks computed by code, not the model: numbers against the case JSON, brevity per answer, and whether he led with a call.
  - The full transcript, with the interviewer package revealed.
- **Session history.** A local session library, trends computed by code, and a written summary from the review agent based on short summaries of past scorecards.

**Should have (mostly cheap to add):**
- An interviewer built around Lead Edge's lens: the Lead Edge 8, gross retention first, public comps as the anchor, and working back to 3x.
- The mandatory move: "You said yes. I think it's a pass. Convince me." His response is scored as fold, defend with data, or bluff.
- Probing on "what the deck didn't show you".
- Hint-aware scoring. Hints are logged in `interview_control` and allowed only after 2 failed probes.
- Carrying the "one fix" from the last session into the next one. Only the reviewer checks it, not the interviewer.
- A suggestion for the next case, based on his score band and weakest dimension, and a readiness view against the 26-point band.
- Replay of his own answers (the audio for each turn is already captured).

**Defer to v2 or later:**
- Interrupting mid-answer based on live transcription. The 90-second timer covers v1.
- Automatic speech detection, Smart Turn, and hands-free interrupting.
- A spoken debrief (written first), filler-word counts, and a suited avatar converted from Rocketbox (needs Blender and a person).
- A voice upgrade that runs in a Python sidecar.

**Never build:**
- Live hints, a copilot or on-screen scoring.
- Webcam analysis or recording.
- Spoken "mm-hm"s over an open mic.
- Interviewer memory across cases.
- Multiple interviewer personas.
- Grading numbers with the model alone.

### Architecture Approach

All logic lives in the main process:
- **The interview logic** is a pure function in `interview-machine.ts`, plus a small runner (`SessionRunner`) that carries out its side effects.
- **`CaseLibrary`** builds two things from `_work/data/case_NN.json`, with `{token}` placeholders filled in: an `InterviewerBrief` that never leaves the main process, and a `CaseCard` that is safe for the candidate.
- **`InterviewerAgent`** holds the prompt, the cached brief, `interview_control`, the proctor notes, the sentence splitter and the code that makes text speakable.
- **`ReviewerAgent`** is a separate agent.
- **`Metrics`** is pure code, and **`SessionStore`** saves sessions.

Speech-to-text runs in a separate Electron utility process, so a crash there can't take down the session. The window only displays the screen state and handles media: the mic, the HeadTTS worker, TalkingHead and the webcam.

The state of each turn is sent to Claude as a tagged `<proctor>` block placed after the tool result. Mid-conversation system messages are not confirmed for Opus 5.5, so they are not used. This keeps the conversation history append-only and the cached prefix stable.

**Major components:**
1. **interview-machine (pure code).**
   - Covers the phases, the section plan, turn caps and minimums, and timers, all as data.
   - Ignores "sufficient" on a section's first turn.
   - Checks that `next_section` is a valid next step.
   - Treats a missing tool call as "still probing".
2. **CaseLibrary.**
   - Scans the cases and fills in the placeholders. Verified: none are left unfilled across all 12 cases.
   - Splits the brief from the card.
   - Extracts the interviewee deck text, so the model knows what was *not* shown.
   - Builds the speech-to-text vocabulary prompt.
   - Reads only from `data/` and skips the interviewer PDF text.
3. **InterviewerAgent.**
   - Streams text, splits it into sentences, and sends each one to the window to be spoken.
   - Holds `interview_control` until the stream ends.
   - Cancels the stream when Rishi interrupts, and saves only the sentences actually spoken to the history.
4. **Speech queue in the window.**
   - Plays sentences through the voice engine and avatar in order, acknowledging each one back to the main process.
   - When Rishi interrupts, playback stops locally in under 50 ms before the main process is told.
5. **ReviewerAgent.**
   - Makes two calls. The scorecard uses structured output and is never changed once written; trends are recomputed from the summaries.
   - Gets no access to the session store, so the interviewer can't have memory across cases by design.
6. **Swappable parts.**
   - An environment variable picks the real, fake or replay version of each part. There are three test tiers:
     - **T1:** all fakes, on every commit.
     - **T2:** real speech-to-text and voice, replayed Claude responses and a WAV-file mic, at every phase gate.
     - **T3:** everything real, before sign-off (tagged `@live`).

**Conflicts between the research files, and how they were resolved:**
- **Case data:** a JSON brief, not the interviewer PDF sent as a document. avatar_shell suggested the PDF; ARCHITECTURE's approach wins.
- **Turn state:** tagged proctor notes, not system messages.
- **Interviewer output:** spoken text followed by a record-only tool call, not a streamed JSON wrapper around the spoken text.
- **Saving sessions:** `session.json` rewritten safely each turn, not the append-only JSONL that PITFALLS proposed. The rename is atomic on macOS's APFS disk format, and the locked storage decision is JSON with zod. `ponytail:` switch to an append-only log if a session file grows past a few MB.

### Critical Pitfalls

1. **The model owns the flow, so sections loop, get skipped or come out of order.**
   - Code owns the flow. A separate call extracts the section order, code enforces the turn caps, and each turn tells the model the current section and its remaining probes.
   - Adding this later means a rewrite, so it comes first.
2. **Answer-key leaks**, either through the messages to the window and DevTools, or through the model's own words. Prevention:
   - types that can't carry interviewer content;
   - a file handler that never serves `*_interviewer_package.pdf`, and validation of the case ID;
   - an end-to-end test that watches every message sent to the window;
   - separate `<deck_facts>` and `<evaluation_key>` sections in the prompt;
   - a guard before speech that blocks quoted runs of 8 or more words from the answer key;
   - Rishi's turns wrapped as `<candidate_said>`, plus a "tell me the answer key" test.
3. **Delays adding up past 3 s.**
   - From day one, every turn records four timestamps: when he stopped, when the transcript was ready, when Claude's first text arrived, and when the first audio played.
   - Use `effort: low`. Cache the system prefix, and check that the cache is being read from turn 2 onwards.
   - Send the first 6 words to the voice engine right away, and prepare the next sentence while the current one plays.
   - Warm up the engines during the 45-minute review, and show a "thinking" animation to cover the gap.
   - Long answers (60–120 s) slow down the final transcription pass. Measure it, and if needed, transcribe in chunks while he's still talking.
4. **Failures that only happen in the packaged app.**
   - Mic and camera entitlements must be in **both** `entitlements` and `entitlementsInherit`, with usage descriptions.
   - Ask for media access from the main process first.
   - Add a mic-check level meter, because a mic can connect and still record silence.
   - Unpack the native files from the app archive (`asarUnpack`).
   - Copy three, TalkingHead, HeadTTS and transformers.js into the app; load nothing from a CDN.
   - At startup, check that Whisper is on Metal and HeadTTS reports WebGPU. A silent fallback to WASM is about 6x slower.
   - Keep the app's signing identity the same, so macOS keeps the mic and camera permissions.
5. **The voice and transcription engines mangling numbers.**
   - Before speech, a table-driven function rewrites text so it can be read aloud: `$184M`, `4.1x`, `%+`, `bps`, ranges and acronyms. The prompt also asks Claude to write for speech.
   - Before transcription, skip Whisper when the recording is near-silent, judged by volume and length (there is no speech detection in v1).
   - Filter Whisper's made-up phrases, collapse repeated phrases, and keep its prompt short.
   - Grading compares numbers through a parser that reads value, unit and scale with a tolerance, never as raw strings.
6. **The persona drifting:** too nice, monologuing, or giving away answers.
   - Keep replies short: about 150 tokens, 1–3 sentences, one question. Code trims anything past about 4 sentences.
   - Use a list of banned phrases and example turns from the pushback scripts.
   - Hints are allowed only when code says so.
   - Test it with a "rubber stamp" check: a wrong GRR must get pushback.
7. **Inconsistent grading.**
   - Code computes timings, brevity and numbers. The model judges only the qualitative rows, and each judgment must quote evidence that is checked to actually appear in the transcript.
   - Save the grader's model and prompt version with each record.
   - Test with fixture transcripts by checking that scores come out in the right order, not their exact values.

**Also watch for:**
- The sentence splitter breaking on `4.1x`, `$1.5B` and `e.g.`.
- Stale audio playing after an interruption. Cancel by turn ID.
- Keeping the history truthful after an interruption: turns must alternate and the history must end on Rishi's turn.
- The audio engine starting paused. Kokoro outputs 24 kHz audio, while Whisper expects 16 kHz.
- Timers: count down from a fixed end time, set `backgroundThrottling: false`, and keep the Mac from sleeping (`powerSaveBlocker`).
- The avatar: create one instance for the app's lifetime and cap it at 30 fps.
- Echo: because the mic is only on while the button is held, most echo is avoided. Recommend headphones, and test once with laptop speakers only.

## Implications for Roadmap

Nine phases are suggested. Each phase swaps a fake part for the real one, and the T1 tests must stay green throughout.

### Phase 1: Scaffold, Test Harness, Security Baseline

**Why first:** every later phase depends on the test seams and on knowing the packaged app works. PITFALLS 2 and 12 both say these hooks must exist from day one; added later, they mean a rewrite.

**Delivers:**
- The electron-vite app pinned per STACK, and the private GitHub repo.
- `.gitignore` covering `.env`, models, sessions and case data, plus a secret-scan test.
- Vitest projects for the main process and the window.
- A Playwright-for-Electron harness on the built app, including:
  - the end-to-end switches (fake media plus `AudioServiceSandbox`);
  - skipped permission prompts;
  - the `ANTHROPIC_BASE_URL` replay server.
- The Settings and API-key flow: encrypted storage, auto-fill from the environment or `.env`, and a live test call.
- A custom `app://` file protocol and a content security policy (allowing `wasm-unsafe-eval`).
- A test that checks the entitlements file.
- One smoke test of the packaged `.app`.

**Covers:** API key onboarding, the repo and secrets requirements, and the TDD and end-to-end testing requirement.
**Avoids:** Pitfalls 1, 2 and 12, and keys leaking into logs or the window.

### Phase 2: Core Domain Logic (pure code, test-first)

**Why next:** pure functions are the fastest wins for TDD, and every later piece plugs into these contracts.

**Delivers:**
- Shared types and the contract for messages between processes.
- The section catalog, mapped to the rubric rows.
- The interview state machine:
  - warm-up before the review;
  - a presentation phase with no interruptions;
  - grilling with a plan, caps and minimums;
  - a configurable grilling length.
- `CaseLibrary`: fills in placeholders, splits the brief from the card, extracts the deck text and builds the speech-to-text prompt. Tested over all 12 real cases plus a test fixture case (`case_99_fixture`).
- Small pure functions:
  - the sentence splitter;
  - the function that makes text speakable, with its pronunciation list;
  - the number parser;
  - the leak guard;
  - the metrics, with brevity bands at 30–60 s and over 90 s.

**Avoids:** Pitfalls 6, 8, 9 (the parser half), 11 and 5 (the guard half).

### Phase 3: Walking Skeleton (all fakes)

**Why now:** the whole flow should be clickable and tested end to end before the risky media work starts. Fixing the session format now protects the trends history later.

**Delivers:**
- **Session store:** validated with zod, written safely, and bad files set aside.
- **Wiring:** the session runner, the composition root and the fake parts.
- **Screens:** Library, Review, Interview and ReviewMode, all rendering the screen state.
- **Library behaviour:** completed cases greyed out (worked out from the session files), with retake.
- **Resilience and timing:** resume after a crash, and a fake clock that can speed up time.
- **The end-to-end redaction test** that watches the messages to the window.
- **A passing T1 suite.**

**Avoids:** Pitfall 5 on the data channels, interview logic leaking into React components, and corrupted storage.

### Phase 4: Proctored Review Block

**Why now:** it doesn't depend on voice, and it checks the `app://` protocol, macOS permissions and the camera early. It can run in parallel with Phases 5 and 7.

**Delivers:**
- react-pdf showing the interviewee PDF through `app://`.
- The countdown timer, the 10-minute warning hook and the Ready button.
- The UI to enter or skip the warm-up.
- The webcam tile: mirrored, 640x360, and a separate stream from the mic.
- Media permissions: the permission handler, asking for media access, and the mic-check meter.
- Keeping the Mac awake and the window from slowing down in the background.
- Optionally, a notes box.

**Avoids:** Pitfall 1, timer drift and the pdfjs version mismatch.

### Phase 5: Voice Out (voice engine and avatar)

**Why now:** this is the highest visual and packaging risk, and the interviewer persona can't be judged until it has a voice.

**Delivers:**
- **Avatar:** TalkingHead copied into the repo, with the English lip-sync file imported directly and the language set to English. Use one of the sample avatars (`avatarsdk.glb` or `brunette.glb`).
- **Voice:** HeadTTS in a worker on WebGPU, with its files copied into the app or cached. It warms up during the review and recovers if the GPU device is lost or the app resumes.
- **Speech queue:** sentences in order with acknowledgements, cancelled by turn ID on an interruption.
- **Startup check:** the voice engine must report WebGPU, or a red banner appears.
- **Behaviour:** idle, listening and thinking states.
- **Performance:** a 30 fps cap, one avatar instance for the app's lifetime, and the audio engine resumed when needed.
- **Voice audition:** compare `bm_george`, `af_heart` and others.
- **End-to-end checks** on state rather than pixels: speaking, mouth-shape count above zero, and a non-blank canvas.

**Avoids:** Pitfalls 3, 8 and 11, and memory or graphics leaks.

### Phase 6: Interviewer Agent

**Why now:** this is the core value and what sets the app apart. It depends on the state machine (Phase 2), the skeleton (Phase 3) and a voice to judge it by (Phase 5). If Phase 5 slips, it can start with captions instead of a voice.

**Delivers:**
- **The real Claude connection.**
  - `claude-opus-5-5` as a config value, `effort: low` and a cached system prefix.
  - Handling for refusals, and retries covered by a spoken filler line.
- **The persona prompt.**
  - Separate `<deck_facts>` and `<evaluation_key>` sections.
  - Rules for writing to be spoken, a list of banned phrases and example turns.
- **Section control.**
  - The `interview_control` tool, with its result passed along on the next user message.
  - A structured call that extracts the section order from his opening.
  - Proctor notes giving the current section, remaining probes, turn count, elapsed time and whether a hint is allowed.
- **Interview moves.**
  - The mandatory "convince me it's a pass" move, and probing on what the deck didn't show.
  - The 90-second interruption during the grilling, and a natural close.
  - The warm-up chat prompt.
- **Safety and testing.**
  - The leak guard placed before speech.
  - Record and replay fixtures.
  - Live tests (`@live`): no leaks, pushback on a wrong GRR, sections completing within a set number of turns, and cache hits.

**Avoids:** Pitfalls 5, 6, 7 and 10.

### Phase 7: Voice In and Interrupting (closes the loop)

**Why now:** it needs the live avatar and the agent. Once it lands, the core voice loop is complete.

**Delivers:**
- **Push-to-talk capture** at 16 kHz, with the sample rate checked.
- **Whisper turbo** in a utility process, with the case-specific prompt and a startup check that it's on Metal.
- **Cleaning the transcript:**
  - a silence check based on volume, which returns "no answer";
  - a filter for made-up phrases;
  - collapsing of repeated phrases.
- **Latency timestamps** on every turn.
- **T2 tests** with WAV fixtures generated by `say`, plus 3–5 real recordings.
- **Interrupting with the button:** playback stops locally, the main process is told, the Claude stream is cancelled, and only the spoken text stays in the history.
- **One echo test** with laptop speakers only.
- **A measurement** of transcription delay on long answers. Chunked transcription gets built only if the measurement calls for it.

**Avoids:** Pitfalls 4, 9 and 10, and the pitfall of an untruthful history after an interruption.

### Phase 8: Review Mode and Trends

**Why now:** it needs real transcripts and the `interview_control` log to tune against. The review screen already exists with a fake reviewer from Phase 3.

**Delivers:**
- **The scorecard** from the review agent (structured output, `effort: high`):
  - the 6 rubric rows, each with a quote checked to appear in the transcript;
  - the flag map: found, missed, or found after a hint.
- **Checks done by code:** numbers, brevity, and whether he led with a call.
- **The reveal:** the answer key, the 60-second ideal answer next to his opening, and the transcript.
- **Trends:** tables computed by code, plus a written summary based on short summaries of past scorecards.
- **Follow-ups:** the carried-forward "one fix", the next-case suggestion and the readiness view.
- **Audio replay** of his answers.
- **Record-keeping:** the grader's model and prompt version saved with each record.
- **Tests:** fixture transcripts that check scores come out in the right order.

**Avoids:** Pitfall 13, and the reviewer seeing the raw history.

### Phase 9: Packaged Hardening and Live Sign-off

**Why last:** per voice_pipeline.md, Metal, WebGPU and the macOS permissions must be checked in the packaged app, not just when running in development.

**Delivers:**
- A T3 run on the packaged `.app`: signed locally, Apple Silicon only, native files unpacked, and models stored in the app's user data folder.
- An offline run, with only the connection to Claude allowed.
- A test that macOS asks for permissions again after `tccutil reset`.
- A check for memory growth across 3 back-to-back sessions.
- A report of median latency against the 3-second target.
- The full "Looks Done But Isn't" checklist from PITFALLS.md.

### Why This Order

- **Contracts first, then fakes, then one real part at a time.** The contracts and the state machine come first (Phase 2), then the skeleton on fakes (Phase 3). After that, each risky part (Phases 4, 5 and 7) or the agent (Phase 6) replaces one fake behind its interface while the T1 tests stay green. This follows the build order in ARCHITECTURE.
- **Cheap now, a rewrite later.** The information barrier and code-owned section flow cost little on day one and a rewrite later. That's why the redaction types are in Phases 2–3 and the state machine is in Phase 2.
- **Parallel work.** Phases 4, 5 and 7 touch separate parts and could run in parallel after Phase 3. Phase 6 can go ahead with captions instead of a voice.
- **The interviewer's log comes before the scorecard.** It is designed in Phase 6, not Phase 8, because hint-aware scoring and the flag map depend on it (see the dependency note in FEATURES.md).
- **Transcription quality comes before grading.** The vocabulary prompt and number handling arrive with the voice work (Phases 2 and 7), not with grading, because grading can only be as good as the transcript.

### Research Flags

**Phases that will likely need `/gsd:research-phase`:**
- **Phase 5:**
  - running HeadTTS offline, and copying transformers.js and the model into the app;
  - loading them from `app://`, which may need a patch to the worker;
  - the exact method names that connect HeadTTS to TalkingHead's `speakAudio`;
  - whether TalkingHead has a way to dispose of itself;
  - the animation retargeting setup for `avatarsdk.glb`.
- **Phase 6:**
  - Opus 5.5's time to first token at `effort: low` with about 35K tokens of cached prefix (measure this first);
  - whether the API accepts a text-only assistant turn after earlier turns that included thinking, which matters for interruptions;
  - whether the `server-side-fallback` setting affects tool use.
- **Phase 7:**
  - how long Whisper turbo's final pass takes on 60–120 s answers;
  - whether Chromium's echo cancellation removes the avatar's own audio (only matters with laptop speakers).

**Phases with standard patterns (skip research):**
- **Phase 1:** proven in the spike; follow STACK.md.
- **Phase 2:** pure TypeScript, and the case data has already been inspected.
- **Phase 3:** standard Electron messaging plus JSON files.
- **Phase 4:** react-pdf, a countdown timer and the webcam.
- **Phase 8:** zod structured output plus metrics computed by code.
- **Phase 9:** the checklist already exists.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions checked on npm today. The spike proved that the Whisper binding loads in both Node versions, that the fake-mic flags work and that WebGPU runs under Playwright. MEDIUM on the long-term upkeep of `whisper-cpp-node`, which has a single maintainer. |
| Features | HIGH on the format and rubric, MEDIUM on the market | The format, rubric and pushback bank come from Rishi's own playbook. The competitor survey relies on third-party listings. |
| Architecture | HIGH | How tool calls work was checked against the official docs: the tool result must come first, and forcing a tool call returns an error (400) on Opus 5.5. The case JSON was inspected and every placeholder fills in. MEDIUM on how history behaves after an interruption, since thinking is always on. |
| Pitfalls | MEDIUM | macOS permissions and Whisper's made-up phrases are well documented. Echo cancellation with web audio and TalkingHead's cleanup are unverified and need to be tested. |

**Overall confidence:** HIGH that it can be built. MEDIUM that it will feel like a real partner, which depends on tuning the persona and on Opus 5.5's latency. Neither can be settled until it's measured.

### Gaps to Address

- **Opus 5.5 latency vs. the 3-second target.** Measure it in Phase 6 with per-stage timestamps. If the median is still over 3 s after `effort: low` and caching, tell Rishi. Switching to a smaller model is his call and a single config change.
- **HeadTTS running offline.** For v1, accept a one-time model download from Hugging Face into a cache on first run. Full copying into the app is flagged for Phase 5 research.
- **Silence and made-up transcripts without speech detection.** The v1 plan is a volume-and-length check plus a phrase filter. Test it with silent and near-silent fixtures.
- **Transcription delay on long answers.** Measure it before building chunked transcription.
- **Choice of voice.** Kokoro's US male voices are weak. Audition the British male and the strong female voices on real case lines before settling the persona.
- **How the avatar looks.** Use a sample avatar for now (non-commercial licence, fine for personal use). A suited Rocketbox avatar needs a person working in Blender, so it is deferred.
- **Echo with laptop speakers.** The plan is the button-controlled mic plus a recommendation to wear headphones. A loopback-connection fix gets a spike only if needed.

## Sources

### Primary (HIGH confidence)
- npm registry checks on 2026-11-03: versions, compatible dependency ranges, the SDK's `fetch` and base-URL seams, and the native interface in whisper-cpp-node. See STACK.md.
- A local spike with Electron 45.2.1 and Playwright 1.64.1: fake media, the `AudioServiceSandbox` flag, WebGPU on `apple/metal-3`, hidden windows and Node 24.
- Claude docs: defining tools and the restriction on forced tool calls in Opus 5.5; handling tool calls (tool result first).
- Inspection of `lead_edge_mock_cases/_work/data/case_02.json`, placeholder coverage across all 12 cases, and PDF text sizes.
- Rishi's Lead Edge Mock Case Playbook (format, rubric, pushback bank, debrief) and `.planning/PROJECT.md`.
- The TalkingHead, HeadTTS and HeadAudio READMEs and source code, and Playwright's Electron docs.

### Secondary (MEDIUM confidence)
- Road to Offer and PrepLounge, on how AI case tools fail.
- Write-ups on Electron's macOS permission entitlements (bigbinary, electron issue #29861).
- whisper.cpp issues about made-up transcripts and the `no_speech_thold` setting.
- QA Wolf on injecting web audio (one fake file per browser instance).
- Claude release notes (thinking can't be turned off on Opus 5.5).

### Tertiary (LOW confidence)
- Mid-conversation system messages on Opus 5.5 (not confirmed, so not used).
- Whether Chromium's echo cancellation uses web audio output as its reference.
- TalkingHead's cleanup API.
- Third-party listings for Yoodli, Final Round AI and others.

---
*Research completed: 2026-11-03*
*Ready for roadmap: yes*
