/**
 * test/round-trip-recruits.test.js
 *
 * Round-trip tests for recruits.js: captureRecruits / restoreRecruits.
 *
 * The RECRUITS array is module-level state initialised from recruits.json.
 * captureRecruits snapshots isRecruited + unlockedStances per recruit id.
 * restoreRecruits replays that snapshot back onto the same RECRUITS array.
 *
 * Note: freshImport of recruits.js re-evaluates the module, which means RECRUITS
 * is re-built from recruits.json — all recruits start as not-recruited.
 */

import { describe, it, expect } from 'vitest';
import { freshImport } from './helpers/fresh-modules.js';

function jsonRoundTrip(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('round-trip: recruits.js', () => {
  it('empty state (no recruits) survives round-trip', async () => {
    const mod = await freshImport('src/recruits.js');
    const snap1 = jsonRoundTrip(mod.captureRecruits());

    const mod2 = await freshImport('src/recruits.js');
    mod2.restoreRecruits(snap1);
    const snap2 = mod2.captureRecruits();

    expect(snap2).toEqual(snap1);
  });

  it('recruited flag survives round-trip', async () => {
    const mod = await freshImport('src/recruits.js');

    // Mark the first recruit as recruited
    const firstId = mod.RECRUITS[0]?.id;
    expect(firstId).toBeDefined();
    mod.RECRUITS[0].isRecruited = true;

    const snap1 = jsonRoundTrip(mod.captureRecruits());

    const mod2 = await freshImport('src/recruits.js');
    // Sanity: default is not-recruited
    expect(mod2.RECRUITS[0].isRecruited).toBeFalsy();

    mod2.restoreRecruits(snap1);
    const snap2 = mod2.captureRecruits();

    expect(snap2).toEqual(snap1);
    expect(mod2.RECRUITS[0].isRecruited).toBe(true);
  });

  it('unlockedStances survive round-trip', async () => {
    const mod = await freshImport('src/recruits.js');

    mod.RECRUITS[0].isRecruited = true;
    mod.RECRUITS[0].unlockedStances = ['iron-guard', 'berserker'];

    const snap1 = jsonRoundTrip(mod.captureRecruits());

    const mod2 = await freshImport('src/recruits.js');
    mod2.restoreRecruits(snap1);
    const snap2 = mod2.captureRecruits();

    expect(snap2).toEqual(snap1);
    // Verify the actual array was restored
    expect(mod2.RECRUITS[0].unlockedStances).toEqual(['iron-guard', 'berserker']);
  });

  it('multiple recruits with mixed states survive round-trip', async () => {
    const mod = await freshImport('src/recruits.js');

    if (mod.RECRUITS.length >= 2) {
      mod.RECRUITS[0].isRecruited = true;
      mod.RECRUITS[0].unlockedStances = ['stance-a'];
      mod.RECRUITS[1].isRecruited = false;
      mod.RECRUITS[1].unlockedStances = [];
    }

    const snap1 = jsonRoundTrip(mod.captureRecruits());

    const mod2 = await freshImport('src/recruits.js');
    mod2.restoreRecruits(snap1);
    const snap2 = mod2.captureRecruits();

    expect(snap2).toEqual(snap1);
  });
});
