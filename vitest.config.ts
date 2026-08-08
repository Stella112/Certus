import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    // Integration tests hit the real sandbox: 3s timeout per call, several calls per case.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
