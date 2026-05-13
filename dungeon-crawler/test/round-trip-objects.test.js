/**
 * test/round-trip-objects.test.js
 *
 * Round-trip tests for objects.js: captureWorldState / restoreWorldState.
 *
 * This is the most important module to test because it owns:
 *   • _state flags (mummyGateOpened, crystalShrineState, etc.)
 *   • _collections Sets (knownAlchemyRecipes, knownForgeRecipes, seenEssences,
 *     unlockedRecipes, disarmedTraps, eggEmptied, openedTrialGates, spokenToNpcs)
 *   • _containerContentsPersistence dict (keyed by "<type>:<level>,<col>,<row>")
 *   • _persistedStarterStashItems array
 *
 * objects.js is the biggest module and has the most THREE.js / DOM usage,
 * but captureWorldState / restoreWorldState are pure-data functions — they only
 * read and write the plain-JS state objects, so they work cleanly under jsdom
 * as long as the module can be imported without throwing.
 *
 * STRATEGY: we use restoreWorldState to seed state (since we can't call
 * spawnObjectsForLevel which requires a scene), then captureWorldState to read
 * it back, then after a fresh import restore again and compare.
 */

import { describe, it, expect } from 'vitest';
import { freshImport } from './helpers/fresh-modules.js';

function jsonRoundTrip(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Build a valid restoreWorldState payload with all fields populated */
function buildWorldPayload(overrides = {}) {
  return {
    flags: {
      // _state flags
      mummyGateOpened: false,
      mummyEscapeGateOpened: false,
      starterGateOpened: false,
      starterPortalEnabled: false,
      crystalShrineState: 0,
      level3PortalEnabled: false,
      level4PortalEnabled: false,
      level2PortcullisOpened: false,
      level2GiantPortcullisOpened: false,
      level2HoleClosed: false,
      level1HoleRoomSpawned: false,
      monsterNpcSaved: false,
      stanceNpcDeparted: false,
      level1BtnPortcullisOpened: false,
      level1OgrePortcullisOpened: false,
      level1ShrineGateOpened: false,
      // Collections that live inside flags (legacy getWorldFlags shape)
      disarmedTraps: [],
      seenEssences: [],
      unlockedRecipes: [],
      monsterNpcStock: [],
      ...overrides.flags,
    },
    merchantStock: overrides.merchantStock ?? [],
    potionMerchantStock: overrides.potionMerchantStock ?? [],
    stanceMerchantStock: overrides.stanceMerchantStock ?? [],
    knownAlchemyRecipes: overrides.knownAlchemyRecipes ?? [],
    knownForgeRecipes: overrides.knownForgeRecipes ?? [],
    eggEmptied: overrides.eggEmptied ?? [],
    openedTrialGates: overrides.openedTrialGates ?? [],
    spokenToNpcs: overrides.spokenToNpcs ?? [],
    containerContents: overrides.containerContents ?? {},
    starterStashItems: overrides.starterStashItems ?? null,
  };
}

describe('round-trip: objects.js', () => {
  it('default empty world state survives round-trip', async () => {
    const mod = await freshImport('src/objects.js');

    const snap1 = jsonRoundTrip(mod.captureWorldState());

    const mod2 = await freshImport('src/objects.js');
    mod2.restoreWorldState(snap1);
    const snap2 = mod2.captureWorldState();

    expect(snap2).toEqual(snap1);
  });

  it('_state boolean flags survive round-trip', async () => {
    const mod = await freshImport('src/objects.js');

    mod.restoreWorldState(buildWorldPayload({
      flags: {
        mummyGateOpened: true,
        starterGateOpened: true,
        starterPortalEnabled: true,
        crystalShrineState: 2,
        level3PortalEnabled: true,
        level4PortalEnabled: true,
        level2PortcullisOpened: true,
        level2GiantPortcullisOpened: true,
        level2HoleClosed: true,
        level1HoleRoomSpawned: false, // false because it mutates dungeonMap cells
        monsterNpcSaved: true,
        stanceNpcDeparted: true,
        level1BtnPortcullisOpened: true,
        level1OgrePortcullisOpened: true,
        level1ShrineGateOpened: true,
        disarmedTraps: [],
        seenEssences: [],
        unlockedRecipes: [],
        monsterNpcStock: [],
      },
    }));

    const snap1 = jsonRoundTrip(mod.captureWorldState());

    const mod2 = await freshImport('src/objects.js');
    mod2.restoreWorldState(snap1);
    const snap2 = mod2.captureWorldState();

    expect(snap2.flags.mummyGateOpened).toBe(true);
    expect(snap2.flags.starterGateOpened).toBe(true);
    expect(snap2.flags.crystalShrineState).toBe(2);
    expect(snap2.flags.level3PortalEnabled).toBe(true);
    expect(snap2.flags.level2HoleClosed).toBe(true);
    expect(snap2).toEqual(snap1);
  });

  it('_collections Sets survive round-trip (all types)', async () => {
    const mod = await freshImport('src/objects.js');

    mod.restoreWorldState(buildWorldPayload({
      knownAlchemyRecipes: ['Minor Healing Potion', 'Minor Mana Potion'],
      knownForgeRecipes: ['Iron Sword', 'Steel Helm'],
      eggEmptied: ['1,5,10', '2,8,3'],
      openedTrialGates: ['12,4', '7,9'],
      spokenToNpcs: ['0,3,5', '1,10,12'],
      flags: {
        disarmedTraps: ['5,10', '12,3', '8,7'],
        seenEssences: ['Minotaur Essence', 'Ogre Essence'],
        unlockedRecipes: ['Goblin Parchment'],
        monsterNpcStock: [],
      },
    }));

    const snap1 = jsonRoundTrip(mod.captureWorldState());

    const mod2 = await freshImport('src/objects.js');
    mod2.restoreWorldState(snap1);
    const snap2 = mod2.captureWorldState();

    // Verify Set-backed arrays (order may differ — sort for comparison)
    expect(snap2.knownAlchemyRecipes.sort()).toEqual(snap1.knownAlchemyRecipes.sort());
    expect(snap2.knownForgeRecipes.sort()).toEqual(snap1.knownForgeRecipes.sort());
    expect(snap2.eggEmptied.sort()).toEqual(snap1.eggEmptied.sort());
    expect(snap2.openedTrialGates.sort()).toEqual(snap1.openedTrialGates.sort());
    expect(snap2.spokenToNpcs.sort()).toEqual(snap1.spokenToNpcs.sort());
    expect(snap2.flags.disarmedTraps.sort()).toEqual(snap1.flags.disarmedTraps.sort());
    expect(snap2.flags.seenEssences.sort()).toEqual(snap1.flags.seenEssences.sort());
    expect(snap2.flags.unlockedRecipes.sort()).toEqual(snap1.flags.unlockedRecipes.sort());
  });

  it('_containerContentsPersistence with all type prefixes survives round-trip', async () => {
    const mod = await freshImport('src/objects.js');

    const containers = {
      'chest:1,3,5':        ['Iron Sword', null, 'Minor Healing Potion'],
      'rack:1,5,6':         ['Steel Axe', 'Leather Helm'],
      'cabinet:2,10,12':    ['Fireball Tome'],
      'anvil:2,8,9':        ['Goblin Schematic'],
      'bone:1,4,4':         ['Skeleton Key', null],
      'statue:2,6,6':       ['Minotaur Essence'],
      // Same cell, different type — must NOT collide
      'chest:1,3,5,1':      ['Shield of Oak'],
    };

    mod.restoreWorldState(buildWorldPayload({ containerContents: containers }));

    const snap1 = jsonRoundTrip(mod.captureWorldState());

    // Verify all keys are present
    for (const key of Object.keys(containers)) {
      expect(snap1.containerContents).toHaveProperty(key);
    }

    const mod2 = await freshImport('src/objects.js');
    mod2.restoreWorldState(snap1);
    const snap2 = mod2.captureWorldState();

    expect(snap2.containerContents).toEqual(snap1.containerContents);
  });

  it('_persistedStarterStashItems survives round-trip', async () => {
    const mod = await freshImport('src/objects.js');

    const stashItems = [
      'Minor Healing Potion', null, null, 'Iron Sword', null,
      null, 'Torch', null, null, null,
      null, null, null, null, null,
      null, null, null, null, null,
      null, null, null, null, null,
    ];

    mod.restoreWorldState(buildWorldPayload({ starterStashItems: stashItems }));

    const snap1 = jsonRoundTrip(mod.captureWorldState());
    expect(snap1.starterStashItems).toEqual(stashItems);

    const mod2 = await freshImport('src/objects.js');
    mod2.restoreWorldState(snap1);
    const snap2 = mod2.captureWorldState();

    expect(snap2.starterStashItems).toEqual(stashItems);
    expect(snap2).toEqual(snap1);
  });

  it('restoreWorldState(null) is a no-op (does not throw)', async () => {
    const mod = await freshImport('src/objects.js');
    expect(() => mod.restoreWorldState(null)).not.toThrow();
  });

  it('missing _state keys default to false/0 on restore (no key pollution)', async () => {
    const mod = await freshImport('src/objects.js');

    // Restore a payload that is missing several _state keys (simulates an old save)
    mod.restoreWorldState({
      flags: {
        mummyGateOpened: true,
        // All other keys intentionally absent
        disarmedTraps: [],
        seenEssences: [],
        unlockedRecipes: [],
        monsterNpcStock: [],
      },
      knownAlchemyRecipes: [],
      knownForgeRecipes: [],
      eggEmptied: [],
      openedTrialGates: [],
      spokenToNpcs: [],
      containerContents: {},
    });

    const snap = mod.captureWorldState();
    // mummyGateOpened was explicitly set
    expect(snap.flags.mummyGateOpened).toBe(true);
    // starterGateOpened was absent in the restore payload — must default to false
    expect(snap.flags.starterGateOpened).toBe(false);
    // crystalShrineState is a number — absent keys default to 0
    expect(snap.flags.crystalShrineState).toBe(0);
  });
});
