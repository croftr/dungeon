// ─────────────────────────────────────────────────────────────────────────────
//  COMBAT RULES  — single source of truth for all combat tuning and formation logic.
//  Edit this file to iterate on combat balance and rules.
// ─────────────────────────────────────────────────────────────────────────────

// ── Utility ───────────────────────────────────────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ── Hit chance constants ──────────────────────────────────────────────────────

/** Base probability (0–1) that a player's attack hits a monster. */
export const BASE_PLAYER_HIT_CHANCE = 0.80;

/** Base probability (0–1) that a monster's attack hits a party member. */
export const BASE_MONSTER_HIT_CHANCE = 0.45;

/** Hit chance shift per point of DEX advantage/disadvantage (both directions). */
export const DEX_HIT_MODIFIER = 0.015;

/** Floor applied to all hit chance results — no attacker can drop below this. */
export const MIN_HIT_CHANCE = 0.15;

/** Ceiling applied to all hit chance results — no attacker can exceed this. */
export const MAX_HIT_CHANCE = 0.97;

// ── Critical hit constants ────────────────────────────────────────────────────

/** Probability (0–1) that a confirmed hit (either direction) becomes a critical hit. */
export const CRIT_CHANCE = 0.05;

/** Damage multiplier applied when a critical hit occurs. */
export const CRIT_MULTIPLIER = 3;

// ── Monster attack damage constants ──────────────────────────────────────────

/** Flat bonus added to a monster's STR when calculating attack damage. */
export const MONSTER_BASE_ATTACK = 4;

/**
 * Fraction of a character's RES stat subtracted from incoming monster damage.
 * e.g. RES 18 × 0.5 = 9 points of damage reduction.
 */
export const RESILIENCE_DAMAGE_FACTOR = 0.5;

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

export const BACKUP_PAIRS = {
  2: 0,   // slot 2 steps up when slot 0 is dead
  3: 1,   // slot 3 steps up when slot 1 is dead
};

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
