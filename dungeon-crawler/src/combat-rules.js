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
 * Uses character STR and is reduced by the monster's physical defence.
 *
 * @param {object} character  Party member (needs stats.strength)
 * @param {object|null} weaponDef  Item definition from items.js (needs baseDamage), or null for bare fists
 * @param {object} monster    Monster (needs defence)
 * @returns {number}          Final damage (minimum 1)
 */
export function calcPlayerPhysicalDamage(character, weaponDef, monster, ammoDef = null) {
  // Stat weights on the weapon determine how much STR vs DEX contributes to damage.
  // Defaults to pure STR (bare-hand punch or any weapon without the field).
  const strW = weaponDef?.statWeights?.str ?? 1.0;
  const dexW = weaponDef?.statWeights?.dex ?? 0.0;
  const statBonus = Math.floor(
    (character.stats?.strength ?? 10) * strW +
    (character.stats?.dexterity ?? 10) * dexW
  );
  let raw = (weaponDef?.baseDamage ?? 0) + statBonus;
  if (ammoDef && ammoDef.damageModifier) {
    raw = Math.round(raw * ammoDef.damageModifier);
  }
  return Math.max(1, raw - (monster.defence ?? 0));
}

/**
 * Damage dealt by a magic attack (FIREBALL).
 * Uses character INT instead of STR, and is reduced by the monster's resilience (magic resistance).
 *
 * @param {object} character  Party member (needs stats.intelligence)
 * @param {object|null} weaponDef  Item definition (needs baseDamage)
 * @param {object} monster    Monster (needs stats.resilience)
 * @returns {number}          Final damage (minimum 1)
 */
export function calcPlayerMagicDamage(character, weaponDef, monster) {
  const raw = (weaponDef?.baseDamage ?? 0) + (character.stats?.intelligence ?? 10);
  return Math.max(1, raw - (monster.stats?.resilience ?? 0));
}

/**
 * Damage dealt by a monster's attack on a party member.
 * Scales with monster STR; reduced by the character's RES (resilience stat)
 * and DEF (physical defence from equipped armour).
 *
 * @param {object} monster              Monster (needs stats.strength)
 * @param {object} character            Party member (needs stats.resilience)
 * @param {number} [characterDefence=0] Total physical defence from equipment
 * @returns {number}                    Final damage (minimum 1)
 */
export function calcMonsterDamage(monster, character, characterDefence = 0) {
  const raw = (monster.stats?.strength ?? 10) + MONSTER_BASE_ATTACK;
  const resMitigation = Math.floor((character.stats?.resilience ?? 0) * RESILIENCE_DAMAGE_FACTOR);
  return Math.max(1, raw - resMitigation - characterDefence);
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

// ── Skill magnitude resolver ──────────────────────────────────────────────────

/**
 * Sums the item skill-power bonuses a caster's equipped items grant for a given skill.
 *
 * Item skillBonuses keys (any combination allowed):
 *   "all"          — applies to every skill
 *   "healing"      — applies to skills with type "healing"   (matches skills.json `type`)
 *   "buff"         — applies to skills with type "buff"
 *   "debuff"       — applies to skills with type "debuff"
 *   "<Skill Name>" — applies to one specific skill, e.g. "Sanctuary" or "Holy Radiance"
 */
function _itemSkillBonus(skillName, skillDef, caster) {
  const bonuses = caster?.skillBonuses;
  if (!bonuses) return 0;
  let total = 0;
  total += bonuses['all']          ?? 0;
  if (skillDef.type) total += bonuses[skillDef.type] ?? 0;
  if (skillName)     total += bonuses[skillName]     ?? 0;
  return total;
}

/**
 * Returns the effective magnitude for a skill.
 *
 * Resolution order:
 *   1. If the skill has a `magnitudeFormula`, evaluate it against the caster's stats.
 *   2. Otherwise use the hard-coded `magnitude` value from skills.json.
 *   3. Apply any item bonus from the caster's equipped gear, using the skill's
 *      `magnitudeBonusMode` to determine how:
 *
 *      "flat"    (default) — bonus added directly:        base + bonus
 *                            Use for HP values, percentages, absolute amounts.
 *      "percent"           — bonus is a % change to base: base * (1 + bonus / 100)
 *                            Use for damage/speed multipliers. e.g. bonus=10 → ×1.10.
 *                            Use negative values on items to strengthen inverted
 *                            multipliers (e.g. "Sunder Armor": -10 → 0.5 × 0.9 = 0.45).
 *
 * @param {string}  skillName  Key from skills.json, e.g. "Holy Radiance"
 * @param {object}  skillDef   The skill definition object from skills.json
 * @param {object}  caster     The party member casting the skill (needs .stats and .skillBonuses)
 */
export function resolveSkillMagnitude(skillName, skillDef, caster) {
  console.log('resolveSkillMagnitude', skillName, skillDef.type, skillDef.magnitudeFormula, caster?.stats);

  let base;
  if (skillDef.magnitudeFormula && caster?.stats) {
    const s = caster.stats;
    base = skillDef.magnitudeFormula
      .replace(/vitality/g,     s.vitality     ?? 0)
      .replace(/intelligence/g, s.intelligence ?? 0)
      .replace(/strength/g,     s.strength     ?? 0)
      .replace(/dexterity/g,    s.dexterity    ?? 0)
      .replace(/resilience/g,   s.resilience   ?? 0)
      .split('+').map(Number).reduce((a, b) => a + b, 0);
  } else {
    base = skillDef.magnitude ?? 1;
  }

  const bonus = _itemSkillBonus(skillName, skillDef, caster);
  if (bonus === 0) return base;

  const mode = skillDef.magnitudeBonusMode ?? 'flat';
  const result = mode === 'percent'
    ? base * (1 + bonus / 100)
    : base + bonus;

  console.log(`[${skillName}] base=${base} bonus=${bonus} mode=${mode} → ${result}`);
  return result;
}
