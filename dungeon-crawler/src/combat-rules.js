// ─────────────────────────────────────────────────────────────────────────────
//  COMBAT RULES  — single source of truth for all combat tuning and formation logic.
//  Edit data/combat-rules.json to iterate on combat balance.
// ─────────────────────────────────────────────────────────────────────────────

import RULES from './data/combat-rules.json';
import SKILLS_DATA from './data/skills.json';
import { getHqWeaponDamageBonus } from './crafting.js';
import { getMonsterHitChanceReduction, getStanceDamageMultiplier, getMagicDamageMultiplier, getStanceCureHealBonus, getStanceRegenBonus, getStanceElementMultiplier } from './stance.js';
import { getMonsterElementMultiplier } from './elements.js';

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
export function playerHitChance(character, monster, weaponDef = null) {
  const dexDiff = (character.stats?.dexterity ?? 10) - (monster.stats?.dexterity ?? 10);
  let chance = BASE_PLAYER_HIT_CHANCE + dexDiff * DEX_HIT_MODIFIER;

  if (character.skills) {
    character.skills.forEach(skill => {
      const name = typeof skill === 'string' ? skill : skill.name;
      const skillDef = SKILLS_DATA[name];
      if (skillDef?.isPassive && skillDef.effectType === 'weaponAccuracyBonus') {
        if (weaponDef && weaponDef.weaponType === skillDef.weaponType) {
          chance += skillDef.magnitude || 0;
        }
      }
    });
  }

  return clamp(chance, MIN_HIT_CHANCE, MAX_HIT_CHANCE);
}

/**
 * Probability (0–1) that `character` lands a direct-damage spell on `monster`.
 * Mirrors the physical hit formula but contests INT vs INT — a focused mind
 * against a focused mind. The Pyromancer passive's accuracyMagnitude still
 * applies to Fireball and Incinerate.
 */
