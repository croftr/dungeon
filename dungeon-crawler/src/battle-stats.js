// ─────────────────────────────────────────────────────────────────────────────
//  BATTLE STATS  — tracks damage dealt / received per party member per fight.
//  The icon appears top-left after a monster is killed; clicking it opens a
//  summary panel. Stats reset when the next fight begins. If the panel is open
//  it stays open across fights, showing live data for the current monster.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, {dealt: number, taken: number}>} */
let _stats = new Map();
let _monsterName = '';
let _panelVisible = false;
let _iconVisible = false;

// ── Public API ────────────────────────────────────────────────────────────────

/** Reset all stats for a new fight. Keeps the panel open if it was open. */
export function resetBattleStats(monsterName = '') {
  _stats = new Map();
  _monsterName = monsterName;
  _hideIcon();
  if (_panelVisible) {
    _refreshPanel();
  } else {
    _closePanel();
  }
}

/** Record damage a party member dealt to a monster. */
export function recordDamageDealt(characterName, amount) {
  if (!characterName) return;
  _getOrCreate(characterName).dealt += amount;
  _refreshPanel();
}

/** Record damage a party member took from a monster. */
export function recordDamageTaken(memberName, amount) {
  if (!memberName) return;
  _getOrCreate(memberName).taken += amount;
  _refreshPanel();
}

/** Show the battle-stats icon (call after a monster is killed). */
export function showBattleStatsIcon(monsterName = '') {
  _monsterName = monsterName;
  _iconVisible = true;
  const btn = document.getElementById('battle-stats-btn');
  if (btn) btn.classList.add('bsb--visible');
  _refreshPanel();
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _getOrCreate(name) {
  if (!_stats.has(name)) _stats.set(name, { dealt: 0, taken: 0 });
  return _stats.get(name);
}

function _hideIcon() {
  _iconVisible = false;
  const btn = document.getElementById('battle-stats-btn');
  if (btn) btn.classList.remove('bsb--visible');
}

function _closePanel() {
  _panelVisible = false;
  const panel = document.getElementById('battle-stats-panel');
  if (panel) panel.classList.remove('bsp--visible');
}

function _togglePanel() {
  _panelVisible = !_panelVisible;
  const panel = document.getElementById('battle-stats-panel');
  if (!panel) return;
  if (_panelVisible) {
    _renderPanel(panel);
    panel.classList.add('bsp--visible');
  } else {
    panel.classList.remove('bsp--visible');
  }
}

function _refreshPanel() {
  if (!_panelVisible) return;
  const panel = document.getElementById('battle-stats-panel');
  if (panel) _renderPanel(panel);
}

function _renderPanel(panel) {
  const body = panel.querySelector('.bsp-body');
  if (!body) return;

  if (_stats.size === 0) {
    body.innerHTML = '<div class="bsp-empty">No combat data.</div>';
  } else {
    const rows = [..._stats.entries()]
      .sort((a, b) => b[1].dealt - a[1].dealt)
      .map(([name, { dealt, taken }]) => `
        <div class="bsp-row">
          <span class="bsp-name">${name}</span>
          <span class="bsp-dealt" title="Damage dealt">${dealt.toLocaleString()}</span>
          <span class="bsp-taken" title="Damage taken">${taken.toLocaleString()}</span>
        </div>
      `).join('');

    body.innerHTML = `
      <div class="bsp-header-row">
        <span class="bsp-name"></span>
        <span class="bsp-col-label" title="Damage dealt">DMG OUT</span>
        <span class="bsp-col-label" title="Damage taken">DMG IN</span>
      </div>
      ${rows}
    `;
  }

  const titleEl = panel.querySelector('.bsp-title');
  if (titleEl) {
    titleEl.textContent = _monsterName ? `Battle Summary — ${_monsterName}` : 'Battle Summary';
  }
}

// ── DOM init ──────────────────────────────────────────────────────────────────

export function initBattleStats() {
  // Bar button
  const btn = document.createElement('button');
  btn.id = 'battle-stats-btn';
  btn.title = 'Battle summary';
  btn.innerHTML = '⚔';
  btn.addEventListener('click', _togglePanel);
  document.body.appendChild(btn);

  // Panel
  const panel = document.createElement('div');
  panel.id = 'battle-stats-panel';
  panel.innerHTML = `
    <div class="bsp-titlebar">
      <span class="bsp-title">Battle Summary</span>
      <button class="bsp-close" title="Close">✕</button>
    </div>
    <div class="bsp-body"></div>
  `;
  panel.querySelector('.bsp-close').addEventListener('click', _closePanel);
  document.body.appendChild(panel);
}
