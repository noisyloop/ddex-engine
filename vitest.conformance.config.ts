import { defineConfig } from 'vitest/config';

// Separate config so `pnpm test:conformance` only picks up the XSD-validation
// suite. Kept apart from the default config because libxmljs2 needs a native
// build (prebuilt binary or `node-gyp rebuild`) that we don't want to require
// for the standard `pnpm test` run.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/conformance/**/*.test.ts'],
  },
});
