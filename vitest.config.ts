import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Conformance tests are gated behind their own script — see
    // `pnpm test:conformance` and `vitest.conformance.config.ts`. They need
    // libxmljs2's native build, which isn't always available in CI.
    exclude: ['tests/conformance/**', 'node_modules/**', 'dist/**'],
  },
});
