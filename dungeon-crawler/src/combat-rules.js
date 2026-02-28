// ─────────────────────────────────────────────────────────────────────────────
//  COMBAT RULES  — single source of truth for all combat tuning and formation logic.
//  Edit data/combat-rules.json to iterate on combat balance.
// ─────────────────────────────────────────────────────────────────────────────

import RULES from './data/combat-rules.json';

// ── Utility ───────────────────────────────────────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ── Hit chance constants ──────────────────────────────────────────────────────

/** Base probability (0–1) that a player's attack hits a monster. */
export const BASE_PLAYER_HIT_CHANCE = RULES.basePlayerHitChance;

/** Base probability (0–1) that a monster's attack hits a party member. */
export const BASE_MONSTER_HIT_CHANCE = RULES.baseMonsterHitChance;

/** Hit chance shift per point of DEX advantage/disadvantage (both directions). */
export const DEX_HIT_MODIFIER = RULES.dexHitModifier;

/** Floor applied to all hit chance results — no attacker can drop below this. */
export const MIN_HIT_CHANCE = RULES.minHitChance;

/** Ceiling applied to all hit chance results — no attacker can exceed this. */
export const MAX_HIT_CHANCE = RULES.maxHitChance;

// ── Critical hit constants ────────────────────────────────────────────────────

/** Probability (0–1) that a confirmed hit (either direction) becomes a critical hit. */
export const CRIT_CHANCE = RULES.critChance;

/** Damage multiplier applied when a critical hit occurs. */
export const CRIT_MULTIPLIER = RULES.critMultiplier;

// ── Monster attack damage constants ──────────────────────────────────────────

/** Flat bonus added to a monster's STR when calculating attack damage. */
export const MONSTER_BASE_ATTACK = RULES.monsterBaseAttack;

/**
 * Fraction of a character's RES stat subtracted from incoming monster damage.
 * e.g. RES 18 × 0.5 = 9 points of damage reduction.
 */
export const RESILIENCE_DAMAGE_FACTOR = RULES.resilienceDamageFactor;

// ── On-hit status effect constants ───────────────────────────────────────────

/**
 * Controls how quickly resilience reduces on-hit effect chance.
 * A character with this many resilience points halves the raw chance.
 * Formula: rawChance × (BASE / (BASE + resilience))
 */
export const ON_HIT_EFFECT_BASE = RULES.onHitEffectBase;

/**
 * Floor for on-hit effect chance after all reductions — ensures effects always
 * have at least a small chance of landing even with very high resilience.
 */
export const ON_HIT_EFFECT_MIN_CHANCE = RULES.onHitEffectMinChance;

// ── Shield bash stun constants ──────────────────────────────────────────────

/** Probability (0–1) that a shield bash stuns the monster. */
export const SHIELD_BASH_STUN_CHANCE = RULES.shieldBashStunChance;

/** Duration in ms that a shield bash stun lasts. */
export const SHIELD_BASH_STUN_DURATION_MS = RULES.shieldBashStunDurationMs;

// ── Hit chance functions ──────────────────────────────────────────────────────

/**
 * Probability (0–1) that `character` lands a hit on `monster`.
 * Scales up with DEX advantage, down with DEX disadvantage.
 *
 * @param {object} character  Party member object (needs stats.dexterity)
 * @param {object} monster    Monster object (needs stats.dexterity)
 * @returns {number}          Clamped probability
 */
export function playerHitChance(character, monster) {
  const dexDiff = (character.stats?.dexterity ?? 10) - (monster.stats?.dexterity ?? 10);
  return clamp(BASE_PLAYER_HIT_CHANCE + dexDiff * DEX_HIT_MODIFIER, MIN_HIT_CHANCE, MAX_HIT_CHANCE);
}

/**
 * Probability (0–1) that `monster` lands a hit on `character`.
 * Scales up with monster DEX advantage, down with character DEX advantage.
 *
 * @param {object} monster    Monster object (needs stats.dexterity)
 * @param {object} character  Party member object (needs stats.dexterity)
 * @returns {number}          Clamped probability
 */
export function monsterHitChance(monster, character) {
  const dexDiff = (monster.stats?.dexterity ?? 10) - (character.stats?.dexterity ?? 10);
  return clamp(BASE_MONSTER_HIT_CHANCE + dexDiff * DEX_HIT_MODIFIER, MIN_HIT_CHANCE, MAX_HIT_CHANCE);
}

