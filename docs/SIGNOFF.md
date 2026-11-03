# Milestone v1.0 sign-off

- **Date:** 2026-11-03
- **Commit:** `357e542`, plus this docs commit
- **Final gate:** lint, typecheck, Vitest and T1. The results are in `.planning/phases/09-packaged-live-sign-off/09-03-SUMMARY.md`.

**Verdict.** All 52 v1 requirements have automated proof. The packaged, ad-hoc-signed arm64 `.app` ran two full cases live against Claude: case_99 and case 02, each from the library through to the scorecard. During those runs:

- whisper ran on Metal and HeadTTS on WebGPU;
- main contacted only `api.anthropic.com`;
- no interviewer material leaked;
- memory stayed flat over 3 sessions.

**One target is missed.** The stop-to-first-audio median is 4.98 s against the 3 s goal (VOUT-04). Claude time-to-first-token causes almost all of it; see [LATENCY.md](../.planning/phases/09-packaged-live-sign-off/LATENCY.md). Three items need Rishi; they are listed at the end.

Legend:
- **pass**: the last run was green.
- **pass (live)**: a real Claude, packaged or live run.
- **human_needed**: cannot be automated.
- **missed**: measured and short of the target.

## Requirements

| ID | What | Proving test(s) | Last result |
|---|---|---|---|
| FND-01 | Electron app; one dev command, one package command | `npm run package`, `scripts/verify-package.sh`, `tests/e2e/packaged.spec.ts` (@packaged), `tests/e2e/shell.spec.ts` | pass (live): verify-package OK, @packaged 3/3 |
| FND-02 | Private repo, gitignored secrets/models/sessions, secret scan | `tests/config/secret-scan.test.ts`, `tests/config/fixture-hygiene.test.ts` | pass |
| FND-03 | Test harness from day one | `vitest.config.ts` projects, `playwright.config.ts`, `src/renderer/src/smoke.test.ts`, `tests/replay/*.test.ts` | pass |
| FND-04 | Camera/mic entitlements + usage strings asserted | `tests/config/entitlements.test.ts`, `scripts/verify-package.sh` (codesign entitlements on app + renderer helper, Info.plist usage strings) | pass |
| FND-05 | Sandboxed renderer, CSP, `app://` | `src/shared/csp.test.ts`, `src/main/protocol.test.ts`, `src/main/appProtocol.test.ts`, `tests/e2e/shell.spec.ts` | pass |
| KEY-01 | Settings asks for key, live check, safeStorage | `src/main/keys/keyStore.test.ts`, `src/main/keys/probe.test.ts`, `src/main/keys/probe.live.test.ts`, `src/renderer/src/screens/Settings.test.tsx`, `tests/e2e/key.spec.ts` | pass; probe pass (live) |
| KEY-02 | Auto-fill from env / `.env` (keymgr) | `src/main/keys/dotenv.test.ts`, `keyStore.test.ts`, `tests/e2e/live.spec.ts` (@live key auto-fill) | pass (live) |
| KEY-03 | Key never in renderer/logs/fixtures/git | `tests/e2e/leak.spec.ts` (canary key), `src/main/log.test.ts`, `tests/config/secret-scan.test.ts`, `fixture-hygiene.test.ts` | pass |
| KEY-04 | Replace / clear key | `keyStore.test.ts`, `Settings.test.tsx`, `tests/e2e/key.spec.ts` | pass |
| LIB-01 | Lists 12 cases, candidate-safe fields | `src/main/domain/cases/library.test.ts`, `library.real.test.ts` (12 real cases), `Library.test.tsx`, `tests/e2e/flow.spec.ts` | pass |
| LIB-02 | Completed greyed with date/score, Retake | `Library.test.tsx`, `tests/e2e/flow.spec.ts` | pass |
| LIB-03 | Case loader builds candidate + interviewer views | `resolve.test.ts`, `resolve.real.test.ts`, `deckSource.test.ts`, `deckText.test.ts` | pass |
| BAR-01 | No interviewer content to renderer pre-review | `tests/e2e/barrier.spec.ts` (IPC tap), `tests/e2e/leak.spec.ts`, `src/main/session/view.test.ts`, `src/main/review/isolation.test.ts`, @t3 tap | pass; pass (live) in @t3 |
| BAR-02 | `app://` never serves interviewer PDF | `src/main/appProtocol.test.ts`, `tests/e2e/barrier.spec.ts` | pass |
| BAR-03 | Leak guard on every utterance | `src/main/domain/text/leakGuard.test.ts`, `claudeLlm.live.test.ts` (injection eval) | pass; injection eval pass (live) on re-run (one model-variance miss with 0 leaks) |
| FLOW-01 | Pure phase state machine | `src/main/domain/machine/interviewMachine.test.ts` | pass |
| FLOW-02 | Optional warm-up | `runner.flow6.test.ts`, `tests/e2e/flow.spec.ts` | pass |
| FLOW-03 | Proctored 45-min review | `tests/e2e/review.spec.ts` (countdown, T-10 warning, Ready skip), `DeckViewer.test.tsx` | pass |
| FLOW-04 | Uninterrupted timed presentation | `runner.flow6.test.ts`, `interviewMachine.test.ts` | pass |
| FLOW-05 | Section order extracted from opening | `src/main/agent/extraction.test.ts`, `runner.flow6.test.ts` | pass |
| FLOW-06 | Grill target + soft/hard caps, first-turn signal ignored | `src/main/domain/machine/sections.test.ts`, `interviewMachine.test.ts`, `claudeLlm.live.test.ts` (section eval) | pass; pass (live) |
| FLOW-07 | Atomic save each turn, resume | `src/main/store/sessionStore.test.ts`, `runner.resume.test.ts`, `tests/e2e/resume.spec.ts` | pass |
| FLOW-08 | End early, partial scored | `runner.score.test.ts`, `tests/e2e/flow.spec.ts` | pass |
| VIN-01 | Push-to-talk + per-answer timer | `Session.voice.test.tsx`, `src/renderer/src/mic/capture.test.ts`, `tests/e2e/voiceloop.t2.spec.ts` | pass |
| VIN-02 | Local whisper turbo on Metal, glossary prompt | `src/main/stt/whisper.int.test.ts`, `sttPrompt.test.ts`, `tests/e2e/packaged.spec.ts` (Metal), @t3 | pass (live): `metal` in packaged app |
| VIN-03 | Transcript shown | `Session.voice.test.tsx`, `tests/e2e/voice.t2.spec.ts` | pass |
| VIN-04 | Silence = no answer; hallucination filter | `src/main/stt/gate.test.ts`, `clean.test.ts`, `filtered.test.ts`, `voiceloop.t2.spec.ts` step d | pass |
| VIN-05 | Mic check level meter | `MicCheck.test.tsx`, `level.test.ts`, `tests/e2e/media.spec.ts` | pass |
| INT-01 | Claude interviewer, one config value, cached brief | `claudeLlm.test.ts`, `prompt.test.ts`, `compose.test.ts`, `claudeLlm.live.test.ts` (cache eval) | pass; pass (live) |
| INT-02 | Chill-but-sharp partner persona | `prompt.test.ts`, `claudeLlm.live.test.ts` (style eval) | pass (live) |
| INT-03 | Framing question per section, moves on in order | `sections.test.ts`, `tests/e2e/interviewer.t2.spec.ts`, live section eval | pass; pass (live) |
| INT-04 | Section coverage | `sections.test.ts`, `prompt.test.ts`, `interviewer.t2.spec.ts` | pass |
| INT-05 | Probes gaps; mandatory "convince me" pushback | `claudeLlm.live.test.ts` (grr + pushback evals), @t3 GRR pushback logged | pass (live) |
| INT-06 | `interview_control` tool each turn, validated | `src/main/agent/control.test.ts`, `claudeLlm.replay.test.ts`, live (0/14 missing control) | pass; pass (live) |
| INT-07 | Transcript wrapped as data (injection-safe) | `messages.test.ts`, `turnText.test.ts`, live injection eval | pass; pass (live) on re-run |
| INT-08 | Fresh interviewer per case | `runner.agent.test.ts`, `compose.test.ts` | pass |
| VOUT-01 | HeadTTS/Kokoro on WebGPU, fallback banner | `headtts.test.ts`, `voice.test.ts`, `tests/e2e/voice.t2.spec.ts`, @t3 | pass (live): `webgpu` in packaged app |
| VOUT-02 | Speech normalisation | `numbers.test.ts`, `speakable.test.ts`, `speakable.real.test.ts` (all 12 cases) | pass |
| VOUT-03 | TalkingHead lip-sync + idle/listen/think | `avatarCore.test.ts`, `behaviour.test.ts`, `AvatarStage.test.tsx`, `voice.t2.spec.ts` | pass |
| VOUT-04 | Sentence streaming; median stop→first word ≤ 3 s | `sentenceSplitter.test.ts`, `src/main/session/latency.test.ts`, `voiceloop.t2.spec.ts` (1.42 s with replayed Claude), @t3 per-stage timings | streaming pass; **3 s target missed** live: 4.98 s median ([LATENCY.md](../.planning/phases/09-packaged-live-sign-off/LATENCY.md)) |
| VOUT-05 | Barge-in stops voice, cancels stream, spoken-only history | `runner.bargein.test.ts`, `claudeLlm.bargein.test.ts`, `speechQueue.test.ts`, `voiceloop.t2.spec.ts` step e, @t3 | pass (live): 1.4 ms / 0.7 ms |
| VOUT-06 | Mirrored webcam tile, never recorded | `WebcamTile.test.tsx`, `tests/config/no-recording.test.ts`, `tests/e2e/media.spec.ts` | pass |
| REV-01 | 6-dim /30 scorecard with verified quotes | `scorecard.test.ts`, `evidence.test.ts`, `grader.test.ts`, `review.live.test.ts`, @t3 (12/12, 9/9 evidence verified) | pass (live) |
| REV-02 | Flag map found / hinted / missed | `checks.test.ts`, `Debrief.test.tsx` | pass |
| REV-03 | Deterministic checks in code | `checks.test.ts`, `src/main/domain/metrics.test.ts` | pass |
| REV-04 | Reveal: ideal answer, key numbers, transcript | `ReviewMode.test.tsx`, `tests/e2e/reviewmode.spec.ts` | pass |
| REV-05 | Local session library | `sessionStore.test.ts`, `sessionSchema.test.ts` | pass |
| REV-06 | Cross-case trends agent | `trends.test.ts`, `Trends.test.tsx`, `review.replay.test.ts` | pass |
| QA-01 | TDD | Git history: a test commit before each feat commit, per the phase SUMMARYs | pass |
| QA-02 | T1 E2E, all fakes, every screen | `npm run test:e2e` | pass (09-03 gate) |
| QA-03 | T2 E2E, real STT/TTS + replayed Claude | `npm run test:e2e:t2` (voice.t2, interviewer.t2, voiceloop.t2) | pass: 6/6 twice (Phase 8), voiceloop.t2 again in 09-01 |
| QA-04 | T3 live on packaged `.app`; no leaks, GRR pushback, sections within cap | `npm run test:t3` (`tests/e2e/signoff.t3.spec.ts`), `npm run test:live` | pass (live): @t3 3/3, live evals green ([t3-results.json](../.planning/phases/09-packaged-live-sign-off/t3-results.json)) |

