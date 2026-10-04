import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// The legacy bridge as a single classic script (dist-bridge/bridge.js) for tests/legacy/test_app.cjs,
// which evaluates it in a node vm with a stub DOM, as it did the old app script.
export default defineConfig({
  plugins: [preact()],
  publicDir: false,
  build: {
    outDir: 'dist-bridge',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: 'src/testing/bridgeEntry.ts',
      formats: ['iife'],
      name: 'CaptureFinderBridge',
      fileName: () => 'bridge.js',
    },
  },
});
