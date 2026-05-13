/**
 * test/round-trip-essentiary.test.js
 *
 * Round-trip tests for essentiary.js: captureEssentiary / restoreEssentiary.
 *
 * State owned by essentiary.js:
 *   _arenaMonsterTiers  { [monsterId: string]: number }  (starts empty / all default to 1)
 *
 * captureEssentiary returns { arenaMonsterTiers: { ... } }.
 * restoreEssentiary replaces _arenaMonsterTiers with whatever is in the payload.
 */

import { describe, it, expect } from 'vitest';
import { freshImport } from './helpers/fresh-modules.js';

function jsonRoundTrip(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('round-trip: essentiary.js', () => {
  it('empty tier map survives round-trip', async () => {
    const mod = await freshImport('src/essentiary.js');
    const snap1 = jsonRoundTrip(mod.captureEssentiary());

    const mod2 = await freshImport('src/essentiary.js');
    mod2.restoreEssentiary(snap1);
    const snap2 = mod2.captureEssentiary();

    expect(snap2).toEqual(snap1);
  });

  it('arena tier victories survive round-trip', async () => {
    const mod = await freshImport('src/essentiary.js');

    // Record victories for a couple of monster types
    mod.recordArenaVictory('goblin');
    mod.recordArenaVictory('goblin');   // tier 3
    mod.recordArenaVictory('skeleton'); // tier 2
    mod.recordArenaVictory('minotaur'); // tier 2

    expect(mod.getMonsterTier('goblin')).toBe(3);
    expect(mod.getMonsterTier('skeleton')).toBe(2);

    const snap1 = jsonRoundTrip(mod.captureEssentiary());

    const mod2 = await freshImport('src/essentiary.js');
    // Default tier before restore
    expect(mod2.getMonsterTier('goblin')).toBe(1);

    mod2.restoreEssentiary(snap1);
    const snap2 = mod2.captureEssentiary();

    expect(snap2).toEqual(snap1);
    expect(mod2.getMonsterTier('goblin')).toBe(3);
    expect(mod2.getMonsterTier('skeleton')).toBe(2);
    expect(mod2.getMonsterTier('minotaur')).toBe(2);
    // A monster that was never fought should still default to 1
    expect(mod2.getMonsterTier('orc')).toBe(1);
  });

  it('restoreEssentiary(null) is a no-op', async () => {
    const mod = await freshImport('src/essentiary.js');
    mod.recordArenaVictory('goblin');

    // Calling restore with null should not throw and should not reset state
    mod.restoreEssentiary(null);
    expect(mod.getMonsterTier('goblin')).toBe(2);
  });
});
