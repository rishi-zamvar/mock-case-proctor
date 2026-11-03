# Feature Research

**Domain:** AI voice mock-interview proctor for a growth-equity (Lead Edge Capital) case interview. Single user, local, desktop.
**Researched:** 2026-11-02
**Confidence:** MEDIUM. The case format and rubric are HIGH, because they come straight from the user's playbook (`~/Downloads/Lead Edge Mock Case Playbook.md`). The competitor feature surveys are MEDIUM/LOW: they come from third-party listings and blogs, and some vendor pages could not be fetched (403). The voice-realism findings are MEDIUM, from research papers plus vendor guides.

## What the market does (calibration)

| Product class | Examples | What they actually do | Relevance |
|---|---|---|---|
| Generic voice interview coaches | Yoodli, Google Interview Warmup, Final Round AI | Roleplay with an avatar or voice. Post-session scorecard on delivery (filler words, pacing, conciseness, talk-to-listen ratio). Transcript. Final Round also sells a live "copilot" that feeds answers during real interviews | Only the delivery metrics and the transcript-with-highlights pattern carry over. Their content grading is generic. |
| Consulting case AIs | Road to Offer (voice, 7-dimension rubric), CaseStudyPrep.AI (voice, adaptive, grades structure/math/synthesis), PrepLounge Casebot, McKinsey's free coach (Apr 2026), AlumnAI, BCG Casey-style simulators | Library of cases, spoken answers, interviewer-led follow-ups, rubric report, some progress tracking | Closest analog. **None found are PE/growth-equity specific.** Every one is MBB-style (structure + math), not "read the numbers, make a call, defend the price." |
| Conversational video avatars | Tavus, HeyGen Interactive, Hume EVI | Lip-synced real-time avatar, emotion-aware voice, interruption handling | Sets the realism bar. Out of scope because they're paid. TalkingHead + Kokoro is the local stand-in. |

Documented failure modes of AI case interviewers (Road to Offer, CaseBasix via Road to Offer). These are the bar to beat:
1. **Sycophancy.** It praises weak answers as warmly as strong ones.
2. **Answer leaking.** It hands over the solution too early.
3. **Rare pushback.** It seldom challenges the first hypothesis.
4. **Math errors** by the model itself.
5. **Generic feedback.** Feedback isn't tied to quoted evidence.
6. **Rigid flow.**
7. **No cross-session memory.**

Conclusion: the defensible value here is not the avatar. It is **a skeptical partner grounded in a hidden answer key, scored on a domain rubric with quoted evidence, with trends over time.** Generic tools structurally cannot do this.

## Feature Landscape

### Table Stakes (missing any of these breaks the "real mock" illusion or the prep value)

Grouped by session block, following the playbook's 60-minute format.

**Library and session shell**

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Case library (12 cases, level, vertical, completed greyed, explicit retake) | Playbook rule: "pick a case he has not seen, rotate verticals" | LOW | Read from `_work/content/case_NN.json`. Show only candidate-safe fields (name, vertical, level). Never interviewer fields. |
| Session state machine (warm-up → review → presentation → grilling → review mode) with abort and resume-safe persistence | Every competitor has a linear session flow. A crash mid-grilling must not lose the transcript | MEDIUM | Persist each turn as it happens (append-only). This is the backbone everything else hangs on. |
| Hard information barrier: interviewer package never reaches the renderer before review mode | Answer leaking is the #1 documented failure. Playbook: "answer key stays with you until the debrief" | MEDIUM | Main process holds the interviewer JSON/PDF text. The renderer gets the scorecard only after the session ends. Test it as a security property (E2E: the DOM and IPC payloads contain no flag strings during the session). |

**Warm-up (optional, 5–10 min)**

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Skippable warm-up chat: "walk me through your resume / why growth equity / why Lead Edge", then the handoff line "Here's the project. You have 45 minutes…" | Matches Saar's real format and the playbook script | LOW | Same voice loop, small prompt. Not scored, or only lightly scored on poise. |

**Proctored review (45 min)**

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| In-window interviewee PDF viewer (page nav, zoom) | It's the whole block | LOW | pdf.js, or Electron/Chromium's built-in PDF viewer (cheapest: `<iframe>`/`<embed>` of the PDF). |
| Countdown timer, 10-minute warning, "Ready" skip-ahead | Playbook: "Give a 10-minute warning" | LOW | The warning should be spoken by the partner or at least sounded, not just a visual change. |
| Scratch notes plus calculator | Playbook allows pen, blank candidate pack, calculator | LOW | A plain textarea, persisted, viewable during the presentation. The calculator can be the macOS one; don't build it. Paper is also fine, so this is optional. |
| Clarifying-question answer: "assume what you'd assume in a real deal" | Playbook rule. Prevents the AI from helping during the review | LOW | No AI call needed. A canned response. Arguably skip it. |

