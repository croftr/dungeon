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

function showConfirmDialog(message, onConfirm) {
  let overlay = document.getElementById('custom-confirm-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'custom-confirm-overlay';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); display: flex; align-items: center; justify-content: center; z-index: 12000; opacity: 0; transition: opacity 0.25s ease;';
    
    overlay.innerHTML = `
      <div style="background: rgba(10, 8, 5, 0.98); border: 2px solid #5d4037; border-radius: 6px; padding: 30px 40px; box-shadow: 0 0 40px rgba(0,0,0,0.9); text-align: center; max-width: 400px; font-family: Georgia, serif;">
        <div id="custom-confirm-message" style="color: #e8c87a; font-size: 16px; letter-spacing: 1px; margin-bottom: 24px; line-height: 1.4;"></div>
        <div style="display: flex; gap: 16px; justify-content: center;">
          <button id="custom-confirm-yes" style="background: rgba(139, 32, 32, 0.3); border: 1px solid #8b2020; color: #f4e8c1; padding: 10px 24px; font-family: monospace; font-size: 14px; cursor: pointer; border-radius: 3px; text-transform: uppercase; transition: all 0.2s;">Yes</button>
          <button id="custom-confirm-no" style="background: rgba(40, 30, 20, 0.6); border: 1px solid #5a4a3a; color: #b0a090; padding: 10px 24px; font-family: monospace; font-size: 14px; cursor: pointer; border-radius: 3px; text-transform: uppercase; transition: all 0.2s;">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  document.getElementById('custom-confirm-message').textContent = message;
  
  const yesBtn = document.getElementById('custom-confirm-yes');
  const noBtn = document.getElementById('custom-confirm-no');

  const newYes = yesBtn.cloneNode(true);
  const newNo = noBtn.cloneNode(true);
  yesBtn.replaceWith(newYes);
  noBtn.replaceWith(newNo);
  
  newYes.onmouseover = () => { newYes.style.background = '#8b2020'; };
  newYes.onmouseout = () => { newYes.style.background = 'rgba(139, 32, 32, 0.3)'; };

  newNo.onmouseover = () => { newNo.style.background = '#3a3028'; };
  newNo.onmouseout = () => { newNo.style.background = 'rgba(40, 30, 20, 0.6)'; };

  const close = () => {
    overlay.style.opacity = '0';
    setTimeout(() => { if (overlay.style.opacity === '0') overlay.style.display = 'none'; }, 250);
  };

  newYes.addEventListener('click', () => {
    close();
    if (onConfirm) onConfirm();
  });

  newNo.addEventListener('click', () => {
    close();
  });

  overlay.style.display = 'flex';
  overlay.offsetHeight;
  overlay.style.opacity = '1';
}

/** Render a common saves list UI into a container */
export function renderSavesList(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  const saves = listSaves();

  if (saves.length === 0) {
    container.innerHTML = '<div class="mm-no-saves" style="font-size: 18px; padding: 40px;">No saved games.</div>';
    return;
  }
  container.innerHTML = saves.map(s => {
    const d = new Date(s.savedAt);
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="mm-save-entry" data-key="${s.key}">
      <div class="mm-save-info">
        <span class="mm-save-level">${s.levelName}</span>
        <span class="mm-save-meta"><span class="mm-save-date">${date}</span><span class="mm-save-time">${time}</span></span>
      </div>
      <button class="mm-save-delete-btn" aria-label="Delete Save" title="Delete Save">✕</button>
    </div>`;
  }).join('');
  
  container.querySelectorAll('.mm-save-entry').forEach(el => {
    const key = el.dataset.key;
    const infoDiv = el.querySelector('.mm-save-info');
    if (infoDiv) {
      infoDiv.addEventListener('click', () => triggerLoad(key));
    } else {
      el.addEventListener('click', () => triggerLoad(key));
    }
    const delBtn = el.querySelector('.mm-save-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirmDialog('Are you sure you want to delete this save?', () => {
          deleteSave(key);
          renderSavesList(containerSelector); // re-render
        });
      });
    }
  });
}
