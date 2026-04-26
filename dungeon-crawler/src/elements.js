// Element registry + helpers for the elemental damage system.
//
// Elements are loaded from data/elements.json. Resistance authoring uses two
// shapes that don't mix:
//   - Monsters/families: categorical strings → CATEGORY_MULT (immune/resist/normal/weak/vulnerable)
//   - Armor/buffs/stances: 0..1 percentages, summed and capped at 0.9 in the aggregator
//
// Combat code calls getMonsterElementMultiplier() for outgoing damage and reads
// the player's aggregated elementalResistances map for incoming damage.

import ELEMENTS from './data/elements.json';
import MONSTER_FAMILIES from './data/monster-families.json';

export { ELEMENTS };
export const ELEMENT_IDS = Object.keys(ELEMENTS);

export const CATEGORY_MULT = {
  immune: 0,
  resist: 0.5,
  normal: 1,
  weak: 1.5,
  vulnerable: 2.0,
};

const PLAYER_RESIST_CAP = 0.9;

export function getMonsterElementMultiplier(monster, element) {
  if (!element || element === 'physical') return 1;
  const own = monster?.elementalResistances?.[element];
  if (own != null) return CATEGORY_MULT[own] ?? 1;
  const fam = MONSTER_FAMILIES[monster?.family]?.elementalResistances?.[element];
  if (fam != null) return CATEGORY_MULT[fam] ?? 1;
  return 1;
}

// Cap the upper end at 0.9 (90% reduction) — matches the existing
// statusResistances pattern. Negative values pass through unchanged so a
// vulnerable wearer can take >100% incoming damage.
export function capPlayerResistance(value) {
  return Math.min(PLAYER_RESIST_CAP, value);
}

// Returns the dominant element id for an attack, or null if non-elemental.
// Used for cosmetic effects (slash-trail tint, hit-burst colour) where we want
// one canonical element even though a weapon could carry multiple riders.
// Priority: largest weapon rider → largest ammo rider → null.
export function getPrimaryAttackElement(weaponDef, ammoDef = null) {
  const pickLargest = (map) => {
    if (!map) return null;
    let bestId = null, bestVal = -Infinity;
    for (const [id, val] of Object.entries(map)) {
      if (val > bestVal) { bestVal = val; bestId = id; }
    }
    return bestVal > 0 ? bestId : null;
  };
  return pickLargest(weaponDef?.elementalDamage) ?? pickLargest(ammoDef?.elementalDamage);
}

// Hex colour for an element (used by Three.js materials). Returns null when
// the id is unknown/null so callers can skip tinting.
export function getElementColorHex(elementId) {
  const c = ELEMENTS[elementId]?.color;
  if (!c) return null;
  return parseInt(c.replace('#', ''), 16);
}