**Presentation (~4 min)**

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Uninterrupted presentation turn, timed | Playbook: "Let him finish without interrupting. Note whether he leads with a call." | LOW | **Conflict to resolve in requirements:** PROJECT.md wants interruptions during grilling. The presentation itself should stay uninterrupted to match the playbook. |
| Extraction of the candidate's listed considerations to set section order | PROJECT.md: sections follow the order of his opening | MEDIUM | One Claude call on the presentation transcript → ordered list of sections mapped onto the canonical set (Lead Edge 8, retention, comps/price, business quality, back-solve, diligence, the call). The canonical sections he never raised get appended, and his failure to raise them is itself scored. |

**Grilling (the core)**

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Push-to-talk turns with a per-answer timer | User choice. Gives clean turn boundaries and makes brevity measurable | LOW | A visible elapsed timer while he speaks. Brevity is graded post hoc. |
| Local STT tuned for finance jargon and numbers | Wrong numbers in the transcript = wrong grading | MEDIUM | whisper.cpp with an `initial_prompt` seeded from the case glossary plus comp names (Veeva, Guidewire…) plus "ARR, GRR, NRR, CAGR, 3x". Run a number-normalization pass ("ninety-four percent" → 94%) before grading. |
| Partner voice ≤3 s to first word, with lip-sync | Core Value. Latency above 3–4 s kills the illusion | HIGH | Stream Claude tokens → sentence-chunk → Kokoro → TalkingHead visemes. Covered in `research/voice_pipeline.md`. |
| Section-by-section grilling grounded in the answer key: framing question per section, stays until the section's must-pull-outs are tested, then moves on | Core Value. The playbook's 5 priorities | HIGH | The interviewer needs **hidden per-section state**: which flags and must-pull-outs are probed, found, or missed, and when it's done. Don't rely on the LLM to "feel" when it's done. Keep a small structured scratchpad (tool call or JSON block) updated each turn, with explicit exit criteria per section and a turn cap per section so the 45-min budget holds. |
| Pushback behaviours from the playbook | These are what make it a Lead Edge VP rather than a chatbot | MEDIUM | Prompt-level rules plus the case pushback scripts plus the generic bank. Required moves: "where did that number come from in the pack"; "which single risk matters most"; "what answer would change your mind"; push hardest on his strongest claim; **"You said yes. I think it's a pass. Convince me." on every case**; disagree even when he's right. |
| Anti-sycophancy and no-feeding default | A documented failure mode of every AI case tool | MEDIUM | Persona says "may or may not feed the answer". Make feeding rare and logged, so the scorecard can discount anything found only after a hint. |
| Calls out obvious BS and wrong numbers live | PROJECT.md persona. Also the "math errors" failure mode | MEDIUM | Give the interviewer the case's numbers-to-memorize and the worked back-solve as ground truth, so it challenges against data, not its own arithmetic. |
| Barge-in: he can cut the avatar off | PROJECT.md. Standard in every 2026 voice agent | MEDIUM | With push-to-talk, the cheap version is that pressing the talk button stops TTS immediately and truncates the partner's context to what was actually spoken. No VAD or echo-cancellation problem because the mic is gated. |
| Avatar idle/listening behaviour (blink, gaze, nods while he talks) | Without it the face is a dead mannequin between turns | LOW–MEDIUM | TalkingHead has idle/mood animations. Trigger nods randomly or on pauses in his audio level. **Visual backchannels only.** Audio "mm-hm" over an open mic pollutes STT. |
| Webcam self-view tile | Zoom realism. User asked for it | LOW | `getUserMedia`, mirrored, no recording (see anti-features). |
| Partner closes the interview naturally ("Great, that's all I had") | Ending abruptly on a timer feels robotic | LOW | Triggered when all sections are done or the time budget runs out. |

