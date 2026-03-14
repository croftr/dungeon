// ─────────────────────────────────────────────────────────────────────────────
//  ITEM DATABASE HUB
//
//  All item/potion/spell data lives in src/data/*.json.
//  This file combines them into a single ITEMS array and provides lookups.
//
//  Edit JSON files to add/modify game content:
//    data/loot.json        — loot drops and quest items
//    data/head.json        — helmets and headwear
//    data/cloak.json       — cloaks
//    data/neck.json        — amulets and pendants
//    data/chest.json       — chest armour
//    data/belt.json        — belts
//    data/hands.json       — gloves and gauntlets
//    data/rings.json       — rings
//    data/legs.json        — leggings
//    data/feet.json        — boots
//    data/weapons.json     — weapons (hand/bothHands)
//    data/shields.json      — shields
//    data/ammo.json        — arrows, bolts, spellbook item
//    data/skill-items.json  — active skill items (equippable)
//    data/spellbooks.json  — learnable spellbooks and scrolls
//    data/potions.json     — consumable potions
//    data/spells.json      — castable spells
// ─────────────────────────────────────────────────────────────────────────────

import { SPELLS } from './spells.js';
import POTIONS from './data/potions.json';
import LOOT from './data/loot.json';
import HEAD from './data/head.json';
import CLOAK from './data/cloak.json';
import NECK from './data/neck.json';
import CHEST from './data/chest.json';
import BELT from './data/belt.json';
import HANDS from './data/hands.json';
import RINGS from './data/rings.json';
import LEGS from './data/legs.json';
import FEET from './data/feet.json';
import WEAPONS from './data/weapons.json';
import SHIELDS from './data/shields.json';
import AMMO from './data/ammo.json';
import SKILLS from './data/skill-items.json';
import SPELLBOOKS from './data/spellbooks.json';

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
  SLEEP: 'sleep',
});

export const ITEMS = [
  ...POTIONS,
  ...LOOT,
  ...HEAD,
  ...CLOAK,
  ...NECK,
  ...CHEST,
  ...BELT,
  ...HANDS,
  ...RINGS,
  ...LEGS,
  ...FEET,
  ...WEAPONS,
  ...SHIELDS,
  ...AMMO,
  ...SKILLS,
  ...SPELLBOOKS,
  ...SPELLS,
];


// ─────────────────────────────────────────────────────────────────────────────
//  LOOKUP HELPER
// ─────────────────────────────────────────────────────────────────────────────

export function getItemDef(name) {
  return ITEMS.find((item) => item.name === name) ?? null;
}
