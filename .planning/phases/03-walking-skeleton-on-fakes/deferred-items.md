# Deferred Items (Phase 03)

## From 03-10
- `npm run lint` exits non-zero on 19 pre-existing errors (explicit-function-return-type, no-explicit-any, no-unused-vars) in files untouched by 03-10: src/main/e2e.test.ts, src/main/keys/keyStore.test.ts, src/main/keys/probe.test.ts, src/main/store/sessionSchema.test.ts, src/renderer/src/screens/Settings.test.tsx, tests/e2e/key.spec.ts, tests/replay/server.test.ts. 03-10 files are lint-clean (baseline went 21 -> 19 by fixing ipc.test.ts).
- RESOLVED in 03-11 (eaaaa03): all 19 errors fixed; `npm run lint` exits 0.
