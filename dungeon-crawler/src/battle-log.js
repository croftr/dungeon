// ─────────────────────────────────────────────────────────────────────────────
//  BATTLE LOG  — stores the last MAX_LOG combat events and renders them in a
//  togglable in-game panel (press B to show/hide).
//
//  Exported API:
//    initBattleLog()          — create DOM panel, wire B key
//    addLogEntry(entry)       — record one combat event
//    getLog()                 — return the full log array (newest first)
// ─────────────────────────────────────────────────────────────────────────────

import { ELEMENTS } from './elements.js';

const MAX_LOG = 500;   // events kept in the data store
const DOM_CAP = 200;   // max <div> rows kept in the DOM at once

// Renders an inline element badge "🔥+6" with the element's color.
// Used in attack rows to show per-element rider damage and spell elements.
function _elemBadge(elementId, value, signed = true) {
  const def = ELEMENTS[elementId];
  if (!def) return '';
  const sign = signed && value >= 0 ? '+' : '';
  const num = value != null ? `${sign}${typeof value === 'number' ? Math.round(value) : value}` : '';
  return `<span class="bl-elem" style="color:${def.color};" title="${def.name}">${def.symbol}${num}</span>`;
}

const _log = [];
let _activeFilter = 'all';

// ── Public API ────────────────────────────────────────────────────────────────

