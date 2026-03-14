// ─────────────────────────────────────────────────────────────────────────────
//  SAVE GAME  — localStorage persistence (v2: full world state)
// ─────────────────────────────────────────────────────────────────────────────

import { party, partyGold, autoAttack, autoRangeAttack } from './party.js';
import { player } from './player.js';
import { getMonsterStates } from './monster.js';
import { getWorldFlags, getContainerStates, getMerchantStock } from './objects.js';
import { RECRUITS } from './recruits.js';

const SAVE_KEY = 'dungeon-save';
const LOAD_KEY = 'dungeon-pending-load';

// Accumulated world state across level transitions.
// Keyed by level number (1, 2, 3).
let _accumulatedWorldState = {};

function _serializeMember(m) {
  // Deep-clone but strip non-serializable fields (setTimeout IDs etc.)
  return JSON.parse(JSON.stringify(m, (key, val) => {
    if (key === 'cooldownTimers') return undefined;
    return val;
  }));
}

/**
 * Snapshot the current level's world state into the accumulated store.
 * Call BEFORE leaving a level (in loadLevel) and BEFORE saving.
 */
export function snapshotCurrentLevel() {
  const level = window.currentLevel ?? 1;
  _accumulatedWorldState[level] = {
    monsters: getMonsterStates(level),
    containers: getContainerStates(),
  };
  // Merchant is on Level 1
  if (level === 1) {
    _accumulatedWorldState[1].merchantAvailable = getMerchantStock();
  }
}

/** Seed accumulated world state on restore (for levels not currently loaded). */
export function setAccumulatedWorldState(ws) {
  if (ws) _accumulatedWorldState = { ..._accumulatedWorldState, ...ws };
}

/** Get accumulated world state for a specific level. */
export function getAccumulatedWorldState(level) {
  return _accumulatedWorldState[level] ?? null;
}

/** Persist current game state to localStorage. Returns ISO timestamp of save. */
export function saveGame() {
  // Snapshot current level before building save object
  snapshotCurrentLevel();

  // Video flags are on window (set by main.js)
  const save = {
    version: 3,
    savedAt: new Date().toISOString(),
    currentLevel: window.currentLevel ?? 1,
    player: {
      gridRow: player.gridRow,
      gridCol: player.gridCol,
      facing: player.facing,
    },
    partyGold,
    party: party.map(_serializeMember),
    autoAttack,
    autoRangeAttack,

    // World state for all visited levels
    worldState: { ..._accumulatedWorldState },

    // Global progression flags
    flags: {
      ...getWorldFlags(),
      hasSeenOgreVideo: !!window._saveFlags?.hasSeenOgreVideo,
      hasSeenPrepVideo: !!window._saveFlags?.hasSeenPrepVideo,
      hasSeenMinotaurVideo: !!window._saveFlags?.hasSeenMinotaurVideo,
      hasSeenDemonVideo: !!window._saveFlags?.hasSeenDemonVideo,
      hasSeenAquaManVideo: !!window._saveFlags?.hasSeenAquaManVideo,
      hasSeenTreemanVideo: !!window.hasSeenTreemanVideo,
    },

    // Recruit state
    recruits: Object.fromEntries(RECRUITS.map(r => [r.id, !!r.isRecruited])),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  return save.savedAt;
}

/** Returns true if a save file exists in localStorage. */
export function hasSaveGame() {
  return !!localStorage.getItem(SAVE_KEY);
}

/** Returns { savedAt, currentLevel } metadata or null. */
export function getSaveInfo() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const { savedAt, currentLevel } = JSON.parse(raw);
    return { savedAt, currentLevel };
  } catch {
    return null;
  }
}

/**
 * Trigger a load: copies save to sessionStorage, then reloads the page.
 * Returns false if no save exists.
 */
export function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  sessionStorage.setItem(LOAD_KEY, raw);
  window.location.reload();
  return true;
}

/**
 * Called once on startup.
 * Returns parsed save data if a load was pending, otherwise null.
 * Removes the pending flag so it only fires once.
 * Handles v1 → v2 migration.
 */
export function consumePendingLoad() {
  const raw = sessionStorage.getItem(LOAD_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(LOAD_KEY);
  try {
    const save = JSON.parse(raw);
    // v1 → v2 migration: add empty world state
    if (!save.version || save.version < 2) {
      save.worldState = {};
      save.flags = {};
      save.recruits = {};
      save.autoAttack = true;
      save.autoRangeAttack = false;
    }
    // v2 → v3 migration: replace unspentStatPoints/pendingSkillChoice with skill tree fields
    if (save.version < 3) {
      for (const m of (save.party ?? [])) {
        if (m.isEmpty) continue;
        if (!m.acquiredNodes) m.acquiredNodes = ['start'];
        if (m.pendingNodeChoice === undefined) m.pendingNodeChoice = null;
        if (m.pendingNodePicks === undefined) {
          // If they had a pending level-up with stat points, convert to node picks
          const hadPending = !!m.pendingLevelUp;
          m.pendingNodePicks = hadPending ? 1 : 0;
        }
        if (!m.skillTreeId) {
          const r = RECRUITS.find(x => x.name === m.name);
          if (r?.skillTree) m.skillTreeId = r.skillTree;
        }
        // Clear old fields
        delete m.unspentStatPoints;
        delete m.pendingSkillChoice;
        delete m.pendingSkillChoiceIndex;
        // Clear stale skillProgression (no longer needed — tree is authoritative)
        delete m.skillProgression;
      }
    }
    return save;
  } catch {
    return null;
  }
}
