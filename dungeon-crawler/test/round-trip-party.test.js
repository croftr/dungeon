/**
 * test/round-trip-party.test.js
 *
 * Round-trip tests for party.js: capturePartyState / restorePartyState.
 *
 * party.js is the most complex module in the save system. It deep-clones the
 * 4-slot party[] array (stripping cooldownTimers), plus gold, autoAttack, and
 * autoRangeAttack flags.
 *
 * DESIGN NOTE: restorePartyState calls updateEffectiveStats(m) for non-empty
 * members, which adds derived fields (activeSets, baseStats, elementalResistances,
 * skillBonuses, statusResistances, skillDurationBonusMs) that were not in the
 * original captured snapshot. Therefore the round-trip test pattern is:
 *
 *   capture → JSON → restore into mod2 → capture mod2 → compare mod2.snap1 == mod2.snap2
 *
 * i.e. we compare TWO captures of post-restore state rather than pre- vs post-restore.
 * This correctly tests that state is STABLE across two restore cycles — any field
 * that exists in the first restore will be present in the second restore too.
 */

import { describe, it, expect } from 'vitest';
import { freshImport } from './helpers/fresh-modules.js';

function jsonRoundTrip(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Minimal party member shape that satisfies restorePartyState's
// updateEffectiveStats call without failing. Only fields required for the
// stats computation need to be present.
function makeMember(id, overrides = {}) {
  return {
    id,
    isEmpty: false,
    name: `Hero${id}`,
    job: 'Fighter',
    stats: { strength: 10, dexterity: 10, vitality: 10, intelligence: 10, resilience: 10 },
    level: 1,
    xp: 0,
    statBonuses: { strength: 0, dexterity: 0, vitality: 0, intelligence: 0, resilience: 0 },
    skillTreeId: null,
    acquiredNodes: ['start'],
    pendingNodePicks: 0,
    pendingNodeChoice: null,
    skills: [],
    spells: [],
    unlockedStances: [],
    stance: null,
    leftHand: null,
    rightHand: null,
    ammo: null,
    ammoB: null,
    image: null,
    skinLight: '#e8c8a0',
    skinDark: '#b08050',
    hairColor: '#8a1a1a',
    irisColor: '#2a6a3a',
    inventory: Array(30).fill(null),
    startingInventory: null,
    startingActionSlots: null,
    equipment: {
      leftHand: null,
      rightHand: null,
      head: null,
      chest: null,
      legs: null,
      feet: null,
      ammo: null,
      skill: null,
      skill2: null,
      skill3: null,
      skill4: null,
      skill5: null,
      skill6: null,
      relic: null,
    },
    isDead: false,
    hp: 100,
    hpMax: 100,
    mp: 50,
    mpMax: 50,
    sp: 100,
    spMax: 100,
    ...overrides,
  };
}

/**
 * Seed a party member into mod.party[0], restore the party into mod2, then
 * compare a SECOND restore against the first. This ensures stability.
 */
async function roundTripMember(member) {
  const mod = await freshImport('src/party.js');
  Object.assign(mod.party[0], member);

  // First capture
  const snap1 = jsonRoundTrip(mod.capturePartyState());

  // Restore into fresh module → second capture
  const mod2 = await freshImport('src/party.js');
  mod2.restorePartyState(snap1);
  const snap2 = jsonRoundTrip(mod2.capturePartyState());

  // Restore AGAIN into mod3 → third capture — must equal second
  const mod3 = await freshImport('src/party.js');
  mod3.restorePartyState(snap2);
  const snap3 = jsonRoundTrip(mod3.capturePartyState());

  return { snap1, snap2, snap3 };
}

describe('round-trip: party.js', () => {
  it('all-empty party + default gold survive round-trip', async () => {
    const mod = await freshImport('src/party.js');
    const snap1 = jsonRoundTrip(mod.capturePartyState());

    const mod2 = await freshImport('src/party.js');
    mod2.restorePartyState(snap1);
    const snap2 = jsonRoundTrip(mod2.capturePartyState());

    expect(snap2.gold).toBe(0);
    expect(snap2.members).toHaveLength(4);
    // All-empty members should round-trip cleanly — toEqual should pass since
    // updateEffectiveStats is not called for isEmpty members.
    expect(snap2).toEqual(snap1);
  });

  it('gold amount survives round-trip', async () => {
    const mod = await freshImport('src/party.js');
    mod.setPartyGold(1234);

    const snap1 = jsonRoundTrip(mod.capturePartyState());
    expect(snap1.gold).toBe(1234);

    const mod2 = await freshImport('src/party.js');
    mod2.restorePartyState(snap1);
    const snap2 = jsonRoundTrip(mod2.capturePartyState());

    expect(snap2.gold).toBe(1234);
  });

  it('autoAttack and autoRangeAttack flags survive round-trip', async () => {
    const mod = await freshImport('src/party.js');
    mod.setAutoAttack(false);
    mod.setAutoRangeAttack(false);

    const snap1 = jsonRoundTrip(mod.capturePartyState());

    const mod2 = await freshImport('src/party.js');
    mod2.restorePartyState(snap1);
    const snap2 = jsonRoundTrip(mod2.capturePartyState());

    expect(snap2.autoAttack).toBe(false);
    expect(snap2.autoRangeAttack).toBe(false);
  });

  it('member equipment.leftHand survives round-trip (stable after two restores)', async () => {
    const { snap2, snap3 } = await roundTripMember(makeMember(0, {
      equipment: {
        ...makeMember(0).equipment,
        leftHand: { name: 'Iron Sword', slot: 'leftHand' },
      },
    }));

    // The CRITICAL field must be present and correct
    expect(snap2.members[0].equipment.leftHand.name).toBe('Iron Sword');
    expect(snap3.members[0].equipment.leftHand.name).toBe('Iron Sword');

    // After two restores the state should be identical (stable)
    expect(snap3).toEqual(snap2);
  });

  it('acquiredNodes array survives round-trip (stable after two restores)', async () => {
    const { snap2, snap3 } = await roundTripMember(makeMember(0, {
      acquiredNodes: ['start', 'strength-1', 'strength-2', 'vitality-1'],
    }));

    expect(snap2.members[0].acquiredNodes).toEqual(['start', 'strength-1', 'strength-2', 'vitality-1']);
    expect(snap3.members[0].acquiredNodes).toEqual(['start', 'strength-1', 'strength-2', 'vitality-1']);
    expect(snap3).toEqual(snap2);
  });

  it('inventory items survive round-trip (stable after two restores)', async () => {
    const inv = Array(30).fill(null);
    inv[0] = { name: 'Minor Healing Potion', count: 3 };
    inv[1] = { name: 'Iron Sword' };
    inv[5] = { name: 'Torch', count: 2 };

    const { snap2, snap3 } = await roundTripMember(makeMember(0, { inventory: inv }));

    expect(snap2.members[0].inventory[0]).toEqual({ name: 'Minor Healing Potion', count: 3 });
    expect(snap2.members[0].inventory[5]).toEqual({ name: 'Torch', count: 2 });
    expect(snap3).toEqual(snap2);
  });

  it('cooldownTimers are NOT persisted (stripped on capture)', async () => {
    const mod = await freshImport('src/party.js');

    Object.assign(mod.party[0], makeMember(0, {
      cooldownTimers: { left: 999, right: 888 },
    }));

    const snap1 = jsonRoundTrip(mod.capturePartyState());
    expect(snap1.members[0].cooldownTimers).toBeUndefined();
  });
});