**Review mode**

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Rubric scorecard: the playbook's 6 dimensions, 1–5 each, /30, with bands (26–30 ready, 20–25 close/one fix, <20 run another Level 1) | Playbook's own rubric. Every competitor has a scorecard | MEDIUM | Dimensions: Clear call, Lead Edge 8, Retention insight, Valuation & comps, Return back-solve, Business quality & poise. Each score must cite **quoted transcript evidence** plus the answer-key item it maps to, otherwise feedback goes generic (documented failure). |
| Flag map: each hidden flag found / missed / found-after-hint, with where in the transcript | Playbook debrief step 2: "Reveal the primary flag. Did you see it? Where?" | MEDIUM | Primary flag is visually distinct. Distinguish "found unprompted" from "found after prompting", because the playbook's rubric rewards finding it yourself. |
| Numbers check: every number he stated vs the case ground truth (GRR, multiple, required CAGR, exit ARR) | "Numbers right/wrong" is in PROJECT.md. LLMs mis-grade arithmetic | MEDIUM | Extract numbers with an LLM, compare **deterministically** against case JSON with tolerance bands. Don't let Claude judge correctness by itself. |
| Brevity per answer (duration, word count, flagged rambles) | User asked for brevity grading. Generic coaches all measure conciseness | LOW | Deterministic from timings. Show a per-answer bar plus a target band. Flag answers that don't lead with the point (LLM check: "first sentence answers the question?"). |
| "Led with a call in the first sentence" check on the presentation | Rubric dimension #1, and the "strong answer" template | LOW | Cheap, high-signal, deterministic-ish. |
| Debrief in playbook order: his self-assessment first ("what do you think you got right?"), then flags revealed, intended read plus back-solve, scores, **one thing to keep plus one thing to fix** | Playbook debrief script. Self-assessment before the reveal is a real coaching technique | MEDIUM | Can be spoken by the partner (nice) or written (cheaper). Written first, voice optional. |
| Full transcript with timestamps, his turns vs the partner's, linked from the scorecard evidence | Every competitor (Interview Warmup, Yoodli) has it | LOW | Already persisted by the state machine. |
| Interviewer package revealed in review (answer key, prep brief, 60-second ideal answer) | Playbook: "Nothing hidden from him after the debrief" | LOW | The ideal-answer-vs-his-opening side-by-side is the highest-value single view. |

**Cross-session**

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Local session library (transcript, timings, scores, flags, feedback) | PROJECT.md. The basis for trends | LOW | One JSON file per session, or SQLite. Deliberately boring. |
| Trends: rubric dimension scores over sessions, total vs the bands, flag find rate, avg answer length, recurring weaknesses | Playbook practice tracker ("date, case, rubric total, flag found, one fix"). Only some purpose-built tools have memory | MEDIUM | **Compute the numeric trends deterministically** (charts/tables). The review agent writes only the narrative ("you've quoted NRR instead of GRR in 3 of 4 sessions"). Give it the stored structured results, not raw transcripts, to keep context small. |

### Differentiators (where this beats every generic tool)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Lead Edge-specific interviewer brain: the 8 criteria, GRR-first, comps anchor, work-back-to-3x, "is it interesting" | No competitor found is PE/growth-equity. All are MBB structure+math | MEDIUM | Mostly prompt plus grounding data that already exists in the case library. The highest value-per-effort item in the project. |
| "Convince me it's a pass" conviction test, scored as fold / defend-with-data / bluff | Tests the exact thing the rubric's poise dimension measures. Generic tools never disagree | LOW | One mandatory move plus one scorecard field. |
| "What the deck didn't show you" probing | PROJECT.md emphasis. A real partner tell | LOW | Driven from the answer key's "not shown" items and traps. |
| Carry-forward "one fix": the last session's fix is shown before the next case and specifically tested and scored | Closes the coaching loop. Playbook says agree on one fix per session | LOW | Inject the prior fix into the review agent's scoring (not into the interviewer, which stays fresh per case). |
| Hint-aware scoring (credit discounted for things found only after the partner fed it) | Prevents the "chill partner fed me" inflation | LOW | Needs the interviewer to log feeds in its hidden state. |
| Sequenced difficulty suggestion (next case by Level and by weakest dimension; "<20 → run another Level 1") | Playbook practice progression | LOW | Rule-based from the bands. No AI needed. |
| Partner-voiced 10-minute warning and handoff | Small things that make the proctored hour feel real | LOW | Pre-generated TTS. |
| Audio replay of his own answers in review | Hearing your rambling is more corrective than reading it | LOW–MEDIUM | Keep the push-to-talk WAVs you already capture for STT. Store per turn. |
| Readiness view: rolling score vs the 26-point "ready" band across the last N sessions | Answers his actual question: "am I ready for Saar?" | LOW | A derivative of trends. |

