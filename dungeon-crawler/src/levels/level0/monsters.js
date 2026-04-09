import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 0 – The Starter Room
//  Only the training dummy lives here — no combat monsters.
// ─────────────────────────────────────────────────────────────────────────────

const _dummy = inst(D.dummy, 10, 7, 23,
    null, // no idle animation — dummy stands still
    asset('/monsters/dummy-annimation/dummy-attack.glb'),
    null, 0.5, 0, 0, 0, // level = 0
    null, // patrol
    null, // glbDeath
    asset('/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')); // glbHit

// Dev-tool fields for the Training Console (not persisted across reloads)
_dummy.faceSouth = true;
_dummy.combatMode = false;
_dummy.drainStamina = false;
_dummy.originalStats = { ...D.dummy.stats };
_dummy.originalAttackSpeed = D.dummy.attackSpeed;

// ── East Room ──────────────────────────────────────────────────────────────
const _demonSpawn = inst(D.demon_spawn, 11, 10, 20,
  asset('/monsters/demon-spawn/idle-2.glb'),   // glbIdle
  asset('/monsters/demon-spawn/basic-attack.glb'), // glbAttack
  asset('/monsters/demon-spawn/demon-spawn-attacl.mp3'), // attackSound
  0.4, 0, 0, 0, // scale, offsetX, offsetZ, level=0
  null,  // patrol
  asset('/monsters/demon-spawn/dead.glb'),     // glbDeath
  asset('/monsters/demon-spawn/getting-hit.glb'), // glbHit
  asset('/monsters/demon-spawn/walking.glb'),  // glbWalk
);

_demonSpawn.tauntSound = asset('/monsters/demon-spawn/evil-laugh.mp3');

export const level0Monsters = [_dummy, _demonSpawn];
