---
phase: 03-walking-skeleton-on-fakes
plan: 10
subsystem: composition
tags: [compose, ipc, preload, e2e-tap, case-pdf-route]
requires:
  - phase: 03-02
    provides: casePdfResolver, readDeckText, registerAppProtocol(casePdf)
  - phase: 03-08
    provides: createSessionRunner / SessionRunner
  - phase: 03-09
    provides: renderer routing over window.api (library/session/onView/onSpeak)
provides:
  - readConfig / compose / AppConfig (single composition root, env-selected fakes)
  - registerIpc(ipc, IpcDeps, devUrl) with guarded + zod-validated session channels
  - full preload Api + E2E hooks (micPeak, say, ipcLog redaction tap)
affects: [03-11/12 E2E, phases 5-7 real adapters swap in compose.ts]
tech-stack:
  added: []
  patterns:
    - "compose(env, {userData, log, send}) is the only place adapters are built; index.ts passes process.env in"
    - "ipc.ts `on(ch, schema, fn)` helper: origin guard first, then tuple safeParse, then handler"
    - "Preload `inv()` wraps every invoke so the E2E tap records all invoke results; permanent view/speak listeners record pushes"
key-files:
  created:
    - src/main/compose.ts
    - src/main/compose.test.ts
  modified:
    - src/main/ipc.ts
    - src/main/ipc.test.ts
    - src/main/index.ts
    - src/preload/index.ts
    - tests/e2e/shell.spec.ts
key-decisions:
  - "LLM/STT/TTS/ADAPTERS env set to anything but 'fake' throws at startup; real adapters land in Phases 5-7"
  - "E2E_TIME_SCALE honoured only when E2E=1"
  - "Main send() skips destroyed windows so a late view push after close cannot throw"
requirements-completed: [BAR-01, BAR-02, LIB-01]
duration: 6min
completed: 2026-11-03
---

# Phase 3 Plan 10: Composition Root and Session IPC Summary

The walking skeleton is assembled. `compose.ts` builds the fake LLM/STT, the scaled clock, the session store and the runner from env (CASES_ROOT, SESSIONS_DIR, E2E_TIME_SCALE). IPC adds 7 origin-guarded, zod-validated channels. The preload exposes the full `Api` and, under `--e2e`, an IPC tap that records every payload. The built app opens on the case library and serves the interviewee PDF (but not the interviewer PDF) through `app://bundle/cases/<id>/interviewee.pdf`.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 RED: compose + session IPC tests | f90e82c | 25 failing |
| 1 GREEN: compose.ts + validated IPC | 75e3dd3 | 53/53 pass |
| 2 Preload API + E2E tap, index.ts wiring, shell spec | 397d91a | full vitest, typecheck, build, 16/16 E2E pass |

## Verification
- `npx vitest run`: 679 passed, 2 skipped
- `npm run typecheck` and `npm run build`: exit 0
- `npm run test:e2e`: 16/16 pass (key, leak and shell Phase 1 specs unchanged except for the api-surface assertion)
- Scratch smoke (scratchpad only, not committed): `case-card-99` is visible; `interviewee.pdf` returns 200 and `interviewer.pdf` returns 404
- `grep process.env src/main` (non-test): only index.ts. The preload never imports schemas or zod.

## Deviations from Plan

**1. [Rule 1 - Lint] Fixed pre-existing lint errors in ipc.test.ts.** The file had missing return types and `as any`, and I touched it anyway. Replaced the `as any` casts with typed `IpcDeps` casts.

**2. Acceptance grep `safeParse` count ≥ 6 not literally met (count = 2).** All 7 new channels go through one `on(ch, schema, fn)` helper that runs guard then `schema.safeParse`, so every channel is validated, as the tests show. The literal count reflects the dedup, not missing validation.

**3. `let win` did not exist in index.ts.** I added it at module scope, and `createWindow` now returns the window.

## Deferred Issues
- `npm run lint` still exits non-zero on 19 pre-existing errors in files 03-10 didn't touch (logged in deferred-items.md). All 03-10 files lint clean, and the repo-wide error count dropped from 21 to 19.

## Known Stubs
None. The fake adapters are intentional for Phase 3, and real ones swap in at compose.ts in Phases 5-7.

## Self-Check: PASSED
