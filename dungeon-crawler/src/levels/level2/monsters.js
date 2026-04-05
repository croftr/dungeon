import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 2 – The Deep Passage
// ─────────────────────────────────────────────────────────────────────────────

export const level2Monsters = [

  // ── NEW PRE-TREEMAN DUNGEON ───────────────────────────────────────────────

  // Room A (rows 3-5, cols 3-8) — 2 Treekin
  inst(D.treekin, 200, 3, 5,
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb'),
    asset('/monsters/treekin-animation/treeKin-attack.mp3'), 0.45, 0, 0, 2,
    { bounds: { minRow: 3, maxRow: 5, minCol: 3, maxCol: 8 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  inst(D.treekin, 201, 5, 6,
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb'),
    asset('/monsters/treekin-animation/treeKin-attack.mp3'), 0.45, 0, 0, 2,
    { bounds: { minRow: 3, maxRow: 5, minCol: 3, maxCol: 8 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  // Room B (rows 7-9, cols 9-14) — 2 Iceman
  inst(D.iceman, 202, 8, 10,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/iceMan-animation/iceman-attack.mp3'), 0.6, 0, 0, 2,
    { bounds: { minRow: 7, maxRow: 9, minCol: 9, maxCol: 14 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  inst(D.iceman, 203, 8, 13,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/iceMan-animation/iceman-attack.mp3'), 0.6, 0, 0, 2,
    { bounds: { minRow: 7, maxRow: 9, minCol: 9, maxCol: 14 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  // Room C (rows 11-13, cols 5-11) — 2 Orc Warriors
  inst(D.orc_warrior, 204, 12, 6,
    asset('/monsters/orc-warrior/idle-normal.glb'),
    asset('/monsters/orc-warrior/attack1.glb'),
    asset('/monsters/orc-warrior/attack1.mp3'),
    0.5, 0, 0, 2,
    { bounds: { minRow: 11, maxRow: 13, minCol: 5, maxCol: 11 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/orc-warrior/getting-killed.glb'),
    asset('/monsters/orc-warrior/getting-hit.glb'),
    asset('/monsters/orc-warrior/walking.glb'),
    null,
    asset('/monsters/orc-warrior/idle-combat.glb')),

  inst(D.orc_warrior, 205, 12, 10,
    asset('/monsters/orc-warrior/idle-normal.glb'),
    asset('/monsters/orc-warrior/attack1.glb'),
    asset('/monsters/orc-warrior/attack1.mp3'),
    0.5, 0, 0, 2,
    { bounds: { minRow: 11, maxRow: 13, minCol: 5, maxCol: 11 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/orc-warrior/getting-killed.glb'),
    asset('/monsters/orc-warrior/getting-hit.glb'),
    asset('/monsters/orc-warrior/walking.glb'),
    null,
    asset('/monsters/orc-warrior/idle-combat.glb')),

  // ── EXISTING LEVEL 2 BOSSES (all rows shifted +15 from original) ──────────

  // Treeman patrols the main chamber (rows 16-22, cols 3-8)
  inst(D.treeman, 8, 22, 7,
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/treeman-animation/attack-sound.mp3'), 0.90, 0, 0, 2,
    { bounds: { minRow: 16, maxRow: 22, minCol: 3, maxCol: 8 }, speed: 0.6, waitTime: 2.5 },
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Dead_withSkin (1).glb'),
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin (1).glb')),

  // Demon guards the demon room at the south end of the level-2 passage
  inst(D.demon, 9, 32, 5,
    asset('/monsters/demon/Meshy_AI_Animation_Idle_withSkin.glb'),
    asset('/monsters/demon/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb'),
    asset('/monsters/demon/no-mercy.mp3'), 0.70, 0, 0, 2, null,
    asset('/monsters/demon/Meshy_AI_Animation_Fall_Dead_from_Abdominal_Injury_withSkin.glb'),
    asset('/monsters/demon/Meshy_AI_Animation_Slap_Reaction_withSkin.glb')),

  // Aqua Man guards the passage to the stairs after falling through the pit
  Object.assign(inst(D.aqua_man, 70, 39, 3,
    asset('/monsters/aqua-man/Meshy_AI_Animation_Idle_withSkin.glb'),
    asset('/monsters/aqua-man/Meshy_AI_Animation_Punch_Combo_withSkin.glb'),
    asset('/monsters/aqua-man/aqua-attack.mp3'), 0.60, 0, 0, 2,
    null,
    asset('/monsters/aqua-man/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/aqua-man/Meshy_AI_Animation_Face_Punch_Reaction_1_withSkin.glb'),
    asset('/monsters/aqua-man/Meshy_AI_Animation_Walking_withSkin.glb'),
    null,
    asset('/monsters/aqua-man/cobat-idle.glb')), { faceNorth: true }),

  // Giant stomps around the NE giant room (rows 17-19, cols 13-24)
  inst(D.giant, 71, 18, 18,
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Idle_03_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Simple_Kick_withSkin.glb'),
    asset('/monsters/giant/giant-attack.mp3'), 0.80, 0, 0, 2,
    { bounds: { minRow: 17, maxRow: 19, minCol: 13, maxCol: 24 }, speed: 0.6, waitTime: 3.0 },
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Dead_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Walking_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Idle_11_withSkin.glb')
  ),
];
