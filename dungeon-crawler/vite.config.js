import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      // Force three.proton.js (and any other bundled lib) to use the same
      // Three.js instance as the rest of the app, eliminating the
      // "Multiple instances of Three.js" warning.
      //
      // Must point at the explicit ESM build file, NOT the package root:
      // three's exports map resolves bare `import` to three.module.js but
      // CommonJS `require("three")` (which three.proton.js uses) to a
      // *separate* three.cjs file — a second full copy of Three.js. Aliasing
      // straight to three.module.js short-circuits the exports map so the UMD
      // require and the ESM imports collapse onto one file.
      //
      // Exact-match regex (^three$) so subpath imports like
      // `three/examples/jsm/...` are left untouched.
      { find: /^three$/, replacement: path.resolve('./node_modules/three/build/three.module.js') },
    ],
    // three.proton.js is a UMD bundle that pulls Three.js in via CommonJS
    // `require("three")`, while the app and three.quarks use the ESM
    // `import ... from 'three'` path. Without dedupe those resolve to two
    // separate module instances — bundling a *second* full copy of Three.js
    // into the particles chunk and triggering the runtime
    // "Multiple instances of Three.js" warning. Dedupe collapses both paths
    // onto the single installed copy.
    dedupe: ['three'],
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

  },
});
