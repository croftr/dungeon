// ─────────────────────────────────────────────────────────────────────────────
//  BATTLE STATS  — tracks cumulative damage dealt / received per party member.
//  The icon is always visible top-left. Stats accumulate across all fights
//  until the user manually resets them with the Reset button in the panel.
//
//  DMG OUT is additionally split into damage *sources* (physical weapon, weapon
//  skills, elemental weapon riders, spell magic, traps, poison) so the balance
//  team can see where a party's output is actually coming from. The per-source
//  buckets always sum back to the member's total dealt.
// ─────────────────────────────────────────────────────────────────────────────

/** Ordered list of damage-source bucket keys (also the CSV column order). */
export const DAMAGE_CATEGORIES = ['physical', 'weaponSkill', 'elemental', 'magic', 'trap', 'poison'];

/** Display metadata for each damage source: label + bar/legend colour. */
const CAT_META = {
  physical:   { label: 'Physical',     short: 'PHYS',   color: '#b8b8c0' },
  weaponSkill:{ label: 'Weapon Skill', short: 'WSKILL', color: '#f0a83a' },
  elemental:  { label: 'Elemental',    short: 'ELEM',   color: '#d060d0' },
  magic:      { label: 'Magic',        short: 'MAGIC',  color: '#5a9cf0' },
  trap:       { label: 'Trap',         short: 'TRAP',   color: '#c07838' },
  poison:     { label: 'Poison',       short: 'POISON', color: '#5ad05a' },
};

function _emptyCats() {
  return { physical: 0, weaponSkill: 0, elemental: 0, magic: 0, trap: 0, poison: 0 };
}

/** @type {Map<string, {dealt:number, taken:number, attacks:number, hits:number, byCat:Record<string,number>}>} */
let _stats = new Map();
let _panelVisible = false;
let _sessionStart = null;
/** Names whose per-source breakdown row is currently expanded. */
let _expanded = new Set();

// ── Public API ────────────────────────────────────────────────────────────────

/** Clear all accumulated stats (called by the Reset button). */
export function resetBattleStats() {
  _stats = new Map();
  _sessionStart = null;
  _expanded = new Set();
  _refreshPanel();
}

/**
 * Record damage a party member dealt to a monster.
 * @param {string} characterName
 * @param {number} amount  total damage dealt by this hit
 * @param {Record<string,number>|null} cats  per-source split that sums to `amount`
 *        (keys from DAMAGE_CATEGORIES). When omitted the whole hit is filed under
 *        "physical" so older call-sites keep working.
 */
