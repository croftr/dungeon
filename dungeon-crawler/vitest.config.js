import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',

    // Pre-populate the jsdom DOM with stub elements so source modules that call
    // document.getElementById(...).addEventListener(...) at load time don't crash.
    setupFiles: ['./test/setup.js'],

    // Alias audio.js and minimap.js to no-op stubs.
    // These modules use AudioContext / fetch / Three.js internally; the stubs
    // expose the same named exports as no-ops so importing modules see a clean API.
    alias: {
      [path.resolve('./src/audio.js')]:   path.resolve('./test/helpers/stubs.js'),
      [path.resolve('./src/minimap.js')]: path.resolve('./test/helpers/stubs.js'),
    },
  },
});
