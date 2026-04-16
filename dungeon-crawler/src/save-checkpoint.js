// ─────────────────────────────────────────────────────────────────────────────
//  SAVE CHECKPOINT  (v7)
//
//  Level-state-based save system. Replaces the v6 registry/container-id mess.
//
//  Core idea: levels are idempotent and data-driven, so world state does not
//  need to be serialized per-object. Instead we record a small progression
//  descriptor + a handful of non-derived flags, and derive everything else:
//
//    • Level 0 (the hub) persists only the starter-stash contents plus
//      merchant stock, potion-merchant stock, Barnaby stock, and the crystal
//      shrine state.
//    • Any dungeon level below `currentLevelReached` (and ≠ the level the
//      player is on) is rebuilt in "end state" — gates open, monsters dead,
//      chests empty — via buildEndStateFlags() + killAllMonstersOnLevel().
//    • The level the player was on is rebuilt in "start state"; they spawn
//      at its entry portal (findCell(CELL_START)).
//
//  Save fires only on dungeon-level transitions (loadLevel() in main.js).
//  No manual save; no mid-level save. Arena entry/exit is excluded.
// ─────────────────────────────────────────────────────────────────────────────

import {
  capturePartyState, restorePartyState,
} from './party.js';
import { getQuestLog, setQuestLog } from './quest.js';
import { captureRecruits, restoreRecruits, RECRUITS } from './recruits.js';
import { captureMonsterState, restoreMonsterState } from './monster.js';
import { captureEssentiary, restoreEssentiary } from './essentiary.js';
import {
  captureWorldState, restoreWorldState,
  snapshotStarterStash, getPersistedStarterStashItems, setPersistedStarterStashItems,
  setWorldFlags, getWorldFlags,
} from './objects.js';
import { buildEndStateFlags, killAllMonstersOnLevel } from './save-level-state.js';

export const SAVE_VERSION = 7;
const SAVE_PREFIX = 'dungeon-save-lvl-';

const LEVEL_NAMES = {
  0: 'Starter Room',
  1: 'Western Dungeon',
  2: 'Deep Passage',
  3: 'Abyssal Crypts',
  4: 'Forgotten Vault',
  5: 'Hall of Heroes',
};

/**
 * Capture the full checkpoint payload. Called by autoSaveCheckpoint() at the
 * moment of a level transition (before `currentLevel` is bumped).
 *
 * Invariant: this only fires on level transitions, so we are never mid-sequence
 * in the crystal-shrine flow or any other synchronous gameplay stage.
 */
export function captureCheckpoint(opts = {}) {
  const { videoFlags } = opts;

  // Make sure the live starter-stash contents are written into the persisted
  // snapshot before we read it back out for the save payload.
  snapshotStarterStash();

  const world = captureWorldState();
  const flags = world.flags ?? {};

  // Capture the live flag state wholesale. The end-state rule is additive:
  // on load, buildEndStateFlags() overlays "cleared" flags on top of these
  // for any level below currentLevelReached. We store the full live set so
  // mid-clear backtracking (e.g. player partially progressed L1 then walked
  // back to L0) doesn't lose progression when reloaded.
  const persistedFlags = { ...flags };

  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),

    currentLevel: window.currentLevel ?? 0,
    currentLevelReached: window.currentLevelReached ?? 0,

    party: capturePartyState(),
    quests: getQuestLog(),
    recruits: captureRecruits(),
    video: videoFlags ?? null,
    essentiary: captureEssentiary(),
    monsters: captureMonsterState(),

    settings: {
      easyMode: !!window.easyMode,
      helpEnabled: !!window.helpEnabled,
    },

    level0: {
      starterStashItems: getPersistedStarterStashItems(),
      merchantStock: world.merchantStock,
      potionMerchantStock: world.potionMerchantStock,
    },

    worldFlags: persistedFlags,

    knownAlchemyRecipes: world.knownAlchemyRecipes,
    knownForgeRecipes: world.knownForgeRecipes,

    keyQuests: {}, // reserved for L5 gate scaffolding
  };
}

/**
 * Write a checkpoint to localStorage. Slot is keyed by currentLevelReached so
 * the player has coarse undo between level milestones (one save per reached-
 * level tier). Called from loadLevel() on dungeon-level transitions.
 */
