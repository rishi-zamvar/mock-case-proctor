---
phase: 03-walking-skeleton-on-fakes
plan: 01
subsystem: contracts
tags: [ipc, zod, ports, session-store, redaction]
requires: []
provides: [CH channels, ViewState, LibraryView, Intent, SpeakEvent, Reveal, Scorecard, ViewStateSchema, IntentSchema, StartArgsSchema, IdArgsSchema, AckArgsSchema, SessionFileSchema, LlmPort, SttPort, ClockPort, MakeLlm]
affects: [03-03..03-12]
tech-stack:
  added: []
  patterns: [two-way z.infer compile guards, strict zod at every boundary, superRefine for reviewMode-only reveal]
key-files:
  created: [src/main/ports/index.ts, src/main/store/sessionSchema.ts, src/main/store/sessionSchema.test.ts]
  modified: [src/shared/ipc.ts, src/shared/schemas.ts, src/shared/schemas.test.ts, src/preload/index.ts, src/renderer/src/App.test.tsx, src/renderer/src/screens/Settings.test.tsx]
decisions:
  - "Preload typed as Pick<Api,'key'> / Pick<E2EHooks,'micPeak'> until 03-10 wires the session API"
  - "Key-only renderer test mocks cast to Window['api'] after the Api widening"
metrics:
  duration: 4min
  completed: 2026-11-03
---

# Phase 3 Plan 01: Phase 3 Contracts Summary

Every Phase 3 contract now exists under its final name. The shared IPC types and their strict zod schemas include a ViewState that cannot carry a reveal outside reviewMode. The LLM, STT and clock ports are type-only. session.json has a strict schema at schemaVersion 1, kept identical to the reducer types by compile guards.

## Tasks

| Task | Commits |
|------|---------|
| 1 Shared IPC types + strict schemas | 383dee7 (RED), 9531a03 (GREEN), 855c383 (fix) |
| 2 Ports + session.json schema | 635273a (RED), d65c1d2 (GREEN) |

## Deviations from Plan

**1. [Rule 3 - Blocking] Narrowed the preload's type annotations to keep typecheck green**
- Widening `Api`/`E2EHooks` broke `const api: Api` in `src/preload/index.ts`. The full wiring belongs to 03-10.
- Fix: `Pick<Api,'key'>` and `Pick<E2EHooks,'micPeak'>`, marked with a `ponytail:` comment. 03-10 restores the full types. Commit 9531a03.

**2. [Rule 3 - Blocking] Renderer test mocks**
- The key-only `window.api` mocks in `App.test.tsx` and `Settings.test.tsx` no longer satisfied `Api`, so they are now cast to `Window['api']`. Commit 855c383.

## Verification

- `npx vitest run src/shared src/main/store`: 60 tests pass.
- `npm run typecheck` (node + web) passes.
- `src/shared/ipc.ts` has no imports. `src/shared/schemas.ts` has 25 `.strict()` calls plus `superRefine`.

## Known Stubs

None. The preload Pick is a deliberate placeholder that 03-10 resolves.

## Self-Check: PASSED