// ── Damage functions ──────────────────────────────────────────────────────────

/**
 * Damage dealt by a physical attack (SWIPE / BASH / PUNCH / SHOOT).
 * Uses character STR and is reduced by the monster's VIT/RES stat mitigation and flat defence.
 *
 * @param {object} character  Party member (needs stats.strength)
 * @param {object|null} weaponDef  Item definition from items.js (needs baseDamage), or null for bare fists
 * @param {object} monster    Monster (needs defence, stats.vitality, stats.resilience)
 * @returns {number}          Final damage (minimum 1)
 */
export function calcPlayerPhysicalDamage(character, weaponDef, monster, ammoDef = null) {
  // Stat weights on the weapon determine how much STR vs DEX contributes to damage.
  // Defaults to pure STR (bare-hand punch or any weapon without the field).
  const strW = weaponDef?.statWeights?.str ?? 1.0;
  const dexW = weaponDef?.statWeights?.dex ?? 0.0;
  const intW = weaponDef?.statWeights?.intelligence ?? 0.0;
  const vitW = weaponDef?.statWeights?.vitality ?? 0.0;
  const resW = weaponDef?.statWeights?.resilience ?? 0.0;
  const statBonus = Math.floor(
    (character.stats?.strength ?? 10) * strW +
    (character.stats?.dexterity ?? 10) * dexW +
    (character.stats?.intelligence ?? 10) * intW +
    (character.stats?.vitality ?? 10) * vitW +
    (character.stats?.resilience ?? 10) * resW
  );
  let raw = (weaponDef?.baseDamage ?? 0) + statBonus;
  if (ammoDef && ammoDef.damageModifier) {
    raw = Math.round(raw * ammoDef.damageModifier);
  }
  const statMitigation = Math.floor(
    ((monster.stats?.resilience ?? 0) + (monster.stats?.vitality ?? 0)) * RESILIENCE_DAMAGE_FACTOR / 2
  );
  return Math.max(1, raw - statMitigation - (monster.defence ?? 0));
}

/**
 * Damage dealt by a magic attack (FIREBALL).
 * Uses character INT instead of STR, and is reduced by the monster's VIT/RES stat mitigation.
 *
 * @param {object} character  Party member (needs stats.intelligence)
 * @param {object|null} weaponDef  Item definition (needs baseDamage)
 * @param {object} monster    Monster (needs stats.vitality, stats.resilience)
 * @returns {number}          Final damage (minimum 1)
 */
export function calcPlayerMagicDamage(character, weaponDef, monster) {
  const raw = weaponDef?.magnitudeFormula
    ? resolveSpellMagnitude(weaponDef.name, weaponDef, character)
    : (weaponDef?.baseDamage ?? 0) + (character.stats?.intelligence ?? 10);
  const statMitigation = Math.floor(
    ((monster.stats?.resilience ?? 0) + (monster.stats?.vitality ?? 0)) * RESILIENCE_DAMAGE_FACTOR / 2
  );
  return Math.max(1, raw - statMitigation);
}

/**
 * Damage dealt by a monster's attack on a party member.
 * Scales with monster STR; reduced by the character's RES and VIT (50-50 split)
 * and DEF (physical defence from equipped armour).
 *
 * @param {object} monster              Monster (needs stats.strength)
 * @param {object} character            Party member (needs stats.resilience, stats.vitality)
 * @param {number} [characterDefence=0] Total physical defence from equipment
 * @returns {number}                    Final damage (minimum 1)
 */
export function calcMonsterDamage(monster, character, characterDefence = 0) {
  const raw = (monster.stats?.strength ?? 10) + MONSTER_BASE_ATTACK;
  const mitigation = Math.floor(
    ((character.stats?.resilience ?? 0) + (character.stats?.vitality ?? 0)) * RESILIENCE_DAMAGE_FACTOR / 2
  );
  return Math.max(1, raw - mitigation - characterDefence);
}

// ── On-hit effect chance ──────────────────────────────────────────────────────