### Anti-Features (deliberately NOT build)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Live hints, copilot, or on-screen answer suggestions during the session (Final Round AI-style) | Feels helpful | Destroys the mock's purpose. It's also the exact leak path to guard against | Hints only from the partner's mouth, logged and score-discounted. |
| Live scoring or rubric visible during the session | "Gamified feedback" | Breaks realism, invites playing to the meter, risks leaking flag names | Everything appears in review mode only. |
| Webcam analysis (eye contact, facial emotion, body language) | Yoodli/HireVue do it | Noisy, privacy-heavy, irrelevant to the Lead Edge rubric, adds a big model. Road to Offer itself says AI can't judge presence well | Self-view only, never recorded or analyzed. |
| Filler-word, "um", and pace-of-speech grading as a headline metric | Every generic coach has it | Whisper strips most fillers anyway (unreliable), and the rubric grades insight and brevity, not diction | Brevity by duration/word count plus "led with the point". Optional filler count, low weight. |
| Audio backchannels ("mm-hm", "right") while he talks | Big realism lever in full-duplex research | With an open mic they bleed into STT and need echo cancellation. Full-duplex is a research problem, not an overnight build | Visual nods. The partner's turn may open with "Right, so…". |
| VAD auto end-of-turn or full-duplex speech model | Standard in voice agents | User explicitly chose push-to-talk. Auto-cutoff mid-thought on numbers is maddening, and the brevity timer needs clean boundaries | Push-to-talk. Barge-in = pressing talk. |
| Avatar-initiated mid-answer interruption driven by streaming STT | "Real partners interrupt" | Requires streaming partial transcripts plus a continuous Claude "should I interrupt" judgement: HIGH complexity and cost, and false interrupts feel worse than none | **Ship cheap:** the partner may interrupt when an answer passes a time threshold (e.g. ~90 s: "Let me stop you, what's the one number?"), and its next turn can open with "Hold on, back up…". Revisit real mid-answer interrupts only if the cheap version feels flat. |
| Interviewer memory across cases | "Make it learn me" | Contaminates the fresh-interviewer realism. PROJECT.md forbids it | Only the review agent reads history. |
| Multiple interviewer personas, difficulty sliders, custom avatars | Feature-list bloat | One real target (Saar / a Lead Edge partner). Each persona needs its own tuning and tests | One persona, tuned well. Difficulty comes from case Level. |
| In-app case authoring, DCF/LBO drills, market-sizing math drills | Competitors have drill banks | Out of scope per PROJECT.md. The real case is non-technical | Cases come from the existing pipeline. |
| Session video recording | "Watch yourself" | Large files, privacy, little value over audio plus transcript | Per-turn audio replay. |
| LLM-only numeric grading | Simpler | LLMs mis-grade arithmetic (documented) | Deterministic number comparison against case JSON. |
| Cloud sync, accounts, sharing | Generic SaaS reflex | Single-user, local, per PROJECT.md | Local files. |

## Feature Dependencies

```
Case library (reads case JSON)
    └──> Session state machine + append-only turn persistence
            ├──> Proctored review (PDF viewer, timer, notes)
            ├──> Voice loop: push-to-talk → whisper STT (glossary prompt) → Claude stream → Kokoro TTS → TalkingHead lip-sync
            │       ├──> Barge-in (talk button stops TTS + truncates context)
            │       ├──> Idle/listening avatar behaviour
            │       └──> Warm-up chat (same loop, smaller prompt)
            ├──> Presentation turn (uninterrupted)
            │       └──> Section-order extraction
            │               └──> Section grilling with hidden per-section state (flags probed/found/fed, exit criteria, turn caps)
            │                       ├──> Pushback moves incl. "convince me it's a pass"
            │                       ├──> Time-threshold interruption
            │                       └──> Natural close
            └──> Review mode (unlocks the interviewer package for the renderer)
                    ├──> Number extraction + deterministic check vs case JSON
                    ├──> Brevity metrics (needs per-turn timings)
                    ├──> Flag map (needs the interviewer's hidden state log + transcript)
                    ├──> Rubric scorecard with quoted evidence (needs all of the above)
                    └──> Session library entry
                            └──> Trends (deterministic) + review-agent narrative
                                    ├──> Carry-forward "one fix"
                                    ├──> Next-case suggestion
                                    └──> Readiness view

Information barrier ──constrains──> every renderer-facing feature until review mode
Hint logging ──enhances──> flag map + rubric (hint-aware scoring)
Audio backchannels ──conflicts──> local STT on an open mic (hence visual-only)
VAD auto-turn ──conflicts──> push-to-talk brevity timing (hence excluded)
```