export function recordDamageDealt(characterName, amount, cats = null) {
  if (!characterName) return;
  const s = _getOrCreate(characterName);
  s.dealt += amount;
  if (cats) {
    for (const k of DAMAGE_CATEGORIES) s.byCat[k] += cats[k] || 0;
  } else {
    s.byCat.physical += amount;
  }
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

/** Force the battle stats panel closed (e.g. on resurrect / load). */
export function closeBattleStats() {
  _closePanel();
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _getOrCreate(name) {
  if (!_stats.has(name)) _stats.set(name, { dealt: 0, taken: 0, attacks: 0, hits: 0, byCat: _emptyCats() });
  const s = _stats.get(name);
  if (!s.byCat) s.byCat = _emptyCats(); // tolerate older shapes
  if (!_sessionStart) _sessionStart = Date.now();
  return s;
}

function _elapsedMinutes() {
  if (!_sessionStart) return 0;
  return (Date.now() - _sessionStart) / 60000;
}

/** Sum every member's per-source buckets into one party-wide breakdown. */
function _aggregateCats() {
  const tot = _emptyCats();
  for (const s of _stats.values()) {
    if (!s.byCat) continue;
    for (const k of DAMAGE_CATEGORIES) tot[k] += s.byCat[k] || 0;
  }
  return tot;
}

function _downloadCsv() {
  const mins = _elapsedMinutes();
  const catHeaders = DAMAGE_CATEGORIES.map(k => CAT_META[k].short).join(',');
  const lines = [`Name,DMG OUT,DMG IN,D/MIN,ACC%,AVG/HIT,${catHeaders}`];
  [..._stats.entries()]
    .sort((a, b) => b[1].dealt - a[1].dealt)
    .forEach(([name, { dealt, taken, attacks, hits, byCat }]) => {
      const dpm = mins > 0 ? (dealt / mins).toFixed(2) : '0';
      const acc = attacks > 0 ? Math.round(hits / attacks * 100) : '';
      const avg = hits > 0 ? (dealt / hits).toFixed(1) : '';
      const cats = DAMAGE_CATEGORIES.map(k => Math.round(byCat?.[k] || 0)).join(',');
      lines.push(`${name},${dealt},${taken},${dpm},${acc},${avg},${cats}`);
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

// ── Render helpers ──────────────────────────────────────────────────────────

/** A thin horizontal stacked bar showing each source's share of `total`. */
function _stackedBar(byCat, total) {
  if (!total) return '';
  const segs = DAMAGE_CATEGORIES
    .filter(k => (byCat[k] || 0) > 0)
    .map(k => {
      const pct = byCat[k] / total * 100;
      const meta = CAT_META[k];
      return `<span class="bsp-seg" style="width:${pct}%;background:${meta.color}"
                title="${meta.label}: ${Math.round(byCat[k]).toLocaleString()} (${pct.toFixed(1)}%)"></span>`;
    }).join('');
  return `<div class="bsp-bar">${segs}</div>`;
}

/** Legend rows: dot · label · value · share. Hides zero buckets. */
function _legend(byCat, total) {
  const items = DAMAGE_CATEGORIES
    .filter(k => (byCat[k] || 0) > 0)
    .map(k => {
      const pct = total ? byCat[k] / total * 100 : 0;
      const meta = CAT_META[k];
      return `
        <div class="bsp-leg-item">
          <span class="bsp-leg-dot" style="background:${meta.color}"></span>
          <span class="bsp-leg-label">${meta.label}</span>
          <span class="bsp-leg-val">${Math.round(byCat[k]).toLocaleString()}</span>
          <span class="bsp-leg-pct">${pct.toFixed(0)}%</span>
        </div>`;
    }).join('');
  return items || '<div class="bsp-leg-empty">No damage recorded yet.</div>';
}

function _renderPanel(panel) {
  const body = panel.querySelector('.bsp-body');
  if (!body) return;

  if (_stats.size === 0) {
    body.innerHTML = '<div class="bsp-empty">No combat data.</div>';
    return;
  }

  const mins = _elapsedMinutes();
  const rows = [..._stats.entries()]
    .sort((a, b) => b[1].dealt - a[1].dealt)
    .map(([name, { dealt, taken, attacks, hits, byCat }]) => {
      const dpm = mins > 0 ? dealt / mins : 0;
      const dpmStr = dpm >= 10 ? Math.round(dpm).toLocaleString()
                   : dpm >= 1  ? dpm.toFixed(1)
                   :             dpm.toFixed(2);
      const accStr = attacks > 0 ? Math.round(hits / attacks * 100) + '%' : '—';
      const avgStr = hits > 0 ? (dealt / hits).toFixed(1) : '—';
      const open = _expanded.has(name);
      const breakdown = open
        ? `<div class="bsp-breakdown">
             ${_stackedBar(byCat || _emptyCats(), dealt)}
             <div class="bsp-legend">${_legend(byCat || _emptyCats(), dealt)}</div>
           </div>`
        : '';
      return `
        <div class="bsp-member${open ? ' bsp-member--open' : ''}">
          <div class="bsp-row" data-name="${encodeURIComponent(name)}" title="Click to break down damage out">
            <span class="bsp-name"><span class="bsp-caret">${open ? '▾' : '▸'}</span>${name}</span>
            <span class="bsp-dealt" title="Damage dealt">${dealt.toLocaleString()}</span>
            <span class="bsp-taken" title="Damage taken">${taken.toLocaleString()}</span>
            <span class="bsp-dpm" title="Damage dealt per minute">${dpmStr}</span>
            <span class="bsp-acc" title="Hit accuracy">${accStr}</span>
            <span class="bsp-avghit" title="Average damage per hit">${avgStr}</span>
          </div>
          ${breakdown}
        </div>`;
    }).join('');

  const agg = _aggregateCats();
  const aggTotal = DAMAGE_CATEGORIES.reduce((s, k) => s + agg[k], 0);

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
    <div class="bsp-sources">
      <div class="bsp-sources-title">Damage out by source <span class="bsp-sources-total">${aggTotal.toLocaleString()}</span></div>
      ${_stackedBar(agg, aggTotal)}
      <div class="bsp-legend bsp-legend--grid">${_legend(agg, aggTotal)}</div>
    </div>
  `;
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

  // Delegated click: toggle a member's per-source breakdown. The body's innerHTML
  // is rebuilt on every refresh, so a single delegated listener is more robust
  // than re-binding per-row handlers.
  panel.querySelector('.bsp-body').addEventListener('click', (e) => {
    const row = e.target.closest('.bsp-row');
    if (!row || !row.dataset.name) return;
    const name = decodeURIComponent(row.dataset.name);
    if (_expanded.has(name)) _expanded.delete(name);
    else _expanded.add(name);
    _refreshPanel();
  });

  document.body.appendChild(panel);
}
