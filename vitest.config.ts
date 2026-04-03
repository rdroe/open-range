import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const lib = (p: string) =>
  fileURLToPath(new URL(`./src/lib/${p}`, import.meta.url))

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/lib/**/*.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        lines: 100,
        functions: 95,
      },
    },
  },
  resolve: {
    alias: {
      // Longest match first — `open-range` alone would swallow `open-range/foo`.
      'open-range/basicRange': lib('basicRange/index.ts'),
      'open-range/readableRange': lib('readableRange/index.ts'),
      'open-range/dimensionalRange': lib('dimensionalRange/index.ts'),
      'open-range/ticks': lib('ticks/index.ts'),
      'open-range': lib('index.ts'),
    },
  },
})
