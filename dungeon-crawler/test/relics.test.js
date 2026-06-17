import { describe, it, expect } from 'vitest';
import RELICS_DATA from '../src/data/items/relics.json';

describe('Relics HP regeneration speed', () => {
  it('all relics with HP regen have an interval of 10s (halved speed)', () => {
    const regenRelics = RELICS_DATA.filter(r => r.hpRegen);
    expect(regenRelics.length).toBeGreaterThan(0);
    for (const relic of regenRelics) {
      expect(relic.hpRegen.interval).toBe(10);
    }
  });
});
