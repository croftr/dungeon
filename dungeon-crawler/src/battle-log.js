// ─────────────────────────────────────────────────────────────────────────────
//  BATTLE LOG  — stores the last MAX_LOG combat events and renders them in a
//  togglable in-game panel (press B to show/hide).
//
//  Exported API:
//    initBattleLog()          — create DOM panel, wire B key
//    addLogEntry(entry)       — record one combat event
//    getLog()                 — return the full log array (newest first)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LOG = 500;   // events kept in the data store
const DOM_CAP = 200;   // max <div> rows kept in the DOM at once

const _log = [];

// ── Public API ────────────────────────────────────────────────────────────────

/** Add one combat event. Trims the store to MAX_LOG and updates the panel. */
export function addLogEntry(entry) {
  _log.unshift(entry);
  if (_log.length > MAX_LOG) _log.pop();
  _prependRow(entry);
}

/** Returns the full log array, newest entry first. */
export function getLog() { return _log; }

/** Create the DOM panel and register the B key toggle. */
export function initBattleLog() {
  _buildPanel();
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'b' || e.key === 'B') && e.target === document.body) {
      _togglePanel();
    }
  });
}

// ── DOM ───────────────────────────────────────────────────────────────────────

function _buildPanel() {
  const panel = document.createElement('div');
  panel.id = 'battle-log-panel';
  panel.innerHTML = `
    <div class="bl-header">
      <span>⚔ Battle Log</span>
      <button class="bl-expand-btn" id="bl-expand-btn" title="Expand to full screen">⤢</button>
    </div>
    <div class="bl-entries" id="bl-entries"></div>
  `;
  document.body.appendChild(panel);

  document.getElementById('bl-expand-btn').addEventListener('click', _toggleExpand);
}

function _togglePanel() {
  const panel = document.getElementById('battle-log-panel');
  if (!panel) return;
  panel.classList.toggle('bl--visible');
}

function _toggleExpand() {
  const panel = document.getElementById('battle-log-panel');
  const btn = document.getElementById('bl-expand-btn');
  if (!panel) return;
  const isExpanded = panel.classList.toggle('bl--expanded');
  if (btn) {
    btn.textContent = isExpanded ? '⤡' : '⤢';
    btn.title = isExpanded ? 'Restore' : 'Expand to full screen';
  }
}

function _prependRow(entry) {
  const container = document.getElementById('bl-entries');
  if (!container) return;

  const row = document.createElement('div');
  let typeClass = 'bl--hit';
  if (entry.type === 'death') typeClass = 'bl--death';
  else if (entry.crit) typeClass = 'bl--crit';
  else if (!entry.hit) typeClass = 'bl--miss';

  row.className = 'bl-row ' + typeClass;
  row.innerHTML = _buildRowHtml(entry);
  container.prepend(row);

  // Trim DOM — avoids accumulating thousands of nodes
  while (container.children.length > DOM_CAP) container.lastChild.remove();
}

// ── Formatting ────────────────────────────────────────────────────────────────

const TYPE_ABBR = {
  swipe: 'swipe',
  bash: 'bash',
  punch: 'punch',
  shoot: 'shoot',
  fireball: 'fire',
  attack: 'atk',
};

function _buildRowHtml(e) {
  if (e.type === 'death') {
    return `<span class="bl-badge">💀</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.target}</b> has been slain!</span>`;
  }

  const badge = e.crit ? '⚡' : e.hit ? '●' : '○';
  const type = TYPE_ABBR[e.attackType] ?? e.attackType;
  const dmgPart = e.hit ? `<b>${e.finalDamage}</b> dmg` : 'miss';
  const formula = _formula(e);

  return `<span class="bl-badge">${badge}</span>` +
    `<span class="bl-who"><b>${e.attacker}</b>→${e.target}</span>` +
    `<span class="bl-type">${type}</span>` +
    `<span class="bl-dmg">${dmgPart}</span>` +
    `<span class="bl-calc">${formula}</span>`;
}

function _formula(e) {
  if (!e.hit) {
    return `(${Math.round(e.hitChance * 100)}% hit chance)`;
  }

  if (e.actor === 'player') {
    const stat = e.attackType === 'fireball' ? 'INT' : 'STR';
    const mit = e.attackType === 'fireball' ? 'RES' : 'DEF';
    const raw = e.statBonus + e.weaponBase - e.mitigation;
    const crit = e.crit ? ` ×${e.critMultiplier}` : '';
    return `(${stat}${e.statBonus}+base${e.weaponBase}−${mit}${e.mitigation}=${raw}${crit})`;
  }

  // monster attack
  const raw = e.statBonus + e.baseBonus - e.mitigation;
  const crit = e.crit ? ` ×${e.critMultiplier}` : '';
  return `(STR${e.statBonus}+${e.baseBonus}−mit${e.mitigation}=${raw}${crit})`;
}
