import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 2 – The Deep Passage
// ─────────────────────────────────────────────────────────────────────────────

export const level2Monsters = [

  // ── NEW PASSAGE GUARDIANS ─────────────────────────────────────────────────
  // Iron Wardens flanking the portcullis gate in the new room (rows 3 & 5, col 7)
  inst(D.iron_warden, 900, 3, 7,
    asset('/monsters/iron-warden/idle.glb'),
    asset('/monsters/iron-warden/standard-attack.glb'),
    asset('/monsters/iron-warden/attack-sound.mp3'),
    0.5625, 0, 0, 2, // level = 2
    null, // patrol
    asset('/monsters/iron-warden/dying.glb'),
    asset('/monsters/iron-warden/getting-hit.glb'),
    asset('/monsters/iron-warden/walking.glb'),
    null,
    asset('/monsters/iron-warden/combat-idle.glb')),

  inst(D.iron_warden, 901, 5, 7,
    asset('/monsters/iron-warden/idle.glb'),
    asset('/monsters/iron-warden/standard-attack.glb'),
    asset('/monsters/iron-warden/attack-sound.mp3'),
    0.5625, 0, 0, 2, // level = 2
    null, // patrol
    asset('/monsters/iron-warden/dying.glb'),
    asset('/monsters/iron-warden/getting-hit.glb'),
    asset('/monsters/iron-warden/walking.glb'),
    null,
    asset('/monsters/iron-warden/combat-idle.glb')),

  // ── NEW PRE-TREEMAN DUNGEON ───────────────────────────────────────────────

  // Room A (rows 3-5, cols 13-18) — 2 Treekin (shifted from cols 3-8 to cols 13-18)
  inst(D.treekin, 200, 3, 15,
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb'),
    asset('/monsters/treekin-animation/treeKin-attack.mp3'), 0.45, 0, 0, 2,
    { bounds: { minRow: 3, maxRow: 5, minCol: 13, maxCol: 18 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  inst(D.treekin, 201, 5, 16,
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb'),
    asset('/monsters/treekin-animation/treeKin-attack.mp3'), 0.45, 0, 0, 2,
    { bounds: { minRow: 3, maxRow: 5, minCol: 13, maxCol: 18 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/treekin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  // Room B (rows 7-9, cols 19-24) — 2 Iceman (shifted from cols 9-14 to cols 19-24)
  inst(D.iceman, 202, 8, 20,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/iceMan-animation/iceman-attack.mp3'), 0.6, 0, 0, 2,
    { bounds: { minRow: 7, maxRow: 9, minCol: 19, maxCol: 24 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  inst(D.iceman, 203, 8, 23,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/iceMan-animation/iceman-attack.mp3'), 0.6, 0, 0, 2,
    { bounds: { minRow: 7, maxRow: 9, minCol: 19, maxCol: 24 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')),

  // Crow Wizard room — east of Room B, accessed via corridor (row 8, cols 25-29); room rows 7-9 cols 30-35
  // Two summoned skeletons flank the entrance — dormant until the player enters
  // Shifted trigger bounds from cols 18-25 to cols 28-35, and coordinates to col 30
  Object.assign(inst(D.summoned_skeleton, 451, 7, 30,
    asset('/monsters/summoned-skeleton/idle.glb'),
    asset('/monsters/summoned-skeleton/attack.glb'),
    asset('/monsters/summoned-skeleton/skeleton-attack.mp3'),
    0.45, 0, 0, 2, null,
    asset('/monsters/summoned-skeleton/dead.glb'),
    asset('/monsters/summoned-skeleton/getting-hit.glb'),
    asset('/monsters/summoned-skeleton/walking.glb')), {
    _dormant: true,
    _triggerBounds: { minRow: 7, maxRow: 9, minCol: 28, maxCol: 35 },
    _waitForCrowVideo: true,
    glbStandUp: asset('/monsters/summoned-skeleton/standing-up.glb'),
  }),

  Object.assign(inst(D.summoned_skeleton, 452, 9, 30,
    asset('/monsters/summoned-skeleton/idle.glb'),
    asset('/monsters/summoned-skeleton/attack.glb'),
    asset('/monsters/summoned-skeleton/skeleton-attack.mp3'),
    0.45, 0, 0, 2, null,
    asset('/monsters/summoned-skeleton/dead.glb'),
    asset('/monsters/summoned-skeleton/getting-hit.glb'),
    asset('/monsters/summoned-skeleton/walking.glb')), {
    _dormant: true,
    _triggerBounds: { minRow: 7, maxRow: 9, minCol: 28, maxCol: 35 },
    _waitForCrowVideo: true,
    glbStandUp: asset('/monsters/summoned-skeleton/standing-up.glb'),
  }),

  // Shifted from col 25 to col 35
  inst(D.crow_wizard, 450, 8, 35,
    asset('/monsters/crow-wizard/idle.glb'),
    asset('/monsters/crow-wizard/standard-attack.glb'),
    asset('/monsters/crow-wizard/standard-attack.mp3'),
    0.5, 0, 0, 2, null,
    asset('/monsters/crow-wizard/dead.glb'),
    asset('/monsters/crow-wizard/getting-hit.glb'),
    asset('/monsters/crow-wizard/walking.glb'),
    null,
    asset('/monsters/crow-wizard/combat-idle.glb')),

  // Ice Mushroom room — west of Room B, accessed via corridor through row 8 (cols 12-14, rows 7-9)
  // Shifted from col 3 to col 13
  inst(D.ice_mushroom, 500, 7, 13,
    asset('/monsters/ice-mushroom/idle.glb'),
    asset('/monsters/ice-mushroom/standard-attack.glb'),
    asset('/monsters/ice-mushroom/standard-attack.mp3'), 0.45, 0, 0, 2, null,
    asset('/monsters/ice-mushroom/dead.glb'),
    null,
    asset('/monsters/ice-mushroom/walk.glb'),
    null,
    asset('/monsters/ice-mushroom/combat-idle.glb')),

  inst(D.ice_mushroom, 501, 9, 13,
    asset('/monsters/ice-mushroom/idle.glb'),
    asset('/monsters/ice-mushroom/standard-attack.glb'),
    asset('/monsters/ice-mushroom/standard-attack.mp3'), 0.45, 0, 0, 2, null,
    asset('/monsters/ice-mushroom/dead.glb'),
    null,
    asset('/monsters/ice-mushroom/walk.glb'),
    null,
    asset('/monsters/ice-mushroom/combat-idle.glb')),

  // Ice gauntlet reward room (cols 12-14, row 14) — guardian mushroom after crossing ice floor
  // Shifted from col 4 to col 14
  inst(D.ice_mushroom, 502, 14, 14,
    asset('/monsters/ice-mushroom/idle.glb'),
    asset('/monsters/ice-mushroom/standard-attack.glb'),
    asset('/monsters/ice-mushroom/standard-attack.mp3'), 0.45, 0, 0, 2, null,
    asset('/monsters/ice-mushroom/dead.glb'),
    null,
    asset('/monsters/ice-mushroom/walk.glb'),
    null,
    asset('/monsters/ice-mushroom/combat-idle.glb')),

  // Room C (rows 11-13, cols 15-21) — 2 Orc Warriors (shifted from cols 5-11 to cols 15-21)
  inst(D.orc_warrior, 204, 12, 16,
    asset('/monsters/orc-warrior/idle-normal.glb'),
    asset('/monsters/orc-warrior/attack1.glb'),
    asset('/monsters/orc-warrior/attack1.mp3'),
    0.5, 0, 0, 2,
    { bounds: { minRow: 11, maxRow: 13, minCol: 15, maxCol: 21 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/orc-warrior/getting-killed.glb'),
    asset('/monsters/orc-warrior/getting-hit.glb'),
    asset('/monsters/orc-warrior/walking.glb'),
    null,
    asset('/monsters/orc-warrior/idle-combat.glb')),

  inst(D.orc_warrior, 205, 12, 20,
    asset('/monsters/orc-warrior/idle-normal.glb'),
    asset('/monsters/orc-warrior/attack1.glb'),
    asset('/monsters/orc-warrior/attack1.mp3'),
    0.5, 0, 0, 2,
    { bounds: { minRow: 11, maxRow: 13, minCol: 15, maxCol: 21 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/orc-warrior/getting-killed.glb'),
    asset('/monsters/orc-warrior/getting-hit.glb'),
    asset('/monsters/orc-warrior/walking.glb'),
    null,
    asset('/monsters/orc-warrior/idle-combat.glb')),

  // ── EXISTING LEVEL 2 BOSSES (all rows shifted +15 from original, cols shifted +10) ──────────

  // Treeman patrols the main chamber (rows 16-22, cols 13-18) — shifted from col 7 to col 17
  inst(D.treeman, 8, 22, 17,
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/treeman-animation/attack-sound.mp3'), 0.90, 0, 0, 2,
    { bounds: { minRow: 16, maxRow: 22, minCol: 13, maxCol: 18 }, speed: 0.6, waitTime: 2.5 },
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Dead_withSkin (1).glb'),
    asset('/monsters/treeman-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin (1).glb')),

  // Demon guards the demon room at the south end of the level-2 passage
  // Shifted from col 5 to col 15
  inst(D.demon, 9, 32, 15,
    asset('/monsters/demon/Meshy_AI_Animation_Idle_withSkin.glb'),
    asset('/monsters/demon/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb'),
    asset('/monsters/demon/no-mercy.mp3'), 0.70, 0, 0, 2, null,
    asset('/monsters/demon/Meshy_AI_Animation_Fall_Dead_from_Abdominal_Injury_withSkin.glb'),
    asset('/monsters/demon/Meshy_AI_Animation_Slap_Reaction_withSkin.glb')),

  // Aqua Man guards the passage to the stairs after falling through the pit
  // Shifted from col 3 to col 13
  Object.assign(inst(D.aqua_man, 70, 39, 13,
    asset('/monsters/aqua-man/Meshy_AI_Animation_Idle_withSkin.glb'),
    asset('/monsters/aqua-man/Meshy_AI_Animation_Punch_Combo_withSkin.glb'),
    asset('/monsters/aqua-man/aqua-attack.mp3'), 0.60, 0, 0, 2,
    null,
    asset('/monsters/aqua-man/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/aqua-man/Meshy_AI_Animation_Face_Punch_Reaction_1_withSkin.glb'),
    asset('/monsters/aqua-man/Meshy_AI_Animation_Walking_withSkin.glb'),
    null,
    asset('/monsters/aqua-man/cobat-idle.glb')), { faceNorth: true }),

  // Giant stomps around the NE giant room (rows 17-19, cols 23-34) — shifted from col 18 to col 28
  inst(D.giant, 71, 18, 28,
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Idle_03_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Simple_Kick_withSkin.glb'),
    asset('/monsters/giant/giant-attack.mp3'), 0.80, 0, 0, 2,
    { bounds: { minRow: 17, maxRow: 19, minCol: 23, maxCol: 34 }, speed: 0.6, waitTime: 3.0 },
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Dead_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Hit_Reaction_1_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Walking_withSkin.glb'),
    asset('/monsters/giant/Meshy_AI_Bare_Chested_Berserke_biped_Animation_Idle_11_withSkin.glb')
  ),
];
