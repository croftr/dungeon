import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 6 – "The Goblin Gate" Practice Level
// ─────────────────────────────────────────────────────────────────────────────

export const level6Monsters = [
  // Single goblin in the small room — easy intro fight
  inst(D.goblin, 600, 7, 5,
    asset('/monsters/goblin-animation/goblin-alert.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/goblin-animation/goblin-attack.wav'), 0.45, 0, 0, 6, null,
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Walking_withSkin.glb')),
];
