import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 1 – The Western Dungeon
// ─────────────────────────────────────────────────────────────────────────────

export const level1Monsters = [
  // North dead-end passage (behind the portcullis — opens when the wall button is pressed)
  inst(D.treekin, 0, 3, 7,
    '/monsters/treekin-animation/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb',
    '/monsters/treekin-animation/treeKin-attack.mp3', 0.45, 0, 0, 1, null,
    '/monsters/treekin-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/treekin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),

  // Upper maze
  inst(D.goblin, 1, 9, 6,
    '/monsters/goblin-animation/goblin-alert.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/goblin-animation/goblin-attack.wav', 0.45, 0, 0, 1, null,
    '/monsters/goblin-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Walking_withSkin.glb'),

  // Southern section
  inst(D.albino_goblin, 2, 15, 5,
    '/monsters/albino_goblin-aimation/Meshy_AI_Animation_Agree_Gesture_withSkin.glb',
    '/monsters/albino_goblin-aimation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/albino_goblin-aimation/albino-goblin-attack.mp3', 0.45, 0, 0, 1, null,
    '/monsters/albino_goblin-aimation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/albino_goblin-aimation/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/albino_goblin-aimation/Meshy_AI_Animation_Walking_withSkin.glb'),

  // Lower maze — zombie lurks in the far lower-right section, well past the row-14 barrier
  inst(D.zombie, 3, 17, 12,
    '/monsters/zombie-animation/Meshy_AI_Animation_Idle_3_withSkin.glb',
    '/monsters/zombie-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/zombie-animation/zombie-attack.mp3', 0.45, 0, 0, 1, null,
    '/monsters/zombie-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/zombie-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),

  // Lower maze
  inst(D.ghoul, 4, 17, 11,
    '/monsters/ghoul-aimation/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/ghoul-aimation/Meshy_AI_Animation_Basic_Jump_withSkin.glb',
    '/monsters/ghoul-aimation/ghoul-attack.mp3', 0.45, 0, 0, 1, null,
    '/monsters/ghoul-aimation/Meshy_AI_Animation_Dead_withSkin (1).glb'),

  // Deeper south passage
  inst(D.orc, 7, 19, 8,
    '/monsters/orc-animation/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/orc-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/orc-animation/orc-attack.mp3', 0.5, 0, 0, 1, null,
    '/monsters/orc-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/orc-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),

  // Bottom long corridor
  inst(D.iceman, 5, 21, 5,
    '/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/iceMan-animation/iceman-attack.mp3', 0.6, 0, 0, 1, null,
    '/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),

  // Training dummy in the big east room
  inst(D.dummy, 10, 11, 20,
    '/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    null, 0.5),

  // Ogre in the north-west room — on patrol
  inst(D.ogre, 21, 2, 2,
    '/monsters/ogre/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/ogre/Meshy_AI_Animation_Attack_withSkin.glb',
    '/monsters/ogre/ogre.mp3', 0.7, 0, 0, 1,
    { bounds: { minRow: 1, maxRow: 5, minCol: 1, maxCol: 5 }, speed: 0.5, waitTime: 2.0 },
    '/monsters/ogre/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/ogre/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),

  // Goblin guard in the vertical passage leading to the Northwest room
  inst(D.goblin, 23, 8, 1,
    '/monsters/goblin-animation/goblin-alert.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/goblin-animation/goblin-attack.wav', 0.45, 0, 0, 1, null,
    '/monsters/goblin-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Walking_withSkin.glb'),

  inst(D.treekin, 61, 7, 5,
    '/monsters/treekin-animation/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb',
    '/monsters/treekin-animation/treeKin-attack.mp3', 0.45, 0, 0, 1, null,
    '/monsters/treekin-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/treekin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),

  inst(D.iceman, 62, 15, 10,
    '/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/iceMan-animation/iceman-attack.mp3', 0.6, 0, 0, 1, null,
    '/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),

  inst(D.iceman, 63, 19, 4,
    '/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/iceMan-animation/iceman-attack.mp3', 0.6, 0, 0, 1, null,
    '/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),

  // Additional Goblins spread through Level 1 corridors (avoiding big rooms)
  inst(D.goblin, 25, 16, 7,
    '/monsters/goblin-animation/goblin-alert.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/goblin-animation/goblin-attack.wav', 0.45, 0, 0, 1, null,
    '/monsters/goblin-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Walking_withSkin.glb'),

  inst(D.goblin, 26, 18, 3,
    '/monsters/goblin-animation/goblin-alert.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/goblin-animation/goblin-attack.wav', 0.45, 0, 0, 1, null,
    '/monsters/goblin-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/goblin-animation/Meshy_AI_Animation_Walking_withSkin.glb'),

  // Mummies in the secret room (Rows 1-4, Cols 17-20)
  inst(D.mummy, 101, 2, 18,
    '/monsters/mummy-annimation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/mummy-annimation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/mummy-annimation/mummy-attack.mp3', 0.45, 0, 0, 1, null,
    '/monsters/mummy-annimation/Meshy_AI_Animation_Dead_withSkin.glb',
    null,
    '/monsters/mummy-annimation/Meshy_AI_Animation_Walking_withSkin.glb'),

  inst(D.mummy, 102, 3, 18,
    '/monsters/mummy-annimation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/mummy-annimation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/mummy-annimation/mummy-attack.mp3', 0.45, 0, 0, 1, null,
    '/monsters/mummy-annimation/Meshy_AI_Animation_Dead_withSkin.glb',
    null,
    '/monsters/mummy-annimation/Meshy_AI_Animation_Walking_withSkin.glb'),

  inst(D.mummy, 103, 4, 18,
    '/monsters/mummy-annimation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/mummy-annimation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/mummy-annimation/mummy-attack.mp3', 0.45, 0, 0, 1, null,
    '/monsters/mummy-annimation/Meshy_AI_Animation_Dead_withSkin.glb',
    null,
    '/monsters/mummy-annimation/Meshy_AI_Animation_Walking_withSkin.glb'),

  // Zombies in the hidden room (Rows 17-20, Cols 16-19)
  inst(D.zombie, 201, 18, 17,
    '/monsters/zombie-animation/Meshy_AI_Animation_Idle_3_withSkin.glb',
    '/monsters/zombie-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/zombie-animation/zombie-attack.mp3', 0.45, 0, 0, 1, null,
    '/monsters/zombie-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/zombie-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),

  inst(D.zombie, 202, 18, 18,
    '/monsters/zombie-animation/Meshy_AI_Animation_Idle_3_withSkin.glb',
    '/monsters/zombie-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/zombie-animation/zombie-attack.mp3', 0.45, 0, 0, 1, null,
    '/monsters/zombie-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/zombie-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),

  inst(D.zombie, 203, 19, 18,
    '/monsters/zombie-animation/Meshy_AI_Animation_Idle_3_withSkin.glb',
    '/monsters/zombie-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/zombie-animation/zombie-attack.mp3', 0.45, 0, 0, 1, null,
    '/monsters/zombie-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/zombie-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
];
