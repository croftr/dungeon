// Element registry + helpers for the elemental damage system.
//
// Elements are loaded from data/elements.json. ONE unified resistance model is
// shared by party members AND monsters. Resistance is authored as an integer on
// a -100..+200 scale (m.elementalResistances / monster.elementalResistances):
//
//   R = -100 → vulnerable, take 2.0× damage
//   R =  -50 → weak,       take 1.5× damage
//   R =    0 → neutral,    take full damage
//   R =  +50 → resist,     take 0.5× damage
//   R = +100 → immune,     take 0 damage
//   R = +150 → absorb 50%  → HEAL for half the would-be damage
//   R = +200 → absorb 100% → HEAL for the full would-be damage
//
// Incoming elemental damage is multiplied by resistanceMultiplier(R) = 1 - R/100.
// A NEGATIVE product means the element heals the target instead of hurting it.
// Combat code calls getMonsterElementMultiplier() for player→monster damage and
// resistanceMultiplier() with the player's aggregated resistance for incoming.

import ELEMENTS from './data/elements.json';
import MONSTER_FAMILIES from './data/monster-families.json';

export { ELEMENTS };
export const ELEMENT_IDS = Object.keys(ELEMENTS);

// The whole system in one line: a resistance value → an incoming-damage multiplier.
// >1 = takes extra, <0 = absorbs (heals). Shared by party and monsters.
export function resistanceMultiplier(resistance) {
  return 1 - (resistance ?? 0) / 100;
}

// Back-compat: monsters/families used to author categorical strings. Map any
// legacy string to its numeric equivalent so old data and old saves keep working.
const LEGACY_CATEGORY_R = { immune: 100, resist: 50, normal: 0, weak: -50, vulnerable: -100 };
export function toResistanceValue(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return LEGACY_CATEGORY_R[v] ?? 0;
  return 0;
}

// Resolve a would-be elemental `amount` against a resistance value into a final
// outcome: exactly one of { damage, heal } is > 0 (both 0 = immune / fully
// resisted). A resistance > 100 yields a negative multiplier → the element
// absorbs into healing. `floorOne` keeps genuine hits from rounding away to 0
// (chip-damage floor); pass false for stacked riders that may legitimately be 0.
export function resolveElementalAmount(amount, resistance, { floorOne = true } = {}) {
  const signed = amount * resistanceMultiplier(resistance);
  if (signed < 0) return { damage: 0, heal: Math.round(-signed) };
  const rounded = Math.round(signed);
  if (rounded <= 0) return { damage: 0, heal: 0 };
  return { damage: floorOne ? Math.max(1, rounded) : rounded, heal: 0 };
}

export function getMonsterElementMultiplier(monster, element) {
  if (!element || element === 'physical') return 1;
  const own = monster?.elementalResistances?.[element];
  if (own != null) return resistanceMultiplier(toResistanceValue(own));
  const fam = MONSTER_FAMILIES[monster?.family]?.elementalResistances?.[element];
  if (fam != null) return resistanceMultiplier(toResistanceValue(fam));
  return 1;
}

// Physical attack-type (swipe / bash / shoot / punch) damage multipliers.
// Like elemental resistances but keyed by the weapon's attackType and expressed
// as a raw multiplier: 1 = neutral, >1 = weak (takes more), <1 = resists, 0 =
// immune. Monster-specific overrides family. Applied to RAW damage BEFORE
// mitigation (see calcPlayerPhysicalDamage) so a weakness can punch through flat
// DEF instead of being eaten by the damage floor.
export function getMonsterAttackTypeMultiplier(monster, attackType) {
  if (!attackType) return 1;
  const own = monster?.attackTypeMultipliers?.[attackType];
  if (own != null) return own;
  const fam = MONSTER_FAMILIES[monster?.family]?.attackTypeMultipliers?.[attackType];
  if (fam != null) return fam;
  return 1;
}

// Trap-specific variant — identical to the monster lookup under the unified
// model (elemental traps apply their base penalty separately in objects.js).
export function getMonsterTrapElementMultiplier(monster, element) {
  return getMonsterElementMultiplier(monster, element);
}

// Returns the dominant element id for an attack, or null if non-elemental.
// Used for cosmetic effects (slash-trail tint, hit-burst colour) where we want
// one canonical element even though a weapon could carry multiple riders.
// Priority: largest weapon rider → largest ammo rider → null.
export function getPrimaryAttackElement(weaponDef, ammoDef = null) {
  const pickLargest = (map) => {
    if (!map) return null;
    let bestId = null, bestVal = -Infinity;
    for (const [key, val] of Object.entries(map)) {
      const id = key.endsWith('Percent') ? key.slice(0, -7) : key;
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