## "Looks Done But Isn't" checklist (PITFALLS.md)

| Item | Status | Evidence |
|---|---|---|
| Mic/camera after `tccutil reset` in the packaged app | **human_needed** | The automatable part is proven. `src/main/media.test.ts` shows the app asks only on `not-determined`, never re-asks after a denial, and never throws. `scripts/verify-package.sh` checks the `device.audio-input` and `device.camera` entitlements on the app and the renderer helper, plus `NSMicrophoneUsageDescription` and `NSCameraUsageDescription`. The real prompt is left to Rishi (below). |
| WebGPU/Metal in the packaged build | pass (live) | @t3 recorded STT device `metal` and TTS device `webgpu`, and `whisper.node` loaded from `app.asar.unpacked`. |
| Offline except Claude | pass (live) | The @t3 network tap: main contacted only `api.anthropic.com`, and the renderer made no remote `http(s)`/`ws(s)` requests. Models are bundled, so nothing comes from a CDN or HF. |
| Echo, on laptop speakers | by design, **not measured on speakers** | Turns are gated by the button and there is no VAD. The mic does not capture while the avatar speaks unless Talk is pressed, and pressing Talk is a barge-in. So speaker echo can't cause a self-interruption, but no 5-minute speaker session was measured. |
| Silence → "no answer" | pass | `voiceloop.t2.spec.ts` step d, plus `stt/gate.test.ts` and `filtered.test.ts` (the "Thank you." filter). |
| Numbers | pass | The `speakable.real.test.ts` census over all 12 cases' numbers to memorise, plus `numbers.test.ts` / `speakable.test.ts`. |
| Leak guard | pass (live) | `leak.spec.ts` and `barrier.spec.ts` (IPC tap), the live injection eval (0 leaks with Opus), and the @t3 tap. The Haiku run had 1 n-gram, flagged by the guard; see LATENCY.md. |
| Sections | pass | `interviewer.t2.spec.ts` (replayed interview in the opening's order) and the live section eval (caps respected). |
| Barge-in | pass (live) | `voiceloop.t2.spec.ts` step e, `runner.bargein.test.ts` (spoken-only history), and @t3 (1.4 ms / 0.7 ms to silence). |
| Crash | pass | `tests/e2e/resume.spec.ts` kills the app mid-interview, then the library loads and the session resumes. |
| Timer | pass (**wall-clock only**) | `tests/e2e/review.spec.ts` "countdown is deadline-driven". The countdown follows the wall clock within one tick. It is deadline-based (`deadline - now`), so a throttled or hidden window catches up on its next tick. A 2-minute minimised window was **not** tested explicitly. |
| Memory | pass (live) | The @t3 soak ran 3 sessions, with s3/s1 workingSet at main 0.98, renderer 0.62 and GPU 0.82, and 1 avatar instance. |

## Latency

The packaged live median from stop to first audio was **4.98 s** (p90 8.61 s, n=12), against the 3 s target:

| Stage | Median |
|---|---|
| STT | 0.92 s |
| Claude TTFT | 3.20 s |
| Token to audio | 0.67 s |

One live run of Haiku was not faster (TTFT 1.99 s vs 1.90 s) and leaked one answer-key n-gram, which the guard flagged, so the recommendation is to keep `claude-opus-5-5`. Full report: [`.planning/phases/09-packaged-live-sign-off/LATENCY.md`](../.planning/phases/09-packaged-live-sign-off/LATENCY.md).

## Needs Rishi

1. **TCC re-prompt in the packaged app: human_needed.** This was never run automatically, because it resets system privacy grants.
   1. `tccutil reset Microphone com.rishizamvar.mockcaseproctor`
   2. `tccutil reset Camera com.rishizamvar.mockcaseproctor`
   3. Open `Mock Case Proctor.app` from Finder.
   4. Expect two prompts, Microphone and then Camera. Grant both, start a case, and confirm the webcam tile shows you and the mic-check meter moves.
2. **Voice choice.** Listen to `.planning/phases/05-voice-out-avatar/audition/<voice>-<n>.wav`. The default is `bm_george`; `am_fenrir` and `am_michael` graded one notch higher. To switch, change `VOICE` in `src/renderer/src/speech/voice.ts` and re-package.
3. **Interviewer model / latency.** Read [LATENCY.md](../.planning/phases/09-packaged-live-sign-off/LATENCY.md). The recommendation is to keep Opus and treat the first-turn extraction overlap and the prefix trim as next steps. To try another model: `INTERVIEWER_MODEL=<model> LIVE=1 npx vitest run --project main src/main/agent/claudeLlm.live.test.ts`
