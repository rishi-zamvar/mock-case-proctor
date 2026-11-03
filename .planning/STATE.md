---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Completed 06-10-PLAN.md
last_updated: "2026-11-03T11:09:05.932Z"
last_activity: 2026-11-03
progress:
  total_phases: 9
  completed_phases: 6
  total_plans: 61
  completed_plans: 57
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-03)

**Core value:** It must feel like a real conversation with a Lead Edge partner: Rishi speaks, a believable avatar answers out loud within a few seconds, follows his structure, and pushes on exactly what the case's answer key says matters.
**Current focus:** Phase 6 — Interviewer Agent

## Current Position

Phase: 6 (Interviewer Agent) — EXECUTING
Plan: 10 of 10
Status: Phase complete — ready for verification
Last activity: 2026-11-03

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 8min | 3 tasks | 18 files |
| Phase 01 P04 | 4min | 2 tasks | 4 files |
| Phase 01 P02 | 2min | 3 tasks | 6 files |
| Phase 01 P05 | 3min | 2 tasks | 9 files |
| Phase 01 P03 | 3min | 3 tasks | 6 files |
| Phase 01 P06 | 8min | 2 tasks | 11 files |
| Phase 01 P07 | 10min | 2 tasks | 11 files |
| Phase 01 P08 | 4min | 2 tasks | 2 files |
| Phase 01 P09 | 9min | 3 tasks | 6 files |
| Phase 02 P01 | 6min | 2 tasks | 8 files |
| Phase 02 P05 | 3min | 2 tasks | 6 files |
| Phase 02 P04 | 9min | 2 tasks | 5 files |
| Phase 02 P03 | 5min | 2 tasks | 4 files |
| Phase 02 P02 | 4min | 3 tasks | 9 files |
| Phase 03 P02 | 6min | 2 tasks | 10 files |
| Phase 03 P01 | 4min | 2 tasks | 9 files |
| Phase 03 P03 | 6min | 2 tasks | 2 files |
| Phase 03 P05 | 4min | 1 tasks | 2 files |
| Phase 03 P06 | 3min | 2 tasks | 3 files |
| Phase 03 P04 | 4min | 2 tasks | 6 files |
| Phase 03 P07 | 10min | 2 tasks | 6 files |
| Phase 03 P09 | 8min | 2 tasks | 5 files |
| Phase 03 P08 | 9min | 2 tasks | 4 files |
| Phase 03 P10 | 6min | 2 tasks | 7 files |
| Phase 03 P11 | 15min | 2 tasks | 9 files |
| Phase 03 P12 | 22min | 3 tasks | 2 files |
| Phase 04 P04 | 2min | 2 tasks | 4 files |
| Phase 04 P01 | 2min | 2 tasks | 13 files |
| Phase 04 P03 | 6min | 2 tasks | 8 files |
| Phase 04 P02 | 4min | 2 tasks | 8 files |
| Phase 04 P05 | 2min | 2 tasks | 7 files |
| Phase 04 P06 | 2min | 2 tasks | 6 files |
| Phase 04 P07 | 35min | 3 tasks | 11 files |
| Phase 05 P04 | 6min | 2 tasks | 4 files |
| Phase 05 P03 | 6min | 1 tasks | 2 files |
| Phase 05 P02 | 4min | 3 tasks | 19 files |
| Phase 05 P01 | 25min | 3 tasks | 13 files |
| Phase 05 P06 | 4min | 2 tasks | 5 files |
| Phase 05 P05 | 4min | 2 tasks | 6 files |
| Phase 05 P07 | 6min | 1 tasks | 3 files |
| Phase 05 P08 | 21min | 2 tasks | 9 files |
| Phase 06 P02 | 3min | 2 tasks | 4 files |
| Phase 06 P01 | 10min | 2 tasks | 7 files |
| Phase 06 P03 | 3min | 2 tasks | 4 files |
| Phase 06 P05 | 6min | 2 tasks | 4 files |
| Phase 06 P04 | 12min | 2 tasks | 2 files |
| Phase 06 P07 | 15min | 2 tasks | 3 files |
| Phase 06 P06 | 15min | 2 tasks | 3 files |
| Phase 06 P09 | 6min | 1 tasks | 13 files |
| Phase 06 P08 | 8min | 2 tasks | 3 files |
| Phase 07 P03 | 4min | 2 tasks | 7 files |
| Phase 07 P01 | 4min | 2 tasks | 5 files |
| Phase 07 P02 | 4min | 2 tasks | 9 files |
| Phase 07 P04 | 5min | 2 tasks | 5 files |
| Phase 07 P06 | 12min | 2 tasks | 11 files |
| Phase 06 P10 | 64min | 3 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in the PROJECT.md Key Decisions table and in the research/SUMMARY.md Resolved Decisions.
Recent decisions affecting current work:

