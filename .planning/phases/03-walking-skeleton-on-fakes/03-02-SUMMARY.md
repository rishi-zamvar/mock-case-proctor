---
phase: 03-walking-skeleton-on-fakes
plan: 02
subsystem: main/app-protocol + case library
tags: [app-protocol, BAR-02, case-library, tdd]
requires: [Phase 1 app:// resolver, Phase 2 library.ts]
provides: [resolveCasePdfRequest, registerAppProtocol casePdf param, findCase, casePdfResolver, readDeckText, case-99 fixture PDFs]
affects: [03 compose/main wiring (pass casePdfResolver(root) as 4th arg), 03 session loadCase (readDeckText), Phase 4 react-pdf]
tech-stack:
  added: []
  patterns: [raw-path exact-match allowlist, defence-in-depth filename guard, injected pdftotext runner]
key-files:
  created: [src/main/domain/cases/deckSource.ts, src/main/domain/cases/deckSource.test.ts, tests/fixtures/cases/case_99_fixture/case_99_fixture_interviewee_package.pdf, tests/fixtures/cases/case_99_fixture/case_99_fixture_interviewer_package.pdf]
  modified: [src/main/protocol.ts, src/main/protocol.test.ts, src/main/appProtocol.ts, src/main/appProtocol.test.ts, src/main/domain/cases/library.ts, src/main/domain/cases/library.test.ts]
decisions:
  - "Case PDF route is app://bundle/cases/<NN>/interviewee.pdf (same-origin, no corsEnabled); anything else under /cases is 404"
  - "Case route matched on the RAW path with an exact regex; encoded/dot-segment variants are denied, not normalised"
metrics:
  duration: 6min
  completed: 2026-11-03
  tasks: 2
  files: 10
---

# Phase 3 Plan 02: Case-PDF app:// route and deck source Summary

`app://bundle/cases/<NN>/interviewee.pdf` is the only case file reachable over app://, matched by exact raw-path regex, resolved through `casePdfResolver` (interviewee path only, must exist), and double-checked in the handler against `_interviewer_package.pdf`; `readDeckText` supplies deck text from `deck.txt` or pdftotext on the interviewee PDF.

## Tasks

| Task | Name | RED | GREEN |
|------|------|-----|-------|
| 1 | Case-PDF route resolver + handler wiring | 9065605 | ee53e82 |
| 2 | findCase, casePdfResolver, readDeckText, fixture PDFs | e97a7dc | 98ac06d |

## Verification

- `npx vitest run src/main`: 402 passed, 1 skipped (pre-existing skip)
- `npm run typecheck:node`: clean
- No `corsEnabled` in appProtocol.ts; no `interviewer` in deckSource.ts
- Both fixture PDFs start with `%PDF`, are tracked, and contain fictional text only (generated with cupsfilter)

## Deviations from Plan

None - plan executed exactly as written. (The appProtocol test fake serves 200 only for `file:///lib/` URLs so bundle-root misses still reject like Electron's net.fetch; a test detail, not a behaviour change.)

## Notes for downstream

- `registerAppProtocol` callers are unchanged until compose/main passes `casePdfResolver(root)` as the 4th argument; without it every `/cases/` request is 404.

## Known Stubs

None.

## Self-Check: PASSED
