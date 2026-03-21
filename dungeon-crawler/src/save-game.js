// ─────────────────────────────────────────────────────────────────────────────
//  SAVE GAME  — auto-save on level transitions (v4)
// ─────────────────────────────────────────────────────────────────────────────

import { party, partyGold, autoAttack, autoRangeAttack } from './party.js';
import { RECRUITS } from './recruits.js';

const LOAD_KEY = 'dungeon-pending-load';
const SAVE_PREFIX = 'dungeon-save-';

const LEVEL_NAMES = {
  0: 'Starter Room',
  1: 'Western Dungeon',
  2: 'Deep Passage',
  3: 'Abyssal Crypts',
  4: 'Forgotten Vault',
  5: 'Hall of Heroes',
};

function _serializeMember(m) {
  return JSON.parse(JSON.stringify(m, (key, val) => {
    if (key === 'cooldownTimers') return undefined;
    return val;
  }));
}

/** Auto-save triggered on every level transition. */
export function autoSave(targetLevel, worldState) {
  const levelName = LEVEL_NAMES[targetLevel] ?? `Level ${targetLevel}`;
  const key = `${SAVE_PREFIX}${targetLevel}-${Date.now()}`;
  const save = {
    version: 5,
    savedAt: new Date().toISOString(),
    targetLevel,
    levelName,
    partyGold,
    party: party.map(_serializeMember),
    recruits: Object.fromEntries(RECRUITS.map(r => [r.id, !!r.isRecruited])),
    autoAttack,
    autoRangeAttack,
    worldState: worldState ?? null,
  };
  localStorage.setItem(key, JSON.stringify(save));
}

/** Returns all v4 saves sorted newest-first. */
export function listSaves() {
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(SAVE_PREFIX)) continue;
    try {
      const { version, savedAt, levelName, targetLevel } = JSON.parse(localStorage.getItem(key));
      if (version !== 4 && version !== 5) continue;
      results.push({ key, savedAt, levelName, targetLevel });
    } catch { /* skip corrupt entries */ }
  }
  return results.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Remove a single save by key. */
export function deleteSave(key) {
  localStorage.removeItem(key);
}

/** Copy save to sessionStorage and reload the page. */
export function triggerLoad(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return;
  sessionStorage.setItem(LOAD_KEY, raw);
  window.location.reload();
}

/**
 * Called once on startup. Returns parsed save or null.
 * Discards saves with version < 4.
 */
export function consumePendingLoad() {
  const raw = sessionStorage.getItem(LOAD_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(LOAD_KEY);
  try {
    const save = JSON.parse(raw);
    if (!save.version || save.version < 4) return null; // v4 loads fine, just lacks worldState
    return save;
  } catch {
    return null;
  }
}
