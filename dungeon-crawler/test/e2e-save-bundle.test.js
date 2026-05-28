/**
 * test/e2e-save-bundle.test.js
 *
 * Full end-to-end save bundle round-trip test.
 *
 * Pattern:
 *   Phase 1 — seed known state across multiple modules, call captureSave()
 *             → bundle1
 *   Phase 2 — reset all modules, call each restore* individually, call
 *             captureSave() again → bundle2
 *   Phase 3 — reset, restore from bundle2, captureSave() → bundle3
 *
 *   Assert: bundle2 and bundle3 are identical for every save-relevant field.
 *   (bundle1 → bundle2 may differ for party because updateEffectiveStats adds
 *   derived fields on the first restore; bundle2 → bundle3 must be stable.)
 *
 * Why not use freshImport()?
 *   freshImport() calls vi.resetModules() internally, so two freshImport()
 *   calls give two separate registries — modules can't share state across them.
 *   Here we need all modules in ONE registry (the same one save.js loaded its
 *   dependencies into), so we manage vi.resetModules() manually and use direct
 *   dynamic import() with absolute file:// URLs.
 *
 * Why not use applySavePostInit()?
 *   applySavePostInit() calls refreshPartyCards() which does canvas operations
 *   (portrait drawing) that fail under jsdom. We replicate its state-restore
 *   logic directly, skipping only the DOM-rendering calls.
 */

import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

/** Resolve a project-root-relative path to a file:// URL string. */
function u(rel) {
  return pathToFileURL(path.resolve(PROJECT_ROOT, rel)).href;
}

/**
 * Load a fresh set of all save-relevant modules into a single shared registry.
 * Returns an object with named references to each module so tests can mutate
 * state through their public APIs.
 *
 * Call vi.resetModules() first, then call this; it will import save.js (which
 * transitively loads all dependencies) and then import each sub-module directly
 * — Vitest returns the already-cached instance because save.js already pulled
 * it into the registry.
 */
async function loadFreshSystem() {
  // save.js's static imports populate the registry with quest.js, party.js, etc.
  const save     = await import(/* @vite-ignore */ u('src/save.js'));
  // Each subsequent import() gets the cached instance from save.js's evaluation.
  const quest    = await import(/* @vite-ignore */ u('src/quest.js'));
  const help     = await import(/* @vite-ignore */ u('src/help.js'));
  const party    = await import(/* @vite-ignore */ u('src/party.js'));
  const recruits = await import(/* @vite-ignore */ u('src/recruits.js'));
  const ess      = await import(/* @vite-ignore */ u('src/essentiary.js'));
  const monsters = await import(/* @vite-ignore */ u('src/monster.js'));
  const objects  = await import(/* @vite-ignore */ u('src/objects.js'));
  const player   = await import(/* @vite-ignore */ u('src/player.js'));
  return { save, quest, help, party, recruits, ess, monsters, objects, player };
}

function jsonClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Restore a bundle into a freshly loaded system, calling each module's
 * restore function individually (same sequence as applySavePostInit, minus
 * the DOM calls).
 */
function applyBundle(sys, bundle) {
  sys.quest.setQuestLog(bundle.quests);
  sys.help.restoreHelpState(bundle.help);
  sys.party.restorePartyState(bundle.party);         // calls updateEffectiveStats
  sys.recruits.restoreRecruits(bundle.recruits);
  sys.ess.restoreEssentiary(bundle.essentiary);
  sys.monsters.restoreMonsterState(bundle.monsters);
  sys.objects.restoreWorldState(bundle.world);
  sys.player.restorePlayerState(bundle.player);       // no camera arg = skip tween
}

// ─────────────────────────────────────────────────────────────────────────────

