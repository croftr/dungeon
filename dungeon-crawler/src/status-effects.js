// ─────────────────────────────────────────────────────────────────────────────
//  STATUS EFFECT DEFINITIONS
//  Debuffs that monster attacks can inflict on party members.
//
//  Each entry drives both the visual presentation (icon, name, status banner)
//  and the gameplay mechanic (duration, tick damage, etc.).
//
//  To add a new effect:
//    1. Add a new key here with a unique effectId.
//    2. Reference it in monster-defs.js → onHitEffects array.
//    3. Add tick-damage handling in party.js → updateParty if needed.
//
//  Fields:
//    id          — must match the object key; used as the canonical identifier
//    name        — display name shown in the battle log and status banner tooltip
//    type        — must be 'debuff' so the status banner renderer picks it up
//    icon        — path to the icon shown on the party card status bar
//    duration    — how many seconds the effect lasts
//    tickInterval — seconds between each damage tick (omit if no tick damage)
//    tickDamage  — HP removed per tick (omit if no tick damage)
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_EFFECT_DEFS = {

  /** Poison — drains 1 HP every 2 seconds for 30 seconds. */
  poison: {
    id: 'poison',
    name: 'Poison',
    type: 'debuff',
    icon: '/icons/poison.svg',
    duration: 30,
    tickInterval: 2,
    tickDamage: 1,
  },

};
