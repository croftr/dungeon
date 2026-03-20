// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER FACTORY
//  Kept separate from monster.js so per-level monster files can import it
//  without creating a circular dependency.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a monster instance descriptor.
 * Stats (hp, defence, stats{}) come from monster-defs.js — edit there.
 * Only instance-specific data lives here: map position, assets, game state.
 */
export function inst(
  def, id, gridRow, gridCol,
  glbIdle, glbAttack, attackSound,
  scale = 0.45, offsetX = 0, offsetZ = 0, level = 1,
  patrol = null, glbDeath = null, glbHit = null, glbWalk = null, glbIdleAlt = null,
  glbCombatIdle = null
) {
  return {
    id, type: 'glb',
    ...def,
    hpMax: def.hp,
    gridRow, gridCol,
    offsetX, offsetZ,
    alive: true, mesh: null, mixer: null, actions: {},
    glbIdle, glbAttack, glbDeath, glbHit, glbWalk, attackSound, scale,
    level,
    patrol,
    glbIdleAlt,
    glbCombatIdle,
  };
}
