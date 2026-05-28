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

/**
 * Same as `inst()` but marks the instance as a 2×2 quartet formation. The
 * monster's def stats (hp, xp, drops, stats, special attacks) apply *per sub*
 * unchanged — there will be four of them, each as defined in JSON. The mesh
 * is auto-scaled down so four copies fit cleanly in one tile.
 *
 * Use this for any solo monster def that you want spawned as a quartet on a
 * given tile. No edits to monsters.json required — just call
 * `instQuartet(D.goblin, ...)` instead of `inst(D.goblin, ...)`.
 */
const QUARTET_SCALE_SHRINK = 0.75;
export function instQuartet(
  def, id, gridRow, gridCol,
  glbIdle, glbAttack, attackSound,
  scale = 0.45, offsetX = 0, offsetZ = 0, level = 1,
  patrol = null, glbDeath = null, glbHit = null, glbWalk = null, glbIdleAlt = null,
  glbCombatIdle = null
) {
  const m = inst(
    def, id, gridRow, gridCol,
    glbIdle, glbAttack, attackSound,
    scale * QUARTET_SCALE_SHRINK, offsetX, offsetZ, level,
    patrol, glbDeath, glbHit, glbWalk, glbIdleAlt, glbCombatIdle
  );
  m.formation = 'quartet';
  return m;
}