- Roadmap: Adopted the research's 9-phase build order (contracts, then fakes, then one real component at a time). This is above the "standard" 5-8 band because the boundaries are natural risk seams, not padding.
- Roadmap: The code-owned section flow and the information-barrier types land in Phases 2-3, because adding them later would mean a rewrite.
- Roadmap: The `interview_control` log is designed in Phase 6, ahead of grading in Phase 8, because hint-aware scoring and the flag map depend on it.
- Roadmap: VOUT-04 (3 s latency) and VOUT-05 (barge-in) sit in Phase 7, because both need real STT plus the agent to be measurable.
- [Phase 01]: Scaffold via temp dir + rsync; electron-builder.json (not yml) so config tests need no YAML parser
- [Phase 01]: Replay server writes req log even on 599 missing-fixture
- [Phase 01]: app:// resolver also checks raw path: WHATWG URL clamps %2e%2e, so traversal is refused not clamped
- [Phase 01]: Renderer uses a plain state switch (no router); Home reuses Settings.module.css
- [Phase 01]: KeyStore is Electron-free; 01-06 injects safeStorage as Cipher. Probe keeps thinking disabled (SDK 1.4.0 accepts it).
- [Phase 01]: Meta CSP omits frame-ancestors (ignored in meta); app:// header carries the full CSP
- [Phase 01]: No corsEnabled on app:// scheme: built app renders without CORS errors
- [Phase 01]: app:// cross-origin refusal proven via main net.fetch (no corsEnabled); handler returns 404 on missing files
- [Phase 01]: Real safeStorage + use-mock-keychain persists across relaunch; E2E_FAKE_CIPHER fallback not needed
- [Phase 01]: resources/assets keeps non-dot placeholder ASSETS.txt (electron-builder drops dotfiles)
- [Phase 01]: test:live rebuilds out/ before @live run
- [Phase 02]: Leftover checks walk string leaves, not JSON.stringify (compact JSON objects match LEFTOVER_RE)
- [Phase 02]: src/main/domain/cases/ un-ignored (cases/ rule swallowed it)
- [Phase 02]: Leak guard: banned grams = answer-key 8-grams minus deck 8-grams; banned terms match whole tokens; banned_term checked before ngram
- [Phase 02]: parseNumbers ignores bare number words without scale/unit
- [Phase 02]: speakable: tight hyphen ranges only; spaced ranges need en dash
- [Phase 02]: Splitter early chunk at first ,;:— + whitespace with >=6 words before; flush resets early flag per turn
- [Phase 02]: Reducer: reviewDeadline set on review entry; next grill request comes from ANSWER_FINAL; END_REQUESTED also accepted in warmup
- [Phase 02]: Real leak test probes the first deck-free 10-word ideal-answer window
- [Phase 02]: listCases skips case dirs without _work/data JSON; loadCase throws 'case NN not found'
- [Phase 03]: Case PDF route is app://bundle/cases/<NN>/interviewee.pdf (same-origin, no corsEnabled); raw-path exact match, everything else under /cases 404s
- [Phase 03]: Preload typed as Pick<Api,'key'> until 03-10 wires the session API
- [Phase 03]: SessionStore fs seam is Partial<typeof fs> over node:fs; quarantine failures logged and swallowed so list() never throws
- [Phase 03]: toViewState is the sole session->renderer projection; explicit literals + ViewStateSchema.parse on every return
- [Phase 03]: Library start sheet restores focus to its trigger on close
- [Phase 03]: Session countdown anchors app clock to local now() on each view push; Space ignored while end dialog open
- [Phase 03]: Fake speech queue resolves setTimeout at call time so fake timers apply after mount
- [Phase 03]: Runner applies LLM turn results inside one queued job; end ignored once scoring started; ack timeout is wall time
- [Phase 03]: compose.ts is the sole adapter/config-env reader; non-fake LLM/STT/TTS/ADAPTERS throws until Phases 5-7
- [Phase 03]: E2E_TIME_SCALE honoured only under E2E=1
- [Phase 03]: T1 flow suite relaunches on a finished profile rather than sharing one app across tests
- [Phase 03]: Crash E2E kills mid-speech; interviewer line saved only after acks, so pending turn is on disk
- [Phase 04]: ensureMediaAccess: one try per kind around status read + ask; never rejects
- [Phase 04]: REVIEW_WARNING_MS is a 10-min constant; warning accepted once inside [deadline-10min, deadline)
- [Phase 04]: MicCheck/WebcamTile: explicit getUserMedia={undefined} means unavailable; omitted prop falls back to navigator.mediaDevices
- [Phase 04]: react-pdf 11 used without options prop: pdfjs 6.3.289 removed isEvalSupported
- [Phase 04]: DeckViewer: workerSrc set in DeckViewer.tsx (same module as Document, per README); global react-pdf mock in test-setup.ts
- [Phase 04]: Runner timers Map keyed review|warning; fired timers self-delete
- [Phase 04]: Session countdown is deadline-derived state, min-clamped per deadline (nextRemaining)
- [Phase 04]: WebcamTile unmounts <video> when off ([hidden] lost to display:block)
- [Phase 04]: Display-sleep E2E matches NoDisplaySleepAssertion|PreventUserIdleDisplaySleep on the app pid
- [Phase 05]: speechQueue: failed-synth acks go through speakMarker to keep seq order; handOff races synth vs drop so a stuck cancelled synth cannot block later turns
- [Phase 05]: HeadTTS device by endpoint order (null adapter -> wasm, webgpu fail -> wasm, both fail -> none); synth timeout reconnects current endpoint
- [Phase 05]: Voice assets live under gitignored resources/assets/models/ and are served at /res/models/... (voices at /res/models/voices/<v>.bin); models are local-only (allowRemoteModels=false)
- [Phase 05]: Voice packages (talkinghead, three, headtts, transformers) are exact-pinned devDependencies; copyVoiceVendor copies the runtime into src/renderer/public/vendor at build
- [Phase 05]: TTS mode defaults headtts, fake under E2E=1; T-10 line is spoken (no ack, no transcript) only in headtts
- [Phase 05]: AvatarStage: fake mode keeps exact T1 placeholder; avatar mode = dark tile + bottom-left name tag with speaking dot
- [Phase 05]: Avatar logic in pure avatarCore.ts (tested); avatarEngine.ts is thin TalkingHead glue
- [Phase 05]: voice.ts queue ready rejects on device none so seqs ack false immediately
- [Phase 05]: App is the sole getVoice caller (lazy useState); missing api.config = fake; voice.resume on Start and Resume
- [Phase 05]: Pin @electron/osx-sign isbinaryfile to 5.0.7 via npm overrides (4.0.10 crashes on model.onnx during packaging)
- [Phase 05]: VOICE stays bm_george; am_fenrir/am_michael grade C+ vs C, switch the one constant after listening to audition WAVs
- [Phase 06]: Turn filter checks banned phrases before the 4-sentence cap; banned sentences don't consume a slot
- [Phase 06]: seedFromHistory: text-only, skips empty turns, prefixes '(start)' user msg before a leading interviewer turn
- [Phase 06]: Owed pushback (valuation turn>=1 or call) blocks 'sufficient' until hard cap unless pushback_done
- [Phase 06]: Warm-up auto-ends after 10 min via START_TIMER warmup -> WARMUP_DONE; re-armed on resume
- [Phase 06]: parseControl: reducer current section wins over model section_id; invalid/missing control -> null (probing)
- [Phase 06]: Turn filter (4-sentence cap + banned phrases) runs before leak guard on every spoken turn; reason codes only in logs
- [Phase 06]: Hint-without-permission logged as anomaly; control still applied
- [Phase 06]: Interviewer evaluation key is an explicit allowlist; leak sources never enter the prompt
- [Phase 06]: Flags route to retention/diligence probes by keyword on flag text
- [Phase 06]: Interject is a real interviewer turn (kind 'interject') via speakTurn; one silent retry with SORRY_LINE; extraction double-failure falls back to default section order
- [Phase 06]: claudeLlm appends history only after a completed turn; aborted turns forgotten; extractPlan rethrows APIError, unparsable -> { order: [] }
- [Phase 06]: Replay fixtures recorded on case_99 only; scripted lines use Fixturely deck figures
- [Phase 06]: LLM defaults auto outside E2E, fake under E2E; no key falls back to fake with a per-session warn
- [Phase 07]: Mic accumulator aligns quietest-frame search to absolute 20 ms grid; injected E2E WAV replaces mic for one recording (no getUserMedia)
- [Phase 07]: whisper-cpp-node loaded via createRequire: 0.2.12 import export points at unpublished dist/index.mjs
- [Phase 07]: Whisper models via STT_MODELS with WHISPER_CACHE move + sha256 + 1 GiB disk guard; turbo q5_0 120s = 5.5s
- [Phase 07]: STT assembler ignores text of noAnswer chunks; answer noAnswer when joined text empty
- [Phase 07]: whisperStt: electron-vite 6 main inputs via build.rolldownOptions.input; init_failed sticky, exit/timeout respawn lazily
- [Phase 07]: claudeLlm.interrupted rewrites the last turn to spoken text + [interrupted]; aborted turns stay forgotten without the call
- [Phase 07]: 07-06: canTalk false while transcribing; latency stamps on unscaled realNow; sttChunk bypasses the runner queue
- [Phase 06]: pushback_done is a per-turn event: persona sets it true only on the delivering turn (live eval caught 3x)
- [Phase 06]: wrap_section maps to status=sufficient so sections close on the partner's call, not only the hard cap
- [Phase 06]: Interviewer stays claude-opus-5-5; pooled median TTFT 1.74s (n=54, p90 4.8s); haiku/prefix-trim is Rishi's call

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 5 needs research: HeadTTS offline/`app://` loading, the HeadTTS to TalkingHead `speakAudio` wiring, TalkingHead disposal, and avatar retargeting.
- Phase 6 needs research: Opus 5.5 TTFT at `effort: low` with a ~35K cached prefix (measure first), text-only assistant turns after thinking turns (barge-in history), and the interaction between `server-side-fallback` and tool use.
- Phase 7 needs research: the whisper turbo final-pass latency on 60-120 s answers, and Chromium AEC with WebAudio output.
- Risk: the Opus 5.5 median latency may exceed 3 s. Switching models is one config value and is Rishi's call.

## Session Continuity

Last session: 2026-11-03T11:09:05.928Z
Stopped at: Completed 06-10-PLAN.md
Resume file: None
