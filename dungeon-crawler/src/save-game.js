// ─────────────────────────────────────────────────────────────────────────────
//  SAVE GAME  — localStorage persistence
// ─────────────────────────────────────────────────────────────────────────────

import { party, partyGold } from './party.js';
import { player } from './player.js';

const SAVE_KEY = 'dungeon-save';
const LOAD_KEY = 'dungeon-pending-load';

function _serializeMember(m) {
  // Deep-clone but strip non-serializable fields (setTimeout IDs etc.)
  return JSON.parse(JSON.stringify(m, (key, val) => {
    if (key === 'cooldownTimers') return undefined;
    return val;
  }));
}

/** Persist current game state to localStorage. Returns ISO timestamp of save. */
export function saveGame() {
  const save = {
    version: 1,
    savedAt: new Date().toISOString(),
    currentLevel: window.currentLevel ?? 1,
    player: {
      gridRow: player.gridRow,
      gridCol: player.gridCol,
      facing: player.facing,
    },
    partyGold,
    party: party.map(_serializeMember),
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
 */
export function consumePendingLoad() {
  const raw = sessionStorage.getItem(LOAD_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(LOAD_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
