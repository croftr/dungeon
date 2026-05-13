import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',

    // Pre-populate the jsdom DOM with stub elements so source modules that call
    // document.getElementById(...).addEventListener(...) at load time don't crash.
    setupFiles: ['./test/setup.js'],

    // Because tests load src/ modules via dynamic import() with absolute file://
    // URLs (see freshImport), Vitest never registers those files in its static
    // module graph, so edits to them are silently ignored in watch mode.
    // forceRerunTriggers tells Vitest to rerun all tests whenever any src/ JS
    // file changes, regardless of whether it appears in the static graph.
    forceRerunTriggers: ['**/src/**/*.js'],

    // Alias audio.js and minimap.js to no-op stubs.
    // These modules use AudioContext / fetch / Three.js internally; the stubs
    // expose the same named exports as no-ops so importing modules see a clean API.
    alias: {
      [path.resolve('./src/audio.js')]:   path.resolve('./test/helpers/stubs.js'),
      [path.resolve('./src/minimap.js')]: path.resolve('./test/helpers/stubs.js'),
    },
  },
});
