import { describe, it, expect } from 'vitest';
import WEAPONS_DATA from '../src/data/items/weapons.json';

describe('Vampiric Dagger weapon skill', () => {
  it('has double lifeSteal (2.0) on the Crimson Drain skill', () => {
    const dagger = WEAPONS_DATA.find(w => w.name === 'Vampiric Dagger');
    expect(dagger).toBeDefined();
    expect(dagger.weaponSkill).toBeDefined();
    expect(dagger.weaponSkill.name).toBe('Crimson Drain');
    expect(dagger.weaponSkill.lifeSteal).toBe(2);
  });
});
