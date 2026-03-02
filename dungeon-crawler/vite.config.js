import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // The game's core modules are tightly interdependent (circular static imports),
    // so they can't be meaningfully split into separate chunks. Raising the limit
    // silences the false-positive warning rather than masking a real problem.
    chunkSizeWarningLimit: 2000,
  },
});
