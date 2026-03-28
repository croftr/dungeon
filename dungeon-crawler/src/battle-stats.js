// ─────────────────────────────────────────────────────────────────────────────
//  BATTLE STATS  — tracks cumulative damage dealt / received per party member.
//  The icon is always visible top-left. Stats accumulate across all fights
//  until the user manually resets them with the Reset button in the panel.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, {dealt: number, taken: number, attacks: number, hits: number}>} */
let _stats = new Map();
let _panelVisible = false;
let _sessionStart = null;

// ── Public API ────────────────────────────────────────────────────────────────

/** Clear all accumulated stats (called by the Reset button). */
export function resetBattleStats() {
  _stats = new Map();
  _sessionStart = null;
  _refreshPanel();
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

/** Record a player attack attempt (hit or miss) for accuracy tracking. */
export function recordAttack(characterName, didHit) {
  if (!characterName) return;
  const s = _getOrCreate(characterName);
  s.attacks += 1;
  if (didHit) s.hits += 1;
  _refreshPanel();
}

/** No-op kept for call-site compatibility — icon is now always visible. */
export function showBattleStatsIcon() {}

// ── Internals ─────────────────────────────────────────────────────────────────

function _getOrCreate(name) {
  if (!_stats.has(name)) _stats.set(name, { dealt: 0, taken: 0, attacks: 0, hits: 0 });
  if (!_sessionStart) _sessionStart = Date.now();
  return _stats.get(name);
}

function _elapsedMinutes() {
  if (!_sessionStart) return 0;
  return (Date.now() - _sessionStart) / 60000;
}

function _downloadCsv() {
  const mins = _elapsedMinutes();
  const lines = ['Name,DMG OUT,DMG IN,D/MIN,ACC%,AVG/HIT'];
  [..._stats.entries()]
    .sort((a, b) => b[1].dealt - a[1].dealt)
    .forEach(([name, { dealt, taken, attacks, hits }]) => {
      const dpm = mins > 0 ? (dealt / mins).toFixed(2) : '0';
      const acc = attacks > 0 ? Math.round(hits / attacks * 100) : '';
      const avg = hits > 0 ? (dealt / hits).toFixed(1) : '';
      lines.push(`${name},${dealt},${taken},${dpm},${acc},${avg}`);
    });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'battle-stats.csv';
  a.click();
  URL.revokeObjectURL(a.href);
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
    const mins = _elapsedMinutes();
    const rows = [..._stats.entries()]
      .sort((a, b) => b[1].dealt - a[1].dealt)
      .map(([name, { dealt, taken, attacks, hits }]) => {
        const dpm = mins > 0 ? dealt / mins : 0;
        const dpmStr = dpm >= 10 ? Math.round(dpm).toLocaleString()
                     : dpm >= 1  ? dpm.toFixed(1)
                     :             dpm.toFixed(2);
        const accStr = attacks > 0 ? Math.round(hits / attacks * 100) + '%' : '—';
        const avgStr = hits > 0 ? (dealt / hits).toFixed(1) : '—';
        return `
        <div class="bsp-row">
          <span class="bsp-name">${name}</span>
          <span class="bsp-dealt" title="Damage dealt">${dealt.toLocaleString()}</span>
          <span class="bsp-taken" title="Damage taken">${taken.toLocaleString()}</span>
          <span class="bsp-dpm" title="Damage dealt per minute">${dpmStr}</span>
          <span class="bsp-acc" title="Hit accuracy">${accStr}</span>
          <span class="bsp-avghit" title="Average damage per hit">${avgStr}</span>
        </div>
      `;
      }).join('');

    body.innerHTML = `
      <div class="bsp-header-row">
        <span class="bsp-name"></span>
        <span class="bsp-col-label" title="Damage dealt">DMG OUT</span>
        <span class="bsp-col-label" title="Damage taken">DMG IN</span>
        <span class="bsp-col-label" title="Damage dealt per minute">D/MIN</span>
        <span class="bsp-col-label" title="Hit accuracy">ACC%</span>
        <span class="bsp-col-label" title="Average damage per hit">AVG/HIT</span>
      </div>
      ${rows}
    `;
  }
}

// ── DOM init ──────────────────────────────────────────────────────────────────

export function initBattleStats() {
  // Bar button — always visible
  const btn = document.createElement('button');
  btn.id = 'battle-stats-btn';
  btn.title = 'Battle stats';
  btn.innerHTML = '⚔';
  btn.addEventListener('click', _togglePanel);
  document.body.appendChild(btn);

  // Panel
  const panel = document.createElement('div');
  panel.id = 'battle-stats-panel';
  panel.innerHTML = `
    <div class="bsp-titlebar">
      <span class="bsp-title">Battle Stats</span>
      <div class="bsp-titlebar-actions">
        <button class="bsp-csv" title="Download as CSV">CSV</button>
        <button class="bsp-reset" title="Reset all stats">Reset</button>
        <button class="bsp-close" title="Close">✕</button>
      </div>
    </div>
    <div class="bsp-body"></div>
  `;
  panel.querySelector('.bsp-close').addEventListener('click', _closePanel);
  panel.querySelector('.bsp-reset').addEventListener('click', resetBattleStats);
  panel.querySelector('.bsp-csv').addEventListener('click', _downloadCsv);
  document.body.appendChild(panel);
}
