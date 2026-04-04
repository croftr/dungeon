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
let _activeFilter = 'all';

// ── Public API ────────────────────────────────────────────────────────────────

/** Add one combat event. Trims the store to MAX_LOG and updates the panel. */
export function addLogEntry(entry) {
  _log.unshift(entry);
  if (_log.length > MAX_LOG) _log.pop();
  _prependRow(entry);
  _updateCount();
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
      <span class="bl-title">⚔ Battle Log <span class="bl-count" id="bl-count"></span></span>
      <div class="bl-header-btns">
        <button class="bl-csv-btn" id="bl-csv-btn" title="Download log as CSV">CSV</button>
        <button class="bl-icon-btn" id="bl-clear-btn" title="Clear log">✕</button>
        <button class="bl-expand-btn" id="bl-expand-btn" title="Expand to full screen">⤢</button>
      </div>
    </div>
    <div class="bl-filter-bar" id="bl-filter-bar">
      <button class="bl-filter-btn bl-filter-btn--active" data-filter="all">All</button>
      <button class="bl-filter-btn" data-filter="attack">Attacks</button>
      <button class="bl-filter-btn" data-filter="magic">Magic</button>
      <button class="bl-filter-btn" data-filter="skill">Skills</button>
      <button class="bl-filter-btn" data-filter="effect">Effects</button>
    </div>
    <div class="bl-entries" id="bl-entries"></div>
  `;
  document.body.appendChild(panel);

  document.getElementById('bl-expand-btn').addEventListener('click', _toggleExpand);

  document.getElementById('bl-clear-btn').addEventListener('click', () => {
    _log.length = 0;
    const c = document.getElementById('bl-entries');
    if (c) c.innerHTML = '';
    _updateCount();
  });

  document.getElementById('bl-csv-btn').addEventListener('click', _downloadCsv);

  document.getElementById('bl-filter-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('.bl-filter-btn');
    if (!btn) return;
    _activeFilter = btn.dataset.filter;
    document.querySelectorAll('.bl-filter-btn').forEach(b =>
      b.classList.toggle('bl-filter-btn--active', b.dataset.filter === _activeFilter));
    const p = document.getElementById('battle-log-panel');
    if (p) p.dataset.filter = _activeFilter === 'all' ? '' : _activeFilter;
  });
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

function _updateCount() {
  const el = document.getElementById('bl-count');
  if (el) el.textContent = _log.length > 0 ? `(${_log.length})` : '';
}

function _downloadCsv() {
  if (_log.length === 0) return;
  const headers = ['Time', 'Type', 'Actor', 'Target', 'Action', 'Result', 'Damage', 'Details'];
  const rows = _log.map(e => {
    const time = e.time ? new Date(e.time).toLocaleTimeString() : '';
    const type = e.type || 'attack';
    const actor = e.actor || e.attacker || e.killer || e.actorName || '';
    const target = e.target || '';
    let action = '';
    let result = '';
    let damage = '';
    let details = '';

    if (type === 'death') {
      action = 'Death';
      damage = e.damage != null ? e.damage : '';
      result = 'Killed';
      details = e.killer ? `Killed by ${e.killer}` : '';
    } else if (type === 'levelup') {
      action = 'Level Up';
      result = `Level ${e.level}`;
    } else if (type === 'skill') {
      action = e.skillName || '';
      damage = (e.finalDamage != null) ? e.finalDamage : '';
      result = (e.finalDamage != null && e.finalDamage < 0) ? 'Heal' : 'Skill';
      details = e.note || '';
    } else if (type === 'status-effect') {
      action = e.effectName || '';
      result = 'Afflicted';
      details = `By ${e.attacker || ''}`;
    } else if (type === 'tick') {
      action = e.effectName || '';
      damage = e.amount != null ? e.amount : '';
      result = e.amount < 0 ? 'Regen' : 'Poison';
    } else if (type === 'potion') {
      action = e.itemName || '';
      result = 'Use';
      details = e.description || '';
    } else {
      // Attack
      action = e.attackType || 'attack';
      if (e.blocked) {
        result = 'Blocked';
      } else if (!e.hit) {
        result = 'Miss';
      } else {
        result = e.crit ? 'Crit' : 'Hit';
        damage = e.finalDamage != null ? e.finalDamage : '';
      }
      details = _formula(e).replace(/"/g, '""'); // Escaping quotes for CSV
    }

    return [
      time, type, actor, target, action, result, damage, details
    ].map(v => `"${v}"`).join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `battle_log_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Category mapping (used for filter data-attr) ─────────────────────────────

// Attack types that are spells (go under Magic filter, not Attacks)
const SPELL_ATTACK_TYPES = new Set(['fireball', 'banishment', 'incinerate']);

// Skill log entries whose skillName matches these are spells → Magic filter
// Everything else logged as type:'skill' is an active ability → Skills filter
const SPELL_SKILL_NAMES = new Set([
  'Heal', 'Rejuvenate', 'Regeneration', 'Resist Poison', 'Cure Poison',
  'Holy Radiance', 'Sleep',
]);

function _getCat(entry) {
  if (entry.type === 'death' || entry.type === 'levelup') return 'event';
  if (entry.type === 'skill') {
    // Spells (heals, debuff spells) → magic; active abilities → skill
    return SPELL_SKILL_NAMES.has(entry.skillName) ? 'magic' : 'skill';
  }
  // Damage spells logged as attack entries
  if (entry.actor === 'player' && SPELL_ATTACK_TYPES.has(entry.attackType)) return 'magic';
  if (entry.type === 'status-effect') return 'effect';
  if (entry.type === 'tick') return 'effect'; // both poison ticks and regen ticks
  if (entry.type === 'potion') return 'item';  // potions visible in All only
  return 'attack';
}

function _prependRow(entry) {
  const container = document.getElementById('bl-entries');
  if (!container) return;

  const row = document.createElement('div');
  const cat = _getCat(entry);

  let typeClass = 'bl--hit';
  if (entry.type === 'death') typeClass = 'bl--death';
  else if (entry.type === 'levelup') typeClass = 'bl--levelup';
  else if (entry.type === 'skill') {
    // Skill entries that restore HP/SP get a green heal tint
    typeClass = (entry.finalDamage != null && entry.finalDamage < 0) ? 'bl--heal' : 'bl--skill';
  }
  else if (entry.type === 'status-effect') typeClass = 'bl--status-effect';
  else if (entry.type === 'tick') typeClass = entry.amount > 0 ? 'bl--tick-dmg' : 'bl--tick-heal';
  else if (entry.type === 'potion') typeClass = 'bl--potion';
  else if (entry.blocked) typeClass = 'bl--block';
  else if (entry.stunned) typeClass = 'bl--stun';
  else if (entry.poisoned) typeClass = 'bl--poison';
  else if (entry.crit) typeClass = 'bl--crit';
  else if (entry.sundered) typeClass = 'bl--sunder';
  else if (!entry.hit) typeClass = 'bl--miss';

  // Monster attacks on the party are flagged as "incoming"
  const isIncoming = entry.actor === 'monster';

  row.className = 'bl-row ' + typeClass + (isIncoming ? ' bl--incoming' : '');
  row.dataset.cat = cat;
  if (entry.effectColor) row.style.borderLeftColor = entry.effectColor;
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
  banishment: 'light',
  incinerate: 'fire',
  attack: 'atk',
  special: 'spell',
};

function _buildRowHtml(e) {
  // ── Death ──────────────────────────────────────────────────────────────────
  if (e.type === 'death') {
    const dmgText = e.damage != null ? ` for <b>${e.damage}</b> dmg` : '';
    const killText = e.killer
      ? `<b>${e.killer}</b> slays <b>${e.target}</b>${dmgText}!`
      : `<b>${e.target}</b> has been slain!`;
    return `<span class="bl-badge">💀</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;">${killText}</span>`;
  }

  // ── Level up ───────────────────────────────────────────────────────────────
  if (e.type === 'levelup') {
    return `<span class="bl-badge">★</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.target}</b> reached level <b>${e.level}</b>!</span>`;
  }

  // ── Skill / spell ──────────────────────────────────────────────────────────
  if (e.type === 'skill') {
    const targetText = e.target ? ` → <b>${e.target}</b>` : '';
    const healText = (e.finalDamage != null && e.finalDamage < 0)
      ? ` <span class="bl-heal-amt">+${Math.abs(e.finalDamage)}</span>` : '';
    const noteText = e.note ? ` <span class="bl-skill-note">(${e.note})</span>` : '';
    return `<span class="bl-badge">✦</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.actor}</b> uses <b>${e.skillName}</b>${targetText}${healText}${noteText}</span>`;
  }

  // ── Status effect applied ──────────────────────────────────────────────────
  if (e.type === 'status-effect') {
    const dir = e.actor === 'monster' ? '↓' : '↑';
    return `<span class="bl-badge">☠</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;">${dir} <b>${e.target}</b> afflicted: <b>${e.effectName}</b> by ${e.attacker}</span>`;
  }

  // ── Status effect tick (poison damage / regen heal) ────────────────────────
  if (e.type === 'tick') {
    const isHeal = e.amount < 0;
    const badge = isHeal ? '♥' : '☣';
    const amt = Math.abs(e.amount);
    const verb = isHeal ? `+${amt} HP` : `−${amt} HP`;
    return `<span class="bl-badge">${badge}</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.target}</b> [${e.effectName}] ${verb}</span>`;
  }

  // ── Potion / consumable ────────────────────────────────────────────────────
  if (e.type === 'potion') {
    return `<span class="bl-badge">⊕</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.actor}</b> uses <b>${e.itemName}</b> — ${e.description}</span>`;
  }

  // ── Standard attack / hit / miss / block / crit ───────────────────────────
  const badge = e.blocked ? '🛡' : (e.crit ? '⚡' : e.hit ? '●' : '○');
  const type = TYPE_ABBR[e.attackType] ?? e.attackType;
  const dir = e.actor === 'monster' ? '↓' : '';

  let dmgPart = 'miss';
  if (e.blocked) {
    dmgPart = 'blocked';
  } else if (e.hit) {
    if (e.crit) {
      dmgPart = `<b>CRIT! ${e.finalDamage}</b><span style="font-size:10px;">dmg</span>`;
    } else {
      dmgPart = `<b>${e.finalDamage}</b> dmg`;
    }
  }
  const formula = _formula(e);

  return `<span class="bl-badge">${badge}</span>` +
    `<span class="bl-who">${dir}<b>${e.attacker}</b>→${e.target}</span>` +
    `<span class="bl-type">${type}</span>` +
    `<span class="bl-dmg">${dmgPart}</span>` +
    `<span class="bl-calc">${formula}</span>`;
}

function _formula(e) {
  if (e.blocked) {
    return '(Shield Block)';
  }

  if (!e.hit) {
    return `(${Math.round(e.hitChance * 100)}% hit chance)`;
  }

  if (e.actor === 'player') {
    const stat = ['fireball', 'banishment', 'incinerate'].includes(e.attackType) ? 'INT' : (e.statLabel ?? 'STR');
    const mit = ['fireball', 'banishment', 'incinerate'].includes(e.attackType) ? 'RES' : 'DEF';
    const ammoLine = e.ammoModifier && e.ammoModifier !== 1 ? ` ×${e.ammoModifier}ammo` : '';
    const raw = e.statBonus + e.weaponBase - e.mitigation;
    const crit = e.crit ? ` ×${e.critMultiplier}` : '';
    const berserkText = (e.berserkMultiplier && e.berserkMultiplier !== 1.0) ? ` (Berserk ×${e.berserkMultiplier})` : '';
    const warcryText = (e.warcryMultiplier && e.warcryMultiplier !== 1.0) ? ` (Warcry ×${e.warcryMultiplier})` : '';
    const stunText = e.stunned ? ' (Stunned!)' : '';
    const poisonText = e.poisoned ? ' (Poisoned!)' : '';
    const sunderText = e.sundered ? ' (Sundered!)' : '';
    return `(${stat}${e.statBonus}+base${e.weaponBase}${ammoLine}−${mit}${e.mitigation}=${raw}${crit})${berserkText}${warcryText}${stunText}${poisonText}${sunderText}`;
  }

  // monster attack
  const defMit = e.defenceMitigation ?? 0;
  const grossRaw = e.statBonus + e.baseBonus;
  const afterRes = Math.floor(grossRaw * (100 - e.mitigation) / 100);
  const raw = afterRes - defMit;
  const crit = e.crit ? ` ×${e.critMultiplier}` : '';
  const stunText = e.stunned ? ' (Stunned!)' : '';
  const poisonText = e.poisoned ? ' (Poisoned!)' : '';
  const defStr = defMit > 0 ? `−def${defMit}` : '';
  return `(STR${e.statBonus}+${e.baseBonus}−res${e.mitigation}%${defStr}=${raw}${crit})${stunText}${poisonText}`;
}
