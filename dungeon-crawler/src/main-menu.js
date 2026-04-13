// ─────────────────────────────────────────────────────────────────────────────
//  MAIN MENU  — opened/closed with Escape key
// ─────────────────────────────────────────────────────────────────────────────

import { listSaves, triggerLoad, manualSave } from './save-game.js';

let _isOpen = false;

export function initMainMenu() {
  // Initialize layout preference from localStorage
  const savedLayout = localStorage.getItem('partyLayoutRule');
  if (savedLayout === 'classic' || savedLayout === 'right' || savedLayout === 'split') {
    window.partyLayoutRule = savedLayout;
  } else if (savedLayout === 'curved') {
    window.partyLayoutRule = 'split'; // migrate name change
    localStorage.setItem('partyLayoutRule', 'split');
  } else {
    // Migrate old boolean to new format if it exists
    const oldSaved = localStorage.getItem('classicPartyLayout');
    if (oldSaved === 'true') {
      window.partyLayoutRule = 'classic';
      localStorage.removeItem('classicPartyLayout');
    } else {
      window.partyLayoutRule = 'split'; // default
    }
  }
  _applyLayoutPreference();

  _buildModal();

  // Escape on window so document-level handlers (equip, tactics, etc.) that
  // call stopPropagation() naturally take priority over this.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (_isOpen) { _close(); return; }
    if (_anyOverlayOpen()) return;
    _openMenu();
  });
}

