// ─────────────────────────────────────────────────────────────────────────────
//  STANCE SYSTEM — data-driven combat stances.
//  Stance defs live in data/stances.json; recruits list their available stances
//  in data/recruits.json via the "stances" field.
//
//  Active stance is stored on the member as `m.stance` (string id or null).
//  All combat effects are pulled from stance.effects.* so json edits take
//  effect with no code changes.
// ─────────────────────────────────────────────────────────────────────────────

import STANCES from './data/stances.json';
import RECRUITS_DATA from './data/recruits.json';
import { party, refreshPartyCards } from './party.js';
import { showMessage } from './minimap.js';
import { asset } from './assets.js';
import { playSoundByUrl } from './audio.js';

export function getStanceDef(stanceId, member = null) {
  if (!stanceId) return null;
  const base = STANCES[stanceId];
  if (!base) return null;
  if (!member) return base;
  // Recruits can override per-stance fields (e.g. per-character portrait art).
  const recruit = RECRUITS_DATA.find(r => r.name === member.name);
  const override = recruit?.stanceOverrides?.[stanceId];
  if (!override) return base;
  return {
    ...base,
    ...override,
    effects: { ...(base.effects ?? {}), ...(override.effects ?? {}) },
  };
}

export function getActiveStance(member) {
  if (!member || !member.stance) return null;
  return getStanceDef(member.stance, member);
}

/** Resolves the portrait path for a member's current stance, honoring overrides. */
export function getStancePortraitPath(member) {
  const stance = getActiveStance(member);
  return stance?.portrait ?? null;
}

export function getAvailableStances(member) {
  if (!member) return [];
  if (Array.isArray(member.availableStances)) return member.availableStances;
  return Array.isArray(member.unlockedStances) ? member.unlockedStances : [];
}

/** The full pool of stances a character is eligible to unlock, from their recruit definition. */
export function getEligibleStances(member) {
  if (!member) return [];
  const recruit = RECRUITS_DATA.find(r => r.name === member.name);
  return recruit?.stances ?? [];
}

export function setStance(memberIndex, stanceId) {
  const m = party[memberIndex];
  if (!m || m.isEmpty) return;
  const prev = m.stance ?? null;
  m.stance = stanceId ?? null;
  if (prev !== m.stance) {
    const def = getStanceDef(m.stance);
    if (def) showMessage(`${m.name} enters <b>${def.name}</b>.`, 1800);
    else if (prev) showMessage(`${m.name} drops their stance.`, 1500);
    playSoundByUrl(asset('/sounds/actions/stance-change.mp3'), 0.8);
  }
  refreshPartyCards();
}

/**
 * Bonus added to each poison tick when `attacker` inflicts poison on a target.
 * Returns 0 when no stance is active, or when the stance requires a poison
 * weapon and the weapon is not one.
 */
export function getPoisonTickBonus(attacker, weaponDef) {
  const stance = getActiveStance(attacker);
  if (!stance) return 0;
  const bonus = stance.effects?.poisonTickBonus ?? 0;
  if (!bonus) return 0;
  if (stance.effects?.requiresPoisonWeapon && weaponDef?.damageType !== 'poison') return 0;
  return bonus;
}

/**
 * Fraction (0..1) subtracted from a monster's hit chance when attacking `character`.
 */
export function getMonsterHitChanceReduction(character) {
  const stance = getActiveStance(character);
  if (!stance) return 0;
  return stance.effects?.monsterHitChanceReduction ?? 0;
}

/**
 * Damage multiplier from `attacker`'s active stance when striking `monster`,
 * looked up by monster family (e.g. Holy stance: { undead: 1.25 }). Returns 1 if no bonus.
 */
export function getStanceDamageMultiplier(attacker, monster) {
  const stance = getActiveStance(attacker);
  const table = stance?.effects?.damageFamilyMultiplier;
  if (!table || !monster?.family) return 1;
  return table[monster.family] ?? 1;
}

/**
 * Returns the statusResistances map declared by `member`'s active stance, or null.
 * Shape matches item resistances: { [effectId]: 0..1 }. The special key "all"
 * applies to every on-hit effect (merged in calcOnHitChance).
 */
export function getStanceStatusResistances(member) {
  const stance = getActiveStance(member);
  return stance?.effects?.statusResistances ?? null;
}

/**
 * Damage multiplier from `attacker`'s active stance for an outgoing elemental attack
 * (e.g. Holy stance boosting Holy damage). Returns 1 if no bonus or no element.
 */
export function getStanceElementMultiplier(attacker, element) {
  if (!element) return 1;
  const stance = getActiveStance(attacker);
  const table = stance?.effects?.damageElementMultiplier;
  if (!table) return 1;
  return table[element] ?? 1;
}

/**
 * Flat crit chance bonus (0..1) from `attacker`'s active stance. Added to the base crit roll.
 */
export function getCritChanceBonus(attacker) {
  const stance = getActiveStance(attacker);
  return stance?.effects?.critChanceBonus ?? 0;
}

/**
 * Blanket multiplier on magic (damage-dealing spell) damage, e.g. Vengeance Stance. Returns 1 if no bonus.
 */
export function getMagicDamageMultiplier(attacker) {
  const stance = getActiveStance(attacker);
  return stance?.effects?.magicDamageMultiplier ?? 1;
}

