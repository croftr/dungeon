import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 4 – The Forgotten Vault
// ─────────────────────────────────────────────────────────────────────────────

export const level4Monsters = [
  // A lone skeleton guards the northern half of the vault
  inst(D.skeletonWarrior, 400, 3, 5,
    asset('/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb'),
    asset('/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb'),
    asset('/monsters/skeleton-animation/attack - Copy.mp3'), 0.5, 0, 0, 4,
    { bounds: { minRow: 1, maxRow: 6, minCol: 1, maxCol: 9 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb')),
];
