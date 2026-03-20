import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 1 – The Western Dungeon
// ─────────────────────────────────────────────────────────────────────────────

export const level1Monsters = [
  // North dead-end passage (behind the portcullis — opens when the wall button is pressed)
  inst(D.treekin, 0, 3, 7,
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb'),
    asset('/monsters/treekin-animation/treeKin-attack.mp3'), 0.45, 0, 0, 1, null,
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  // Upper maze
  inst(D.goblin, 1, 9, 6,
    asset('/monsters/goblin-animation/goblin-alert.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/goblin-animation/goblin-attack.wav'), 0.45, 0, 0, 1, null,
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Walking_withSkin.glb')),

  // Southern section
  inst(D.night_goblin, 2, 15, 5,
    asset('/monsters/night-goblin/idle.glb'),
    asset('/monsters/night-goblin/single-attack.glb'),
    asset('/monsters/night-goblin/goblin-attack.wav'), 0.45, 0, 0, 1, null,
    asset('/monsters/night-goblin/dead.glb'),
    null,
    asset('/monsters/night-goblin/walking.glb'),
    null,
    asset('/monsters/night-goblin/cobat-idle.glb')),

  // Lower maze — zombie lurks in the far lower-right section, well past the row-14 barrier
  inst(D.zombie, 3, 17, 12,
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Idle_3_withSkin.glb'),
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/zombie-animation/zombie-attack.mp3'), 0.45, 0, 0, 1, null,
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  // Lower maze
  inst(D.ghoul, 4, 17, 11,
    asset('/monsters/ghoul-aimation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/ghoul-aimation/Meshy_AI_Animation_Basic_Jump_withSkin.glb'),
    asset('/monsters/ghoul-aimation/ghoul-attack.mp3'), 0.45, 0, 0, 1, null,
    asset('/monsters/ghoul-aimation/Meshy_AI_Animation_Dead_withSkin (1).glb')),

  // Deeper south passage
  inst(D.orc_warrior, 7, 19, 8,
    asset('/monsters/orc-warrior/idle-normal.glb'),
    asset('/monsters/orc-warrior/attack1.glb'),
    asset('/monsters/orc-warrior/attack1.mp3'),
    0.5, 0, 0, 1, null,
    asset('/monsters/orc-warrior/getting-killed.glb'),
    asset('/monsters/orc-warrior/getting-hit.glb'),
    asset('/monsters/orc-warrior/walking.glb'),
    null,
    asset('/monsters/orc-warrior/idle-combat.glb')),

  // Bottom long corridor
  inst(D.iceman, 5, 21, 5,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/iceMan-animation/iceman-attack.mp3'), 0.6, 0, 0, 1, null,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  // Training dummy in the big east room
  inst(D.dummy, 10, 11, 20,
    asset('/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    null, 0.5),

  // Ogre in the north-west room — on patrol
  inst(D.ogre, 21, 2, 2,
    asset('/monsters/ogre/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/ogre/Meshy_AI_Animation_Attack_withSkin.glb'),
    asset('/monsters/ogre/ogre.mp3'), 0.7, 0, 0, 1,
    { bounds: { minRow: 1, maxRow: 5, minCol: 1, maxCol: 5 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/ogre/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/ogre/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  // Goblin guard in the vertical passage leading to the Northwest room
  inst(D.goblin, 23, 8, 1,
    asset('/monsters/goblin-animation/goblin-alert.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/goblin-animation/goblin-attack.wav'), 0.45, 0, 0, 1, null,
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Walking_withSkin.glb')),

  inst(D.treekin, 61, 7, 5,
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb'),
    asset('/monsters/treekin-animation/treeKin-attack.mp3'), 0.45, 0, 0, 1, null,
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  inst(D.iceman, 62, 15, 10,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/iceMan-animation/iceman-attack.mp3'), 0.6, 0, 0, 1, null,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  inst(D.iceman, 63, 19, 4,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/iceMan-animation/iceman-attack.mp3'), 0.6, 0, 0, 1, null,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  // Additional Goblins spread through Level 1 corridors (avoiding big rooms)
  inst(D.goblin, 25, 16, 7,
    asset('/monsters/goblin-animation/goblin-alert.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/goblin-animation/goblin-attack.wav'), 0.45, 0, 0, 1, null,
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Walking_withSkin.glb')),

  inst(D.goblin, 26, 18, 3,
    asset('/monsters/goblin-animation/goblin-alert.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/goblin-animation/goblin-attack.wav'), 0.45, 0, 0, 1, null,
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/goblin-animation/Meshy_AI_Animation_Walking_withSkin.glb')),

  // Mummies in the secret room (Rows 1-4, Cols 17-20)
  inst(D.mummy, 101, 2, 18,
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Idle_withSkin.glb'),
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/mummy-annimation/mummy-attack.mp3'), 0.45, 0, 0, 1, null,
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Dead_withSkin.glb'),
    null,
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Walking_withSkin.glb')),

  inst(D.mummy, 102, 3, 18,
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Idle_withSkin.glb'),
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/mummy-annimation/mummy-attack.mp3'), 0.45, 0, 0, 1, null,
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Dead_withSkin.glb'),
    null,
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Walking_withSkin.glb')),

  inst(D.mummy, 103, 4, 18,
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Idle_withSkin.glb'),
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/mummy-annimation/mummy-attack.mp3'), 0.45, 0, 0, 1, null,
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Dead_withSkin.glb'),
    null,
    asset('/monsters/mummy-annimation/Meshy_AI_Animation_Walking_withSkin.glb')),

  // Zombies in the hidden room (Rows 17-20, Cols 16-19)
  inst(D.zombie, 201, 18, 17,
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Idle_3_withSkin.glb'),
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/zombie-animation/zombie-attack.mp3'), 0.45, 0, 0, 1, null,
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  inst(D.zombie, 202, 18, 18,
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Idle_3_withSkin.glb'),
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/zombie-animation/zombie-attack.mp3'), 0.45, 0, 0, 1, null,
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  inst(D.zombie, 203, 19, 18,
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Idle_3_withSkin.glb'),
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/zombie-animation/zombie-attack.mp3'), 0.45, 0, 0, 1, null,
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/zombie-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),
];
