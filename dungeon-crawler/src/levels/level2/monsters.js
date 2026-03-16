import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 2 – The Deep Passage
// ─────────────────────────────────────────────────────────────────────────────

export const level2Monsters = [
  // One Treeman patrols the chamber. Map shifted +2 cols: room is now cols 3–8.
  inst(D.treeman, 8, 7, 7,
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/treeman-animation/attack-sound.mp3'), 0.90, 0, 0, 2,
    { bounds: { minRow: 1, maxRow: 7, minCol: 3, maxCol: 8 }, speed: 0.6, waitTime: 2.5 },
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Dead_withSkin (1).glb'),
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin (1).glb')),

  // Demon guards the demon room at the south end of the level-2 passage
  inst(D.demon, 9, 17, 5,
    asset('/monsters/demon/Meshy_AI_Animation_Idle_withSkin.glb'),
    asset('/monsters/demon/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb'),
    asset('/monsters/demon/no-mercy.mp3'), 0.70, 0, 0, 2, null,
    asset('/monsters/demon/Meshy_AI_Animation_Fall_Dead_from_Abdominal_Injury_withSkin.glb'),
    asset('/monsters/demon/Meshy_AI_Animation_Slap_Reaction_withSkin.glb')),

  // Aqua Man guards the passage to the stairs after falling through the pit
  Object.assign(inst(D.aqua_man, 70, 24, 3,
    asset('/monsters/aqua-man/Meshy_AI_Animation_Idle_withSkin.glb'),
    asset('/monsters/aqua-man/Meshy_AI_Animation_Punch_Combo_withSkin.glb'),
    asset('/monsters/aqua-man/aqua-attack.mp3'), 0.60, 0, 0, 2, null,
    asset('/monsters/aqua-man/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/aqua-man/Meshy_AI_Animation_Face_Punch_Reaction_1_withSkin.glb'),
    asset('/monsters/aqua-man/Meshy_AI_Animation_Walking_withSkin.glb')), { faceNorth: true }),
];