### Dependency Notes

- **The rubric scorecard depends on the interviewer's hidden state log.** If the grilling agent doesn't emit structured per-turn state (what it probed, whether he found it, whether it fed him), the reviewer has to re-derive everything from the transcript, and "found after hint" becomes impossible. Design the interviewer's structured output in the same phase as the grilling, not in the review phase.
- **Section grilling depends on presentation extraction.** The section order comes from his opening. If the extraction is wrong, the whole grilling feels off-script. Unit-test it against fixture openings.
- **Trends depend on a stable session schema.** Lock the session record (dimension scores, flags, numbers, timings, fix) before building review mode. Changing it later breaks history.
- **The information barrier crosses everything.** Decide on day one that interviewer data lives only in the main process. Retrofitting this is a rewrite.
- **STT quality gates grading quality.** Glossary seeding and number normalization must land with the voice loop, not later.

## MVP Recommendation (overnight build order)

Priority:
1. State machine plus persistence plus the information barrier (everything depends on it)
2. Voice loop with push-to-talk, barge-in and lip-sync (Core Value: "if only one thing works")
3. Answer-key-grounded section grilling with hidden state, plus the playbook pushback moves (the differentiator)
4. Proctored review block (PDF, timer, 10-minute warning, Ready)
5. Review mode: deterministic numbers and brevity checks, then the rubric with evidence, then the flag map
6. Session library plus deterministic trends plus the review-agent narrative

Then cheap wins: carry-forward fix, "convince me" scoring, time-threshold interruption, warm-up, webcam tile, audio replay, readiness view.

Defer: real streaming mid-answer interruption (only if the cheap version feels flat), a spoken debrief (written first), filler-word metrics.

## Open Questions for Requirements

- Is the presentation interruptible? The playbook says no. PROJECT.md's persona implies interruptions only in grilling. Recommendation: no.
- What is the total grilling time budget? The playbook says 5–10 min of pushback with 4–6 questions. PROJECT.md implies a much longer section-by-section grilling covering 5+ sections. This sets the turn caps per section. Recommend ~20–25 min, configurable per session.
- What are the brevity targets per answer type (framing answer vs number answer)? Suggested default: 30–60 s ideal, flag >90 s.

## Sources

- Lead Edge Mock Case Playbook (user's own, Oct 29 2026): format, interviewer guide, pushback bank, 6-dimension rubric, debrief script. HIGH.
- `.planning/PROJECT.md`: requirements and constraints. HIGH.
- [Road to Offer: How to practice case interviews with AI (2026)](https://www.roadtooffer.com/blog/practice-case-interviews-with-ai): tool landscape plus the AI failure modes (sycophancy, leaking, rare pushback, math errors, generic feedback, no memory). MEDIUM.
- [Road to Offer: Free AI tools for case prep (2026)](https://www.roadtooffer.com/blog/free-ai-tools-for-case-interview-prep), [Hacking the Case Interview: Best AI tools (2026)](https://www.hackingthecaseinterview.com/pages/best-ai-tools-case-interview-practice) (403, not read), [PrepLounge: AI interview prep](https://www.preplounge.com/en/articles/ai-interview-preparation), [McKinsey free AI coach (TNW)](https://thenextweb.com/news/mckinsey-ai-interview-practice-tool-lilli-consulting). LOW–MEDIUM.
- Yoodli feature listings ([G2](https://www.g2.com/sellers/yoodli-fa360256-cb67-44e2-bc23-e70b58203cc8), [Outdoo comparison](https://www.outdoo.ai/blog/yoodli-alternatives)): delivery metrics (filler words, pacing, conciseness, talk-to-listen ratio), AI roleplay avatars, scorecards. LOW (third-party).
- Turn-taking realism: [Duplex Conversation (arXiv 2205.15060)](https://arxiv.org/pdf/2205.15060) on backchannels, user state and barge-in as the three capabilities; [FutureAGI barge-in/turn-taking 2026](https://futureagi.com/blog/voice-ai-barge-in-turn-taking-2026/) and [Soniox turn-taking wiki](https://soniox.com/wiki/turn-taking-barge-in) on why naive VAD misreads backchannels and echo cancellation being required. MEDIUM.
- Final Round AI copilot, Google Interview Warmup (transcript plus highlighted talking points), Tavus/Hume/HeyGen interactive avatars: training-data knowledge, not re-verified. LOW.
