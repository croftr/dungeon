// ─────────────────────────────────────────────────────────────────────────────
//  MAIN MENU  — opened/closed with Escape key
//  Contains sub-views; currently just "Controls" (key map).
// ─────────────────────────────────────────────────────────────────────────────

let _isOpen = false;

export function initMainMenu() {
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

// ── helpers ───────────────────────────────────────────────────────────────────

/** Returns true if any game overlay (equipment, tactics, chest…) is visible. */
function _anyOverlayOpen() {
  return ['equip-overlay', 'tactics-overlay', 'chest-overlay', 'merchant-overlay'].some(id => {
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

      <!-- Main view -->
      <div id="mm-main-view">
        <h2 class="mm-title">Menu</h2>
        <button class="mm-item" id="mm-controls-btn">Controls</button>
      </div>

      <!-- Controls sub-view -->
      <div id="mm-controls-view" class="mm-hidden">
        <div class="mm-sub-header">
          <button class="mm-back-btn" id="mm-back-btn">← Back</button>
          <h2 class="mm-title">Controls</h2>
        </div>
        <div class="mm-key-list">
          <div class="mm-key-row"><span class="mm-key">W / ↑</span><span class="mm-desc">Move Forward</span></div>
          <div class="mm-key-row"><span class="mm-key">S / ↓</span><span class="mm-desc">Move Backward</span></div>
          <div class="mm-key-row"><span class="mm-key">Q / ←</span><span class="mm-desc">Turn Left</span></div>
          <div class="mm-key-row"><span class="mm-key">E / →</span><span class="mm-desc">Turn Right</span></div>
          <div class="mm-key-row"><span class="mm-key">A / D</span><span class="mm-desc">Strafe Left / Right</span></div>
          <div class="mm-key-row"><span class="mm-key">C</span><span class="mm-desc">Character Inventory</span></div>
          <div class="mm-key-row"><span class="mm-key">P</span><span class="mm-desc">Party Tactics</span></div>
          <div class="mm-key-row"><span class="mm-key">B</span><span class="mm-desc">Battle Log</span></div>
          <div class="mm-key-row"><span class="mm-key">M</span><span class="mm-desc">Map</span></div>
          <div class="mm-key-row"><span class="mm-key">Esc</span><span class="mm-desc">Menu</span></div>
        </div>
      </div>

    </div>
  `;
  document.body.appendChild(overlay);

  // Backdrop click closes
  overlay.addEventListener('click', (e) => { if (e.target === overlay) _close(); });

  document.getElementById('mm-controls-btn').addEventListener('click', () => {
    document.getElementById('mm-main-view').classList.add('mm-hidden');
    document.getElementById('mm-controls-view').classList.remove('mm-hidden');
  });

  document.getElementById('mm-back-btn').addEventListener('click', () => {
    document.getElementById('mm-controls-view').classList.add('mm-hidden');
    document.getElementById('mm-main-view').classList.remove('mm-hidden');
  });
}

function _openMenu() {
  // Always start at the main view
  document.getElementById('mm-main-view').classList.remove('mm-hidden');
  document.getElementById('mm-controls-view').classList.add('mm-hidden');
  document.getElementById('main-menu-overlay').classList.remove('mm-hidden');
  _isOpen = true;
}

function _close() {
  document.getElementById('main-menu-overlay').classList.add('mm-hidden');
  _isOpen = false;
}
