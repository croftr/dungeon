import { describe, it, expect } from 'vitest';
import RELICS_DATA from '../src/data/items/relics.json';
import { getElementalRiderBreakdown, calcPlayerPhysicalDamageBreakdown } from '../src/combat-rules.js';
import { getPrimaryAttackElement } from '../src/elements.js';
import { getItemDef } from '../src/items.js';

describe('Relics HP regeneration speed', () => {
  it('all relics with HP regen have an interval of 10s (halved speed)', () => {
    const regenRelics = RELICS_DATA.filter(r => r.hpRegen);
    expect(regenRelics.length).toBeGreaterThan(0);
    for (const relic of regenRelics) {
      expect(relic.hpRegen.interval).toBe(10);
    }
  });
});

describe('Stormcore Relic elemental damage', () => {
  const dummyMonster = {
    name: 'Training Dummy',
    family: 'construct',
    stats: { vitality: 10, resilience: 10 },
    defence: 0,
  };

  const dummyWeapon = {
    name: 'Iron Sword',
    weaponType: 'sword',
    attackType: 'swipe',
    baseDamage: 10,
    statWeights: { str: 1.0 },
  };

  it('adds lightning damage rider when Stormcore Relic is equipped by item reference', () => {
    const character = {
      name: 'Alden',
      stats: { strength: 10, dexterity: 10, intelligence: 10, vitality: 10, resilience: 10 },
      equipment: {
        relic: { name: 'Stormcore Relic', slot: 'relic' },
      },
    };

    const breakdown = getElementalRiderBreakdown(character, dummyMonster, dummyWeapon, null);
    expect(breakdown.breakdown.lightning).toBeDefined();
    // flat = 5, statBonus = 10, riderStatBonusFactor = 0.5 -> flat + statBonus * 0.5 = 5 + 5 = 10
    expect(breakdown.breakdown.lightning).toBe(10);
    expect(breakdown.total).toBe(10);
  });

  it('adds lightning damage rider when Stormcore Relic is passed as full definition', () => {
    const stormcoreDef = getItemDef('Stormcore Relic');
    const character = {
      name: 'Alden',
      stats: { strength: 10, dexterity: 10, intelligence: 10, vitality: 10, resilience: 10 },
      equipment: {
        relic: stormcoreDef,
      },
    };

    const breakdown = getElementalRiderBreakdown(character, dummyMonster, dummyWeapon, null);
    expect(breakdown.breakdown.lightning).toBe(10);
    expect(breakdown.total).toBe(10);
  });

  it('integrates into calcPlayerPhysicalDamageBreakdown total and final damage', () => {
    const characterWithoutRelic = {
      name: 'Alden',
      stats: { strength: 10, dexterity: 10, intelligence: 10, vitality: 10, resilience: 10 },
      equipment: {},
    };

    const characterWithRelic = {
      name: 'Alden',
      stats: { strength: 10, dexterity: 10, intelligence: 10, vitality: 10, resilience: 10 },
      equipment: {
        relic: { name: 'Stormcore Relic', slot: 'relic' },
      },
    };

    const resultWithout = calcPlayerPhysicalDamageBreakdown(characterWithoutRelic, dummyWeapon, dummyMonster);
    const resultWith = calcPlayerPhysicalDamageBreakdown(characterWithRelic, dummyWeapon, dummyMonster);

    expect(resultWithout.elementalTotal).toBe(0);
    expect(resultWith.elementalTotal).toBe(10);
    expect(resultWith.final).toBe(resultWithout.final + 10);
  });

  it('stacks relic lightning rider with weapon elemental damage', () => {
    const fireWeapon = {
      name: 'Flame Blade',
      weaponType: 'sword',
      attackType: 'swipe',
      baseDamage: 10,
      statWeights: { str: 1.0 },
      elementalDamage: {
        fire: 6,
      },
    };

    const character = {
      name: 'Alden',
      stats: { strength: 10, dexterity: 10, intelligence: 10, vitality: 10, resilience: 10 },
      equipment: {
        relic: { name: 'Stormcore Relic', slot: 'relic' },
      },
    };

    const breakdown = getElementalRiderBreakdown(character, dummyMonster, fireWeapon, null);
    expect(breakdown.breakdown.fire).toBe(11); // 6 + 10*0.5
    expect(breakdown.breakdown.lightning).toBe(10); // 5 + 10*0.5
    expect(breakdown.total).toBe(21);
  });

  it('provides primary element for visuals when relic has elemental damage', () => {
    const stormcoreDef = getItemDef('Stormcore Relic');
    const primary = getPrimaryAttackElement(dummyWeapon, null, stormcoreDef);
    expect(primary).toBe('lightning');
  });
});
