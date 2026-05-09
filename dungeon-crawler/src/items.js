// ─────────────────────────────────────────────────────────────────────────────
//  ITEM DATABASE HUB
//
//  All item/potion/spell data lives in src/data/items/*.json.
//  This file combines them into a single ITEMS array and provides lookups.
//
//  Edit JSON files to add/modify game content:
//    data/items/loot.json        — loot drops and quest items
//    data/items/head.json        — helmets and headwear
//    data/items/cloak.json       — cloaks
//    data/items/neck.json        — amulets and pendants
//    data/items/chest.json       — chest armour
//    data/items/belt.json        — belts
//    data/items/hands.json       — gloves and gauntlets
//    data/items/rings.json       — rings
//    data/items/legs.json        — leggings
//    data/items/feet.json        — boots
//    data/items/weapons.json     — weapons (hand/bothHands)
//    data/items/shields.json      — shields
//    data/items/ammo.json        — arrows, bolts, spellbook item
//    data/items/skill-items.json  — active skill items (equippable)
//    data/items/spellbooks.json  — learnable spellbooks and scrolls
//    data/items/potions.json     — consumable potions
//    data/spells.json      — castable spells
// ─────────────────────────────────────────────────────────────────────────────

import { SPELLS } from './spells.js';
import RECRUITS_DATA from './data/recruits.json';
import POTIONS from './data/items/potions.json';
import LOOT from './data/items/loot.json';
import HEAD from './data/items/head.json';
import CLOAK from './data/items/cloak.json';
import NECK from './data/items/neck.json';
import CHEST from './data/items/chest.json';
import BELT from './data/items/belt.json';
import HANDS from './data/items/hands.json';
import RINGS from './data/items/rings.json';
import LEGS from './data/items/legs.json';
import FEET from './data/items/feet.json';
import WEAPONS from './data/items/weapons.json';
import SHIELDS from './data/items/shields.json';
import AMMO from './data/items/ammo.json';
import SKILLS from './data/items/skill-items.json';
import SPELLBOOKS from './data/items/spellbooks.json';
import PARCHMENTS from './data/items/parchments.json';
import STANCE_TOMES from './data/items/stance-tomes.json';
import WIZARD_SET from './data/items/wizard-set.json';
import AETHELGARD_SET from './data/items/aethelgard-set.json';
import SERAPHIC_SET from './data/items/seraphic-set.json';
import MOUNTAIN_STALKER_SET from './data/items/mountain-stalker-set.json';
import SYLVAN_SET from './data/items/sylvan-set.json';
import CELESTIAL_SET from './data/items/celestial-set.json';
import IRONPEAK_SET from './data/items/ironpeak-set.json';
import WARDANCER_SET from './data/items/wardancer-set.json';
import STORMREAVER_SET from './data/items/stormreaver-set.json';
import STEEL_VANGUARD_SET from './data/items/steel-vanguard-set.json';

export const ACTIONS = Object.freeze({
  SWIPE: 'swipe',
  BASH: 'bash',
  SHOOT: 'shoot',
  PUNCH: 'punch',
  FIREBALL: 'fireball',
  FROSTBOLT: 'frostbolt',
  WATERBOLT: 'waterbolt',
  LIGHTNINGBOLT: 'lightningbolt',
  HOLYBOLT: 'holybolt',
  DARKBOLT: 'darkbolt',
  BANISHMENT: 'banishment',
  SHIELD_BASH: 'shield-bash',
  REGENERATE: 'regenerate',
  CURE_POISON: 'cure-poison',
  RESIST_POISON: 'resist-poison',
  HEAL: 'heal',
  REJUVENATE: 'rejuvenate',
  SLEEP: 'sleep',
  INCINERATE: 'incinerate',
  RESIST_FEAR: 'resist-fear',
  SHELL: 'shell',
  RESIST_FIRE: 'resist-fire',
  RESIST_ICE: 'resist-ice',
  RESIST_LIGHTNING: 'resist-lightning',
  RESIST_WATER: 'resist-water',
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
  ...PARCHMENTS,
  ...STANCE_TOMES,
  ...WIZARD_SET,
  ...AETHELGARD_SET,
  ...SERAPHIC_SET,
  ...MOUNTAIN_STALKER_SET,
  ...SYLVAN_SET,
  ...CELESTIAL_SET,
  ...IRONPEAK_SET,
  ...WARDANCER_SET,
  ...STORMREAVER_SET,
  ...STEEL_VANGUARD_SET,
  ...SPELLS,
];


// ─────────────────────────────────────────────────────────────────────────────
//  LOOKUP HELPER
// ─────────────────────────────────────────────────────────────────────────────

export function getItemDef(name) {
  return ITEMS.find((item) => item.name === name) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  JOB-BASED RESTRICTIONS (tomes, weapons, armor)
//
//  Items can opt into a class restriction by adding a `job` field. Accepts
//  either a single key ("Paladin") or an array (["Paladin", "Warrior"]).
//  Job names are normalized (lowercase, spaces to hyphens) to match 
//  canonical keys defined in src/data/jobs.js.
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeJob(job) {
  if (!job) return '';
  return String(job).toLowerCase().replace(/\s+/g, '-');
}

export function getMemberJob(member) {
  if (!member) return '';
  if (member.job) return normalizeJob(member.job);
  const recruit = RECRUITS_DATA.find(r => r.name === member.name);
  return normalizeJob(recruit?.job);
}

/**
 * Returns true if `member` is allowed to use `itemDef` based on its job field.
 * Items without a `job` field are unrestricted (returns true).
 */
export function canUseItemByJob(member, itemDef) {
  if (!itemDef?.job) return true;
  const memberJob = getMemberJob(member);
  if (!memberJob) return false;
  const allowed = Array.isArray(itemDef.job) ? itemDef.job : [itemDef.job];
  return allowed.some(j => normalizeJob(j) === memberJob);
}
