# Phase 4: Proctored Review Block - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning
**Mode:** Smart discuss, auto-accepted. The user asked Claude to choose the best path and not wait.

<domain>
## Phase Boundary

This phase fills the Phase 3 placeholders for the review block:
- the real deck viewer, using react-pdf over `app://bundle/cases/<id>/interviewee.pdf`;
- a countdown driven by a fixed deadline;
- the 10-minute-warning event, shown as a caption until Phase 5 gives the partner a voice;
- the Ready skip, which already exists, so this phase just keeps it working;
- a mic-check level meter before the session starts;
- the mirrored webcam self-view tile;
- macOS media permissions;
- keeping the Mac awake during a session.

Out of scope: voice and avatar (Phase 5), speech-to-text (Phase 7), notes.
</domain>

<decisions>
## Implementation Decisions

### Deck viewer
- Use `react-pdf@11`. Never install `pdfjs-dist` directly; let react-pdf bring its pinned 6.3.289.
- Set the worker to `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`. Check that Vite emits it into the bundle and that `app://` serves it with the CSP intact. Add only the `worker-src`/`script-src` that is needed.
- Viewer behaviour:
  - Continuous vertical scroll, with pages fit to the stage width.
  - A page indicator ("p. 12 / 31") and keyboard navigation: PgUp/PgDn and ←/→ jump a page; ⌘+ and ⌘− zoom.
  - A thumbnail rail on the left that can be collapsed.
  - The viewer remembers the last page per session, held in session state through an intent.
- Label pages by the deck footer, not the PDF index. PDF page 1 is the case prompt; deck page N is PDF page N+1. The indicator shows "Prompt" for PDF page 1 and "p. N" after that, matching how the interviewer refers to pages.
- During presentation and grilling the deck stays reachable through a "Deck" toggle that swaps the stage between the avatar and the deck. Real candidates keep the deck in front of them.

### Countdown and warning
- Derive the countdown from `machineState` (`reviewDeadline` minus `now` from the clock port) and render it with tabular numbers.
- Never accumulate ticks. On visibility change, recompute from the deadline.
- Set `backgroundThrottling: false`, which is already done.
- At T−10 minutes the reducer or runner emits `REVIEW_WARNING` once. The UI shows a caption toast ("10 minutes left"). In Phase 5 the same event triggers a spoken line.
- At T−0 the review ends automatically and the presentation starts. This already exists; verify it.
- Fake-clock E2E: at a time scale, assert that the warning fires once and the countdown never jumps backward or skips more than one second per real tick when sampled.

### Mic check
- On the start sheet, a "Check your setup" step sits before Start. It shows a live level meter and a camera preview.
- The meter uses an AnalyserNode RMS over `getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}})`.
- If the input stays silent (RMS below the threshold for 3 seconds while the user is prompted to "say something"), show the warning "We can't hear you — check your mic". The user can still continue.
- E2E: the fake WAV mic makes the meter move (peak above 0.1). A silent-WAV launch triggers the silent warning. That needs a second fixture plus a launch flag.

### Webcam
- Use `getUserMedia({video:{width:640,height:360}})` on a stream separate from the mic.
- The tile is mirrored (`transform: scaleX(-1)`), in the right column, with rounded corners and the label "You".
- Never record and never write to disk. Stop tracks on session end and on unmount.
- If the camera is denied or missing, show a calm placeholder tile with a "Camera off" note. Never fail the session over it.
- Toggle buttons for camera on/off and mic mute sit in the bottom bar. Mic mute only matters from Phase 7 on.

### Permissions and power
- In main:
  - Use `systemPreferences.askForMediaAccess('microphone' | 'camera')` before the first session, on macOS only.
  - `session.setPermissionRequestHandler` allows only `media` for the app's origin and denies everything else.
  - `setPermissionCheckHandler` follows the same rule.
  - All of this is skipped under E2E, which uses the fake-ui switch.
- Start `powerSaveBlocker.start('prevent-display-sleep')` when a session starts and stop it when the session ends or is abandoned. Unit-test it with an injected power API.

### Claude's Discretion
- The component breakdown and the thumbnail rendering strategy. Thumbnails can be rendered lazily at low resolution.
</decisions>

<code_context>
## Existing Code Insights
- `src/renderer/src/screens/Session.tsx` holds the stage placeholder ("Deck viewer — Phase 4"), the webcam placeholder, the timer, the bottom bar and the Ready button.
- `src/renderer/src/screens/Library.tsx` holds the start sheet. Add the setup check there or as a step after it.
- `src/main/session/runner.ts`, `view.ts` and the reducer `interviewMachine.ts` already carry `reviewDeadline`. The `REVIEW_WARNING` effect or event may need adding to the reducer; do it test-first.
- `app://` serves `/cases/<id>/interviewee.pdf` (03-02).
- The E2E harness has fake-media switches; `tests/e2e/global-setup.ts` generates the WAV.
- The CSP constant is in `src/shared/csp.ts`.
</code_context>

<specifics>
## Specific Ideas
- It should feel like a real 45-minute proctored review: the deck front and centre, a trustworthy clock, and you on camera.
</specifics>

<deferred>
## Deferred Ideas
- Notes and scratchpad.
- Highlighting and annotating the PDF.
</deferred>
