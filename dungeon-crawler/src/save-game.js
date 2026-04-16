// ─────────────────────────────────────────────────────────────────────────────
//  SAVE GAME  — v7 checkpoint-based
//
//  Thin shim over save-checkpoint.js. Kept as a separate module so older
//  import sites (main.js, main-menu.js) don't all need to rewire at once.
//
//  The actual save logic lives in save-checkpoint.js. This module handles:
//   • purging stale <v7 saves on startup
//   • the sessionStorage "pending load" handoff across page reload
//   • the listSaves / triggerLoad / deleteSave helpers used by the menu
// ─────────────────────────────────────────────────────────────────────────────

import {
  SAVE_VERSION,
  listCheckpoints,
  deleteCheckpoint,
} from './save-checkpoint.js';

const LOAD_KEY = 'dungeon-pending-load';
const SAVE_PREFIX_NEW = 'dungeon-save-lvl-'; // v7 slots (keyed by currentLevelReached)
const SAVE_PREFIX_OLD = 'dungeon-save-';     // v6 and earlier (keyed by level+timestamp)

// Purge all pre-v7 saves (including v6). The schema changed too broadly to
// migrate. Precedent: pre-v6 saves were wiped the same way.
(function _purgeOldSaves() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    // v7 keys live under SAVE_PREFIX_NEW. Any other SAVE_PREFIX_OLD keys
    // that aren't also v7 are stale and must be dropped.
    const isNew = key.startsWith(SAVE_PREFIX_NEW);
    const isOldFamily = key.startsWith(SAVE_PREFIX_OLD);
    if (!isOldFamily) continue;
    if (isNew) {
      // double-check the payload is actually v7
      try {
        const { version } = JSON.parse(localStorage.getItem(key));
        if (version !== SAVE_VERSION) keys.push(key);
      } catch { keys.push(key); }
    } else {
      // legacy v6 key — drop it
      keys.push(key);
    }
  }
  keys.forEach(k => localStorage.removeItem(k));
})();

/** Lists all v7 checkpoints, newest-first. */
export function listSaves() {
  return listCheckpoints().map(s => ({
    key: s.key,
    savedAt: s.savedAt,
    levelName: s.levelName,
    targetLevel: s.currentLevel,
  }));
}

/** Copy save to sessionStorage and reload the page. */
export function triggerLoad(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return;
  sessionStorage.setItem(LOAD_KEY, raw);
  window.location.reload();
}

/** Called once on startup. Returns parsed save or null. */
export function consumePendingLoad() {
  const raw = sessionStorage.getItem(LOAD_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(LOAD_KEY);
  try {
    const save = JSON.parse(raw);
    if (save.version !== SAVE_VERSION) return null;
    return save;
  } catch {
    return null;
  }
}

/** Remove a single save by key. */
export function deleteSave(key) {
  deleteCheckpoint(key);
}