/**
 * Multiplier (<1 shortens) applied to spell cooldown/delay, e.g. SpellSurge Stance. Returns 1 if no bonus.
 */
export function getSpellCooldownMultiplier(caster) {
  const stance = getActiveStance(caster);
  return stance?.effects?.spellCooldownMultiplier ?? 1;
}

/**
 * Flat damage to reflect back onto an attacker when `target` is in a reflect stance.
 * Takes the pre-clamp incoming damage (what the member would have actually taken).
 */
export function getReflectDamage(target, incomingDamage) {
  const stance = getActiveStance(target);
  if (!stance) return 0;
  const pct = stance.effects?.reflectDamagePercent ?? 0;
  const flat = stance.effects?.reflectDamageFlat ?? 0;
  const reflected = Math.floor(incomingDamage * pct) + flat;
  return Math.max(0, reflected);
}

/**
 * Bonus HP restored by cure and heal spells from `caster`'s active stance.
 */
export function getStanceCureHealBonus(caster) {
  const stance = getActiveStance(caster);
  return stance?.effects?.cureHealBonus ?? 0;
}

/**
 * Bonus HP per tick for Regeneration from `caster`'s active stance.
 */
export function getStanceRegenBonus(caster) {
  const stance = getActiveStance(caster);
  return stance?.effects?.regenMagnitude ?? 0;
}

/**
 * Damage multiplier from `attacker`'s active stance that acts like Berserk (after all calc).
 * Returns 1 if no bonus.
 */
export function getStanceBerserkMultiplier(attacker) {
  const stance = getActiveStance(attacker);
  return stance?.effects?.berserkMultiplier ?? 1;
}

/**
 * Returns true if the attacker's active stance grants double attacks.
 */
export function hasStanceDoubleAttack(attacker) {
  const stance = getActiveStance(attacker);
  return !!stance?.effects?.doubleAttack;
}

/**
 * Returns the amount of lifesteal from the attacker's active stance.
 */
export function getStanceLifestealAmount(attacker) {
  const stance = getActiveStance(attacker);
  return stance?.effects?.lifestealAmount ?? 0;
}

// ── Context menu ────────────────────────────────────────────────────────────

let _stanceMenuEl = null;

function _getMenu() {
  if (_stanceMenuEl) return _stanceMenuEl;
  const el = document.createElement('div');
  el.id = 'stance-menu';
  // Reuse skill-switch-menu styling via class overlap
  el.className = 'skill-sw-hidden';
  el.style.position = 'fixed';
  el.style.minWidth = '190px';
  el.style.background = 'rgba(8, 6, 3, 0.97)';
  el.style.border = '1px solid #7a5a28';
  el.style.borderRadius = '5px';
  el.style.padding = '4px 0';
  el.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 220, 120, 0.07)';
  el.style.zIndex = '1200';
  el.style.userSelect = 'none';
  document.body.appendChild(el);
  _stanceMenuEl = el;
  return el;
}

export function hideStanceMenu() {
  const menu = _getMenu();
  menu.classList.add('skill-sw-hidden');
  menu.style.display = 'none';
}

function _addRow(menu, { label, iconPath, isActive, onClick }) {
  const row = document.createElement('div');
  row.className = 'skill-sw-item' + (isActive ? ' skill-sw-active' : '');
  if (iconPath) {
    const img = document.createElement('img');
    img.src = asset(iconPath);
    img.alt = label;
    row.appendChild(img);
  }
  const span = document.createElement('span');
  span.textContent = label;
  row.appendChild(span);
  if (isActive) {
    const check = document.createElement('span');
    check.className = 'skill-sw-check';
    check.textContent = '✓';
    row.appendChild(check);
  }
  row.addEventListener('click', onClick);
  menu.appendChild(row);
}

export function showStanceMenu(x, y, memberIndex) {
  const m = party[memberIndex];
  if (!m || m.isEmpty) return false;
  const available = getAvailableStances(m);
  if (!available.length) return false;

  const menu = _getMenu();
  menu.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'skill-sw-header';
  header.textContent = `Stance — ${m.name}`;
  menu.appendChild(header);

  _addRow(menu, {
    label: 'No Stance',
    iconPath: null,
    isActive: !m.stance,
    onClick: () => { setStance(memberIndex, null); hideStanceMenu(); },
  });

  const divider = document.createElement('div');
  divider.className = 'skill-sw-divider';
  menu.appendChild(divider);

  available.forEach(id => {
    const def = getStanceDef(id, m);
    if (!def) return;
    _addRow(menu, {
      label: def.name,
      iconPath: def.icon,
      isActive: m.stance === id,
      onClick: () => { setStance(memberIndex, id); hideStanceMenu(); },
    });
  });

  menu.classList.remove('skill-sw-hidden');
  menu.style.display = 'block';
  const rect = menu.getBoundingClientRect();
  let left = x, top = y;
  if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 8;
  if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 8;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  return true;
}

// Dismiss on outside click / Esc
document.addEventListener('mousedown', (e) => {
  if (!_stanceMenuEl) return;
  if (_stanceMenuEl.classList.contains('skill-sw-hidden')) return;
  if (_stanceMenuEl.contains(e.target)) return;
  hideStanceMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideStanceMenu();
});
