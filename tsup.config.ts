import { defineConfig } from 'tsup';

export default defineConfig([
  // Plugin sandbox entry — bundled as standalone IIFE-free ESM for Worker Loader
  {
    entry:    { index: 'src/index.ts' },
    outDir:   'dist/plugin',
    format:   ['esm'],
    target:   'esnext',
    platform: 'browser',
    bundle:   true,
    // emdash, react, and cloudflare:workers are available in the host environment
    external: ['emdash', 'react', 'react-dom', 'cloudflare:workers'],
    dts:      false,
    sourcemap: false,
  },
  // Descriptor — imported by the host Astro site config
  {
    entry:    { descriptor: 'src/descriptor.ts' },
    outDir:   'dist',
    format:   ['esm'],
    target:   'esnext',
    platform: 'neutral',
    bundle:   false,
    dts:      true,
    sourcemap: false,
  },
]);
