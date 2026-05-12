// ─────────────────────────────────────────────────────────────────────────────
//  SAVE / LOAD  (v1 — fresh design after state-cleanup pass)
//
//  Save anywhere via the Esc menu. Unlimited timestamped slots (Date.now() in
//  the localStorage key). Loading reloads the page so all in-flight scene /
//  tween / animation state is cleanly thrown away; on the next boot the saved
//  bundle is pulled out of sessionStorage and applied after init.
//
//  This module owns:
//   • the bundle shape and version
//   • the localStorage keying and listing
//   • the page-reload handoff via sessionStorage
//   • the saves-list rendering helper
//   • a small confirm-dialog used for destructive actions
//
//  It does NOT own any game state. Every field in the bundle comes from a
//  capture* helper exported by an owning module, and goes back via the
//  matching restore* helper.
// ─────────────────────────────────────────────────────────────────────────────

import { capturePartyState, restorePartyState } from './party.js';
import { capturePlayerState, restorePlayerState } from './player.js';
import { captureMonsterState, restoreMonsterState } from './monster.js';
import { captureWorldState, restoreWorldState, snapshotStarterStash } from './objects.js';
import { getQuestLog, setQuestLog } from './quest.js';
import { captureRecruits, restoreRecruits, RECRUITS } from './recruits.js';
import { captureEssentiary, restoreEssentiary } from './essentiary.js';
import { captureHelpState, restoreHelpState } from './help.js';

export const SAVE_VERSION = 1;
const SAVE_PREFIX = 'dungeon-save-';
const PENDING_KEY = 'dungeon-pending-load';

const LEVEL_NAMES = {
  0: 'Starter Room',
  1: 'Western Dungeon',
  2: 'Deep Passage',
  3: 'Abyssal Crypts',
  4: 'Forgotten Vault',
  5: 'Hall of Heroes',
};

