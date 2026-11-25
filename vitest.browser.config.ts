import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/** Runs the runtime tests in real Chromium, Firefox and WebKit; tests using Node APIs stay in the Node run. */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [
      'test/spec.test.ts',
      'test/deep.test.ts',
      'test/keyed-limit.test.ts',
      'test/toolbox-parity.test.ts',
      'test/path-fixtures.test.ts',
    ],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
});
