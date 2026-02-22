// ─────────────────────────────────────────────────────────────────────────────
//  SKILLS STATE  — shared mutable state for active skill buffs.
//
//  Imported by equipment.js (writes) and monster.js (reads) to avoid creating
//  a circular dependency between those two modules.
// ─────────────────────────────────────────────────────────────────────────────

export const skillsState = {
  /** Sanctuary — reduces all incoming party damage by 10% while active. */
  sanctuary: {
    active: false,
    expiresAt: 0,   // performance.now() value when the buff ends
  },

  /** Arcane Lantern — Merlin's spell illuminates the dungeon like a torch. */
  arcaneLight: {
    active: false,
    expiresAt: 0,
  },

  /** Entangle - Halves attack speed for the targeted monster */
  entangle: {
    active: false,
    expiresAt: 0,
    targetId: null,
  },
  /** Sunder Armor — cuts a specific monster's defence by 50% */
  sunderArmor: {
    active: false,
    targetId: null,
    expiresAt: 0,
  },

  /** Berserk — boots Korg's damage by 20% */
  berserk: {
    active: false,
    actorName: null, // to restrict the buff to just the user
    expiresAt: 0,
  },
};
