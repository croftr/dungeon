/**
 * test/helpers/fresh-modules.js
 *
 * Utility for round-trip tests that need a "clean" module instance to restore
 * into — i.e. the module's internal state must be back at its default values
 * before calling restore*.
 *
 * Usage:
 *   import { freshImport } from './helpers/fresh-modules.js';
 *
 *   const { getQuestLog, setQuestLog } = await freshImport('src/quest.js');
 *
 * How it works:
 *   vi.resetModules() clears Vitest's module registry for all modules loaded
 *   since the last reset (or since the test started). The subsequent dynamic
 *   import() then re-evaluates the module from scratch, giving us factory-fresh
 *   module-local state. Because resetModules() also clears cached imports of
 *   dependencies, the freshly imported module gets its own dependency instances
 *   as well.
 *
 * IMPORTANT: paths must be passed as project-root-relative bare strings like
 * 'src/quest.js'. They will be resolved into absolute paths by freshImport.
 */

import { vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Reset all cached modules and then dynamically import the requested module,
 * returning its exports.
 *
 * Uses vi.importActual() after resetModules() so that the Vite module resolver
 * (including alias resolution) is applied — this means audio.js / minimap.js /
 * equipment.js aliases defined in vitest.config.js are honoured even after
 * vi.resetModules() clears the cache.
 *
 * @param {string} projectRelativePath - Path relative to the project root,
 *   e.g. 'src/quest.js' or 'src/help.js'.
 * @returns {Promise<Record<string, unknown>>} The freshly imported module's exports.
 */
export async function freshImport(projectRelativePath) {
  vi.resetModules();
  const absolutePath = path.resolve(PROJECT_ROOT, projectRelativePath);
  return vi.importActual(absolutePath);
}
