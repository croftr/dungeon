// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER DEFINITIONS  — edit stats here to tune all monsters.
//  Changes propagate automatically to every instance of that monster type.
//
//  Stats reference:
//    hp        — total hit points
//    defence   — physical armour (flat reduction from melee/ranged damage)
//    strength  — raw attack damage dealt to the party
//    dexterity — hit accuracy and dodge (higher = lands more hits, harder to hit)
//    vitality  — reserved for future HP-scaling / regen mechanics
//    intelligence — reserved for future magic-attack mechanics
//    resilience — magic resistance (flat reduction from fireball / spell damage)
//
//  onHitEffects (optional):
//    Array of status effects this monster can inflict on a successful hit.
//    Each entry: { effectId: <key from STATUS_EFFECT_DEFS>, chance: 0–1 }
//    Effects are defined in status-effects.js.
// ─────────────────────────────────────────────────────────────────────────────

import monsterData from './data/monsters.json';

export const MONSTER_DEFS = monsterData;
