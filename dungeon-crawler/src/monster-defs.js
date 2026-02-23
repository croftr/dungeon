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

export const MONSTER_DEFS = {

  goblin: {
    name: 'Goblin',
    hp: 100,
    defence: 8,
    stats: { strength: 12, dexterity: 15, vitality: 8, intelligence: 5, resilience: 5 },
  },

  albino_goblin: {
    name: 'Albino Goblin',
    hp: 120,
    defence: 8,
    stats: { strength: 14, dexterity: 18, vitality: 10, intelligence: 5, resilience: 6 },
    onHitEffects: [
      { effectId: 'poison', chance: 0.9 },
    ],
  },

  orc: {
    name: 'Orc',
    hp: 200,
    defence: 12,
    stats: { strength: 20, dexterity: 8, vitality: 15, intelligence: 6, resilience: 12 },
  },

  ghoul: {
    name: 'Ghoul',
    hp: 180,
    defence: 7,
    stats: { strength: 16, dexterity: 12, vitality: 10, intelligence: 4, resilience: 6 },
  },

  zombie: {
    name: 'Zombie',
    hp: 100,
    defence: 5,
    stats: { strength: 14, dexterity: 4, vitality: 10, intelligence: 2, resilience: 8 },
  },

  iceman: {
    name: 'IceMan',
    hp: 200,
    defence: 12,
    stats: { strength: 15, dexterity: 8, vitality: 12, intelligence: 10, resilience: 10 },
  },

  treekin: {
    name: 'TreeKin',
    hp: 150,
    defence: 15,
    stats: { strength: 18, dexterity: 6, vitality: 15, intelligence: 12, resilience: 12 },
  },

};
