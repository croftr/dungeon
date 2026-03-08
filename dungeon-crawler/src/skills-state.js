// ─────────────────────────────────────────────────────────────────────────────
//  SKILLS STATE  — shared mutable state for active skill buffs.
//
//  Imported by equipment.js (writes) and monster.js (reads) to avoid creating
//  a circular dependency between those two modules.
//
//  Every skill that has a magnitude stores it here, resolved from the caster's
//  stats and equipment at cast time via resolveSkillMagnitude().
// ─────────────────────────────────────────────────────────────────────────────

export const skillsState = {
  /** Sanctuary — reduces all incoming party damage while active. */
  sanctuary: {
    active: false,
    expiresAt: 0,     // performance.now() value when the buff ends
    magnitude: 1,     // resolved from caster's stats + gear at cast time
  },

  /** Arcane Lantern — Merlin's spell illuminates the dungeon like a torch. */
  arcaneLight: {
    active: false,
    expiresAt: 0,
  },

  /** Entangle — multiplies the targeted monster's attack delay */
  entangle: {
    active: false,
    expiresAt: 0,
    targetId: null,
    magnitude: 1,     // resolved at cast time
  },

  /** Sunder Armor — multiplier applied to a specific monster's defence */
  sunderArmor: {
    active: false,
    targetId: null,
    expiresAt: 0,
    magnitude: 1,     // resolved at cast time
  },

  /** Berserk — damage multiplier for the caster */
  berserk: {
    active: false,
    actorName: null,  // restricts the buff to just the caster
    expiresAt: 0,
    magnitude: 1,     // resolved at cast time
  },

  /** Whirlwind — attack-delay multiplier for the caster */
  whirlwind: {
    active: false,
    actorName: null,
    expiresAt: 0,
    magnitude: 1,     // resolved at cast time
  },

  /** True Shot — guaranteed hit for ranged attacks (no magnitude needed) */
  trueShot: {
    active: false,
    actorName: null,
    expiresAt: 0,
  },

  /** Warcry — damage multiplier for the whole party */
  warcry: {
    active: false,
    expiresAt: 0,
    magnitude: 1,     // resolved at cast time
  },

  /** War Dance — attack-delay multiplier for the whole party */
  warDance: {
    active: false,
    expiresAt: 0,
    magnitude: 1,     // resolved at cast time
  },
  /** Double Attack — allows the caster to attack twice per action */
  doubleAttack: {
    active: false,
    actorName: null,
    expiresAt: 0,
  },
  /** Rampart — doubles the caster's armor while active. */
  rampart: {
    active: false,
    actorName: null,
    expiresAt: 0,
    magnitude: 1, // resolved at cast time
  },
};