/**
 * Effective probability (0–1) that an on-hit status effect lands on a character.
 *
 * Two independent reductions are applied multiplicatively:
 *   1. Resilience — higher resilience → lower chance, with diminishing returns.
 *      The BASE constant represents the resilience value that halves the raw chance.
 *   2. Item resistances — each item granting resistance to this effect reduces
 *      the remaining chance further (additive per item, capped at 90% total).
 *
 * A minimum floor (ON_HIT_EFFECT_MIN_CHANCE) ensures it is never impossible.
 *
 * @param {number} rawChance           The effect's base chance from data (0–1)
 * @param {number} resilience          Target's current resilience stat
 * @param {object|null} statusResistances  Map of effectId → total resistance (0–1) from gear
 * @param {string} effectId            The effect being checked, e.g. "poison"
 * @returns {number}                   Clamped effective chance (0–1)
 */
export function calcOnHitChance(rawChance, resilience, statusResistances, effectId) {
  const resMultiplier = ON_HIT_EFFECT_BASE / (ON_HIT_EFFECT_BASE + resilience);
  const itemResistance = Math.min(0.9, statusResistances?.[effectId] ?? 0);
  return Math.max(ON_HIT_EFFECT_MIN_CHANCE, rawChance * resMultiplier * (1 - itemResistance));
}

// ── Formation layout ─────────────────────────────────────────────────────────
//
//  Party slots are arranged in a 2×2 grid:
//
//    [ slot 0 ]  [ slot 1 ]   ← primary front row  (melee + ranged)
//    [ slot 2 ]  [ slot 3 ]   ← back row            (ranged only by default)
//
//  Each back-row slot has a "front partner". If that partner is dead or absent,
//  the back-row member steps up to the front line — they can be targeted by
//  monster attacks AND can perform melee attacks.
//
//  BACKUP_PAIRS maps backSlot → frontSlot it covers.

export const BACKUP_PAIRS = RULES.backupPairs;

// ── Formation queries ─────────────────────────────────────────────────────────

/**
 * Returns the member objects currently on the effective front line.
 *
 * Rules:
 *   - A front-row member (slot 0 or 1) is on the front line if alive.
 *   - If a front-row member is dead/absent, their back-row partner steps up.
 *   - Empty slots are ignored.
 *
 * @param {Array} party  The live party array from party.js
 * @returns {object[]}   Alive members currently on the front line
 */
export function getEffectiveFrontLine(party) {
  const frontLine = [];
  for (const [frontIdx, backIdx] of [[0, 2], [1, 3]]) {
    const front = party[frontIdx];
    const back = party[backIdx];
    if (front && !front.isEmpty && !front.isDead) {
      frontLine.push(front);
    } else if (back && !back.isEmpty && !back.isDead) {
      frontLine.push(back);   // stepped up
    }
  }
  return frontLine;
}

/**
 * Returns true if the party member at slotIndex can perform a melee attack.
 *
 * Rules:
 *   - Front-row slots (0, 1): always allowed if alive.
 *   - Back-row slots (2, 3): allowed only if their front partner is dead/absent.
 *
 * @param {Array}  party      The live party array from party.js
 * @param {number} slotIndex  0-based slot index
 * @returns {boolean}
 */
export function canMelee(party, slotIndex) {
  const m = party[slotIndex];
  if (!m || m.isEmpty || m.isDead) return false;
  if (slotIndex === 0 || slotIndex === 1) return true;
  const frontPartnerIdx = BACKUP_PAIRS[slotIndex];
  if (frontPartnerIdx === undefined) return false;
  const partner = party[frontPartnerIdx];
  return !partner || partner.isEmpty || partner.isDead;
}

/**
 * Picks one random alive member from the effective front line.
 * Returns null if the party is fully wiped.
 *
 * @param {Array} party  The live party array from party.js
 * @returns {object|null}
 */
