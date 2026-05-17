// ─────────────────────────────────────────────────────────────────────────────
//  MAIN MENU  — opened/closed with Escape key
// ─────────────────────────────────────────────────────────────────────────────

import { saveToNewSlot, renderSavesList, whyCantSave } from './save.js';

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

// ── DOM ───────────────────────────────────────────────────────────────────────

function _buildModal() {
  const overlay = document.createElement('div');
  overlay.id = 'main-menu-overlay';
  overlay.classList.add('mm-hidden');
  overlay.innerHTML = `
    <div id="main-menu-panel">
      <div class="mm-header">
        <div class="mm-header-inner">
          <div class="mm-title-block">
            <h2 class="mm-title">Dungeon Crawler</h2>
            <div class="mm-subtitle">Game Menu</div>
          </div>
          <button class="mm-close-btn" id="mm-close-btn" title="Close (Esc)">✕</button>
        </div>
      </div>

      <div class="mm-body">

        <!-- Column 1: controls -->
        <div class="mm-col mm-col-controls">
          <h3 class="mm-section-title"><span class="mm-section-orn">◆</span>Controls<span class="mm-section-orn">◆</span></h3>

          <div class="mm-controls-grid">
            <div class="mm-controls-section">
              <div class="mm-subsection-title">Movement</div>
              <div class="mm-key-list">
                <div class="mm-key-row"><span class="mm-key">W</span><span class="mm-key mm-key-alt">↑</span><span class="mm-desc">Move forward</span></div>
                <div class="mm-key-row"><span class="mm-key">S</span><span class="mm-key mm-key-alt">↓</span><span class="mm-desc">Move backward</span></div>
                <div class="mm-key-row"><span class="mm-key">Q</span><span class="mm-key mm-key-alt">←</span><span class="mm-desc">Turn left</span></div>
                <div class="mm-key-row"><span class="mm-key">E</span><span class="mm-key mm-key-alt">→</span><span class="mm-desc">Turn right</span></div>
                <div class="mm-key-row"><span class="mm-key">A</span><span class="mm-desc">Strafe left</span></div>
                <div class="mm-key-row"><span class="mm-key">D</span><span class="mm-desc">Strafe right</span></div>
              </div>
            </div>

            <div class="mm-controls-section">
              <div class="mm-subsection-title">Screens</div>
              <div class="mm-key-list">
                <div class="mm-key-row"><span class="mm-key">I</span><span class="mm-desc">Inventory</span></div>
                <div class="mm-key-row"><span class="mm-key">C</span><span class="mm-desc">Character development</span></div>
                <div class="mm-key-row"><span class="mm-key">P</span><span class="mm-desc">Party tactics</span></div>
                <div class="mm-key-row"><span class="mm-key">B</span><span class="mm-desc">Battle log</span></div>
                <div class="mm-key-row"><span class="mm-key">L</span><span class="mm-desc">Quest log</span></div>
                <div class="mm-key-row"><span class="mm-key">Esc</span><span class="mm-desc">Game menu / close</span></div>
              </div>
            </div>

            <div class="mm-controls-section">
              <div class="mm-subsection-title">Combat &amp; Party</div>
              <div class="mm-key-list">
                <div class="mm-key-row"><span class="mm-key">1</span><span class="mm-key">2</span><span class="mm-key">3</span><span class="mm-key">4</span><span class="mm-desc">Swap ammo (member 1–4)</span></div>
                <div class="mm-key-row"><span class="mm-key">Space</span><span class="mm-desc">Toggle party panel</span></div>
                <div class="mm-key-row"><span class="mm-key">Z</span><span class="mm-desc">Click at cursor (attack)</span></div>
                <div class="mm-key-row"><span class="mm-key">X</span><span class="mm-desc">Right-click at cursor</span></div>
              </div>
            </div>

            <div class="mm-controls-section">
              <div class="mm-subsection-title">Map &amp; HUD</div>
              <div class="mm-key-list">
                <div class="mm-key-row"><span class="mm-key">Tab</span><span class="mm-desc">Toggle HUD / map</span></div>
                <div class="mm-key-row"><span class="mm-key">M</span><span class="mm-desc">Toggle map</span></div>
                <div class="mm-key-row"><span class="mm-key">F</span><span class="mm-desc">Fullscreen map</span></div>
                <div class="mm-key-row"><span class="mm-key">+</span><span class="mm-key">−</span><span class="mm-desc">Map zoom</span></div>
                <div class="mm-key-row"><span class="mm-key">[</span><span class="mm-key">]</span><span class="mm-desc">Map size</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Column 2: settings -->
        <div class="mm-col mm-col-settings">
          <h3 class="mm-section-title"><span class="mm-section-orn">◆</span>Settings<span class="mm-section-orn">◆</span></h3>

          <div class="mm-settings-section">
            <div class="mm-setting-row mm-setting-row--inline">
              <span class="mm-setting-label">Difficulty</span>
              <span id="mm-difficulty-display" class="mm-setting-value"></span>
            </div>
            <div class="mm-setting-row mm-setting-row--inline">
              <label class="mm-setting-label" for="mm-help-toggle">Inline Help</label>
              <input type="checkbox" id="mm-help-toggle" class="mm-setting-checkbox">
            </div>
          </div>

          <div class="mm-setting-block">
            <div class="mm-setting-block-label">Party Layout</div>
            <div class="mm-layout-options" id="mm-layout-options">
              <button type="button" class="mm-layout-card" data-layout="split">
                <div class="mm-layout-preview">
                  <div class="mm-prev-screen">
                    <div class="mm-prev-card mm-prev-pos-tl"></div>
                    <div class="mm-prev-card mm-prev-pos-tr"></div>
                    <div class="mm-prev-card mm-prev-pos-bl"></div>
                    <div class="mm-prev-card mm-prev-pos-br"></div>
                  </div>
                </div>
                <div class="mm-layout-name">Split Edges</div>
                <div class="mm-layout-hint">Corners of the screen</div>
              </button>
              <button type="button" class="mm-layout-card" data-layout="classic">
                <div class="mm-layout-preview">
                  <div class="mm-prev-screen">
                    <div class="mm-prev-card mm-prev-pos-c1"></div>
                    <div class="mm-prev-card mm-prev-pos-c2"></div>
                    <div class="mm-prev-card mm-prev-pos-c3"></div>
                    <div class="mm-prev-card mm-prev-pos-c4"></div>
                  </div>
                </div>
                <div class="mm-layout-name">Classic Center</div>
                <div class="mm-layout-hint">Row across the bottom</div>
              </button>
              <button type="button" class="mm-layout-card" data-layout="right">
                <div class="mm-layout-preview">
                  <div class="mm-prev-screen">
                    <div class="mm-prev-card mm-prev-pos-r1"></div>
                    <div class="mm-prev-card mm-prev-pos-r2"></div>
                    <div class="mm-prev-card mm-prev-pos-r3"></div>
                    <div class="mm-prev-card mm-prev-pos-r4"></div>
                  </div>
                </div>
                <div class="mm-layout-name">Compact Right</div>
                <div class="mm-layout-hint">Stacked on the right</div>
              </button>
            </div>
          </div>
        </div>

        <!-- Column 3: save / load -->
        <div class="mm-col mm-col-saves">
          <h3 class="mm-section-title"><span class="mm-section-orn">◆</span>Save &amp; Load<span class="mm-section-orn">◆</span></h3>

          <div class="mm-save-section">
            <button id="mm-save-btn" class="mm-save-action-btn">
              <span class="mm-save-icon">💾</span>
              <span class="mm-save-text">Save Game Now</span>
            </button>
            <div id="mm-save-feedback" class="mm-save-feedback"></div>
          </div>

          <div class="mm-subsection-title mm-subsection-title--saves">Load Game</div>
          <div id="mm-saves-list" class="mm-saves-list"></div>
        </div>

      </div>

      <div class="mm-footer">
        <span class="mm-footer-hint">Press <span class="mm-key mm-key-inline">Esc</span> to close</span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) _close(); });
  document.getElementById('mm-close-btn').addEventListener('click', _close);

  const saveBtn = document.getElementById('mm-save-btn');
  const feedbackEl = document.getElementById('mm-save-feedback');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const blocker = whyCantSave();
      if (feedbackEl) {
        if (blocker) {
          feedbackEl.style.color = '#d88060';
          feedbackEl.textContent = blocker;
        } else {
          const key = saveToNewSlot();
          feedbackEl.style.color = '#8fbf6f';
          feedbackEl.textContent = key ? 'Game saved.' : 'Save failed.';
        }
        setTimeout(() => { if (feedbackEl) feedbackEl.textContent = ''; }, 2800);
      }
      renderSavesList('#mm-saves-list', { requireConfirmOnLoad: true });
    });
  }
}

function _openMenu() {
  renderSavesList('#mm-saves-list', { requireConfirmOnLoad: true });

  // Difficulty (read-only — cannot change after game starts)
  const diffEl = document.getElementById('mm-difficulty-display');
  if (diffEl) diffEl.textContent = window.easyMode ? 'Normal' : 'Hard';

  // Sync help toggle checkbox to current state
  const helpChk = document.getElementById('mm-help-toggle');
  if (helpChk) {
    helpChk.checked = !!window.helpEnabled;
    helpChk.onchange = () => { window.helpEnabled = helpChk.checked; };
  }

  // Sync layout cards
  const layoutWrap = document.getElementById('mm-layout-options');
  if (layoutWrap) {
    const current = window.partyLayoutRule || 'split';
    layoutWrap.querySelectorAll('.mm-layout-card').forEach(btn => {
      btn.classList.toggle('is-selected', btn.dataset.layout === current);
      btn.onclick = () => {
        const choice = btn.dataset.layout;
        window.partyLayoutRule = choice;
        localStorage.setItem('partyLayoutRule', choice);
        _applyLayoutPreference();
        layoutWrap.querySelectorAll('.mm-layout-card').forEach(b => {
          b.classList.toggle('is-selected', b.dataset.layout === choice);
        });
      };
    });
  }

  document.getElementById('main-menu-overlay').classList.remove('mm-hidden');
  _isOpen = true;
}

function _close() {
  document.getElementById('main-menu-overlay').classList.add('mm-hidden');
  _isOpen = false;
}