describe('e2e: full save bundle round-trip', () => {

  it('default (empty) state is stable across two restore cycles', async () => {
    // ── Phase 1: capture default state ──────────────────────────────────────
    vi.resetModules();
    const sys1 = await loadFreshSystem();
    const bundle1 = jsonClone(sys1.save.captureSave());

    // ── Phase 2: restore into fresh system and re-capture ───────────────────
    vi.resetModules();
    const sys2 = await loadFreshSystem();
    applyBundle(sys2, bundle1);
    const bundle2 = jsonClone(sys2.save.captureSave());

    // ── Phase 3: second restore cycle — must be stable ─────────────────────
    vi.resetModules();
    const sys3 = await loadFreshSystem();
    applyBundle(sys3, bundle2);
    const bundle3 = jsonClone(sys3.save.captureSave());

    // bundle2 → bundle3 must be identical (stable serialisation)
    expect(bundle3.quests).toEqual(bundle2.quests);
    expect(bundle3.help).toEqual(bundle2.help);
    expect(bundle3.party.gold).toBe(bundle2.party.gold);
    expect(bundle3.recruits).toEqual(bundle2.recruits);
    expect(bundle3.essentiary).toEqual(bundle2.essentiary);
    expect(bundle3.monsters.droppedBossEssences.sort())
      .toEqual(bundle2.monsters.droppedBossEssences.sort());
    expect(bundle3.monsters.killedBosses.sort())
      .toEqual(bundle2.monsters.killedBosses.sort());
    expect(bundle3.world.flags).toEqual(bundle2.world.flags);
    expect(bundle3.world.knownAlchemyRecipes.sort())
      .toEqual(bundle2.world.knownAlchemyRecipes.sort());
    expect(bundle3.world.containerContents)
      .toEqual(bundle2.world.containerContents);
    expect(bundle3.player).toEqual(bundle2.player);
  });

  it('seeded state survives two full restore cycles', async () => {
    // ── Phase 1: seed known state and capture ───────────────────────────────
    vi.resetModules();
    const sys1 = await loadFreshSystem();

    // Quest log
    sys1.quest.setQuestLog({
      'quest-fetch-healing-herbs':    'completed',
      'quest-clear-basement-goblins': 'accepted',
      'quest-retrieve-ancient-tome':  'accepted',
    });

    // Help: player has seen two dialogs
    sys1.help.restoreHelpState({ seenKeys: ['tutorial', 'first-recruit', 'chest-tutorial'] });

    // Gold
    sys1.party.setPartyGold(2500);

    // Auto-combat flags
    sys1.party.setAutoAttack(true);
    sys1.party.setAutoRangeAttack(false);

    // Player position
    sys1.player.player.gridRow = 12;
    sys1.player.player.gridCol = 7;
    sys1.player.player.facing  = 1; // East

    // Essentiary: two monsters fought
    sys1.ess.recordArenaVictory('goblin');    // tier 2
    sys1.ess.recordArenaVictory('skeleton');  // tier 2

    // Monster state: mark first non-summoned monster as dead
    const deadMonster = sys1.monsters.monsters.find(m => !m.summoned);
    if (deadMonster) {
      deadMonster.alive = false;
      deadMonster.hp    = 0;
    }

    // World: some flags and collections
    sys1.objects.restoreWorldState({
      flags: {
        mummyGateOpened:    true,
        starterGateOpened:  false,
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
        level1SarcophagusRoomGateOpened: false,
        mummyEscapeGateOpened: false,
        disarmedTraps:  ['5,10', '12,3'],
        seenEssences:   ['Minotaur Essence'],
        unlockedRecipes: [],
        monsterNpcStock: [],
      },
      knownAlchemyRecipes:  ['Minor Healing Potion', 'Minor Mana Potion'],
      knownForgeRecipes:    ['Iron Sword'],
      eggEmptied:           [],
      openedTrialGates:     [],
      spokenToNpcs:         [],
      merchantStock:        [],
      potionMerchantStock:  [],
      stanceMerchantStock:  [],
      containerContents:    {
        'chest:1,3,5': ['Iron Sword', null, 'Minor Healing Potion'],
      },
      starterStashItems: null,
    });

    // Recruit: first recruit enlisted
    if (sys1.recruits.RECRUITS.length > 0) {
      sys1.recruits.RECRUITS[0].isRecruited    = true;
      sys1.recruits.RECRUITS[0].unlockedStances = ['iron-guard'];
    }

    const bundle1 = jsonClone(sys1.save.captureSave());

    // ── Phase 2: restore into fresh system ──────────────────────────────────
    vi.resetModules();
    const sys2 = await loadFreshSystem();
    applyBundle(sys2, bundle1);
    const bundle2 = jsonClone(sys2.save.captureSave());

    // ── Phase 3: restore again — must be stable ─────────────────────────────
    vi.resetModules();
    const sys3 = await loadFreshSystem();
    applyBundle(sys3, bundle2);
    const bundle3 = jsonClone(sys3.save.captureSave());

    // ── Assertions on bundle2 (first restore) ───────────────────────────────

    // Quest log
    expect(bundle2.quests['quest-fetch-healing-herbs']).toBe('completed');
    expect(bundle2.quests['quest-clear-basement-goblins']).toBe('accepted');
    expect(bundle2.quests['quest-retrieve-ancient-tome']).toBe('accepted');

    // Help
    expect(bundle2.help.seenKeys).toEqual(
      expect.arrayContaining(['tutorial', 'first-recruit', 'chest-tutorial'])
    );
    expect(bundle2.help.seenKeys).toHaveLength(3);

    // Gold
    expect(bundle2.party.gold).toBe(2500);

    // Auto-combat flags
    expect(bundle2.party.autoAttack).toBe(true);
    expect(bundle2.party.autoRangeAttack).toBe(false);

    // Player position
    expect(bundle2.player.gridRow).toBe(12);
    expect(bundle2.player.gridCol).toBe(7);
    expect(bundle2.player.facing).toBe(1);

    // Essentiary
    expect(bundle2.essentiary.arenaMonsterTiers.goblin).toBe(2);
    expect(bundle2.essentiary.arenaMonsterTiers.skeleton).toBe(2);

    // Dead monster
    if (deadMonster) {
      const savedDead = bundle2.monsters.monsters.find(
        m => m.id === deadMonster.id && m.level === (deadMonster.level ?? 1)
      );
      expect(savedDead?.alive).toBe(false);
      expect(savedDead?.hp).toBe(0);
    }

    // World flags
    expect(bundle2.world.flags.mummyGateOpened).toBe(true);
    expect(bundle2.world.flags.starterGateOpened).toBe(false);
    expect(bundle2.world.flags.disarmedTraps).toEqual(
      expect.arrayContaining(['5,10', '12,3'])
    );
    expect(bundle2.world.flags.seenEssences).toContain('Minotaur Essence');

    // World collections
    expect(bundle2.world.knownAlchemyRecipes).toEqual(
      expect.arrayContaining(['Minor Healing Potion', 'Minor Mana Potion'])
    );
    expect(bundle2.world.knownForgeRecipes).toContain('Iron Sword');
    expect(bundle2.world.containerContents['chest:1,3,5']).toEqual(
      ['Iron Sword', null, 'Minor Healing Potion']
    );

    // Recruit
    if (sys1.recruits.RECRUITS.length > 0) {
      const firstId = sys1.recruits.RECRUITS[0].id;
      expect(bundle2.recruits[firstId]).toBeTruthy();
    }

    // ── Stability assertions: bundle3 must equal bundle2 ─────────────────────
    expect(bundle3.quests).toEqual(bundle2.quests);
    expect(bundle3.help.seenKeys.sort()).toEqual(bundle2.help.seenKeys.sort());
    expect(bundle3.party.gold).toBe(bundle2.party.gold);
    expect(bundle3.party.autoAttack).toBe(bundle2.party.autoAttack);
    expect(bundle3.party.autoRangeAttack).toBe(bundle2.party.autoRangeAttack);
    expect(bundle3.player).toEqual(bundle2.player);
    expect(bundle3.essentiary).toEqual(bundle2.essentiary);
    expect(bundle3.recruits).toEqual(bundle2.recruits);
    expect(bundle3.monsters.droppedBossEssences.sort())
      .toEqual(bundle2.monsters.droppedBossEssences.sort());
    expect(bundle3.monsters.killedBosses.sort())
      .toEqual(bundle2.monsters.killedBosses.sort());
    expect(bundle3.world.flags.disarmedTraps.sort())
      .toEqual(bundle2.world.flags.disarmedTraps.sort());
    expect(bundle3.world.flags.seenEssences.sort())
      .toEqual(bundle2.world.flags.seenEssences.sort());
    expect(bundle3.world.knownAlchemyRecipes.sort())
      .toEqual(bundle2.world.knownAlchemyRecipes.sort());
    expect(bundle3.world.containerContents)
      .toEqual(bundle2.world.containerContents);
  });

  it('monster per-instance state survives two restore cycles', async () => {
    vi.resetModules();
    const sys1 = await loadFreshSystem();

    // Take the first three non-summoned monsters and mutate them distinctly
    const targets = sys1.monsters.monsters.filter(m => !m.summoned).slice(0, 3);
    expect(targets.length).toBeGreaterThan(0);

    targets[0].alive = false;
    targets[0].hp    = 0;
    targets[0].corpseContents = ['Iron Sword', null, 'Minor Healing Potion', null, null,
      null, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null, null, null];

    if (targets[1]) {
      targets[1].hp = Math.floor(targets[1].hpMax / 2);
      targets[1].activeDebuffs = [{ effectId: 'poison', expiresAt: 9999, stacks: 2 }];
    }

    if (targets[2]) {
      targets[2]._easyModeApplied = true;
      targets[2].hpMax = Math.floor(targets[2].hpMax / 2);
      targets[2].hp    = targets[2].hpMax;
    }

    const bundle1 = jsonClone(sys1.save.captureSave());

    vi.resetModules();
    const sys2 = await loadFreshSystem();
    applyBundle(sys2, bundle1);
    const bundle2 = jsonClone(sys2.save.captureSave());

    vi.resetModules();
    const sys3 = await loadFreshSystem();
    applyBundle(sys3, bundle2);
    const bundle3 = jsonClone(sys3.save.captureSave());

    // Verify in bundle2
    const find = (bundle, m) => bundle.monsters.monsters.find(
      s => s.id === m.id && s.level === (m.level ?? 1)
    );

    const d2 = find(bundle2, targets[0]);
    expect(d2.alive).toBe(false);
    expect(d2.hp).toBe(0);
    expect(d2.corpseContents[0]).toBe('Iron Sword');
    expect(d2.corpseContents[2]).toBe('Minor Healing Potion');

    if (targets[1]) {
      const t2 = find(bundle2, targets[1]);
      expect(t2.hp).toBe(Math.floor(targets[1].hpMax / 2));
      expect(t2.activeDebuffs[0].effectId).toBe('poison');
    }

    if (targets[2]) {
      const t3 = find(bundle2, targets[2]);
      expect(t3.hpMax).toBe(targets[2].hpMax);
      expect(t3.easyModeApplied).toBe(true);
    }

    // Stability: bundle3 matches bundle2 for all monster data
    for (const target of targets) {
      const b2 = find(bundle2, target);
      const b3 = find(bundle3, target);
      expect(b3.alive).toBe(b2.alive);
      expect(b3.hp).toBe(b2.hp);
      expect(b3.hpMax).toBe(b2.hpMax);
      expect(b3.corpseContents).toEqual(b2.corpseContents);
      if (b2.activeDebuffs?.length) {
        expect(b3.activeDebuffs).toEqual(b2.activeDebuffs);
      }
    }
  });

  it('world container contents survive two restore cycles', async () => {
    vi.resetModules();
    const sys1 = await loadFreshSystem();

    sys1.objects.restoreWorldState({
      flags: {
        mummyGateOpened: false, mummyEscapeGateOpened: false,
        starterGateOpened: false, starterPortalEnabled: false,
        crystalShrineState: 0, level3PortalEnabled: false,
        level4PortalEnabled: false, level2PortcullisOpened: false,
        level2GiantPortcullisOpened: false, level2HoleClosed: false,
        level1HoleRoomSpawned: false, monsterNpcSaved: false,
        stanceNpcDeparted: false, level1BtnPortcullisOpened: false,
        level1OgrePortcullisOpened: false, level1ShrineGateOpened: false,
        level1SarcophagusRoomGateOpened: false,
        disarmedTraps: [], seenEssences: [], unlockedRecipes: [], monsterNpcStock: [],
      },
      knownAlchemyRecipes: ['Minor Healing Potion'],
      knownForgeRecipes: [],
      eggEmptied: ['1,5,10'],
      openedTrialGates: ['3,7'],
      spokenToNpcs: ['0,2,4'],
      merchantStock: [],
      potionMerchantStock: [],
      stanceMerchantStock: [],
      containerContents: {
        'chest:1,3,5':   ['Iron Sword', null, 'Torch'],
        'rack:2,8,9':    ['Steel Axe'],
        'cabinet:1,5,6': ['Fireball Tome'],
        'bone:1,4,4':    ['Skeleton Key', null],
      },
      starterStashItems: ['Minor Healing Potion', null, null, 'Torch',
        null, null, null, null, null, null,
        null, null, null, null, null,
        null, null, null, null, null,
        null, null, null, null, null],
    });

    const bundle1 = jsonClone(sys1.save.captureSave());

    vi.resetModules();
    const sys2 = await loadFreshSystem();
    applyBundle(sys2, bundle1);
    const bundle2 = jsonClone(sys2.save.captureSave());

    vi.resetModules();
    const sys3 = await loadFreshSystem();
    applyBundle(sys3, bundle2);
    const bundle3 = jsonClone(sys3.save.captureSave());

    // Content assertions on bundle2
    expect(bundle2.world.containerContents['chest:1,3,5']).toEqual(['Iron Sword', null, 'Torch']);
    expect(bundle2.world.containerContents['rack:2,8,9']).toEqual(['Steel Axe']);
    expect(bundle2.world.containerContents['cabinet:1,5,6']).toEqual(['Fireball Tome']);
    expect(bundle2.world.containerContents['bone:1,4,4']).toEqual(['Skeleton Key', null]);
    expect(bundle2.world.knownAlchemyRecipes).toContain('Minor Healing Potion');
    expect(bundle2.world.eggEmptied).toContain('1,5,10');
    expect(bundle2.world.openedTrialGates).toContain('3,7');
    expect(bundle2.world.spokenToNpcs).toContain('0,2,4');
    expect(bundle2.world.starterStashItems[0]).toBe('Minor Healing Potion');
    expect(bundle2.world.starterStashItems[3]).toBe('Torch');

    // Stability: bundle3 must equal bundle2
    expect(bundle3.world.containerContents).toEqual(bundle2.world.containerContents);
    expect(bundle3.world.knownAlchemyRecipes.sort()).toEqual(bundle2.world.knownAlchemyRecipes.sort());
    expect(bundle3.world.eggEmptied.sort()).toEqual(bundle2.world.eggEmptied.sort());
    expect(bundle3.world.openedTrialGates.sort()).toEqual(bundle2.world.openedTrialGates.sort());
    expect(bundle3.world.spokenToNpcs.sort()).toEqual(bundle2.world.spokenToNpcs.sort());
    expect(bundle3.world.starterStashItems).toEqual(bundle2.world.starterStashItems);
  });
});
