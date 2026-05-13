/**
 * test/smoke.test.js
 *
 * Phase 1 smoke test — verifies that the test infrastructure is wired correctly:
 *  • The stubs intercept audio.js / minimap.js so no AudioContext is created.
 *  • quest.js (which imports both) can be imported without throwing.
 *  • The fresh-modules helper works: vi.resetModules() + dynamic import succeeds.
 */

import { describe, it, expect } from 'vitest';
import { freshImport } from './helpers/fresh-modules.js';

describe('smoke — infrastructure', () => {
  it('imports quest.js without errors', async () => {
    const mod = await freshImport('src/quest.js');
    expect(typeof mod.getQuestLog).toBe('function');
    expect(typeof mod.setQuestLog).toBe('function');
  });

  it('freshImport gives a clean module each time', async () => {
    const a = await freshImport('src/quest.js');
    a.setQuestLog({ q1: 'accepted' });
    expect(a.getQuestLog()).toEqual({ q1: 'accepted' });

    // After a fresh import the log is back to empty
    const b = await freshImport('src/quest.js');
    expect(b.getQuestLog()).toEqual({});
  });

  it('imports help.js without errors', async () => {
    const mod = await freshImport('src/help.js');
    expect(typeof mod.captureHelpState).toBe('function');
    expect(typeof mod.restoreHelpState).toBe('function');
  });

  it('imports essentiary.js without errors', async () => {
    const mod = await freshImport('src/essentiary.js');
    expect(typeof mod.captureEssentiary).toBe('function');
    expect(typeof mod.restoreEssentiary).toBe('function');
  });
});
