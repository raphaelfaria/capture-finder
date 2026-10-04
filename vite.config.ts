import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base './': the build works from any path (GitHub Pages serves it under /<repo>/).
// The "legacy-test" mode builds the app with the legacy bridge (src/testing/legacyBridge.ts), which
// exposes the old app's globals for the original test suites; it is never deployed.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [preact()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  build: { outDir: mode === 'legacy-test' ? 'dist-legacy' : 'dist' },
}));
