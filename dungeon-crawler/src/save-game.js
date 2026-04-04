// ─────────────────────────────────────────────────────────────────────────────
//  SAVE GAME  — registry-based save/load (v6)
// ─────────────────────────────────────────────────────────────────────────────

import { serializeAll } from './save-registry.js';

const LOAD_KEY = 'dungeon-pending-load';
const SAVE_PREFIX = 'dungeon-save-';
const SAVE_VERSION = 6;

const LEVEL_NAMES = {
  0: 'Starter Room',
  1: 'Western Dungeon',
  2: 'Deep Passage',
  3: 'Abyssal Crypts',
  4: 'Forgotten Vault',
  5: 'Hall of Heroes',
};

// Wipe all pre-v6 saves on first load
(function _purgeOldSaves() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(SAVE_PREFIX)) continue;
    try {
      const { version } = JSON.parse(localStorage.getItem(key));
      if (version < SAVE_VERSION) keys.push(key);
    } catch { keys.push(key); }
  }
  keys.forEach(k => localStorage.removeItem(k));
})();

/** Core save — used by both autoSave and manualSave. */
function _save(targetLevel) {
  const levelName = LEVEL_NAMES[targetLevel] ?? `Level ${targetLevel}`;
  const key = `${SAVE_PREFIX}${targetLevel}-${Date.now()}`;
  const save = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    targetLevel,
    levelName,
    ...serializeAll(),
  };
  localStorage.setItem(key, JSON.stringify(save));
}

/** Auto-save disabled as per user request (only manual saves from the Esc menu are allowed). */
export function autoSave(targetLevel) {
  // auto-save removed
}

/** Manual save from the Esc menu. */
export function manualSave() {
  _save(window.currentLevel);
}

/** Returns all v6 saves sorted newest-first. */
export function listSaves() {
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(SAVE_PREFIX)) continue;
    try {
      const { version, savedAt, levelName, targetLevel } = JSON.parse(localStorage.getItem(key));
      if (version !== SAVE_VERSION) continue;
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
 */
export function consumePendingLoad() {
  const raw = sessionStorage.getItem(LOAD_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(LOAD_KEY);
  try {
    const save = JSON.parse(raw);
    if (!save.version || save.version !== SAVE_VERSION) return null;
    return save;
  } catch {
    return null;
  }
}
