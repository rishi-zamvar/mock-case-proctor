import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: [['list']],
  use: { trace: 'retain-on-failure' }
})
