// ─────────────────────────────────────────────────────────────────────────────
//  ITEM DATABASE HUB
//
//  All item/potion/spell data lives in src/data/*.json.
//  This file combines them into a single ITEMS array and provides lookups.
//
//  Edit JSON files to add/modify game content:
//    data/items.json       — equipment, weapons, armor, loot, skill items, spellbooks
//    data/potions.json     — consumable potions
//    data/spells.json      — castable spells
// ─────────────────────────────────────────────────────────────────────────────

import { SPELLS } from './spells.js';
import POTIONS from './data/potions.json';
import ITEMS_DATA from './data/items.json';

export const ACTIONS = Object.freeze({
  SWIPE: 'swipe',
  BASH: 'bash',
  SHOOT: 'shoot',
  PUNCH: 'punch',
  FIREBALL: 'fireball',
  SHIELD_BASH: 'shield-bash',
  REGENERATE: 'regenerate',
  CURE_POISON: 'cure-poison',
  RESIST_POISON: 'resist-poison',
  HEAL: 'heal',
  REJUVENATE: 'rejuvenate',
});

export const ITEMS = [
  ...POTIONS,
  ...ITEMS_DATA,
  ...SPELLS,
];


// ─────────────────────────────────────────────────────────────────────────────
//  LOOKUP HELPER
// ─────────────────────────────────────────────────────────────────────────────

export function getItemDef(name) {
  return ITEMS.find((item) => item.name === name) ?? null;
}
