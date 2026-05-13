/**
 * test/round-trip-monster.test.js
 *
 * Round-trip tests for monster.js: captureMonsterState / restoreMonsterState.
 *
 * State captured:
 *   _collections.droppedBossEssences  Set<string>
 *   _collections.killedBosses         Set<string>
 *   monsters[]  (per-monster: id, level, alive, hp, hpMax, gridRow, gridCol,
 *                facing, activeDebuffs, awakeningUsed, cureUsed, easyModeApplied,
 *                corpseContents)
 *
 * NOTE: monster.js populates the monsters[] array at module load time by
 * spreading levelNMonsters arrays from the level configs. Tests must work with
 * this pre-populated array rather than assuming it starts empty.
 */

import { describe, it, expect } from 'vitest';
import { freshImport } from './helpers/fresh-modules.js';

function jsonRoundTrip(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('round-trip: monster.js', () => {
  it('monsters array is non-empty at module load (level defs are pre-populated)', async () => {
    const mod = await freshImport('src/monster.js');
    // Verify the assumption: monsters come from the level defs, so > 0
    expect(mod.monsters.length).toBeGreaterThan(0);
  });

  it('fresh capture + restore round-trip (default state)', async () => {
    const mod = await freshImport('src/monster.js');
    const snap1 = jsonRoundTrip(mod.captureMonsterState());

    // Verify shape
    expect(Array.isArray(snap1.monsters)).toBe(true);
    expect(Array.isArray(snap1.droppedBossEssences)).toBe(true);
    expect(Array.isArray(snap1.killedBosses)).toBe(true);

    // Restore into a fresh module and re-capture — should be identical
    const mod2 = await freshImport('src/monster.js');
    mod2.restoreMonsterState(snap1);
    const snap2 = mod2.captureMonsterState();

    expect(snap2.droppedBossEssences.sort()).toEqual(snap1.droppedBossEssences.sort());
    expect(snap2.killedBosses.sort()).toEqual(snap1.killedBosses.sort());
    expect(snap2.monsters.length).toBe(snap1.monsters.length);
    // Per-monster fields must survive
    for (let i = 0; i < snap1.monsters.length; i++) {
      expect(snap2.monsters[i].id).toBe(snap1.monsters[i].id);
      expect(snap2.monsters[i].level).toBe(snap1.monsters[i].level);
      expect(snap2.monsters[i].alive).toBe(snap1.monsters[i].alive);
      expect(snap2.monsters[i].hp).toBe(snap1.monsters[i].hp);
      expect(snap2.monsters[i].hpMax).toBe(snap1.monsters[i].hpMax);
    }
  });

  it('droppedBossEssences set survives round-trip', async () => {
    const mod = await freshImport('src/monster.js');
    // Populate via restore (simulates capture from a game where bosses dropped essences)
    const baseSnap = jsonRoundTrip(mod.captureMonsterState());
    const payload = {
      ...baseSnap,
      droppedBossEssences: ['Minotaur Essence', 'Ogre Essence'],
      killedBosses: [],
    };

    mod.restoreMonsterState(payload);
    const snap1 = jsonRoundTrip(mod.captureMonsterState());
    expect(snap1.droppedBossEssences).toEqual(expect.arrayContaining(['Minotaur Essence', 'Ogre Essence']));

    const mod2 = await freshImport('src/monster.js');
    mod2.restoreMonsterState(snap1);
    const snap2 = mod2.captureMonsterState();

    expect(snap2.droppedBossEssences.sort()).toEqual(snap1.droppedBossEssences.sort());
  });

  it('killedBosses set survives round-trip', async () => {
    const mod = await freshImport('src/monster.js');
    const baseSnap = jsonRoundTrip(mod.captureMonsterState());
    const payload = {
      ...baseSnap,
      killedBosses: ['minotaur', 'ogre', 'giant'],
    };

    mod.restoreMonsterState(payload);
    const snap1 = jsonRoundTrip(mod.captureMonsterState());

    const mod2 = await freshImport('src/monster.js');
    mod2.restoreMonsterState(snap1);
    const snap2 = mod2.captureMonsterState();

    expect(snap2.killedBosses.sort()).toEqual(['giant', 'minotaur', 'ogre']);
  });

  it('alive/hp changes survive round-trip for first-level monster', async () => {
    const mod = await freshImport('src/monster.js');

    // Pick the first non-summoned monster
    const firstMonster = mod.monsters.find(m => !m.summoned);
    expect(firstMonster).toBeDefined();

    // Mutate it
    firstMonster.alive = false;
    firstMonster.hp = 0;

    const snap1 = jsonRoundTrip(mod.captureMonsterState());
    const firstSnapped = snap1.monsters.find(m => m.id === firstMonster.id && m.level === (firstMonster.level ?? 1));
    expect(firstSnapped).toBeDefined();
    expect(firstSnapped.alive).toBe(false);
    expect(firstSnapped.hp).toBe(0);

    // Restore into a fresh module
    const mod2 = await freshImport('src/monster.js');
    mod2.restoreMonsterState(snap1);
    const snap2 = mod2.captureMonsterState();

    const firstRestored = snap2.monsters.find(m => m.id === firstMonster.id && m.level === (firstMonster.level ?? 1));
    expect(firstRestored.alive).toBe(false);
    expect(firstRestored.hp).toBe(0);
  });

  it('corpseContents survive round-trip', async () => {
    const mod = await freshImport('src/monster.js');

    // Find a non-summoned monster and set corpseContents on it
    const target = mod.monsters.find(m => !m.summoned);
    expect(target).toBeDefined();

    const corpse = [
      'Iron Sword', null, 'Minor Healing Potion', null, null,
      null, null, null, null, null,
      null, null, null, null, null,
      null, null, null, null, null,
      null, null, null, null, null,
    ];
    target.alive = false;
    target.hp = 0;
    target.corpseContents = corpse;

    const snap1 = jsonRoundTrip(mod.captureMonsterState());
    const snappedTarget = snap1.monsters.find(
      m => m.id === target.id && m.level === (target.level ?? 1)
    );
    expect(snappedTarget.corpseContents[0]).toBe('Iron Sword');
    expect(snappedTarget.corpseContents[2]).toBe('Minor Healing Potion');

    const mod2 = await freshImport('src/monster.js');
    mod2.restoreMonsterState(snap1);

    const restored = mod2.monsters.find(
      m => m.id === target.id && m.level === (target.level ?? 1)
    );
    expect(restored.corpseContents[0]).toBe('Iron Sword');
    expect(restored.corpseContents[2]).toBe('Minor Healing Potion');
  });

  it('activeDebuffs survive round-trip', async () => {
    const mod = await freshImport('src/monster.js');

    const target = mod.monsters.find(m => !m.summoned);
    expect(target).toBeDefined();

    target.activeDebuffs = [
      { effectId: 'poison', expiresAt: 99999, stacks: 2 },
      { effectId: 'slow',   expiresAt: 88888 },
    ];

    const snap1 = jsonRoundTrip(mod.captureMonsterState());
    const snapped = snap1.monsters.find(
      m => m.id === target.id && m.level === (target.level ?? 1)
    );
    expect(snapped.activeDebuffs).toHaveLength(2);

    const mod2 = await freshImport('src/monster.js');
    mod2.restoreMonsterState(snap1);

    const restored = mod2.monsters.find(
      m => m.id === target.id && m.level === (target.level ?? 1)
    );
    expect(restored.activeDebuffs).toHaveLength(2);
    expect(restored.activeDebuffs[0].effectId).toBe('poison');
    expect(restored.activeDebuffs[1].effectId).toBe('slow');
  });

  it('hpMax restoration prevents HP bar percentage errors', async () => {
    const mod = await freshImport('src/monster.js');

    // Find a monster and halve its hpMax (simulates easy mode)
    const target = mod.monsters.find(m => !m.summoned && m.hpMax > 10);
    expect(target).toBeDefined();
    const halfMax = Math.floor(target.hpMax / 2);
    target.hpMax = halfMax;
    target.hp = halfMax;

    const snap1 = jsonRoundTrip(mod.captureMonsterState());
    const snapped = snap1.monsters.find(
      m => m.id === target.id && m.level === (target.level ?? 1)
    );
    expect(snapped.hpMax).toBe(halfMax);

    const mod2 = await freshImport('src/monster.js');
    mod2.restoreMonsterState(snap1);

    const restored = mod2.monsters.find(
      m => m.id === target.id && m.level === (target.level ?? 1)
    );
    // hpMax MUST be restored to the saved value, not the fresh-spawn value
    expect(restored.hpMax).toBe(halfMax);
    expect(restored.hp).toBe(halfMax);
  });

  it('summoned monsters are excluded from capture', async () => {
    const mod = await freshImport('src/monster.js');

    // Inject a summoned monster directly
    const summon = {
      id: 'test-summon-treekin',
      level: 1,
      alive: true,
      hp: 20,
      hpMax: 20,
      gridRow: 2,
      gridCol: 2,
      facing: 0,
      activeDebuffs: [],
      _awakeningUsed: false,
      _cureUsed: false,
      _easyModeApplied: false,
      corpseContents: null,
      summoned: true,
      mesh: null,
    };
    mod.monsters.push(summon);

    const snap1 = jsonRoundTrip(mod.captureMonsterState());
    const ids = snap1.monsters.map(m => m.id);

    expect(ids).not.toContain('test-summon-treekin');
  });
});
