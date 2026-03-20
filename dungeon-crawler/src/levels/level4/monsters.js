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

  // Lizard Man patrols the southern half of the vault
  inst(D.lizardMan, 401, 6, 5,
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Walking_withSkin.glb'),
    asset('/monsters/lizard-man/standard-attack1.glb'),
    asset('/monsters/lizard-man/lizard-normal-attack.mp3'), 0.6, 0, 0, 4,
    { bounds: { minRow: 4, maxRow: 8, minCol: 1, maxCol: 9 }, speed: 0.6, waitTime: 1.5 },
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Dead_withSkin.glb'),
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Face_Punch_Reaction_withSkin.glb'),
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Walking_withSkin.glb')),

  // ── Crocodile Warriors — opposite corners of the vault ───────────────────
  inst(D.crocodile_warrior, 402, 2, 2,
    asset('/monsters/crocodile-warrior/idle.glb'),
    asset('/monsters/crocodile-warrior/double-attack.glb'),
    asset('/monsters/crocodile-warrior/attack.mp3'), 0.65, 0, 0, 4, null,
    asset('/monsters/crocodile-warrior/dead.glb'),
    asset('/monsters/crocodile-warrior/getting-hit.glb'),
    asset('/monsters/crocodile-warrior/walking.glb'), null,
    asset('/monsters/crocodile-warrior/combat-idle.glb')),
  inst(D.crocodile_warrior, 403, 7, 8,
    asset('/monsters/crocodile-warrior/idle.glb'),
    asset('/monsters/crocodile-warrior/double-attack.glb'),
    asset('/monsters/crocodile-warrior/attack.mp3'), 0.65, 0, 0, 4, null,
    asset('/monsters/crocodile-warrior/dead.glb'),
    asset('/monsters/crocodile-warrior/getting-hit.glb'),
    asset('/monsters/crocodile-warrior/walking.glb'), null,
    asset('/monsters/crocodile-warrior/combat-idle.glb')),
];
