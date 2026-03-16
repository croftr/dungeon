import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Force three.proton.js (and any other bundled lib) to use the same
      // Three.js instance as the rest of the app, eliminating the
      // "Multiple instances of Three.js" warning.
      'three': path.resolve('./node_modules/three'),
    },
  },
  build: {
    // Modern browsers only -- skip syntax down-leveling
    target: 'esnext',

    // Split vendor libraries into separate cacheable chunks so V8 can
    // stream-compile and parallel-parse them instead of one 1.8 MB monolith.
    // Game code stays in one chunk due to circular deps
    // (party.js <-> equipment.js, monster.js <-> objects.js).
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-three': ['three'],
          'vendor-extras': [
            'three/examples/jsm/loaders/GLTFLoader.js',
            'three/examples/jsm/loaders/DRACOLoader.js',
            'three/examples/jsm/renderers/CSS2DRenderer.js',
          ],
          'vendor-particles': ['three.proton.js', 'three.quarks'],
          'vendor-tween': ['@tweenjs/tween.js'],
        },
      },
    },

    // The game's core modules are tightly interdependent (circular static imports),
    // so they can't be meaningfully split into separate chunks.
    chunkSizeWarningLimit: 2000,

    // Native modulepreload is supported in all target browsers
    modulePreload: { polyfill: false },

    // Sourcemaps for production profiling (no runtime cost)
    sourcemap: true,

    // DIAGNOSTIC: disable minification to test if it's the cause of sluggishness
    minify: false,
  },
});
