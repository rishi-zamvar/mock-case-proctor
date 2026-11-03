import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: { provider: 'v8', include: ['src/main/**', 'src/shared/**'] },
    projects: [
      {
        extends: true,
        test: {
          name: 'main',
          environment: 'node',
          include: [
            'src/main/**/*.test.ts',
            'src/shared/**/*.test.ts',
            'tests/config/**/*.test.ts',
            'tests/replay/**/*.test.ts'
          ]
        }
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['src/renderer/src/test-setup.ts']
        }
      }
    ]
  }
})