export function playerSpellHitChance(character, monster, spellDef = null) {
  const intDiff = (character.stats?.intelligence ?? 10) - (monster.stats?.intelligence ?? 10);
  let chance = BASE_PLAYER_HIT_CHANCE + intDiff * DEX_HIT_MODIFIER;

  if (character.skills) {
    character.skills.forEach(skill => {
      const name = typeof skill === 'string' ? skill : skill.name;
      const skillDef = SKILLS_DATA[name];
      if (skillDef?.isPassive && name === 'Pyromancer'
          && (spellDef?.attackType === 'fireball' || spellDef?.attackType === 'incinerate')) {
        chance += skillDef.accuracyMagnitude || 0;
      }
    });
  }

  return clamp(chance, MIN_HIT_CHANCE, MAX_HIT_CHANCE);
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
  let chance = BASE_MONSTER_HIT_CHANCE + dexDiff * DEX_HIT_MODIFIER;
  chance -= getMonsterHitChanceReduction(character);
  return clamp(chance, MIN_HIT_CHANCE, MAX_HIT_CHANCE);
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
export function calcPlayerPhysicalDamage(character, weaponDef, monster, ammoDef = null, weaponIsHQ = false) {
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
  let passiveBonus = 0;
  if (character.skills) {
    character.skills.forEach(skill => {
      // Skills are objects with a .name property
      const name = typeof skill === 'string' ? skill : skill.name;
      const skillDef = SKILLS_DATA[name];
      if (skillDef?.isPassive && skillDef.effectType === 'weaponDamageBonus') {
        if (weaponDef && weaponDef.weaponType === skillDef.weaponType) {
          passiveBonus += skillDef.magnitude || 0;
        }
      }
      if (skillDef?.isPassive && skillDef.effectType === 'shieldMasterBonus') {
        passiveBonus += skillDef.magnitude || 0;
      }
    });
  }

  let familyBonus = 0;
  if (weaponDef?.familyBonus && monster?.family) {
    const entries = Array.isArray(weaponDef.familyBonus)
      ? weaponDef.familyBonus
      : Object.entries(weaponDef.familyBonus).map(([family, bonus]) => ({ family, bonus }));

    for (const entry of entries) {
      if (entry.family === monster.family) familyBonus += entry.bonus;
    }
  }

  const hqBonus = weaponIsHQ ? getHqWeaponDamageBonus(weaponDef) : 0;
  let raw = (weaponDef?.baseDamage ?? 0) + hqBonus + statBonus + passiveBonus + familyBonus;
  if (ammoDef && ammoDef.damageModifier) {
    raw = Math.round(raw * ammoDef.damageModifier);
  }
  const dr = monster.damageReduction ?? 0;
  if (dr) raw = Math.round(raw * (1 - dr));
  const statMitigation = Math.floor(
    ((monster.stats?.resilience ?? 0) + (monster.stats?.vitality ?? 0)) * RESILIENCE_DAMAGE_FACTOR / 2
  );
  const afterMit = Math.max(1, raw - statMitigation - (monster.defence ?? 0));
  const stanceMult = getStanceDamageMultiplier(character, monster);
  const physicalFinal = stanceMult === 1 ? afterMit : Math.max(1, Math.round(afterMit * stanceMult));

  // Elemental riders are added on top of the physical portion. Each rider is
  // calculated independently against the monster's per-element multiplier and
  // (optionally) the attacker's stance element multiplier. Riders ignore physical
  // mitigation/defence — they're a separate damage stream.
  const { total: elementalTotal } = getElementalRiderBreakdown(character, monster, weaponDef, ammoDef);
  return Math.max(1, physicalFinal + elementalTotal);
}

/**
 * Computes elemental rider damage from a weapon + ammo against a monster, and
 * returns both a per-element breakdown and the summed total.
 *
 * Each (element, value) is multiplied by the monster's elemental multiplier
 * (categorical → 0/0.5/1/1.5/2) and the attacker's stance element multiplier.
 * Rounded per-element so individual riders show clean numbers in the battle log.
 *
 * Used by both calcPlayerPhysicalDamage (for the total) and attackMonster
 * (for the per-element battle-log breakdown).
 *
 * @returns {{ breakdown: Record<string, number>, total: number }}
 */
export function getElementalRiderBreakdown(character, monster, weaponDef, ammoDef) {
  const breakdown = {};
  let total = 0;
  const sources = [weaponDef?.elementalDamage, ammoDef?.elementalDamage];
  for (const src of sources) {
    if (!src) continue;
    for (const [element, value] of Object.entries(src)) {
      if (!value) continue;
      const monMult = getMonsterElementMultiplier(monster, element);
      if (monMult === 0) continue;
      const stanceMult = getStanceElementMultiplier(character, element);
      const rider = Math.round(value * monMult * stanceMult);
      if (rider === 0) continue;
      breakdown[element] = (breakdown[element] ?? 0) + rider;
      total += rider;
    }
  }
  return { breakdown, total };
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
export function calcPlayerMagicDamage(character, weaponDef, monster, weaponIsHQ = false) {
  const hqBonus = weaponIsHQ ? getHqWeaponDamageBonus(weaponDef) : 0;
  let raw = weaponDef?.magnitudeFormula
    ? resolveSpellMagnitude(weaponDef.name, weaponDef, character) + hqBonus
    : (weaponDef?.baseDamage ?? 0) + hqBonus + (character.stats?.intelligence ?? 10);
  // Apply Pyromancer passive skill bonus per instance of the skill
  if (character.skills) {
    character.skills.forEach(skill => {
      const name = typeof skill === 'string' ? skill : skill.name;
      if (name === 'Pyromancer') {
        const skillDef = SKILLS_DATA['Pyromancer'];
        raw += (skillDef?.magnitude ?? 1);
      }
    });
  }

  // Apply per-element multiplier: family/monster resistance categories drive the
  // multiplier (e.g. undead is "vulnerable" to holy → 2×). Spells with no element
  // are treated as raw arcane and skip this step. Holy stance's
  // damageElementMultiplier also applies here when the spell has an element.
  const element = weaponDef?.element ?? null;
  if (element) {
    const monMult = getMonsterElementMultiplier(monster, element);
    const stanceElemMult = getStanceElementMultiplier(character, element);
    raw = Math.round(raw * monMult * stanceElemMult);
  }

  const dr = monster.damageReduction ?? 0;
  if (dr) raw = Math.round(raw * (1 - dr));
  const statMitigation = Math.floor(
    ((monster.stats?.resilience ?? 0) + (monster.stats?.vitality ?? 0)) * RESILIENCE_DAMAGE_FACTOR / 2
  );
  const afterMit = Math.max(1, raw - statMitigation);
  const stanceMult = getStanceDamageMultiplier(character, monster) * getMagicDamageMultiplier(character);
  return stanceMult === 1 ? afterMit : Math.max(1, Math.round(afterMit * stanceMult));
}

/**
 * Damage dealt by a monster's attack on a party member.
 * Scales with monster STR; reduced by the character's RES and VIT (50-50 split)
 * and DEF (physical defence from equipped armour). If the attack carries an
 * element, the caller passes a pre-resolved `elementResistance` (0..1) which is
 * applied as a final multiplicative reduction.
 *
 * @param {object} monster              Monster (needs stats.strength)
 * @param {object} character            Party member (needs stats.resilience, stats.vitality)
 * @param {number} [characterDefence=0] Total physical defence from equipment
 * @param {number} [elementResistance=0] Pre-resolved player resistance (0..0.9) for the attack's element. Caller passes 0 for non-elemental.
 * @returns {number}                    Final damage (minimum 1)
 */
export function calcMonsterDamage(monster, character, characterDefence = 0, elementResistance = 0) {
  const raw = (monster.stats?.strength ?? 10) + MONSTER_BASE_ATTACK;
  const resVit = (character.stats?.resilience ?? 0) + (character.stats?.vitality ?? 0);
  const resFactor = 100 / (100 + resVit);
  const afterRes = Math.floor(raw * resFactor);
  let dmg = Math.max(1, afterRes - characterDefence);
  if (elementResistance) dmg = Math.max(1, Math.round(dmg * (1 - elementResistance)));
  return window.easyMode ? Math.max(1, Math.floor(dmg * 0.5)) : dmg;
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
  // "all" applies to every effect (e.g. Inquisitor stance); adds on top of per-effect resistance.
  const specific = statusResistances?.[effectId] ?? 0;
  const blanket = statusResistances?.all ?? 0;
  const itemResistance = Math.min(0.9, specific + blanket);
  return Math.max(ON_HIT_EFFECT_MIN_CHANCE, rawChance * resMultiplier * (1 - itemResistance));
}

// ── Formation layout ─────────────────────────────────────────────────────────
//
//  Party slots are arranged in a 2×2 grid viewed from behind the party:
//
//    [ slot 0 front-LEFT ]  [ slot 1 front-RIGHT ]   ← primary front row
//    [ slot 2  back-LEFT ]  [ slot 3  back-RIGHT ]   ← back row
//
//  Directional attack coverage:
//    Front  → slots 0, 1  (or back partner if front is dead)
//    Back   → slots 2, 3  (or front partner if back is dead)
//    Left   → slots 0, 2  (or right-column partner if both dead)
//    Right  → slots 1, 3  (or left-column partner if both dead)
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

// Returns the primary slot member if alive, otherwise the fallback partner.
function _liveOrPartner(party, primaryIdx, fallbackIdx) {
  const primary = party[primaryIdx];
  if (primary && !primary.isEmpty && !primary.isDead) return primary;
  const fallback = party[fallbackIdx];
  if (fallback && !fallback.isEmpty && !fallback.isDead) return fallback;
  return null;
}

// Player facing → forward unit vector in grid space { dr, dc }
// (row increases South, col increases East)
const _FWD = [
  { dr: -1, dc: 0 }, // 0 North
  { dr: 0, dc: 1 }, // 1 East
  { dr: 1, dc: 0 }, // 2 South
  { dr: 0, dc: -1 }, // 3 West
];

// Right-hand vector (90° CW from forward in top-down grid space)
const _RIGHT = [
  { dr: 0, dc: 1 }, // 0 North → right is East
  { dr: 1, dc: 0 }, // 1 East  → right is South
  { dr: 0, dc: -1 }, // 2 South → right is West
  { dr: -1, dc: 0 }, // 3 West  → right is North
];

/**
 * Picks a random alive party member from the face of the formation the monster
 * is attacking from, based on the player's current facing direction.
 *
 * Attack-face → candidate slots:
 *   Front  (monster ahead of party)  → 0, 1
 *   Back   (monster behind party)    → 2, 3
 *   Right  (monster on party's right)→ 1, 3
 *   Left   (monster on party's left) → 0, 2
 *
 * Falls back to any alive member if the entire face is wiped.
 *
 * @param {Array}  party        The live party array from party.js
 * @param {object} monster      Attacking monster (needs gridRow, gridCol)
 * @param {number} facing       player.facing  (0 North / 1 East / 2 South / 3 West)
 * @param {number} playerRow    player.gridRow
 * @param {number} playerCol    player.gridCol
 * @returns {object|null}
 */
export function pickDirectionalTarget(party, monster, facing, playerRow, playerCol) {
  const fwd = _FWD[facing] ?? _FWD[0];
  const right = _RIGHT[facing] ?? _RIGHT[0];

  // Vector from player to monster
  const dr = monster.gridRow - playerRow;
  const dc = monster.gridCol - playerCol;

  const dotFwd = dr * fwd.dr + dc * fwd.dc;
  const dotRight = dr * right.dr + dc * right.dc;

  // Which axis dominates?  Tie goes to front/back.
  let pool;
  if (Math.abs(dotFwd) >= Math.abs(dotRight)) {
    if (dotFwd >= 0) {
      // Front attack: prefer slots 0,1 — substitute back partner if front is dead
      pool = [
        _liveOrPartner(party, 0, 2),
        _liveOrPartner(party, 1, 3),
      ].filter(Boolean);
    } else {
      // Back attack: prefer slots 2,3 — substitute front partner if back is dead
      pool = [
        _liveOrPartner(party, 2, 0),
        _liveOrPartner(party, 3, 1),
      ].filter(Boolean);
    }
  } else {
    const slots = dotRight > 0 ? [1, 3] : [0, 2]; // right or left flank
    pool = slots.map(i => party[i]).filter(m => m && !m.isEmpty && !m.isDead);
  }

  // Fallback: any surviving member (so combat never silently stalls)
  if (!pool.length) {
    const fallback = party.filter(m => m && !m.isEmpty && !m.isDead);
    return fallback.length ? fallback[Math.floor(Math.random() * fallback.length)] : null;
  }

  return pool[Math.floor(Math.random() * pool.length)];
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
  if (def.element) total += bonuses[def.element] ?? 0;
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

  let bonus = _itemMagnitudeBonus(spellName, spellDef, caster);

  // Apply passive skill bonuses
  if (caster?.skills) {
    caster.skills.forEach(skill => {
      const name = typeof skill === 'string' ? skill : skill.name;
      if (name === 'Lifewarden') {
        const skillDef = SKILLS_DATA['Lifewarden'];
        if (spellName === 'Regeneration') {
          bonus += (skillDef?.regenMagnitude ?? 1);
        } else if (spellName === 'Heal' || spellName === 'Cure Poison') {
          bonus += (skillDef?.magnitude ?? 2);
        }
      }
    });
  }

  if (spellName === 'Regeneration') {
    bonus += getStanceRegenBonus(caster);
  } else if (spellName === 'Heal' || spellName === 'Cure Poison') {
    bonus += getStanceCureHealBonus(caster);
  }

  if (bonus === 0) return base;

  const result = _applyBonus(base, bonus, spellDef.magnitudeBonusMode ?? 'flat');
  console.log(`[${spellName}] base=${base} bonus=${bonus} mode=${spellDef.magnitudeBonusMode ?? 'flat'} → ${result}`);
  return result;
}