function _levelName(n) {
  return LEVEL_NAMES[n] ?? `Level ${n}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CAPTURE  — build the save bundle
// ─────────────────────────────────────────────────────────────────────────────

/** Build a complete save payload from current game state. Pure read. */
export function captureSave() {
  // The starter stash chest's contents live on the scene object until the
  // player leaves Level 0; snapshot them into the persisted field first so the
  // captured world state reflects what's actually in the chest right now.
  snapshotStarterStash();

  const currentLevel = window.currentLevel ?? 0;
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    level: currentLevel,
    levelName: _levelName(currentLevel),
    party: capturePartyState(),
    player: capturePlayerState(),
    monsters: captureMonsterState(),
    world: captureWorldState(),
    quests: getQuestLog(),
    recruits: captureRecruits(),
    essentiary: captureEssentiary(),
    help: captureHelpState(),
    videoFlags: { ...(window.videoFlags ?? {}) },
    session: {
      currentLevel,
      currentLevelReached: window.currentLevelReached ?? 0,
      easyMode: !!window.easyMode,
      helpEnabled: !!window.helpEnabled,
    },
  };
}

// Special level numbers whose internal state is ephemeral. Saving while inside
// them would produce a corrupt bundle (no way to re-enter mid-fight, no pre-
// state to return to). Must stay in sync with main.js constants.
const ARENA_LEVEL = 99;
const SCHEMATIC_TRIALS_LEVEL = 50;

/**
 * Returns null if saving is currently allowed; otherwise a short reason
 * string suitable for showing the player.
 */
export function whyCantSave() {
  if (window.arenaState?.active) return 'Cannot save during an arena fight.';
  if (window.currentLevel === ARENA_LEVEL) return 'Cannot save during an arena fight.';
  if (window.currentLevel === SCHEMATIC_TRIALS_LEVEL) return 'Cannot save during the schematic trials.';
  return null;
}

/**
 * Write a fresh save to a new timestamped slot. Returns the storage key on
 * success, or null on failure (with reason logged / available via whyCantSave).
 */
export function saveToNewSlot() {
  if (whyCantSave()) return null;
  const bundle = captureSave();
  const key = `${SAVE_PREFIX}${Date.now()}`;
  try {
    localStorage.setItem(key, JSON.stringify(bundle));
  } catch (e) {
    console.warn('[save] failed to write', e);
    return null;
  }
  return key;
}

// ─────────────────────────────────────────────────────────────────────────────
//  LIST / DELETE
// ─────────────────────────────────────────────────────────────────────────────

/** Returns [{key, savedAt, level, levelName}, ...] newest-first. */
export function listSaves() {
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(SAVE_PREFIX)) continue;
    try {
      const { version, savedAt, level, levelName } = JSON.parse(localStorage.getItem(key));
      if (version !== SAVE_VERSION) continue;
      results.push({
        key,
        savedAt,
        level,
        levelName: levelName ?? _levelName(level),
      });
    } catch { /* skip corrupt */ }
  }
  return results.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function deleteSave(key) {
  localStorage.removeItem(key);
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOAD HANDOFF  (page-reload pattern)
// ─────────────────────────────────────────────────────────────────────────────

/** Copy a save into sessionStorage and reload the page. */
export function triggerLoad(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return;
  sessionStorage.setItem(PENDING_KEY, raw);
  window.location.reload();
}

/**
 * Called once at startup. If a pending load is queued, returns the parsed
 * bundle and clears the queue. Otherwise returns null.
 */
export function consumePendingLoad() {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEY);
  try {
    const save = JSON.parse(raw);
    if (save.version !== SAVE_VERSION) return null;
    return save;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  APPLY  — two-phase restore around the existing init order
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Phase 1: hydrate recruit flags BEFORE initRecruits/initObjects spawn anything.
 * The level builder reads `RECRUITS[].isRecruited` to decide whether to spawn
 * the in-world recruit NPC, so this must run before `initRecruits(scene, camera)`.
 */
export function applySavePreInit(save) {
  if (!save) return;
  if (save.recruits) {
    for (const r of RECRUITS) {
      r.isRecruited = !!save.recruits[r.id];
    }
  }
  // Session settings restored eagerly — main.js reads window.easyMode /
  // window.helpEnabled during init for early gates (loading screen behavior,
  // first-time help dialogs, etc.).
  if (save.session) {
    if (save.session.easyMode !== undefined) window.easyMode = !!save.session.easyMode;
    if (save.session.helpEnabled !== undefined) window.helpEnabled = !!save.session.helpEnabled;
    if (save.session.currentLevelReached !== undefined) {
      window.currentLevelReached = save.session.currentLevelReached;
    }
  }
}

/**
 * Phase 2: restore everything else AFTER init has built the default Level 0
 * scene. Order matters:
 *   1. Module-local state (party, monsters, world flags, quests, etc.)
 *   2. World flags applied before loadLevel so the level spawn uses them.
 *   3. loadLevel(save.level) — rebuilds the scene under the restored state.
 *   4. Player position restored AFTER loadLevel — initPlayer in loadLevel
 *      would otherwise overwrite it with the level's start cell.
 *   5. finishIntro() — drop the intro overlay and hand control to the player.
 *
 * `ctx` provides things the module can't import without circular deps:
 *   { camera, loadLevel, finishIntro }
 */
export function applySavePostInit(save, ctx = {}) {
  if (!save) return;
  window._isRestoring = true;
  try {
    restorePartyState(save.party);
    setQuestLog(save.quests);
    restoreRecruits(save.recruits);
    restoreEssentiary(save.essentiary);
    restoreMonsterState(save.monsters);
    restoreHelpState(save.help);

    // videoFlags — restore in place rather than reassigning, so any module
    // that captured a reference to window.videoFlags keeps reading the same
    // object.
    if (save.videoFlags && window.videoFlags) {
      for (const key of Object.keys(window.videoFlags)) {
        window.videoFlags[key] = !!save.videoFlags[key];
      }
    }

    restoreWorldState(save.world);

    if (ctx.loadLevel) ctx.loadLevel(save.level ?? 0);

    // Player position last — loadLevel calls initPlayer at the level's
    // start cell, so we have to overwrite that with the saved position.
    if (ctx.camera) restorePlayerState(save.player, ctx.camera);
  } finally {
    window._isRestoring = false;
  }

  if (ctx.finishIntro) ctx.finishIntro();
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIRM DIALOG  (shared by delete + mid-game load)
// ─────────────────────────────────────────────────────────────────────────────

function showConfirmDialog(message, onConfirm) {
  let overlay = document.getElementById('save-confirm-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'save-confirm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:12000;opacity:0;transition:opacity 0.25s ease;';
    overlay.innerHTML = `
      <div style="background:rgba(10,8,5,0.98);border:2px solid #5d4037;border-radius:6px;padding:30px 40px;box-shadow:0 0 40px rgba(0,0,0,0.9);text-align:center;max-width:420px;font-family:Georgia,serif;">
        <div id="save-confirm-message" style="color:#e8c87a;font-size:16px;letter-spacing:1px;margin-bottom:24px;line-height:1.4;"></div>
        <div style="display:flex;gap:16px;justify-content:center;">
          <button id="save-confirm-yes" style="background:rgba(139,32,32,0.3);border:1px solid #8b2020;color:#f4e8c1;padding:10px 24px;font-family:monospace;font-size:14px;cursor:pointer;border-radius:3px;text-transform:uppercase;">Yes</button>
          <button id="save-confirm-no" style="background:rgba(40,30,20,0.6);border:1px solid #5a4a3a;color:#b0a090;padding:10px 24px;font-family:monospace;font-size:14px;cursor:pointer;border-radius:3px;text-transform:uppercase;">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  document.getElementById('save-confirm-message').textContent = message;

  // Re-bind buttons (cheap and avoids stale closures)
  const yesBtn = document.getElementById('save-confirm-yes');
  const noBtn = document.getElementById('save-confirm-no');
  const freshYes = yesBtn.cloneNode(true);
  const freshNo = noBtn.cloneNode(true);
  yesBtn.replaceWith(freshYes);
  noBtn.replaceWith(freshNo);

  const close = () => {
    overlay.style.opacity = '0';
    setTimeout(() => { if (overlay.style.opacity === '0') overlay.style.display = 'none'; }, 250);
  };

  freshYes.addEventListener('click', () => { close(); onConfirm?.(); });
  freshNo.addEventListener('click', close);

  overlay.style.display = 'flex';
  // Force reflow before transitioning opacity.
  overlay.offsetHeight; // eslint-disable-line no-unused-expressions
  overlay.style.opacity = '1';
}

// ─────────────────────────────────────────────────────────────────────────────
//  RENDER SAVES LIST
//
//  Used by both the pre-game Load screen and the Esc-menu saves list. The
//  `requireConfirmOnLoad` flag is true mid-game (where loading wipes unsaved
//  progress) and false from the main menu (where there's nothing to lose).
// ─────────────────────────────────────────────────────────────────────────────

export function renderSavesList(containerSelector, { requireConfirmOnLoad = false } = {}) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  const saves = listSaves();

  if (saves.length === 0) {
    container.innerHTML = '<div class="mm-no-saves" style="font-size:14px;padding:24px;text-align:center;color:#a08868;">No saved games.</div>';
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
    const info = el.querySelector('.mm-save-info');
    const loadHandler = () => {
      if (requireConfirmOnLoad) {
        showConfirmDialog('Load this save? Any unsaved progress will be lost.', () => triggerLoad(key));
      } else {
        triggerLoad(key);
      }
    };
    (info ?? el).addEventListener('click', loadHandler);

    const delBtn = el.querySelector('.mm-save-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirmDialog('Delete this save? This cannot be undone.', () => {
          deleteSave(key);
          renderSavesList(containerSelector, { requireConfirmOnLoad });
        });
      });
    }
  });
}
