import { describe, it, expect } from 'vitest';
import { scaleHqPotionEffect } from '../src/crafting.js';
import POTIONS_DATA from '../src/data/items/potions.json';

describe('Potion scaling & HQ effects', () => {
  it('correctly scales Elixir of Foritude effects when HQ', () => {
    const elixirDef = POTIONS_DATA.find(p => p.name === 'Elixir of Foritude');
    expect(elixirDef).toBeDefined();

    const normalEffect = elixirDef.effect;
    expect(normalEffect.stats.vitality).toBe(5);
    expect(normalEffect.stats.resilience).toBe(5);

    const hqEffect = scaleHqPotionEffect(normalEffect);
    // Value multiplier is 1.25, Math.floor(5 * 1.25) = Math.floor(6.25) = 6
    expect(hqEffect.stats.vitality).toBe(6);
    expect(hqEffect.stats.resilience).toBe(6);
  });

  it('correctly scales other elixirs to match', () => {
    const rageDef = POTIONS_DATA.find(p => p.name === 'Elixir of Rage');
    const enlightenmentDef = POTIONS_DATA.find(p => p.name === 'Elixir of Enlightenment');

    expect(scaleHqPotionEffect(rageDef.effect).stats.strength).toBe(6);
    expect(scaleHqPotionEffect(enlightenmentDef.effect).stats.intelligence).toBe(6);
  });
});