export function pickRandomFrontLineTarget(party) {
  const candidates = getEffectiveFrontLine(party);
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── Skill / spell magnitude resolver ─────────────────────────────────────────

/**
 * Sums the item power bonuses a caster's equipped items grant for a given skill or spell.
 *
 * skillBonuses keys (any combination allowed):
 *   "all"              — applies to every skill and spell
 *   "healing"          — applies to effects with type "healing"
 *   "buff"             — applies to effects with type "buff"
 *   "debuff"           — applies to effects with type "debuff"
 *   "direct-damage"    — applies to spells with type "direct-damage"
 *   "<Name>"           — applies to one specific skill/spell, e.g. "Fireball" or "Holy Radiance"
 */
function _itemMagnitudeBonus(name, def, caster) {
  const bonuses = caster?.skillBonuses;
  if (!bonuses) return 0;
  let total = 0;
  total += bonuses['all'] ?? 0;
  if (def.type) total += bonuses[def.type] ?? 0;
  if (name) total += bonuses[name] ?? 0;
  return total;
}

/**
 * Evaluates a stat formula string against caster stats and applies an optional scale factor.
 * Supports additive formulas only, e.g. "vitality + intelligence".
 * Use `magnitudeScale` in the def for multiplicative adjustments (e.g. 0.1 for /10).
 */
function _evalFormula(formula, def, caster) {
  const s = caster.stats;
  const base = formula
    .replace(/vitality/g, s.vitality ?? 0)
    .replace(/intelligence/g, s.intelligence ?? 0)
    .replace(/strength/g, s.strength ?? 0)
    .replace(/dexterity/g, s.dexterity ?? 0)
    .replace(/resilience/g, s.resilience ?? 0)
    .split('+').map(Number).reduce((a, b) => a + b, 0);
  return def.magnitudeScale != null ? base * def.magnitudeScale : base;
}

/**
 * Applies item bonuses to a base magnitude using the def's magnitudeBonusMode.
 *
 *   "flat"    (default) — base + bonus
 *   "percent"           — base * (1 + bonus / 100)
 */
function _applyBonus(base, bonus, mode) {
  return mode === 'percent'
    ? base * (1 + bonus / 100)
    : base + bonus;
}

/**
 * Returns the effective magnitude for a skill.
 *
 * Resolution order:
 *   1. If the skill has a `magnitudeFormula`, evaluate it against the caster's stats.
 *   2. Otherwise use the hard-coded `magnitude` value from skills.json.
 *   3. Apply any item bonus from the caster's equipped gear via `magnitudeBonusMode`.
 *
 *      "flat"    (default) — bonus added directly:        base + bonus
 *      "percent"           — bonus is a % change to base: base * (1 + bonus / 100)
 *
 * @param {string}  skillName  Key from skills.json, e.g. "Holy Radiance"
 * @param {object}  skillDef   The skill definition object from skills.json
 * @param {object}  caster     The party member casting the skill (needs .stats and .skillBonuses)
 */
export function resolveSkillMagnitude(skillName, skillDef, caster) {
  console.log('resolveSkillMagnitude', skillName, skillDef.type, skillDef.magnitudeFormula, caster?.stats);

  const base = (skillDef.magnitudeFormula && caster?.stats)
    ? _evalFormula(skillDef.magnitudeFormula, skillDef, caster)
    : (skillDef.magnitude ?? 1);

  const isWorn = caster?.equipment && Object.values(caster.equipment).some(item => item?.name === skillName);
  const bonus = isWorn ? _itemMagnitudeBonus(skillName, skillDef, caster) : 0;
  if (bonus === 0) return base;

  const result = _applyBonus(base, bonus, skillDef.magnitudeBonusMode ?? 'flat');
  console.log(`[${skillName}] base=${base} bonus=${bonus} mode=${skillDef.magnitudeBonusMode ?? 'flat'} → ${result}`);
  return result;
}

/**
 * Returns the effective magnitude for a spell.
 *
 * Resolution order:
 *   1. If the spell has a `magnitudeFormula`, evaluate it against the caster's stats.
 *      Apply `magnitudeScale` from the def if present (e.g. 0.1 scales intelligence → int/10).
 *   2. Otherwise fall back to `spellDef.baseDamage`.
 *   3. Apply any item bonus from the caster's equipped gear via `magnitudeBonusMode`.
 *
 *      "flat"    (default) — base + bonus
 *      "percent"           — base * (1 + bonus / 100)
 *
 * @param {string}  spellName  e.g. "Fireball"
 * @param {object}  spellDef   The spell definition object from spells.json
 * @param {object}  caster     The party member casting the spell (needs .stats and .skillBonuses)
 */
export function resolveSpellMagnitude(spellName, spellDef, caster) {
  const base = (spellDef.magnitudeFormula && caster?.stats)
    ? _evalFormula(spellDef.magnitudeFormula, spellDef, caster)
    : (spellDef.baseDamage ?? 0);

  const bonus = _itemMagnitudeBonus(spellName, spellDef, caster);
  if (bonus === 0) return base;

  const result = _applyBonus(base, bonus, spellDef.magnitudeBonusMode ?? 'flat');
  console.log(`[${spellName}] base=${base} bonus=${bonus} mode=${spellDef.magnitudeBonusMode ?? 'flat'} → ${result}`);
  return result;
}
