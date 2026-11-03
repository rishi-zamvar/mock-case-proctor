---
phase: 01-scaffold-harness-key-onboarding
plan: 05
subsystem: renderer
tags: [react, settings, onboarding, design-tokens, inter]
requires: [01-01]
provides:
  - state-switch App routing (loading/settings/home) on window.api.key.status
  - Settings key onboarding screen matching the E2E DOM contract
  - Home placeholder
  - app-wide dark design tokens + bundled Inter
affects: [01-06, 01-07, 01-08]
tech-stack:
  added: []
  patterns: [plain state switch (no router), CSS modules + tokens.css, renderer touches only window.api]
key-files:
  created: [src/renderer/src/App.test.tsx, src/renderer/src/screens/Settings.tsx, src/renderer/src/screens/Settings.test.tsx, src/renderer/src/screens/Settings.module.css, src/renderer/src/screens/Home.tsx, src/renderer/src/styles/tokens.css]
  modified: [src/renderer/src/App.tsx, src/renderer/src/main.tsx, src/renderer/index.html]
key-decisions:
  - "Home reuses Settings.module.css (page/card/muted) instead of its own module"
  - "Save anyway completes when the forced save returns valid or a status with hasKey"
requirements-completed: [KEY-01, KEY-04, QA-01]
duration: 3min
completed: 2026-11-03
---

# Phase 1 Plan 05: Renderer Settings, Home and Design Tokens Summary

Plain state-switch App routes to Settings (no key) or Home (key), Settings covers paste/verify/invalid/unverified+Save anyway/unavailable/empty/Replace/Clear against a mocked `window.api`, and the dark token palette with locally bundled Inter ships in the build.

## Accomplishments

- `npx vitest run --project renderer`: 15 tests pass (13 new across App + Settings)
- `npm run typecheck:web` exit 0; `npx electron-vite build` emits Inter woff2 assets
- Static CSP meta removed from `index.html`; title "Mock Case Proctor"
- No router, no ipcRenderer, no inline styles, no gradients/shadows

## Task Commits

1. Task 1 RED: failing Settings/App component tests - `b8aed63` (test)
2. Task 1 GREEN: Settings key onboarding and Home placeholder - `4034968` (feat)
3. Task 2: tokens, bundled Inter, styles, index.html - `07b3aa4` (feat)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

- `Home.tsx` is the planned Phase 3 placeholder ("Case library coming in Phase 3").

## Self-Check: PASSED
