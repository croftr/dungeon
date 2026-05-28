// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER DEFINITIONS  — edit data/monsters.json for solo monsters and
//  data/monster-groups.json for grouped formations (e.g. quartets).
//  This file merges both sources into a single MONSTER_DEFS map.
// ─────────────────────────────────────────────────────────────────────────────
import SOLO from './data/monsters.json';
import GROUPS from './data/monster-groups.json';

export const MONSTER_DEFS = { ...SOLO, ...GROUPS };
