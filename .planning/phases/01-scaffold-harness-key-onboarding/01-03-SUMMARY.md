---
phase: 01-scaffold-harness-key-onboarding
plan: 03
subsystem: keys
tags: [api-key, probe, keystore, dotenv, tdd]
requires: [01-01]
provides:
  - src/main/keys/dotenv.ts (parseDotenv, resolveDotenvPath)
  - src/main/keys/probe.ts (probeKey, PROBE_MODEL)
  - src/main/keys/keyStore.ts (createKeyStore, Cipher, KeyStore, KeyStoreDeps)
affects: [01-06]
tech-stack:
  added: []
  patterns: [injected cipher seam, SDK fetch seam for probe tests, tmp+rename atomic write with mode 0600]
key-files:
  created: [src/main/keys/dotenv.ts, src/main/keys/dotenv.test.ts, src/main/keys/probe.ts, src/main/keys/probe.test.ts, src/main/keys/keyStore.ts, src/main/keys/keyStore.test.ts]
  modified: []
key-decisions:
  - "Probe keeps thinking:{type:'disabled'}; SDK 1.4.0 types accept it"
  - "save() returns 'unavailable' if persist fails after probing (cipher went unavailable mid-call)"
requirements-completed: [KEY-01, KEY-02, KEY-03, KEY-04, QA-01]
duration: 3min
completed: 2026-11-03
---

# Phase 1 Plan 03: API-Key Domain Summary

Electron-free key domain: a 20-line dotenv parser with an E2E-safe path rule, a 1-token `claude-haiku-5-5` probe classifying 401/403 invalid, 429 valid, everything else unverified (maxRetries 0), and a KeyStore with stored -> env -> .env precedence, probe-gated save/replace/clear, and encrypted tmp+rename persistence at mode 0600 through an injected cipher.

## Accomplishments

- `npx vitest run src/main/keys/`: 3 files, 33 tests pass (8 dotenv, 5 probe, 20 KeyStore); secret-scan still green
- No module imports `electron`; no `dotenv` dependency
- KEY-03 enforced by an `afterEach` that asserts no log call contains either test key; plaintext never on disk checked after save/replace

## Task Commits

1. Task 1 RED `aedd613`, GREEN `f760423` (dotenv)
2. Task 2 RED `a288c0b`, GREEN `6707d5f` (probe)
3. Task 3 RED `6e95711`, GREEN `b6607b8` (KeyStore)

## Deviations from Plan

None in behaviour. Notes:
- `npm run typecheck:node` currently fails only on `tests/replay/server.test.ts` (parallel plan 01-02's in-progress RED file); zero errors in `src/main/keys`.
- KeyStore logs a warning (no key) when an env/.env key is kept in memory only because encryption is unavailable.

## Known Stubs

None.

## Self-Check: PASSED
