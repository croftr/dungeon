// ─────────────────────────────────────────────────────────────────────────────
//  SAVE LEVEL STATE  — the "end state" transform
//
//  Dungeon levels 1–5 have two canonical states:
//    • start — pristine, gates closed, monsters alive, chests full
//    • end   — all gates open, no monsters, all chests empty
//
//  After a save is loaded, every dungeon level below currentLevelReached
//  (and not equal to currentLevel) is rebuilt in end state. Level 0 is the
//  hub and never "cleared."
// ─────────────────────────────────────────────────────────────────────────────

import { monsters } from './monster.js';

/**
 * Flag deltas that force level N into its "end state" when merged into the
 * saved worldFlags payload and passed to setWorldFlags(). Each level's entry
 * is a whitelist of flag keys that must be true once that level is cleared.
 */
function getEndStateFlagsForLevel(levelNum) {
  switch (levelNum) {
    case 1: return {
      mummyGateOpened: true,
      mummyEscapeGateOpened: true,
      level1BtnPortcullisOpened: true,
      level1OgrePortcullisOpened: true,
      level1HoleRoomSpawned: true,
      monsterNpcSaved: true,
    };
    case 2: return {
      level2PortcullisOpened: true,
      level2GiantPortcullisOpened: true,
      level2HoleClosed: true,
    };
    case 3: return {
      // No large gate progression on L3 — trap is disarmed via TRAPS_BY_LEVEL.
    };
    case 4: return {
      // No gate progression — trap is disarmed via TRAPS_BY_LEVEL.
    };
    case 5: return {
      // Key-quest progression lives in keyQuests, not world flags.
    };
    default: return {};
  }
}

/** Trap cells (keyed as `row,col`) placed by each level's spawn code. */
const TRAPS_BY_LEVEL = {
  1: ['21,10'],
  2: ['32,10', '32,17'],
  3: ['16,10'],
  4: ['10,7'],
  5: [],
};

/**
 * Build the union of end-state flag deltas for every cleared level. Merge the
 * result on top of the saved worldFlags before calling setWorldFlags().
 */
export function buildEndStateFlags(clearedLevels) {
  const flags = {};
  const disarmedTraps = new Set();
  for (const lvl of clearedLevels) {
    Object.assign(flags, getEndStateFlagsForLevel(lvl));
    for (const key of TRAPS_BY_LEVEL[lvl] ?? []) disarmedTraps.add(key);
  }
  if (disarmedTraps.size) flags.disarmedTraps = [...disarmedTraps];
  return flags;
}

/**
 * Kills every monster with m.level === levelNum. Safe to call repeatedly:
 * already-dead monsters stay dead. Called before loadMonstersForLevel so that
 * mesh loading is skipped (see loadMonstersForLevel in monster.js).
 */
export function killAllMonstersOnLevel(levelNum) {
  for (const m of monsters) {
    if ((m.level ?? 1) !== levelNum) continue;
    m.alive = false;
    m.hp = 0;
  }
}

/**
 * Returns true if the player is (re)entering a dungeon level they have
 * already progressed past. Level 0 is the hub and always returns false.
 */
export function isLevelCleared(levelNum, currentLevelReached) {
  return levelNum >= 1 && levelNum < currentLevelReached;
}
