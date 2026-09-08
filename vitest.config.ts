import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
    // Run every test file in one worker, in sequence. The suite is small and
    // I/O-light, so serialising it costs nothing measurable — and it removes the
    // worker-pool startup race that intermittently failed the whole run on
    // Windows with "failed to find the current suite". One worker, no race.
    fileParallelism: false,
  },
});
