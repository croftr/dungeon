import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 4 – The Forgotten Vault
//  A single lizard-man guards the vault room (rows 1–3).
// ─────────────────────────────────────────────────────────────────────────────

export const level4Monsters = [
  inst(D.lizardMan, 400, 2, 5,
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Walking_withSkin.glb'),
    asset('/monsters/lizard-man/standard-attack1.glb'),
    asset('/monsters/lizard-man/lizard-normal-attack.mp3'), 0.6, 0, 0, 4,
    { bounds: { minRow: 1, maxRow: 3, minCol: 1, maxCol: 9 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Dead_withSkin.glb'),
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Face_Punch_Reaction_withSkin.glb'),
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Walking_withSkin.glb')),

  inst(D.demon_ogre, 401, 4, 14,
    asset('/monsters/demon-ogre/idle.glb'),
    asset('/monsters/demon-ogre/standard-attack.glb'),
    asset('/monsters/demon-ogre/standard-attack.mp3'),
    0.7, 0, 0, 4, // scale=0.7, level=4
    { bounds: { minRow: 3, maxRow: 5, minCol: 13, maxCol: 14 }, speed: 0.4, waitTime: 3.0 },
    asset('/monsters/demon-ogre/dying.glb'),
    asset('/monsters/demon-ogre/getting-hit.glb'),
    asset('/monsters/demon-ogre/walking.glb'),
    null,
    asset('/monsters/demon-ogre/combat-idle.glb')
  ),
];
