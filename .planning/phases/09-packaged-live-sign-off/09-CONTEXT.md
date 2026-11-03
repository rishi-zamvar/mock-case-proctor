# Phase 9: Packaged Live Sign-off - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning
**Mode:** Smart discuss, auto-accepted. The user asked Claude to choose the best path and not wait.

<domain>
## Phase Boundary

The final gate for this milestone: prove that the packaged, ad-hoc-signed arm64 `.app` runs a full real session end to end against the live Claude API, and leave a human-readable sign-off report. This phase adds no new features. It contains:
- a T3 `@live` packaged run;
- the live eval suite re-run against the packaged build's code paths;
- a latency report;
- an offline check;
- a TCC re-prompt check;
- a 3-session memory soak;
- the "Looks Done But Isn't" checklist from `.planning/research/PITFALLS.md`;
- user-facing docs (README: install, first run, key, voice choice, model choice).

Fixes are allowed only for defects these checks expose. Each fix gets a unit test first.
</domain>

<decisions>
## Implementation Decisions

### T3 packaged live run (unattended)
- **Launch.** Use Playwright `_electron.launch({ executablePath: release/mac-arm64/Mock Case Proctor.app/... })` with:
  - `E2E=1` (for the `__mic` WAV injection hook and the mock keychain);
  - `LLM=claude` and `STT=whisper`;
  - `TTS=headtts`;
  - `REVIEWER=claude`;
  - the real key passed explicitly from `.env`. It must never be printed or written to disk.
- **Case.** Run case 02 (PawsHub) for realism, plus case_99. The real case is live-only and never recorded.
- **Session script.** Drive a full session from library to review mode:
  1. Skip the warm-up.
  2. Ready.
  3. An opening WAV (`say`-generated, containing recap, recommendation and considerations).
  4. 4–6 grilling answers as WAVs.
  5. One answer containing a wrong GRR.
  6. One barge-in.
  7. End, then scoring with the real reviewer, then the review mode render.
- **Assertions.**
  - Whisper is on Metal, HeadTTS is on WebGPU, and native `.node` files load from `app.asar.unpacked`.
  - The session reaches review mode with a scorecard whose total is between 6 and 30 and whose evidence quotes are verified.
  - The flag map renders.
  - No CSP violations and no uncaught errors appear in the console.
  - The IPC redaction tap is clean before review mode.
- **Cost.** Keep spend small: one session per case.

### Live evals
- Re-run `npm run test:live` (Phase 6 interviewer evals plus Phase 8 reviewer ordering).
- All must pass: no leak, GRR pushback, sections within cap, pushback once, cache reads, and strong > average > weak.

### Latency report
- Write `.planning/phases/09-packaged-live-sign-off/LATENCY.md` from the live packaged run's stored timings.
- Report medians and p90 for each stage: stop→transcript, transcript→first token, first token→first audio, and the total stop→first audio. Compare against the 3 s target.
- Restate the Phase 6/7 recommendation: Haiku via `INTERVIEWER_MODEL`, prefix trimming, and overlapping the first grill turn with extraction.
- Report the numbers honestly. Don't switch the model, because that's Rishi's call.

### Offline check
- Run the packaged app with all network blocked except `api.anthropic.com`.
- Mechanism: Electron `session.webRequest` in an E2E-only harness mode that logs every non-`app://` request. Assert that the only remote host is `api.anthropic.com` (HeadTTS, transformers and the models are all local).
- Alternatively, assert this from the request log in an existing T2 run.

### TCC permissions
- Real permission dialogs can't be clicked unattended. Do the automatable part:
  - Verify `systemPreferences.getMediaAccessStatus` handling.
  - Verify that `ensureMediaAccess` asks only when the status is `not-determined`.
  - Confirm the packaged entitlements and usage strings are present (`verify-package.sh`).
- Record "permissions re-prompt after `tccutil reset`" as a single human verification item in VERIFICATION, with exact steps:
  1. `tccutil reset Microphone com.<appId>`
  2. `tccutil reset Camera com.<appId>`
  3. Launch from Finder.
  4. Expect two prompts.

  Mark the result `human_needed` for that item only. Do NOT run `tccutil reset` unattended, because it would change the user's system permissions.

### Memory soak
- In the packaged app (or the built app), run 3 back-to-back sessions on fakes, with real TTS and avatar (where the leak risk is), at a time scale.
- Sample `app.getAppMetrics()` working-set memory per process after each session.
- Assert that growth from session 1 to session 3 is under 25% for the renderer and under 25% for main.
- Assert there is still exactly one avatar instance.

### Docs
- `README.md` covering:
  - what it is;
  - install (`npm ci`, `npm run fetch-assets`, `npm run package`);
  - first run (the key auto-fills from keymgr or can be pasted in Settings);
  - choosing a voice (the audition WAVs and the `VOICE` constant);
  - the interviewer model (`INTERVIEWER_MODEL`), with the latency trade-off;
  - the cases root;
  - privacy (local STT and TTS, only Claude is remote, no recording);
  - the test commands for T1, T2, live and packaged.
- `docs/SIGNOFF.md`: the milestone sign-off table covering every requirement, the test that proves it, and the last result.

### Disk
- About 7.6 GB is free. Run `rm -rf release/` before and after packaging, check `df` before packaging, and ship only the turbo model.

### Claude's Discretion
- Spec file names, the soak implementation, and the docs structure.
</decisions>

<code_context>
## Existing Code Insights
- Packaged smoke tests: `tests/e2e/*packaged*`, `scripts/verify-package.sh` (07-10 added the Metal check).
- The live suites: `src/main/agent/claudeLlm.live.test.ts`, the Phase 8 reviewer live test, and `npm run test:live`.
- Voice-loop T2: `tests/e2e/voiceloop.t2.spec.ts` and `voiceFixtures.ts` (the `__mic` injection and `say` fixtures).
- Timings: session timings carry the latency stamps (`src/main/session/latency.ts`).
- PITFALLS "Looks Done But Isn't" checklist: `.planning/research/PITFALLS.md`.
</code_context>

<specifics>
## Specific Ideas
- Rishi should wake up to an app he can open and use, plus a short, honest report of what is proven and what still needs his hands: voice choice, the model latency choice, and the TCC prompt check.
</specifics>

<deferred>
## Deferred Ideas
- v2 items in REQUIREMENTS.md.
</deferred>
