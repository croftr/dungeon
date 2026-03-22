import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 0 – The Starter Room
//  Only the training dummy lives here — no combat monsters.
// ─────────────────────────────────────────────────────────────────────────────

export const level0Monsters = [
  // Training dummy in the east room corner
  inst(D.dummy, 10, 7, 23,
    asset('/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    null, 0.5, 0, 0, 0), // level = 0

  // Giant — test spawn in the big east room
  inst(D.giant, 999, 10, 20,
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Idle_03_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Simple_Kick_withSkin.glb'),
    asset('/monsters/giant/giant-attack.mp3'),
    0.7, 0, 0, 0, // scale, offsetX, offsetZ, level = 0
    null,
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Dead_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Walking_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Idle_11_withSkin.glb')),
];
