import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.tsx'],
    // component tests opt into jsdom with a `// @vitest-environment jsdom` comment
    environment: 'node',
    testTimeout: 30000,
  },
});