/** Add one combat event. Trims the store to MAX_LOG and updates the panel. */
export function addLogEntry(entry) {
  if (entry.time == null) entry.time = Date.now();
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
      <button class="bl-filter-btn" data-filter="attack-out">Atk Out</button>
      <button class="bl-filter-btn" data-filter="attack-in">Atk In</button>
      <button class="bl-filter-btn" data-filter="magic">Magic</button>
      <button class="bl-filter-btn" data-filter="skill">Skills</button>
      <button class="bl-filter-btn" data-filter="effect">Effects</button>
      <button class="bl-filter-btn" data-filter="items">Items</button>
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
    const actor = e.attacker || e.killer || e.actor || e.actorName || '';
    const target = e.target || '';
    let action = '';
    let result = '';
    let damage = '';
    let details = '';

    if (type === 'death') {
      action = 'Death';
      damage = e.damage != null ? Math.round(e.damage) : '';
      result = 'Killed';
      details = '';
    } else if (type === 'levelup') {
      action = 'Level Up';
      result = `Level ${e.level}`;
    } else if (type === 'skill') {
      action = e.skillName || '';
      if (e.subtype === 'expire') {
        result = 'Expired';
      } else {
        damage = (e.finalDamage != null) ? Math.round(e.finalDamage) : '';
        result = (e.finalDamage != null && e.finalDamage < 0) ? 'Heal' : 'Skill';
        details = e.note || '';
      }
    } else if (type === 'status-effect') {
      action = e.effectName || '';
      result = 'Afflicted';
      details = `By ${e.attacker || ''}`;
    } else if (type === 'encumbrance') {
      action = e.subtype === 'cleared' ? 'Encumbrance cleared' : (e.level === 'overloaded' ? 'Overloaded' : 'Encumbered');
      result = e.subtype === 'cleared' ? 'Cleared' : 'Applied';
      details = (e.carry != null && e.max != null) ? `${e.carry.toFixed(1)} / ${e.max.toFixed(1)} kg` : '';
    } else if (type === 'tick') {
      action = e.effectName || '';
      damage = e.amount != null ? Math.round(e.amount) : '';
      result = e.amount < 0 ? 'Regen' : 'Damage';
    } else if (type === 'reflect') {
      action = 'Reflect';
      damage = e.amount != null ? Math.round(e.amount) : '';
      result = 'Reflected';
    } else if (type === 'item') {
      const st = e.subtype || 'loot';
      if (st === 'loot') { action = 'Looted'; result = e.itemName || ''; }
      else if (st === 'drop') { action = 'Dropped'; result = e.itemName || ''; }
      else if (st === 'buy') { action = 'Bought'; result = e.itemName || ''; damage = e.gold != null ? e.gold : ''; }
      else if (st === 'sell') { action = 'Sold'; result = e.itemName || ''; damage = e.gold != null ? e.gold : ''; }
      else if (st === 'alchemy') { action = 'Alchemy'; result = e.itemName || ''; details = e.ingredients ? e.ingredients.join('; ') : ''; }
      else if (st === 'forge') { action = 'Forge'; result = e.itemName || ''; details = e.materials ? e.materials.join('; ') : ''; }
    } else if (type === 'potion') {
      action = e.itemName || '';
      result = 'Use';
      details = e.description || '';
    } else if (type === 'trap') {
      action = e.trapLabel || 'Trap';
      result = e.amount > 0 ? 'Hit' : 'Miss';
      damage = e.amount > 0 ? Math.round(e.amount) : '';
      details = e.element || '';
    } else {
      // Attack
      action = e.attackType || 'attack';
      if (e.blocked) {
        result = 'Blocked';
      } else if (!e.hit) {
        result = 'Miss';
      } else {
        result = e.crit ? 'Crit' : 'Hit';
        damage = e.finalDamage != null ? Math.round(e.finalDamage) : '';
      }
      details = _formula(e).replace(/<[^>]*>/g, '').replace(/"/g, '""');
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
const SPELL_ATTACK_TYPES = new Set(['fireball', 'frostbolt', 'waterbolt', 'lightningbolt', 'holybolt', 'darkbolt', 'banishment', 'incinerate']);

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
  // Weapon skills always count as attacks, even when they cast a spell.
  if (entry.weaponSkill) return 'attack';
  // Damage spells logged as attack entries
  if (entry.actor === 'player' && SPELL_ATTACK_TYPES.has(entry.attackType)) return 'magic';
  if (entry.type === 'status-effect') return 'effect';
  if (entry.type === 'encumbrance') return 'effect';
  if (entry.type === 'tick') return 'effect'; // both poison ticks and regen ticks
  if (entry.type === 'reflect') return 'attack';
  if (entry.type === 'trap') return 'attack';
  if (entry.type === 'potion') return 'item';
  if (entry.type === 'item') return 'item';
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
  else if (entry.type === 'encumbrance') typeClass = 'bl--status-effect';
  else if (entry.type === 'tick') typeClass = entry.amount > 0 ? 'bl--tick-dmg' : 'bl--tick-heal';
  else if (entry.type === 'reflect') typeClass = 'bl--reflect';
  else if (entry.type === 'potion') typeClass = 'bl--potion';
  else if (entry.type === 'item') {
    const st = entry.subtype || 'loot';
    if (st === 'sell') typeClass = 'bl--item-sell';
    else if (st === 'drop') typeClass = 'bl--item-drop';
    else if (st === 'buy') typeClass = 'bl--item-buy';
    else if (st === 'alchemy') typeClass = 'bl--item-alchemy';
    else if (st === 'forge') typeClass = 'bl--item-forge';
    else typeClass = 'bl--item-loot';
  }
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
  row.dataset.dir = isIncoming ? 'in' : 'out';
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
  frostbolt: 'ice',
  waterbolt: 'water',
  lightningbolt: 'lightning',
  holybolt: 'holy',
  darkbolt: 'dark',
  banishment: 'light',
  incinerate: 'fire',
  attack: 'atk',
  special: 'spell',
};

function _buildRowHtml(e) {
  // ── Death ──────────────────────────────────────────────────────────────────
  if (e.type === 'death') {
    const dmgText = e.damage != null ? ` for <b>${Math.round(e.damage)}</b> dmg` : '';
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
    // Buff/debuff wearing off — "Lumni's War Dance fades"
    if (e.subtype === 'expire') {
      return `<span class="bl-badge">✦</span>` +
        `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.actor}</b>'s <b>${e.skillName}</b> fades</span>`;
    }
    const targetText = e.target ? ` → <b>${e.target}</b>` : '';
    const healText = (e.finalDamage != null && e.finalDamage < 0)
      ? ` <span class="bl-heal-amt">+${Math.round(Math.abs(e.finalDamage))}</span>` : '';
    const noteText = e.note ? ` <span class="bl-skill-note">(${e.note})</span>` : '';
    return `<span class="bl-badge">✦</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.actor}</b> uses <b>${e.skillName}</b>${targetText}${healText}${noteText}</span>`;
  }

  // ── Encumbrance change ─────────────────────────────────────────────────────
  if (e.type === 'encumbrance') {
    const carryText = (e.carry != null && e.max != null)
      ? ` <span class="bl-skill-note">(${e.carry.toFixed(1)} / ${e.max.toFixed(1)} kg)</span>`
      : '';
    if (e.subtype === 'cleared') {
      return `<span class="bl-badge">⚖</span>` +
        `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.target}</b> is no longer encumbered${carryText}</span>`;
    }
    const label = e.level === 'overloaded' ? 'Overloaded' : 'Encumbered';
    return `<span class="bl-badge">⚖</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.target}</b>: <b>${label}</b>${carryText}</span>`;
  }

  // ── Status effect applied ──────────────────────────────────────────────────
  if (e.type === 'status-effect') {
    return `<span class="bl-badge">☠</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.target}</b> afflicted: <b>${e.effectName}</b> by ${e.attacker}</span>`;
  }

  // ── Trap damage (player-laid or dungeon hazard) ────────────────────────────
  if (e.type === 'trap') {
    const trapLabel = e.trapLabel || 'Trap';
    const elem = e.element ? ` (${e.element})` : '';
    const dmgStr = e.amount > 0 ? `<b>${Math.round(e.amount)}</b> dmg` : `<b>no</b> dmg`;
    return `<span class="bl-badge">🪤</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;">${trapLabel}${elem} → <b>${e.target}</b> ${dmgStr}</span>`;
  }

  // ── Retribution reflect damage ─────────────────────────────────────────────
  if (e.type === 'reflect') {
    return `<span class="bl-badge">⟲</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.attacker}</b> reflects <b>${Math.round(e.amount)}</b> dmg → <b>${e.target}</b></span>`;
  }

  // ── Status effect tick (poison damage / regen heal) ────────────────────────
  if (e.type === 'tick') {
    const isHeal = e.amount < 0;
    const badge = isHeal ? '♥' : '☣';
    const amt = Math.round(Math.abs(e.amount));
    const verb = isHeal ? `+${amt} HP` : `−${amt} HP`;
    return `<span class="bl-badge">${badge}</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.target}</b> [${e.effectName}] ${verb}</span>`;
  }

  // ── Item transaction (loot / buy / sell / alchemy / forge) ────────────────
  if (e.type === 'item') {
    const st = e.subtype || 'loot';
    if (st === 'loot') {
      return `<span class="bl-badge">▲</span>` +
        `<span class="bl-who" style="max-width: none; flex: 1;">Looted <b>${e.itemName}</b></span>`;
    }
    if (st === 'buy') {
      return `<span class="bl-badge">+</span>` +
        `<span class="bl-who" style="max-width: none; flex: 1;">Bought <b>${e.itemName}</b> for <b>${e.gold}g</b></span>`;
    }
    if (st === 'sell') {
      return `<span class="bl-badge">$</span>` +
        `<span class="bl-who" style="max-width: none; flex: 1;">Sold <b>${e.itemName}</b> for <b>${e.gold}g</b></span>`;
    }
    if (st === 'drop') {
      return `<span class="bl-badge">▼</span>` +
        `<span class="bl-who" style="max-width: none; flex: 1;">Dropped <b>${e.itemName}</b></span>`;
    }
    if (st === 'alchemy') {
      const used = e.ingredients ? ` (used: ${e.ingredients.join(', ')})` : '';
      return `<span class="bl-badge">⚗</span>` +
        `<span class="bl-who" style="max-width: none; flex: 1;">Crafted <b>${e.itemName}</b>${used}</span>`;
    }
    if (st === 'forge') {
      const used = e.materials ? ` (used: ${e.materials.join(', ')})` : '';
      return `<span class="bl-badge">⚒</span>` +
        `<span class="bl-who" style="max-width: none; flex: 1;">Forged <b>${e.itemName}</b>${used}</span>`;
    }
    return `<span class="bl-badge">▲</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;">${e.itemName || ''}</span>`;
  }

  // ── Potion / consumable ────────────────────────────────────────────────────
  if (e.type === 'potion') {
    return `<span class="bl-badge">⊕</span>` +
      `<span class="bl-who" style="max-width: none; flex: 1;"><b>${e.actor}</b> uses <b>${e.itemName}</b> — ${e.description}</span>`;
  }

  // ── Standard attack / hit / miss / block / crit ───────────────────────────
  const badge = e.blocked ? '🛡' : (e.crit ? '✸' : e.hit ? '●' : '○');
  let type;
  if (e.specialName) {
    type = e.isAoe ? `${e.specialName} [AoE]` : e.specialName;
  } else {
    type = TYPE_ABBR[e.attackType] ?? e.attackType;
  }

  let dmgPart = 'miss';
  if (e.blocked) {
    dmgPart = 'blocked';
  } else if (e.hit) {
    // Per-element rider breakdown for physical attacks (Flame Dagger etc.) —
    // appended after the main number so the player sees the elemental contribution.
    let elemTrail = '';
    if (e.elementalBreakdown) {
      const parts = Object.entries(e.elementalBreakdown).filter(([, v]) => v);
      if (parts.length > 0) {
        elemTrail = ' ' + parts.map(([id, v]) => _elemBadge(id, v, true)).join(' ');
      }
    }
    // Spell element prefix (e.g. Banishment fires holy, Fireball fires fire) —
    // shown in front of the damage so the spell's element is unambiguous.
    const elemPrefix = e.spellElement ? `${_elemBadge(e.spellElement, null)} ` : '';
    // Monster attack with an element (e.g. fire elemental) — same prefix shape,
    // plus a "(resN%)" suffix when the player's gear soaked some of it.
    const monsterElemPrefix = (e.actor === 'monster' && e.attackElement) ? `${_elemBadge(e.attackElement, null)} ` : '';
    const monsterResistTrail = (e.actor === 'monster' && e.attackElement && e.elementResistance > 0)
      ? ` <span class="bl-elem-resist">(res ${Math.round(e.elementResistance * 100)}%)</span>` : '';
    if (e.crit) {
      dmgPart = `${elemPrefix}${monsterElemPrefix}<b>CRIT! ${Math.round(e.finalDamage)}</b><span style="font-size:10px;">dmg</span>${elemTrail}${monsterResistTrail}`;
    } else {
      dmgPart = `${elemPrefix}${monsterElemPrefix}<b>${Math.round(e.finalDamage)}</b> dmg${elemTrail}${monsterResistTrail}`;
    }
  }
  const formula = _formula(e);

  return `<span class="bl-badge">${badge}</span>` +
    `<span class="bl-who"><b>${e.attacker}</b> → ${e.target}</span>` +
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
    const stat = ['fireball', 'frostbolt', 'waterbolt', 'lightningbolt', 'holybolt', 'darkbolt', 'banishment', 'incinerate'].includes(e.attackType) ? 'INT' : (e.statLabel ?? 'STR');
    const ammoMod = e.ammoModifier && e.ammoModifier !== 1 ? e.ammoModifier : 1;
    const ammoLine = ammoMod !== 1 ? ` ×${ammoMod}ammo` : '';
    const drText = e.damageReduction ? ` ×${Math.round((1 - e.damageReduction) * 100)}%dr` : '';
    const baseSum = e.statBonus + e.weaponBase;
    const afterAmmo = ammoMod !== 1 ? Math.round(baseSum * ammoMod) : baseSum;
    const rawBase = e.damageReduction ? Math.round(afterAmmo * (1 - e.damageReduction)) : afterAmmo;
    // Multiplicative soak from VIT (physical) or RES (magic), then flat defence
    // (physical only; magic ignores defence).
    const soakLabel = e.statSoakLabel ?? 'vit';
    const soakPct = e.statSoakPct ?? 0;
    const afterSoak = Math.round(rawBase * (100 - soakPct) / 100);
    const defStr = e.defence ? ` −def${e.defence}` : '';
    const raw = Math.max(1, afterSoak - (e.defence ?? 0));
    const crit = e.crit ? ` ×${e.critMultiplier}` : '';
    const berserkText = (e.berserkMultiplier && e.berserkMultiplier !== 1.0) ? ` (Berserk ×${e.berserkMultiplier})` : '';
    const warcryText = (e.warcryMultiplier && e.warcryMultiplier !== 1.0) ? ` (Warcry ×${e.warcryMultiplier})` : '';
    const stunText = e.stunned ? ' (Stunned!)' : '';
    const poisonText = e.poisoned ? ' (Poisoned!)' : '';
    const sunderText = e.sundered ? ' (Sundered!)' : '';
    return `(${stat}${e.statBonus}+base${e.weaponBase}${ammoLine}${drText} −${soakLabel}${soakPct}%${defStr}=${raw}${crit})${berserkText}${warcryText}${stunText}${poisonText}${sunderText}`;
  }

  // monster attack
  const defMit = e.defenceMitigation ?? 0;
  const grossRaw = e.statBonus + e.baseBonus;
  const afterRes = Math.floor(grossRaw * (100 - e.mitigation) / 100);
  const physBase = e.preCritDamage != null ? e.preCritDamage : Math.max(1, afterRes - defMit);
  const crit = e.crit ? ` ×${e.critMultiplier}` : '';
  const stunText = e.stunned ? ' (Stunned!)' : '';
  const poisonText = e.poisoned ? ' (Poisoned!)' : '';
  const defStr = defMit > 0 ? `−def${defMit}` : '';
  const mitLabel = e.mitigationLabel ?? 'res';
  const physBadge = e.attackElement
    ? _elemBadge(e.attackElement, `${physBase}${crit}`, false)
    : `<span class="bl-elem" style="color:#b0a090;" title="Physical">⚔${physBase}${crit}</span>`;
  let riderStr = '';
  if (e.elementalBreakdown) {
    const parts = Object.entries(e.elementalBreakdown).filter(([, v]) => v);
    if (parts.length > 0) riderStr = ' ' + parts.map(([id, v]) => _elemBadge(id, v, true)).join(' ');
  }
  const sanctStr = e.sanctuaryReduction
    ? ` <span class="bl-elem" style="color:#a0c8ff;" title="Sanctuary">🛡−${e.sanctuaryReduction}%</span>`
    : '';
  return `(STR${e.statBonus}+${e.baseBonus}−${mitLabel}${e.mitigation}%${defStr} ${physBadge}${riderStr}${sanctStr})${stunText}${poisonText}`;
}
