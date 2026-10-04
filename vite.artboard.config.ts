import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// The artboard page script (src/artboard/main.tsx) as one classic script plus one stylesheet, which
// tools/artboard inlines into artboards/<Name>Mock.dc.html.
export default defineConfig({
  plugins: [preact()],
  publicDir: false,
  build: {
    outDir: 'dist-artboard',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/artboard/main.tsx',
      formats: ['iife'],
      name: 'Artboard',
      fileName: () => 'artboard.js',
      cssFileName: 'artboard',
    },
  },
});