export function autoSaveCheckpoint() {
  const videoFlags = window._saveFlags
    ? { ...window._saveFlags, hasSeenTreemanVideo: window.hasSeenTreemanVideo }
    : null;
  const save = captureCheckpoint({ videoFlags });
  save.levelName = LEVEL_NAMES[save.currentLevel] ?? `Level ${save.currentLevel}`;
  const slot = save.currentLevelReached ?? 0;
  const key = `${SAVE_PREFIX}${slot}`;
  try {
    localStorage.setItem(key, JSON.stringify(save));
  } catch (e) {
    console.warn('[save] failed to write checkpoint', e);
  }
}

/**
 * Apply a loaded checkpoint. Order matters:
 *   1) restore party/quests/recruits/essentiary/monster caches
 *   2) merge end-state flag deltas on top of saved flags; setWorldFlags()
 *   3) kill monsters on every cleared level (sets m.alive = false)
 *   4) persist the stash snapshot so L0 spawn uses saved contents
 *   5) loadLevel() — which reads currentLevelReached and rebuilds cleared
 *      levels in end state automatically via the setEmptyAllContainers hook
 */
export function loadCheckpoint(save, { loadLevel, restoreVideoFlags, finishIntro } = {}) {
  if (!save || save.version !== SAVE_VERSION) return;

  window._isRestoring = true;

  // 0. Player-chosen settings (difficulty + help toggle). These live on
  //    window.* and are set once at the intro screen — if we don't restore
  //    them here they'd revert to the defaults from main.js.
  if (save.settings) {
    if (save.settings.easyMode !== undefined) window.easyMode = !!save.settings.easyMode;
    if (save.settings.helpEnabled !== undefined) window.helpEnabled = !!save.settings.helpEnabled;
  }

  // 1. Core state
  restorePartyState(save.party);
  setQuestLog(save.quests);
  restoreRecruits(save.recruits);
  restoreEssentiary(save.essentiary);
  restoreMonsterState(save.monsters);
  if (restoreVideoFlags) restoreVideoFlags(save.video);

  // 2. World flags — saved (non-derived) ∪ end-state (derived from cleared set)
  const current = save.currentLevel ?? 0;
  const reached = save.currentLevelReached ?? 0;
  const clearedLevels = [];
  for (let lvl = 1; lvl <= 5; lvl++) {
    if (lvl < reached && lvl !== current) clearedLevels.push(lvl);
  }
  const endStateFlags = buildEndStateFlags(clearedLevels);
  const merged = { ...(save.worldFlags ?? {}), ...endStateFlags };
  setWorldFlags(merged);

  // 3. Level 0 stash + merchant restore (via restoreWorldState for merchants)
  const lvl0 = save.level0 ?? {};
  setPersistedStarterStashItems(lvl0.starterStashItems ?? null);
  restoreWorldState({
    flags: null, // already applied above
    merchantStock: lvl0.merchantStock,
    potionMerchantStock: lvl0.potionMerchantStock,
    knownAlchemyRecipes: save.knownAlchemyRecipes,
    knownForgeRecipes: save.knownForgeRecipes,
  });

  // 4. Kill monsters on every cleared level so loadLevel skips their meshes
  for (const lvl of clearedLevels) killAllMonstersOnLevel(lvl);

  // 5. currentLevelReached watermark (before loadLevel so it sees the right value)
  window.currentLevelReached = reached;

  // 6. Load the target level — spawns start-state for current level
  if (loadLevel) loadLevel(current);

  window._isRestoring = false;

  if (finishIntro) finishIntro();
}

/** Returns all v7 checkpoint saves, newest-first. */
export function listCheckpoints() {
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(SAVE_PREFIX)) continue;
    try {
      const { version, savedAt, levelName, currentLevel, currentLevelReached } =
        JSON.parse(localStorage.getItem(key));
      if (version !== SAVE_VERSION) continue;
      results.push({
        key, savedAt,
        levelName: levelName ?? LEVEL_NAMES[currentLevel] ?? `Level ${currentLevel}`,
        currentLevel, currentLevelReached,
      });
    } catch { /* skip corrupt */ }
  }
  return results.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Remove a single checkpoint by key. */
export function deleteCheckpoint(key) {
  localStorage.removeItem(key);
}
