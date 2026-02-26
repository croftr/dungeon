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

import statusEffectData from './data/status-effects.json';

export const STATUS_EFFECT_DEFS = statusEffectData;
