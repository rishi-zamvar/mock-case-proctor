---
phase: 04-proctored-review-block
plan: 02
subsystem: renderer/deck
tags: [react-pdf, deck-viewer, fixture]
requires: []
provides:
  - "DeckViewer component (default export) + deckLabel()"
  - "global react-pdf jsdom mock in test-setup.ts (globalThis.__PDF_PAGES, 'missing' file -> load error)"
  - "4-page fictional fixture interviewee PDF"
affects: [04-06 Session mounts DeckViewer, 04-07 E2E deck navigation + worker/CSP check]
tech-stack:
  added: ["react-pdf 11.0.0 (exact; pdfjs-dist 6.3.289 transitive)"]
  patterns: ["currentRef mirror so scroll handler never re-reports a page go() already set"]
key-files:
  created:
    - src/renderer/src/deck/DeckViewer.tsx
    - src/renderer/src/deck/DeckViewer.module.css
    - src/renderer/src/deck/DeckViewer.test.tsx
    - tests/config/deps.test.ts
  modified:
    - package.json
    - package-lock.json
    - src/renderer/src/test-setup.ts
    - tests/fixtures/cases/case_99_fixture/case_99_fixture_interviewee_package.pdf
decisions:
  - "No react-pdf options prop: pdfjs 6.3.289 has no isEvalSupported (eval path removed), so OPTIONS would be an empty type error"
  - "Scroll de-dupe uses a currentRef mirror instead of a separate in-flight flag (go() sets it before scrolling)"
metrics:
  duration: 4min
  completed: 2026-11-03
  tasks: 2
  files: 8
---

# Phase 4 Plan 02: Deck Viewer Summary

react-pdf 11 DeckViewer: a continuous width-fit scroll with "Prompt" / "p. N / T" footer labels, PgUp/PgDn/arrow paging, Cmd+=/- zoom (0.5 to 3), and a collapsible thumbnail rail. It reports page changes through onPageChange and knows nothing about sessions. The fixture deck is now 4 fictional pages.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 1 RED: deps pin test | 5d6f0c1 | 3/4 failed before install |
| 1 GREEN: react-pdf + fixture | 6a42491 | `qpdf --show-npages` = 4; cupsfilter honoured form feeds, single run |
| 2 RED: DeckViewer tests + global mock | b952bc0 | module missing |
| 2 GREEN: DeckViewer | 25e62e1 | 17 component tests |
| 2 refactor | f8b94df | comment wording so only the worker URL names pdfjs-dist |

## react-pdf README notes

- Worker: the recommended setup is `pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()`. It **must be set in the same module that renders `<Document>`/`<Page>`**; if set elsewhere, module order can overwrite it. DeckViewer.tsx does this at the top of the module. Vite emitting the worker into `out/renderer/assets` is still unverified. 04-07 checks it; the `?url` import is the fallback.
- `options`: define it outside the component or `useMemo` it. A new object on every render makes react-pdf reload the document.

## Deviations from Plan

**1. [Rule 1 - Bug] Dropped `OPTIONS = { isEvalSupported: false }`**
- Found during: Task 2 typecheck
- Issue: pdfjs-dist 6.3.289's `DocumentInitParameters` no longer has `isEvalSupported` (TS2559). The eval path is gone, so the CSP concern doesn't apply.
- Fix: no `options` prop. A comment records the rule for keeping options memoized if one is ever added.
- Commit: 25e62e1

**2. [Rule 1 - Bug] Lint fixes**
- The ref is now assigned in a `useEffect`, not during render (react-hooks rule).
- `deckLabel` export has an eslint-disable for `react-refresh/only-export-components`, since the contract requires the named export.

**3. Scroll de-dupe via currentRef**
- `go()` updates `currentRef` before calling `scrollIntoView`, so the scroll event that follows sees the same page and does not fire onPageChange again. This replaces a separate flag, which could get stuck when `scrollIntoView` produces no scroll.

## Known Stubs

None. Thumbnails render eagerly at width 96. A `ponytail:` comment notes this; add windowing if a large deck lags.

## Verification

- `npx vitest run`: 53 files passed, 759 tests passed, 2 skipped
- `npm run typecheck`: exit 0
- ESLint is clean on the deck files and test-setup.ts
- Build and E2E were not run (04-07 owns them)

## Self-Check: PASSED
