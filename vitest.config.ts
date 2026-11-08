import { defineConfig } from 'vitest/config'

// The financial engine is the only code under the 100% coverage gate.
// UI, Supabase client and scaffolding are intentionally out of scope.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/finance/**/*.ts'],
      exclude: ['src/lib/finance/**/*.test.ts', 'src/lib/finance/__tests__/**'],
      reporter: ['text', 'html'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
