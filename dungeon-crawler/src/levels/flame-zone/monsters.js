import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';
import { FLAME_ZONE_LEVEL } from '../../map.js';

// ─────────────────────────────────────────────────────────────────────────────
//  FLAME ZONE (level 70) monsters — only loaded while the party is in the zone.
//  Four Flame Spawns spread through the entry hall / central hall / chambers,
//  and two stronger Inferno Warlords guarding the inner sanctum behind the gate.
//
//  No audio passed here (the attack/idle sounds are wired per-monster in
//  monster.js). Flame Spawn has no out-of-combat idle GLB, so combat-idle
//  doubles as its base/idle model; the Inferno Warlord has a dedicated idle.glb
//  for out of combat plus combat-idle.glb for in-combat.
// ─────────────────────────────────────────────────────────────────────────────

const _flameSpawn = (id, row, col) =>
  inst(D.flame_spawn, id, row, col,
    asset('/monsters/flame-spawn/combat-idle.glb'),  // glbIdle (base model; no separate idle)
    asset('/monsters/flame-spawn/attack.glb'),       // glbAttack (default; per-variant glbs in monster.js)
    null,                                            // attackSound — wired per variant in monster.js
    0.45, 0, 0, FLAME_ZONE_LEVEL, null,
    asset('/monsters/flame-spawn/dead.glb'),         // glbDeath
    asset('/monsters/flame-spawn/getting-hit.glb'),  // glbHit
    asset('/monsters/flame-spawn/walking.glb'),      // glbWalk
    null,                                            // glbIdleAlt
    null);                                           // glbCombatIdle (none)

const _infernoWarlord = (id, row, col) =>
  inst(D.inferno_warlord, id, row, col,
    asset('/monsters/inferno-warlord/idle.glb'),         // glbIdle (base model + out-of-combat idle)
    asset('/monsters/inferno-warlord/attack.glb'),       // glbAttack
    null,                                                // attackSound — wired per variant in monster.js
    0.5, 0, 0, FLAME_ZONE_LEVEL, null,
    asset('/monsters/inferno-warlord/dead.glb'),         // glbDeath
    asset('/monsters/inferno-warlord/getting-hit.glb'),  // glbHit
    asset('/monsters/inferno-warlord/walking.glb'),      // glbWalk
    null,                                                // glbIdleAlt
    asset('/monsters/inferno-warlord/combat-idle.glb')); // glbCombatIdle (in-combat idle)

export const flameZoneMonsters = [
  // Flame Spawns — west chamber, east chamber, and two in the central hall
  _flameSpawn(7001, 7, 2),
  _flameSpawn(7002, 7, 12),
  _flameSpawn(7003, 8, 6),
  _flameSpawn(7004, 8, 8),
  // Inferno Warlords — guarding the fire chests in the inner sanctum (behind the gate)
  _infernoWarlord(7010, 2, 6),
  _infernoWarlord(7011, 2, 8),
];
