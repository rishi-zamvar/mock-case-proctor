# Mock Case Proctor

## What This Is

A macOS Electron desktop app that runs a full, proctored Lead Edge Capital growth-equity case interview against the 12-case mock library at `~/Documents/Projects/lead_edge_mock_cases`. Rishi picks a case, reviews the interviewee deck in-window for 45 minutes, then presents by voice to a lifelike 3D talking-head partner (Claude-driven, local free voice) who interrupts, probes and grills section by section, and finally gets a rubric scorecard plus trends across all past sessions. It is a single-user personal prep tool for a real interview.

## Core Value

It must feel like a real conversation with a Lead Edge partner: Rishi speaks, a believable avatar answers out loud within a few seconds, follows his structure, and pushes on exactly the things the case's answer key says matter. If only one thing works, it is the voice loop with an interviewer who knows the case.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Case library screen lists all 12 cases from the mock library; completed cases are greyed out (retake still possible via explicit action)
- [ ] Proctored hour: 45-minute review with the interviewee PDF shown in-window and a countdown timer; "Ready" button skips ahead
- [ ] Optional 5–10 minute warm-up chat before "here is the project" (Saar format), skippable
- [ ] Presentation: Rishi opens with a one-sentence recap, an investment recommendation, and an overview of considerations for and against; then says he is happy to dive into each
- [ ] Turn-taking: Rishi presses a button to start/stop each answer; each answer is timed and brevity is graded
- [ ] Live speech-to-text of Rishi's answer, local, tuned for finance jargon and numbers
- [ ] AI interviewer (Claude API, key from keymgr) that has the case's interviewer package (answer key, flag map, rubric, prep brief, pushback scripts) and conducts the grilling
- [ ] Interviewer asks a high-level framing question per section ("let's dive into why you want to invest first", "financials first?"), stays in a section until it has sufficiently tested understanding, then moves on
- [ ] Section order follows the considerations Rishi listed in his opening; coverage spans: Lead Edge 8, qualitative/quantitative industry view, what to diligence, deal/price (work back to 3x), the call
- [ ] Interviewer persona: a chill but sharp real partner — interrupts, may or may not feed the answer, calls out obvious BS, asks questions that test understanding; basic calculations only, emphasis on depth of insight and calling out what is NOT shown in the deck
- [ ] Interviewer speaks with a lifelike LOCAL, FREE TTS voice (Kokoro via HeadTTS or equivalent)
- [ ] 3D talking-head avatar (TalkingHead.js) lip-syncs to the interviewer's voice, with idle/listening behaviour so it feels interpersonal
- [ ] Webcam self-view tile (Zoom-like)
- [ ] Rishi can interrupt (barge-in) the avatar
- [ ] Session end → Review mode: rubric scorecard against the case's answer key (each dimension scored, each flag found/missed, brevity, numbers right/wrong)
- [ ] Review mode: trends across cases — the review agent reads all previous session results and reports recurring weaknesses and progress
- [ ] Every session (transcript, timings, scores, feedback) is stored in a local library
- [ ] Each case gets a fresh interviewer agent (no memory across cases); only the review agent has cross-session memory
- [ ] Full TDD: unit tests written before logic; integration tests for the state machine, storage and Claude prompts; live E2E tests driving the real Electron app (Playwright for Electron) covering every screen and feature, including the real voice loop with recorded audio fixtures

### Out of Scope

- Paid TTS / avatar APIs (ElevenLabs, HeyGen) — user chose local + free
- Multi-user, accounts, cloud sync — single-user personal tool
- Windows/Linux builds — macOS (Apple Silicon) only
- Authoring new cases in-app — cases come from the existing library pipeline
- Deep DCF/LBO modelling questions — Saar: non-technical, reading numbers and intuition
- Mobile app

## Context

- **Case library**: `~/Documents/Projects/lead_edge_mock_cases/case_NN_<slug>/` each with `*_interviewee_package.pdf` and `*_interviewer_package.pdf`. Structured source data in `_work/content/case_NN.json` and `_work/data/case_NN.json` (generated). Interviewer package contains: run sheet, Prep brief (business in plain English, glossary, what it tests, must-pull-outs, comps, tailwinds/headwinds, traps, 60-second ideal answer, numbers to memorize), answer key (Lead Edge 8 table), flag map, worked back-solve, pushback scripts, rubric. The interviewer agent should be grounded in the structured JSON where possible and the PDF text otherwise. NEVER expose interviewer content in the candidate-facing UI before review mode.
- **Real interview format (Saar, Oct 2026, from `~/Downloads/Lead Edge Mock Case Playbook.md`)**: short 5–10 min chat, then "here is the project"; one tech company (ARR X, growing Y%); deliverable is a perspective on attractiveness for Lead Edge; non-technical; good company meeting 6+ of the Lead Edge 8. Priority order: (1) Lead Edge 8 cold, (2) gross retention is #1, (3) public comps as the anchor, (4) is the business interesting (tailwind, system of record, switching cost), (5) work backwards to 3x over 5–7 years.
- **Lead Edge 8**: Revenue $10M+; Growth 25%+; Gross margin 70%+; Breakeven or profitable; SaaS/highly recurring; 90%+ gross retention; no customer >15%; lifetime burn < $1 per $1 revenue.
- **Research already done**: `research/voice_pipeline.md` (HeadTTS = Kokoro on WebGPU with viseme timings for TalkingHead; whisper.cpp large-v3-turbo Metal; vad-web; Smart Turn; ~2.5–3 s turn latency) and `research/avatar_shell.md` (avatar, Electron shell, reusable OSS).
- **User**: Rishi, Brown student prepping a real Lead Edge growth-equity case interview. Wants it built overnight, autonomously.

## Constraints

- **Platform**: macOS Apple Silicon, Node 22, Electron (latest stable) — single machine
- **Cost**: voice and avatar local and free; only paid dependency is the Claude API (existing ANTHROPIC_API_KEY via `~/.config/keys` keymgr)
- **Latency**: candidate-stops-talking → avatar's first audible word target ≤ 3 s typical
- **Privacy**: interviewer materials never visible to the candidate before review; API key never in renderer or logs
- **Quality**: TDD; every feature covered by automated tests AND a live E2E run in the real app
- **Timeline**: overnight autonomous build

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Local free TTS (Kokoro via HeadTTS) | User chose local/free; HeadTTS outputs viseme timings for TalkingHead | — Pending |
| TalkingHead.js 3D avatar | Free, local, professional, real-time lip-sync | — Pending |
| Webcam self-view | User's "my visual" | — Pending |
| Full proctored hour + skip-ahead | User choice | — Pending |
| Button-to-stop turns, timed, brevity graded | User choice (no VAD auto-cutoff) | — Pending |
| Interviewer = chill realistic partner | User: interrupts, may feed answers, calls BS, not an idealized scrutinizer | — Pending |
| Review = rubric scorecard + cross-case trends | User choice | — Pending |
| Claude for interviewer + reviewer | User: "AI is better"; existing key | — Pending |
| Include optional warm-up chat | Matches Saar's real format; skippable | — Pending |
| Retakes allowed but completed cases greyed | Greyed per user; retake avoids dead ends | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-02 after initialization*
