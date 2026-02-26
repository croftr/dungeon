// ─────────────────────────────────────────────────────────────────────────────
//  ITEM SCHEMA
//
//  Now loaded from data/items.json and data/potions.json
// ─────────────────────────────────────────────────────────────────────────────

import { SPELLS } from './spells.js';
import POTIONS from './data/potions.json';
import ITEM_DATA from './data/items.json';

export const ACTIONS = Object.freeze({
  SWIPE: 'swipe',
  BASH: 'bash',
  SHOOT: 'shoot',
  PUNCH: 'punch',
  FIREBALL: 'fireball',
  SHIELD_BASH: 'shield-bash',
  REGENERATE: 'regenerate',
  CURE_POISON: 'cure-poison',
  HEAL: 'heal',
});

export const ITEMS = [
  ...POTIONS,
  ...ITEM_DATA
];


// ─────────────────────────────────────────────────────────────────────────────
//  LOOKUP HELPER
// ─────────────────────────────────────────────────────────────────────────────

export function getItemDef(name) {
  return ITEMS.find((item) => item.name === name)
    ?? SPELLS.find((spell) => spell.name === name)
    ?? null;
}
