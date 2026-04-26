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

const _iceMushroom = inst(D.ice_mushroom, 11, 12, 18,
    asset('/monsters/ice-mushroom/idle.glb'),
    asset('/monsters/ice-mushroom/standard-attack.glb'),
    asset('/monsters/ice-mushroom/standard-attack.mp3'), 0.45, 0, 0, 0, // level = 0
    null, // patrol
    asset('/monsters/ice-mushroom/dead.glb'),
    null,
    asset('/monsters/ice-mushroom/walk.glb'),
    null,
    asset('/monsters/ice-mushroom/combat-idle.glb'));

export const level0Monsters = [_dummy, _iceMushroom];
