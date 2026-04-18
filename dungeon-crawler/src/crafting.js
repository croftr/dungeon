// ─────────────────────────────────────────────────────────────────────────────
//  CRAFTING HELPERS
//
//  RNG outcomes (fail / HQ / normal) and HQ bonus application for both the
//  alchemy workshop and the blacksmith forge. Config lives in
//  src/data/crafting.json — tweak chances and bonuses there.
//
//  Dev: set `window.__forceCraftOutcome = 'fail' | 'hq' | 'normal' | null`
//  in devtools to force the next craft outcome.
// ─────────────────────────────────────────────────────────────────────────────

import CRAFTING_CONFIG from './data/crafting.json';

export function getCraftingConfig(station) {
  return CRAFTING_CONFIG[station];
}

export function rollCraftOutcome(station) {
  // Dev override for verification
  if (typeof window !== 'undefined' && window.__forceCraftOutcome) {
    return window.__forceCraftOutcome;
  }
  const cfg = CRAFTING_CONFIG[station];
  if (!cfg) return 'normal';
  if (Math.random() < (cfg.failChance ?? 0)) return 'fail';
  if (Math.random() < (cfg.hqChance ?? 0)) return 'hq';
  return 'normal';
}

// On a failed craft, all essence ingredients are lost (non-essence preserved).
export function isEssenceIngredient(name) {
  return typeof name === 'string' && name.includes('Essence');
}

function getItemCategory(def) {
  if (!def) return null;
  if (def.type === 'potion') return 'potion';
  if (def.slot === 'hand' && def.weaponType === 'shield') return 'shield';
  if (def.slot === 'hand') return 'weapon';
  if (def.defence) return 'armor';
  return null;
}

// HQ damage bonus: baseline (from config) + optional bespoke def.hqStat.baseDamage.
export function getHqWeaponDamageBonus(def) {
  const category = getItemCategory(def);
  const baseline = CRAFTING_CONFIG.hqBonuses[category]?.baseDamage ?? 0;
  const bespoke = def?.hqStat?.baseDamage ?? 0;
  return baseline + bespoke;
}

// HQ defence bonus: baseline (armor or shield) + optional bespoke def.hqStat.defence.
export function getHqDefenceBonus(def) {
  const category = getItemCategory(def);
  if (category !== 'armor' && category !== 'shield') return 0;
  const baseline = CRAFTING_CONFIG.hqBonuses[category]?.defence ?? 0;
  const bespoke = def?.hqStat?.defence ?? 0;
  return baseline + bespoke;
}

// Returns a shallow-copied effect with `value`, `duration`, and any
// `stats: { statName: n }` map scaled by the HQ potion multiplier. Original
// eff is not mutated. Stat-boost elixirs use `stats`, simple potions use
// `value`, timed party effects use `duration` — this handles all three shapes.
export function scaleHqPotionEffect(eff) {
  if (!eff) return eff;
  const mult = CRAFTING_CONFIG.hqBonuses.potion?.valueMultiplier ?? 1;
  const scaled = { ...eff };
  if (typeof scaled.value === 'number') {
    scaled.value = Math.floor(scaled.value * mult);
  }
  if (typeof scaled.duration === 'number') {
    scaled.duration = Math.floor(scaled.duration * mult);
  }
  if (scaled.stats && typeof scaled.stats === 'object') {
    const scaledStats = {};
    for (const [k, v] of Object.entries(scaled.stats)) {
      scaledStats[k] = typeof v === 'number' ? Math.floor(v * mult) : v;
    }
    scaled.stats = scaledStats;
  }
  return scaled;
}

// Returns the optional hqStat.effectBonus effect, if the item def defines one.
export function getHqEffectBonus(def) {
  return def?.hqStat?.effectBonus ?? null;
}

export function hqDisplayName(name) {
  return `HQ ${name}`;
}
