import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 0 – The Starter Room
//  Only the training dummy lives here — no combat monsters.
// ─────────────────────────────────────────────────────────────────────────────

export const level0Monsters = [
  // Training dummy in the east room
  inst(D.dummy, 10, 11, 20,
    asset('/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    null, 0.5, 0, 0, 0), // level = 0

  // Night Goblin — big east room
  inst(D.night_goblin, 11, 9, 20,
    asset('/monsters/night-goblin/idle.glb'),
    asset('/monsters/night-goblin/single-attack.glb'),
    asset('/monsters/night-goblin/goblin-attack.wav'),
    0.45, 0, 0, 0,   // level = 0
    null,
    asset('/monsters/night-goblin/dead.glb'),
    null,
    asset('/monsters/night-goblin/walking.glb'),
    null,
    asset('/monsters/night-goblin/cobat-idle.glb')),
];
