/**
 * test/round-trip-save.test.js
 *
 * Integration tests for save.js — the orchestration layer that builds and
 * applies the complete save bundle.
 *
 * Covers:
 *   • captureSave() shape — all expected top-level keys present
 *   • applySavePostInit() — restores state from a bundle (without ctx.loadLevel
 *     or ctx.camera, which require a live Three.js scene)
 *   • listSaves() / deleteSave() — localStorage management
 *   • whyCantSave() — guard conditions
 *
 * applySavePreInit() is excluded: it writes to window.easyMode /
 * window.helpEnabled and reads RECRUITS[], which is covered by the recruits
 * round-trip tests. Anything that calls window.location.reload() is also
 * excluded (triggerLoad) — no point testing a browser navigation in a unit test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshImport } from './helpers/fresh-modules.js';

function jsonRoundTrip(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ── captureSave() shape ────────────────────────────────────────────────────────

describe('captureSave() — bundle shape', () => {
  it('returns all required top-level keys', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = mod.captureSave();

    expect(bundle).toHaveProperty('version');
    expect(bundle).toHaveProperty('savedAt');
    expect(bundle).toHaveProperty('level');
    expect(bundle).toHaveProperty('levelName');
    expect(bundle).toHaveProperty('party');
    expect(bundle).toHaveProperty('player');
    expect(bundle).toHaveProperty('monsters');
    expect(bundle).toHaveProperty('world');
    expect(bundle).toHaveProperty('quests');
    expect(bundle).toHaveProperty('recruits');
    expect(bundle).toHaveProperty('essentiary');
    expect(bundle).toHaveProperty('help');
    expect(bundle).toHaveProperty('videoFlags');
    expect(bundle).toHaveProperty('session');
  });

  it('version is SAVE_VERSION (1)', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = mod.captureSave();
    expect(bundle.version).toBe(mod.SAVE_VERSION);
    expect(bundle.version).toBe(1);
  });

  it('savedAt is an ISO date string', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = mod.captureSave();
    expect(typeof bundle.savedAt).toBe('string');
    expect(new Date(bundle.savedAt).toString()).not.toBe('Invalid Date');
  });

  it('party section contains members array, gold, autoAttack, autoRangeAttack', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = mod.captureSave();
    expect(Array.isArray(bundle.party.members)).toBe(true);
    expect(bundle.party.members).toHaveLength(4);
    expect(typeof bundle.party.gold).toBe('number');
    expect(typeof bundle.party.autoAttack).toBe('boolean');
    expect(typeof bundle.party.autoRangeAttack).toBe('boolean');
  });

  it('player section contains gridRow, gridCol, facing', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = mod.captureSave();
    expect(typeof bundle.player.gridRow).toBe('number');
    expect(typeof bundle.player.gridCol).toBe('number');
    expect(typeof bundle.player.facing).toBe('number');
  });

  it('monsters section contains monsters array and collection arrays', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = mod.captureSave();
    expect(Array.isArray(bundle.monsters.monsters)).toBe(true);
    expect(Array.isArray(bundle.monsters.droppedBossEssences)).toBe(true);
    expect(Array.isArray(bundle.monsters.killedBosses)).toBe(true);
  });

  it('world section contains flags and stock arrays', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = mod.captureSave();
    expect(typeof bundle.world.flags).toBe('object');
    expect(Array.isArray(bundle.world.merchantStock)).toBe(true);
    expect(Array.isArray(bundle.world.knownAlchemyRecipes)).toBe(true);
    expect(Array.isArray(bundle.world.knownForgeRecipes)).toBe(true);
  });

  it('quests is an object', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = mod.captureSave();
    expect(typeof bundle.quests).toBe('object');
    expect(Array.isArray(bundle.quests)).toBe(false);
  });

  it('help section has seenKeys array', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = mod.captureSave();
    expect(Array.isArray(bundle.help.seenKeys)).toBe(true);
  });

  it('session section has required fields', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = mod.captureSave();
    expect(typeof bundle.session.currentLevel).toBe('number');
    expect(typeof bundle.session.easyMode).toBe('boolean');
    expect(typeof bundle.session.helpEnabled).toBe('boolean');
  });

  it('bundle is JSON-serialisable (no circular refs or non-serialisable values)', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = mod.captureSave();
    expect(() => JSON.stringify(bundle)).not.toThrow();
    const reparsed = JSON.parse(JSON.stringify(bundle));
    expect(reparsed.version).toBe(bundle.version);
    expect(reparsed.party.members).toHaveLength(4);
  });
});

// ── applySavePostInit() — restore without scene context ───────────────────────

describe('applySavePostInit() — state restore', () => {
  // applySavePostInit calls refreshPartyCards() which tries to call
  // canvas.getContext('2d') on portrait elements. Under jsdom, auto-created
  // stub divs don't support canvas APIs. We catch only that specific error
  // to confirm the rest of the restore path ran, rather than failing on
  // an unrelated UI rendering step.
  function safeApply(fn) {
    try {
      fn();
    } catch (e) {
      // Allow canvas.getContext errors from refreshPartyCards — these are a
      // jsdom limitation, not a save/restore bug.
      if (!e.message.includes('getContext')) throw e;
    }
  }

  it('does not throw (beyond canvas stub limitation)', async () => {
    const mod = await freshImport('src/save.js');
    const bundle = jsonRoundTrip(mod.captureSave());
    // Should not throw for any reason except the known canvas stub limitation
    expect(() => safeApply(() => mod.applySavePostInit(bundle))).not.toThrow();
  });

  it('applySavePreInit restores session flags to window globals', async () => {
    // Session flags (easyMode, helpEnabled, currentLevelReached) are written by
    // applySavePreInit, not applySavePostInit. Test the right function.
    const mod = await freshImport('src/save.js');

    mod.applySavePreInit({
      session: {
        currentLevel: 3,
        currentLevelReached: 3,
        easyMode: true,
        helpEnabled: false,
      },
    });

    expect(window.easyMode).toBe(true);
    expect(window.helpEnabled).toBe(false);
    expect(window.currentLevelReached).toBe(3);

    // Cleanup
    delete window.easyMode;
    delete window.helpEnabled;
    delete window.currentLevelReached;
  });

  it('applySavePostInit(null) is a no-op', async () => {
    const mod = await freshImport('src/save.js');
    expect(() => mod.applySavePostInit(null)).not.toThrow();
  });
});

// ── whyCantSave() ─────────────────────────────────────────────────────────────

describe('whyCantSave()', () => {
  afterEach(() => {
    // Clean up window globals set by tests
    delete window.arenaState;
    delete window.currentLevel;
  });

  it('returns null when saving is allowed (no arena, no trials)', async () => {
    const mod = await freshImport('src/save.js');
    window.arenaState = null;
    window.currentLevel = 1;
    expect(mod.whyCantSave()).toBeNull();
  });

  it('returns a reason string during an active arena fight', async () => {
    const mod = await freshImport('src/save.js');
    window.arenaState = { active: true };
    const reason = mod.whyCantSave();
    expect(typeof reason).toBe('string');
    expect(reason.length).toBeGreaterThan(0);
  });

  it('returns a reason string when currentLevel is 99 (arena)', async () => {
    const mod = await freshImport('src/save.js');
    window.arenaState = null;
    window.currentLevel = 99;
    const reason = mod.whyCantSave();
    expect(typeof reason).toBe('string');
  });

  it('returns a reason string during schematic trials (level 50)', async () => {
    const mod = await freshImport('src/save.js');
    window.arenaState = null;
    window.currentLevel = 50;
    const reason = mod.whyCantSave();
    expect(typeof reason).toBe('string');
  });
});

// ── listSaves() / deleteSave() ────────────────────────────────────────────────

describe('listSaves() / deleteSave()', () => {
  const TEST_KEY_PREFIX = 'dungeon-save-';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns empty array when no saves exist', async () => {
    const mod = await freshImport('src/save.js');
    expect(mod.listSaves()).toEqual([]);
  });

  it('lists a manually inserted save', async () => {
    const mod = await freshImport('src/save.js');

    const key = `${TEST_KEY_PREFIX}${Date.now()}`;
    const payload = {
      version: mod.SAVE_VERSION,
      savedAt: new Date().toISOString(),
      level: 2,
      levelName: 'Forgotten Depths',
    };
    localStorage.setItem(key, JSON.stringify(payload));

    const saves = mod.listSaves();
    expect(saves).toHaveLength(1);
    expect(saves[0].key).toBe(key);
    expect(saves[0].level).toBe(2);
    expect(saves[0].levelName).toBe('Forgotten Depths');
  });

  it('ignores saves with wrong version', async () => {
    const mod = await freshImport('src/save.js');

    const key = `${TEST_KEY_PREFIX}${Date.now()}`;
    localStorage.setItem(key, JSON.stringify({ version: 99, savedAt: new Date().toISOString(), level: 1 }));

    expect(mod.listSaves()).toEqual([]);
  });

  it('ignores keys that do not start with the save prefix', async () => {
    const mod = await freshImport('src/save.js');

    localStorage.setItem('some-other-key', JSON.stringify({ version: 1, savedAt: new Date().toISOString(), level: 0 }));

    expect(mod.listSaves()).toEqual([]);
  });

  it('ignores corrupt saves without throwing', async () => {
    const mod = await freshImport('src/save.js');

    localStorage.setItem(`${TEST_KEY_PREFIX}corrupt`, 'this is not json {{{');

    expect(() => mod.listSaves()).not.toThrow();
    expect(mod.listSaves()).toEqual([]);
  });

  it('deleteSave removes a key from localStorage', async () => {
    const mod = await freshImport('src/save.js');

    const key = `${TEST_KEY_PREFIX}${Date.now()}`;
    localStorage.setItem(key, JSON.stringify({ version: mod.SAVE_VERSION, savedAt: new Date().toISOString(), level: 1 }));
    expect(mod.listSaves()).toHaveLength(1);

    mod.deleteSave(key);
    expect(mod.listSaves()).toHaveLength(0);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('multiple saves are returned newest-first', async () => {
    const mod = await freshImport('src/save.js');

    const ts1 = Date.now() - 5000;
    const ts2 = Date.now();
    const makePayload = (ts, level) => JSON.stringify({
      version: mod.SAVE_VERSION,
      savedAt: new Date(ts).toISOString(),
      level,
    });

    localStorage.setItem(`${TEST_KEY_PREFIX}${ts1}`, makePayload(ts1, 1));
    localStorage.setItem(`${TEST_KEY_PREFIX}${ts2}`, makePayload(ts2, 2));

    const saves = mod.listSaves();
    expect(saves).toHaveLength(2);
    // Newest first
    expect(saves[0].level).toBe(2);
    expect(saves[1].level).toBe(1);
  });
});

// ── consumePendingLoad() ──────────────────────────────────────────────────────

describe('consumePendingLoad()', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('returns null when nothing is pending', async () => {
    const mod = await freshImport('src/save.js');
    expect(mod.consumePendingLoad()).toBeNull();
  });

  it('returns the parsed bundle and clears sessionStorage', async () => {
    const mod = await freshImport('src/save.js');

    const bundle = { version: mod.SAVE_VERSION, savedAt: new Date().toISOString(), level: 3 };
    sessionStorage.setItem('dungeon-pending-load', JSON.stringify(bundle));

    const result = mod.consumePendingLoad();
    expect(result).not.toBeNull();
    expect(result.level).toBe(3);

    // Must be consumed (cleared)
    expect(sessionStorage.getItem('dungeon-pending-load')).toBeNull();
    // Second call returns null
    expect(mod.consumePendingLoad()).toBeNull();
  });

  it('returns null and clears sessionStorage for wrong version', async () => {
    const mod = await freshImport('src/save.js');

    sessionStorage.setItem('dungeon-pending-load', JSON.stringify({ version: 99, level: 0 }));

    const result = mod.consumePendingLoad();
    expect(result).toBeNull();
    expect(sessionStorage.getItem('dungeon-pending-load')).toBeNull();
  });

  it('returns null and clears sessionStorage for corrupt JSON', async () => {
    const mod = await freshImport('src/save.js');

    sessionStorage.setItem('dungeon-pending-load', 'NOT JSON {{{{');

    expect(() => mod.consumePendingLoad()).not.toThrow();
    expect(mod.consumePendingLoad()).toBeNull();
    expect(sessionStorage.getItem('dungeon-pending-load')).toBeNull();
  });
});