function _applyLayoutPreference() {
  const panel = document.getElementById('party-panel');
  if (panel) {
    panel.classList.remove('layout-classic', 'layout-right', 'layout-split');
    if (window.partyLayoutRule === 'classic') {
      panel.classList.add('layout-classic');
    } else if (window.partyLayoutRule === 'right') {
      panel.classList.add('layout-right');
    }
    // "split" is the default CSS behavior of `#party-panel` (no extra class needed, although we could add layout-split if we wanted, but not necessary since default CSS maps to it. Wait, the default CSS will just be the split layout, so no class is perfectly fine.)
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Returns true if any game overlay (equipment, tactics, chest…) is visible. */
function _anyOverlayOpen() {
  return ['equip-overlay', 'tactics-overlay', 'chest-overlay', 'armor-stand-overlay', 'merchant-overlay', 'training-console-overlay'].some(id => {
    const el = document.getElementById(id);
    return el && window.getComputedStyle(el).display !== 'none';
  });
}

function _renderSavesList() {
  const list = document.getElementById('mm-saves-list');
  const saves = listSaves();
  if (saves.length === 0) {
    list.innerHTML = '<div class="mm-no-saves">No saved games.</div>';
    return;
  }
  list.innerHTML = saves.map(s => {
    const d = new Date(s.savedAt);
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="mm-save-entry" data-key="${s.key}">
      <span class="mm-save-level">${s.levelName}</span>
      <span class="mm-save-meta"><span class="mm-save-date">${date}</span><span class="mm-save-time">${time}</span></span>
    </div>`;
  }).join('');
  list.querySelectorAll('.mm-save-entry').forEach(el => {
    el.addEventListener('click', () => triggerLoad(el.dataset.key));
  });
}

// ── DOM ───────────────────────────────────────────────────────────────────────

function _buildModal() {
  const overlay = document.createElement('div');
  overlay.id = 'main-menu-overlay';
  overlay.classList.add('mm-hidden');
  overlay.innerHTML = `
    <div id="main-menu-panel">
      <div class="mm-header">
        <h2 class="mm-title">DUNGEON CRAWLER</h2>
        <button class="mm-close-btn" id="mm-close-btn">✕</button>
      </div>

      <div class="mm-body">

        <!-- Left column: key bindings -->
        <div class="mm-left-col">
          <div class="mm-controls-section">
            <h3 class="mm-section-title">Movement</h3>
            <div class="mm-key-list">
              <div class="mm-key-row"><span class="mm-key">W / ↑</span><span class="mm-desc">Move forward</span></div>
              <div class="mm-key-row"><span class="mm-key">S / ↓</span><span class="mm-desc">Move backward</span></div>
              <div class="mm-key-row"><span class="mm-key">Q / ←</span><span class="mm-desc">Turn left</span></div>
              <div class="mm-key-row"><span class="mm-key">E / →</span><span class="mm-desc">Turn right</span></div>
              <div class="mm-key-row"><span class="mm-key">A / D</span><span class="mm-desc">Strafe</span></div>
            </div>
          </div>

          <div class="mm-controls-section">
            <h3 class="mm-section-title">Screens</h3>
            <div class="mm-key-list">
              <div class="mm-key-row"><span class="mm-key">I</span><span class="mm-desc">Inventory</span></div>
              <div class="mm-key-row"><span class="mm-key">C</span><span class="mm-desc">Character development</span></div>
              <div class="mm-key-row"><span class="mm-key">P</span><span class="mm-desc">Party tactics</span></div>
              <div class="mm-key-row"><span class="mm-key">B</span><span class="mm-desc">Battle log</span></div>
              <div class="mm-key-row"><span class="mm-key">M</span><span class="mm-desc">Map</span></div>
            </div>
          </div>

          <div class="mm-controls-section">
            <h3 class="mm-section-title">Combat &amp; Loadout</h3>
            <div class="mm-key-list">
              <div class="mm-key-row"><span class="mm-key">1 – 4</span><span class="mm-desc">Rotate loadout (by member)</span></div>
              <div class="mm-key-row"><span class="mm-key">Tab</span><span class="mm-desc">Toggle HUD</span></div>
              <div class="mm-key-row"><span class="mm-key">Esc</span><span class="mm-desc">Menu / close</span></div>
            </div>
          </div>
        </div>

        <div class="mm-col-divider"></div>

        <!-- Right column: settings + save slots -->
        <div class="mm-right-col">
          <h3 class="mm-section-title">Settings</h3>
          <div class="mm-settings-section">
            <div class="mm-setting-row">
              <span class="mm-setting-label">Difficulty</span>
              <span id="mm-difficulty-display" class="mm-setting-value"></span>
            </div>
            <div class="mm-setting-row">
              <label class="mm-setting-label" for="mm-help-toggle">Inline Help</label>
              <input type="checkbox" id="mm-help-toggle" class="mm-setting-checkbox">
            </div>
            <div class="mm-setting-row">
              <label class="mm-setting-label" for="mm-layout-select" style="flex:1">Party Layout</label>
              <select id="mm-layout-select" class="mm-setting-select">
                <option value="split">Split Edges</option>
                <option value="classic">Classic Center</option>
                <option value="right">Compact Right</option>
              </select>
            </div>
          </div>
          <button id="mm-save-btn" class="mm-save-btn">Save Game</button>
          <h3 class="mm-section-title" style="margin-top:1rem">Load Game</h3>
          <div id="mm-saves-list" class="mm-saves-list"></div>
        </div>

      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) _close(); });
  document.getElementById('mm-close-btn').addEventListener('click', _close);
}

function _openMenu() {
  _renderSavesList();

  // Save button
  const saveBtn = document.getElementById('mm-save-btn');
  saveBtn.onclick = () => {
    manualSave();
    saveBtn.textContent = 'Saved!';
    setTimeout(() => { saveBtn.textContent = 'Save Game'; }, 1500);
    _renderSavesList();
  };

  // Difficulty (read-only — cannot change after game starts)
  const diffEl = document.getElementById('mm-difficulty-display');
  if (diffEl) diffEl.textContent = window.easyMode ? 'Normal' : 'Hard';

  // Sync help toggle checkbox to current state
  const helpChk = document.getElementById('mm-help-toggle');
  if (helpChk) {
    helpChk.checked = !!window.helpEnabled;
    helpChk.onchange = () => { window.helpEnabled = helpChk.checked; };
  }

  // Sync layout select
  const layoutSel = document.getElementById('mm-layout-select');
  if (layoutSel) {
    layoutSel.value = window.partyLayoutRule || 'split';
    layoutSel.onchange = () => {
      window.partyLayoutRule = layoutSel.value;
      localStorage.setItem('partyLayoutRule', window.partyLayoutRule);
      _applyLayoutPreference();
    };
  }

  document.getElementById('main-menu-overlay').classList.remove('mm-hidden');
  _isOpen = true;
}

function _close() {
  document.getElementById('main-menu-overlay').classList.add('mm-hidden');
  _isOpen = false;
}
