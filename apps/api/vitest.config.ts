import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Database suites share the seeded catalog; serialize fixture edits and limit memory.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'json-summary', 'lcov', 'html'],
      reportsDirectory: '../../coverage/api',
    },
  },
});
