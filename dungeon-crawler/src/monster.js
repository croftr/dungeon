import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup, player } from './player.js';
import { createHitSpark, createIceBurst, createNatureBurst, createOgreSlam, createMinotaurRage, createTreemanAwakening, createDemonCleave } from './particles.js';
import { CELL, isPassable } from './map.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { party, setHp, flashPortraitHit, showMemberDamage, showMemberHeal, refreshPartyCards, applyStatusEffect, getEffectiveStats, getEffectiveStatusResistances, getDefenceModifier, describeEffect } from './party.js';
import { STATUS_EFFECT_DEFS } from './status-effects.js';
import { showMessage } from './minimap.js';
import {
  playerHitChance, monsterHitChance,
  calcPlayerPhysicalDamage, calcPlayerMagicDamage, calcMonsterDamage,
  calcOnHitChance,
  pickRandomFrontLineTarget, pickDirectionalTarget,
  CRIT_CHANCE, CRIT_MULTIPLIER,
  MONSTER_BASE_ATTACK, RESILIENCE_DAMAGE_FACTOR,
  SHIELD_BASH_STUN_CHANCE, SHIELD_BASH_STUN_DURATION_MS,
} from './combat-rules.js';
import { setInCombat, clearCombat, playCritSound, playActionSound, playHitSound, playPartyHitSound, playShieldBlockSound, isInCombat, playSoundByUrl, setZoneMusic } from './audio.js';
import { addLogEntry } from './battle-log.js';
import { resetBattleStats, recordDamageDealt, recordDamageTaken, showBattleStatsIcon } from './battle-stats.js';
import { getItemDef } from './items.js';
import { spawnDroppedItem, isStatueAt, spawnCorpse } from './objects.js';
import { MONSTER_DEFS as D } from './monster-defs.js';
import { skillsState } from './skills-state.js';
import SKILLS_DATA from './data/skills.json';
import { awardXP } from './leveling.js';

// ─────────────────────────────────────────────────────────────────────────────
//  HUNTER'S EYE STATE  — tracks which monster is currently being analysed
// ─────────────────────────────────────────────────────────────────────────────
let _huntersEyeTargetId = null;

/** Returns the id of the monster currently targeted by Hunter's Eye, or null. */
export function getHuntersEyeTargetId() { return _huntersEyeTargetId; }

/** Show or hide the detailed stats panel above the chosen monster. Pass null to hide all. */
export function setHuntersEyeTarget(id) {
  _huntersEyeTargetId = id;
  monsters.forEach((m) => {
    const show = id !== null && m.id === id && m.alive;
    if (m.statsLabel) m.statsLabel.visible = show;
    if (show && m.statsPanel) _updateStatsPanel(m);
  });
}

// Forward-direction unit vectors per facing value (0=N,1=E,2=S,3=W)
const _FACING_DR = [-1, 0, 1, 0];
const _FACING_DC = [0, 1, 0, -1];

/**
 * Returns the alive monster within melee range of the player that is most
 * aligned with the player's current facing direction.  This ensures that a
 * monster standing between the player and another monster is targeted first,
 * preventing attacks from appearing to "pass through" a closer enemy.
 *
 * Alignment is measured as the dot-product of (monster − player) with the
 * facing unit vector: +1 for directly in front, 0 for the sides, −1 behind.
 * If two monsters share the same score the one earlier in the monsters array
 * wins (stable, deterministic).
 */
export function getInRangeMonster() {
  const currentLevel = window.currentLevel || 1;
  // Collect all passable-reachable adjacent monsters
  const candidates = monsters.filter((m) => {
    if (!m.alive) return false;
    if ((m.level ?? 1) !== currentLevel) return false;
    const distRow = Math.abs(m.gridRow - player.gridRow);
    const distCol = Math.abs(m.gridCol - player.gridCol);
    if (distRow > 1 || distCol > 1) return false;
    if (!isPassable(m.gridRow, m.gridCol) || !isPassable(player.gridRow, player.gridCol)) return false;
    if (distRow === 1 && distCol === 1) {
      if (!isPassable(player.gridRow, m.gridCol) && !isPassable(m.gridRow, player.gridCol)) return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Pick the candidate most aligned with the player's facing direction
  const fdr = _FACING_DR[player.facing] ?? 0;
  const fdc = _FACING_DC[player.facing] ?? 0;
  let best = candidates[0];
  let bestScore = (best.gridRow - player.gridRow) * fdr + (best.gridCol - player.gridCol) * fdc;
  for (let i = 1; i < candidates.length; i++) {
    const m = candidates[i];
    const score = (m.gridRow - player.gridRow) * fdr + (m.gridCol - player.gridCol) * fdc;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER INSTANCES
//  Stats (hp, defence, stats{}) come from monster-defs.js — edit there.
//  Only instance-specific data lives here: map position, assets, game state.
// ─────────────────────────────────────────────────────────────────────────────

function inst(def, id, gridRow, gridCol, glbIdle, glbAttack, attackSound, scale = 0.45, offsetX = 0, offsetZ = 0, level = 1, patrol = null, glbDeath = null, glbHit = null, glbWalk = null, glbIdleAlt = null) {
  return {
    id, type: 'glb',
    ...def,
    hpMax: def.hp,
    gridRow, gridCol,
    offsetX, offsetZ,
    alive: true, mesh: null, mixer: null, actions: {},
    glbIdle, glbAttack, glbDeath, glbHit, glbWalk, attackSound, scale,
    level,
    patrol,
    glbIdleAlt,
  };
}

// Monsters spread through the western dungeon. The big east room is merchant territory.
// Treekin lurks north of the portcullis — players must open it to face him.
export const monsters = [
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

  // ── Level 2 ─────────────────────────────────────────────────────────────
  // One Treeman patrols the chamber. Map shifted +2 cols: room is now cols 3–8.
  inst(D.treeman, 8, 7, 7,
    '/monsters/treeman-animation/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/treeman-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/treeman-animation/attack-sound.mp3', 0.90, 0, 0, 2,
    { bounds: { minRow: 1, maxRow: 7, minCol: 3, maxCol: 8 }, speed: 0.6, waitTime: 2.5 },
    '/monsters/treeman-animation/Meshy_AI_Animation_Dead_withSkin (1).glb',
    '/monsters/treeman-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin (1).glb'),

  // Demon guards the demon room at the south end of the level-2 passage
  inst(D.demon, 9, 17, 5,
    '/monsters/demon/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/demon/no-mercy.mp3', 0.70, 0, 0, 2, null,
    '/monsters/demon/Meshy_AI_Animation_Fall_Dead_from_Abdominal_Injury_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Slap_Reaction_withSkin.glb'),

  // Training dummy in the big east room
  inst(D.dummy, 10, 11, 20,
    '/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    null, 0.5),

  // Ogre in the new north-west room — now on patrol
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

  // Mummies in the secret room (Level 1, Rows 1-4, Cols 17-20)
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

  // Zombies in the new hidden room (Level 1, Rows 17-20, Cols 16-19)
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

  // PLACE HERE FOR TESTING MONSTERS IN THE BIG EAST ROOM
  // inst(D.iceman, 50, 11, 16,
  //   '/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb',
  //   '/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
  //   '/monsters/iceMan-animation/iceman-attack.mp3', 0.6, 0, 0, 1, null,
  //   '/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb',
  //   '/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'),

  // ── Level 3 – The Abyssal Crypts ─────────────────────────────────────────
  // Minotaur in the central chamber
  inst(D.minotaur, 300, 11, 11,
    '/monsters/minotaur/Meshy_AI_Animation_Idle_03_withSkin.glb',
    '/monsters/minotaur/Meshy_AI_Animation_Attack_withSkin.glb',
    '/monsters/minotaur/minator-attack.mp3', 0.8, 0, 0, 3,
    { bounds: { minRow: 9, maxRow: 13, minCol: 8, maxCol: 14 }, speed: 0.6, waitTime: 1.5 },
    '/monsters/minotaur/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/minotaur/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/minotaur/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/minotaur/Meshy_AI_Animation_Alert_withSkin.glb'),

  // North-West Room (4 Skeletons, 1 Demon)
  inst(D.skeletonWarrior, 311, 2, 2,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 312, 2, 4,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 313, 4, 2,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 314, 4, 4,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.demon, 315, 3, 3,
    '/monsters/demon/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Charged_Slash_withSkin.glb',
    '/monsters/demon/demon-hit.mp3', 0.65, 0, 0, 3, null,
    '/monsters/demon/Meshy_AI_Animation_Fall_Dead_from_Abdominal_Injury_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Slap_Reaction_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Walking_withSkin.glb'),

  // North-East Room (4 Skeletons, 1 Demon)
  inst(D.skeletonWarrior, 321, 2, 17,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 322, 2, 19,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 323, 4, 17,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 324, 4, 19,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.demon, 325, 3, 18,
    '/monsters/demon/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Charged_Slash_withSkin.glb',
    '/monsters/demon/demon-hit.mp3', 0.65, 0, 0, 3, null,
    '/monsters/demon/Meshy_AI_Animation_Fall_Dead_from_Abdominal_Injury_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Slap_Reaction_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Walking_withSkin.glb'),

  // South-West Room (4 Skeletons, 1 Demon)
  inst(D.skeletonWarrior, 331, 18, 2,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 332, 18, 4,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 333, 20, 2,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 334, 20, 4,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.demon, 335, 19, 3,
    '/monsters/demon/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Charged_Slash_withSkin.glb',
    '/monsters/demon/demon-hit.mp3', 0.65, 0, 0, 3, null,
    '/monsters/demon/Meshy_AI_Animation_Fall_Dead_from_Abdominal_Injury_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Slap_Reaction_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Walking_withSkin.glb'),

  // South-East Room (4 Skeletons, 1 Demon)
  inst(D.skeletonWarrior, 341, 18, 17,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 342, 18, 19,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 343, 20, 17,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.skeletonWarrior, 344, 20, 19,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/skeleton-animation/attack - Copy.mp3', 0.5, 0, 0, 3, null,
    '/monsters/skeleton-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb',
    '/monsters/skeleton-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
  inst(D.demon, 345, 19, 18,
    '/monsters/demon/Meshy_AI_Animation_Idle_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Charged_Slash_withSkin.glb',
    '/monsters/demon/demon-hit.mp3', 0.65, 0, 0, 3, null,
    '/monsters/demon/Meshy_AI_Animation_Fall_Dead_from_Abdominal_Injury_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Slap_Reaction_withSkin.glb',
    '/monsters/demon/Meshy_AI_Animation_Walking_withSkin.glb'),
];

// ── Assign Block Animations ─────────────────────────────────────────────────
monsters.forEach(m => {
  if (m.name.includes('Skeleton')) {
    m.glbBlock = '/monsters/skeleton-animation/Meshy_AI_Animation_Shield_Push_Left_withSkin.glb';
  }
});

// ── Multi-attack variant definitions ────────────────────────────────────────
// Post-process monsters that have multiple attack animations.
// Each variant defines its own GLB, sound, sound timings, and damage timings.
function _applyMultiAttacks(monsterName, attacks) {
  monsters.forEach(m => {
    if (m.name === monsterName && !m.attacks) {
      m.attacks = attacks;
    }
  });
}

_applyMultiAttacks('Skeleton Warrior', [
  {
    name: 'tripleCombo',
    glb: '/monsters/skeleton-animation/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    sound: '/monsters/skeleton-animation/attack.mp3',
    soundTimings: [0.25, 0.75],
    damageTimings: [0.25, 0.75],
    weight: 1,
  },
  {
    name: 'leftSlash',
    glb: '/monsters/skeleton-animation/Meshy_AI_Animation_Left_Slash_withSkin.glb',
    sound: '/monsters/skeleton-animation/attack.mp3',
    soundTimings: [0.45],
    damageTimings: [0.45],
    weight: 1,
  },
]);

_applyMultiAttacks('IceMan', [
  {
    name: 'doubleCombo',
    glb: '/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    sound: '/monsters/iceMan-animation/iceman-attack.mp3',
    soundTimings: [0.2, 0.6],
    damageTimings: [0.2, 0.6],
    weight: 3,
  },
  {
    name: 'iceCast',
    glb: '/monsters/iceMan-animation/Meshy_AI_Animation_mage_soell_cast_3_withSkin.glb',
    sound: '/monsters/iceMan-animation/ice-attack.mp3',
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 1,
    specialAttack: true,       // hits all party members
    specialOnHitEffects: [{ effectId: 'frozen', chance: 0.20 }],
  },
]);

_applyMultiAttacks('TreeKin', [
  {
    name: 'swing',
    glb: '/monsters/treekin-animation/attack.glb',
    sound: '/monsters/treekin-animation/wood-hit.mp3',
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 7,
  },
  {
    name: 'natureCast',
    glb: '/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb',
    sound: '/monsters/treekin-animation/treeKin-attack.mp3',
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 3,
    specialAttack: true, // hits all party members
    specialOnHitEffects: [{ effectId: 'slow', chance: 0.30 }],
  },
]);

_applyMultiAttacks('Ogre', [
  {
    name: 'normalAttack',
    glb: '/monsters/ogre/Meshy_AI_Animation_Attack_withSkin.glb',
    sound: '/monsters/ogre/ogre.mp3',
    soundTimings: [0.3],
    damageTimings: [0.3],
    weight: 8,
  },
  {
    name: 'doubleCombo',
    glb: '/monsters/ogre/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    sound: '/monsters/ogre/ogre.mp3',
    soundTimings: [0.3, 0.7],
    damageTimings: [0.3, 0.7],
    weight: 2,
    specialAttack: true,
    damageMultiplier: 1.5,
    specialOnHitEffects: [{ effectId: 'fear', chance: 0.75 }],
  },
]);

_applyMultiAttacks('Treeman', [
  {
    name: 'normalAttack',
    glb: '/monsters/treeman-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    sound: '/monsters/treeman-animation/attack-sound.mp3',
    soundTimings: [0.25, 0.65],
    damageTimings: [0.25, 0.65],
    weight: 1,
  },
  {
    name: 'treemanAwakening',
    glb: '/monsters/treeman-animation/Meshy_AI_Animation_mage_soell_cast_1_withSkin.glb',
    sound: '/monsters/treeman-animation/attack-sound.mp3',
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 0,              // never picked randomly — triggered by half-HP only
    specialAttack: true,     // AoE hits all party members
  },
]);

_applyMultiAttacks('Minotaur', [
  {
    name: 'normalAttack',
    glb: '/monsters/minotaur/Meshy_AI_Animation_Attack_withSkin.glb',
    sound: '/monsters/minotaur/minator-attack.mp3',
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 5,
  },
  {
    name: 'weaponCombo',
    glb: '/monsters/minotaur/Meshy_AI_Animation_Weapon_Combo_withSkin.glb',
    sound: '/monsters/minotaur/minator-attack.mp3',
    soundTimings: [0.25, 0.65],
    damageTimings: [0.25, 0.65],
    weight: 3,
  },
  {
    name: 'minotaurRage',
    glb: '/monsters/minotaur/Meshy_AI_Animation_mage_soell_cast_1_withSkin.glb',
    sound: '/monsters/minotaur/minator-attack.mp3',
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 1,
    specialAttack: true,
    specialOnHitEffects: [{ effectId: 'fear', chance: 0.20 }],
  },
]);

_applyMultiAttacks('Demon', [
  {
    name: 'chargedSlash',
    glb: '/monsters/demon/Meshy_AI_Animation_Charged_Slash_withSkin.glb',
    sound: '/monsters/demon/demon-hit.mp3',
    soundTimings: [0.4],
    damageTimings: [0.4],
    weight: 5,
  },
  {
    name: 'tripleCombo',
    glb: '/monsters/demon/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    sound: '/monsters/demon/demon-hit.mp3',
    soundTimings: [0.25, 0.65],
    damageTimings: [0.25, 0.65],
    weight: 2,
  },
  {
    name: 'demonCleave',
    glb: '/monsters/demon/special-attack.glb',
    sound: '/monsters/demon/no-mercy.mp3',
    soundTimings: [0.5],
    damageTimings: [0.5],
    weight: 3,
    damageMultiplier: 0.7,
    specialAttack: true,
    specialOnHitEffects: [{ effectId: 'fear', chance: 0.50, durationSec: 20 }],
  },
]);

function _pickWeightedVariant(variants) {
  const loaded = variants.filter(v => v != null);
  if (loaded.length === 0) return null;
  const totalWeight = loaded.reduce((sum, v) => sum + v.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const v of loaded) {
    roll -= v.weight;
    if (roll <= 0) return v;
  }
  return loaded[loaded.length - 1];
}

let _nextSummonId = 800;

/**
 * Dynamically spawns a treekin next to the given monster during combat.
 * Used by the Treeman's "Awakening of the Woods" ability.
 */
function _spawnTreekin(parentMonster, scene, offsetRow, offsetCol) {
  const row = parentMonster.gridRow + offsetRow;
  const col = parentMonster.gridCol + offsetCol;
  const id = _nextSummonId++;

  const m = inst(D.treekin, id, row, col,
    '/monsters/treekin-animation/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb',
    '/monsters/treekin-animation/treeKin-attack.mp3', 0.45, 0, 0,
    parentMonster.level ?? 2, null,
    '/monsters/treekin-animation/Meshy_AI_Animation_Dead_withSkin.glb',
    '/monsters/treekin-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb');

  m.engaged = true; // immediately hostile
  monsters.push(m);
  _loadMonster(m, scene);

  // Apply treekin attack variants to the summoned monster
  _applyMultiAttacks('TreeKin', [
    {
      name: 'swing',
      glb: '/monsters/treekin-animation/attack.glb',
      sound: '/monsters/treekin-animation/wood-hit.mp3',
      soundTimings: [0.4],
      damageTimings: [0.4],
      weight: 7,
    },
    {
      name: 'natureCast',
      glb: '/monsters/treekin-animation/Meshy_AI_Animation_mage_soell_cast_withSkin.glb',
      sound: '/monsters/treekin-animation/treeKin-attack.mp3',
      soundTimings: [0.5],
      damageTimings: [0.5],
      weight: 3,
      specialAttack: true,
      specialOnHitEffects: [{ effectId: 'slow', chance: 0.30 }],
    },
  ]);
}

/**
 * Triggers the Treeman's "Awakening of the Woods" — forces the cast animation,
 * spawns 2 treekin, and plays the green magic effect.  Called once when HP
 * drops below 50%.
 */
function _triggerTreemanAwakening(treeman, scene) {
  if (treeman._awakeningUsed) return;
  treeman._awakeningUsed = true;

  // Find the awakening variant
  const variant = treeman.attackVariants?.find(v => v && v.name === 'treemanAwakening');
  if (!variant || !variant.action) return;

  // Force-play the cast animation
  const attackAction = variant.action;
  attackAction.reset();
  attackAction.setEffectiveTimeScale(1);
  attackAction.setEffectiveWeight(1);
  attackAction.play();
  const fromAction = (treeman.actions.walk && treeman._animState === 'walk')
    ? treeman.actions.walk : treeman.actions.idle;
  if (fromAction) fromAction.crossFadeTo(attackAction, 0.2, true);

  showMessage(`<b>${treeman.name}</b> channels the Awakening of the Woods!`, 3000);

  // Schedule particle effect + treekin spawning at the damage timing point
  const duration = attackAction.getClip().duration;
  const pts = (variant.damageTimings && variant.damageTimings.length > 0) ? variant.damageTimings[0] : 0.5;
  setTimeout(() => {
    if (!treeman.alive) return;
    if (treeman.mesh) createTreemanAwakening(treeman.mesh.position);
    _spawnTreekin(treeman, scene, -1, 0);
    _spawnTreekin(treeman, scene, 1, 0);
  }, duration * pts * 1000);

  // Apply AoE damage at the timing point (same as other specials)
  setTimeout(() => {
    if (!treeman.alive) return;
    _applyMonsterSpecialAttack(treeman, variant);
  }, duration * pts * 1000);
}

/** Triggers the mummies to start chasing the player immediately. */
export function triggerMummyAmbush() {
  const currentLevel = window.currentLevel || 1;
  monsters.forEach(m => {
    if (m.name === 'Mummy' && m.alive && (m.level ?? 1) === currentLevel) {
      m.engaged = true;
    }
  });
}

export function isMonsterAt(row, col) {
  const currentLevel = window.currentLevel || 1;
  return monsters.some(m => m.alive && (m.level ?? 1) === currentLevel && m.gridRow === row && m.gridCol === col);
}

/**
 * Returns true if any alive monster *other than* excludeId either occupies or
 * has already reserved (is moving toward) the given cell.  Used internally to
 * prevent two monsters from double-booking the same destination in the same
 * frame — isMonsterAt only checks committed gridRow/gridCol and misses monsters
 * that are mid-step.
 */
function _isCellReserved(row, col, excludeId) {
  const currentLevel = window.currentLevel || 1;
  return monsters.some(m => {
    if (!m.alive || m.id === excludeId) return false;
    if ((m.level ?? 1) !== currentLevel) return false;
    if (m.gridRow === row && m.gridCol === col) return true;
    if (m._cs?.moving && m._cs.targetRow === row && m._cs.targetCol === col) return true;
    if (m._ps?.moving && m._ps.targetRow === row && m._ps.targetCol === col) return true;
    return false;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────

/** Rebuild the HTML content of a monster's Hunter's Eye stats panel. */
function _updateStatsPanel(m) {
  if (!m.statsPanel) return;
  const s = m.stats ?? {};

  const isSundered = skillsState.sunderArmor?.active && skillsState.sunderArmor?.targetId === m.id;
  const defVal = m.defence ?? '—';
  const resVal = s.resilience ?? '—';

  const sunderMag = skillsState.sunderArmor.magnitude;
  const displayDef = isSundered && defVal !== '—' ? `<span style="color:#ff8080">${Math.floor(defVal * sunderMag)}</span>` : defVal;
  const displayRes = isSundered && resVal !== '—' ? `<span style="color:#ff8080">${Math.floor(resVal * sunderMag)}</span>` : resVal;

  const isEntangled = skillsState.entangle?.active && skillsState.entangle?.targetId === m.id;
  const isStunned = m.stunUntil && performance.now() < m.stunUntil;

  // On-hit effects section — shows what debuffs this monster type can inflict
  let onHitHtml = '';
  if (m.onHitEffects?.length) {
    onHitHtml += `<div class="hep-divider"></div><div class="hep-section-label">On-Hit Effects</div><div class="hep-debuffs">`;
    m.onHitEffects.forEach(effect => {
      const def = STATUS_EFFECT_DEFS[effect.effectId];
      const name = def?.name ?? effect.effectId;
      const chance = Math.round(effect.chance * 100);
      const desc = def ? describeEffect(def) : '';
      const effectColor = def?.color ?? '#c0ff80';
      const descPart = desc ? ` <span class="hep-effect-desc">(${desc})</span>` : '';
      onHitHtml += `<div class="hep-debuff hep-on-hit" style="color:${effectColor}">`
        + `<span class="hep-effect-name">${name}</span>`
        + `<span class="hep-effect-chance">${chance}%</span>`
        + descPart
        + `</div>`;
    });
    onHitHtml += `</div>`;
  }

  // Active debuffs currently applied to this monster (skills + status effects)
  const nowMs = performance.now();
  const hasSkillDebuffs = isSundered || isEntangled || isStunned;
  const hasStatusDebuffs = m.activeDebuffs?.some(d => nowMs < d.expiresAt);
  let debuffsHtml = '';
  if (hasSkillDebuffs || hasStatusDebuffs) {
    debuffsHtml += `<div class="hep-divider"></div><div class="hep-section-label">Active Effects</div><div class="hep-debuffs">`;
    if (isSundered) {
      debuffsHtml += `<div class="hep-debuff" style="color:#ff8080">Sunder Armor (DEF/RES ½)</div>`;
    }
    if (isEntangled) {
      debuffsHtml += `<div class="hep-debuff" style="color:#80ff80">Entangle (Atk Spd ½)</div>`;
    }
    if (isStunned) {
      debuffsHtml += `<div class="hep-debuff" style="color:#ffd040">Stunned (Cannot Act)</div>`;
    }
    // Data-driven status effects from activeDebuffs
    (m.activeDebuffs ?? []).forEach(d => {
      if (nowMs >= d.expiresAt) return;
      const def = STATUS_EFFECT_DEFS[d.effectId];
      if (!def) return;
      const color = def.color ?? '#c0ff80';
      const desc = describeEffect(def);
      debuffsHtml += `<div class="hep-debuff" style="color:${color}">${def.name} (${desc})</div>`;
    });
    debuffsHtml += `</div>`;
  }

  m.statsPanel.innerHTML =
    `<div class="hep-name">${m.name}</div>` +
    `<div class="hep-row"><span class="hep-label">HP</span><span class="hep-val">${m.hp} / ${m.hpMax}</span></div>` +
    `<div class="hep-divider"></div>` +
    `<div class="hep-grid">` +
    `<span class="hep-stat">STR <b>${s.strength ?? '—'}</b></span>` +
    `<span class="hep-stat">DEX <b>${s.dexterity ?? '—'}</b></span>` +
    `<span class="hep-stat">VIT <b>${s.vitality ?? '—'}</b></span>` +
    `<span class="hep-stat">INT <b>${s.intelligence ?? '—'}</b></span>` +
    `<span class="hep-stat">RES <b>${displayRes}</b></span>` +
    `<span class="hep-stat">DEF <b>${displayDef}</b></span>` +
    `</div>` +
    onHitHtml +
    debuffsHtml;
}

const _draco = new DRACOLoader();
_draco.setDecoderPath('/draco/');
const _gltfLoader = new GLTFLoader();
_gltfLoader.setDRACOLoader(_draco);

function _loadMonster(m, scene) {
  // Load the idle/walking GLB as the base mesh
  _gltfLoader.load(m.glbIdle, (gltf) => {
    const model = gltf.scene;
    m.mesh = model;

    model.scale.setScalar(m.scale);

    const wx = m.gridCol * CELL + (m.offsetX ?? 0);
    const wz = m.gridRow * CELL + (m.offsetZ ?? 0);
    model.position.set(wx, 0.0, wz);

    m.lookAtPlayer = (playerPos) => {
      model.lookAt(playerPos.x, model.position.y, playerPos.z);
    };

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // Fix pixelation on monster textures
        if (child.material && child.material.map) {
          child.material.map.magFilter = THREE.LinearFilter;
          child.material.map.minFilter = THREE.LinearMipmapLinearFilter;
          child.material.map.anisotropy = 16;
        }

        if (child.material) {
          child.material.transparent = false;
          child.material.depthWrite = true;
          if (child.material.metalness !== undefined) child.material.metalness = 0.0;
          if (child.material.roughness !== undefined) child.material.roughness = 1.0;

          if (m.name === 'Goblin' && child.material.color) {
            child.material.color.setHex(0x55aa55);
          }
        }
      }
    });

    m.mixer = new THREE.AnimationMixer(model);

    if (gltf.animations && gltf.animations.length > 0) {
      const idleAction = m.mixer.clipAction(gltf.animations[0]);
      m.actions.idle = idleAction;
      m._activeIdle = idleAction;

      m.getIdleAction = function () {
        if (!m.actions.idleAlt) return m.actions.idle;
        return (Math.random() < 0.25) ? m.actions.idle : m.actions.idleAlt;
      };

      // Agree Gesture animations run fast — halve the speed so they look natural
      // Training dummy doesn't loop its idle animation; it's triggered manually on hit
      if (m.name !== 'Training Dummy') {
        const initialIdle = m.getIdleAction();
        m._activeIdle = initialIdle;
        initialIdle.play();
        if (m.name === 'Minotaur' && initialIdle === m.actions.idle) {
          playSoundByUrl('/monsters/minotaur/scream.mp3', 0.8);
        }
      }

      m.mixer.addEventListener('loop', (e) => {
        if (m._animState !== 'walk' && (e.action === m.actions.idle || e.action === m.actions.idleAlt)) {
          if (m.actions.idleAlt) {
            const nextIdle = m.getIdleAction();
            if (e.action !== nextIdle) {
              nextIdle.reset().play();
              e.action.crossFadeTo(nextIdle, 0.4, true);
              m._activeIdle = nextIdle;
            }
            if (m.name === 'Minotaur' && nextIdle === m.actions.idle) {
              playSoundByUrl('/monsters/minotaur/scream.mp3', 0.8);
            }
          } else if (m.name === 'Minotaur' && e.action === m.actions.idle) {
            playSoundByUrl('/monsters/minotaur/scream.mp3', 0.8);
          }
        }
      });
    }

    if (m.glbIdleAlt) {
      _gltfLoader.load(m.glbIdleAlt, (altGltf) => {
        if (altGltf.animations && altGltf.animations.length > 0) {
          m.actions.idleAlt = m.mixer.clipAction(altGltf.animations[0]);
        }
      });
    }

    scene.add(model);

    // ── HP bar label (CSS2DObject) ──────────────────────────────────────
    const barWrap = document.createElement('div');
    barWrap.className = 'monster-hp-bar';
    const barFill = document.createElement('div');
    barFill.className = 'monster-hp-fill';
    barWrap.appendChild(barFill);
    m.hpBarFill = barFill;

    const hpLabel = new CSS2DObject(barWrap);
    hpLabel.position.set(0, 1.8, 0);
    model.add(hpLabel);
    m.hpLabel = hpLabel;

    // ── Hunter's Eye stats panel (CSS2DObject) ─────────────────────────
    const statsDiv = document.createElement('div');
    statsDiv.className = 'monster-stats-panel';
    _updateStatsPanel({ ...m, statsPanel: statsDiv }); // seed initial HTML
    m.statsPanel = statsDiv;

    const statsLabel = new CSS2DObject(statsDiv);
    statsLabel.position.set(0, 2.6, 0); // above the HP bar
    statsLabel.visible = false;
    model.add(statsLabel);
    m.statsLabel = statsLabel;

    // ── Sleep indicator (three staggered Z-bubbles) ────────────────────
    const sleepDiv = document.createElement('div');
    sleepDiv.className = 'monster-sleep-indicator';
    ['z', 'Z', 'Z'].forEach((letter, i) => {
      const z = document.createElement('span');
      z.className = `sleep-z sleep-z--${i}`;
      z.textContent = letter;
      sleepDiv.appendChild(z);
    });

    const sleepLabel = new CSS2DObject(sleepDiv);
    sleepLabel.position.set(0, 2.2, 0); // centred above the HP bar
    sleepLabel.visible = false;
    model.add(sleepLabel);
    m.sleepLabel = sleepLabel;

    // Load attack animation(s)
    if (m.attacks && m.attacks.length > 0) {
      // ── Multiple attack variants ──
      m.attackVariants = [];
      m.attacks.forEach((atkDef, idx) => {
        _gltfLoader.load(atkDef.glb, (animGltf) => {
          if (animGltf.animations && animGltf.animations.length > 0) {
            const clip = animGltf.animations[0];
            const action = m.mixer.clipAction(clip);
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            m.attackVariants[idx] = {
              action,
              name: atkDef.name,
              sound: atkDef.sound ?? m.attackSound,
              soundTimings: atkDef.soundTimings ?? [0],
              damageTimings: atkDef.damageTimings ?? [0.3],
              weight: atkDef.weight ?? 1,
              specialAttack: atkDef.specialAttack ?? false,
              specialOnHitEffects: atkDef.specialOnHitEffects ?? null,
            };
            // Keep m.actions.attack pointing to first variant for backward compat
            if (idx === 0) m.actions.attack = action;
          }
        });
      });
      // One finished listener for all attack variants
      m.mixer.addEventListener('finished', (e) => {
        const isAttackAction = m.attackVariants?.some(v => v && v.action === e.action);
        if (isAttackAction && m.actions.idle && m.name !== 'Training Dummy') {
          const isMoving = (m._cs && m._cs.moving) || (m._ps && m._ps.moving);
          let toAction = (isMoving && m.actions.walk) ? m.actions.walk : null;
          if (!toAction) {
            toAction = m.getIdleAction ? m.getIdleAction() : m.actions.idle;
            m._activeIdle = toAction;
            if (m.name === 'Minotaur' && toAction === m.actions.idle) {
              playSoundByUrl('/monsters/minotaur/scream.mp3', 0.8);
            }
          }
          toAction.reset().play();
          e.action.crossFadeTo(toAction, 0.25, false);
          m._animState = isMoving ? 'walk' : 'idle';
        }
      });
    } else {
      // ── Legacy single-attack path ──
      _gltfLoader.load(m.glbAttack, (animGltf) => {
        if (animGltf.animations && animGltf.animations.length > 0) {
          const attackClip = animGltf.animations[0];
          const attackAction = m.mixer.clipAction(attackClip);
          m.actions.attack = attackAction;

          attackAction.setLoop(THREE.LoopOnce, 1);
          attackAction.clampWhenFinished = true;

          // When attack finishes, fade back to idle or walk (except for training dummy)
          m.mixer.addEventListener('finished', (e) => {
            if (e.action === m.actions.attack && m.actions.idle && m.name !== 'Training Dummy') {
              const isMoving = (m._cs && m._cs.moving) || (m._ps && m._ps.moving);
              let toAction = (isMoving && m.actions.walk) ? m.actions.walk : null;
              if (!toAction) {
                toAction = m.getIdleAction ? m.getIdleAction() : m.actions.idle;
                m._activeIdle = toAction;
                if (m.name === 'Minotaur' && toAction === m.actions.idle) {
                  playSoundByUrl('/monsters/minotaur/scream.mp3', 0.8);
                }
              }
              toAction.reset().play();
              m.actions.attack.crossFadeTo(toAction, 0.25, false);
              m._animState = isMoving ? 'walk' : 'idle';
            }
          });
        }
      });
    }

    // Load the death animation GLB if provided
    if (m.glbDeath) {
      _gltfLoader.load(m.glbDeath, (deathGltf) => {
        if (deathGltf.animations && deathGltf.animations.length > 0) {
          const deathClip = deathGltf.animations[0];
          const deathAction = m.mixer.clipAction(deathClip);
          m.actions.death = deathAction;
          deathAction.setLoop(THREE.LoopOnce, 1);
          deathAction.clampWhenFinished = true;
        }
      });
    }

    // Load the hit animation GLB if provided
    if (m.glbHit) {
      _gltfLoader.load(m.glbHit, (hitGltf) => {
        if (hitGltf.animations && hitGltf.animations.length > 0) {
          const hitClip = hitGltf.animations[0];
          const hitAction = m.mixer.clipAction(hitClip);
          m.actions.hit = hitAction;
          hitAction.setLoop(THREE.LoopOnce, 1);
          hitAction.clampWhenFinished = true;

          // When hit animation finishes, fade back to idle or walk
          m.mixer.addEventListener('finished', (e) => {
            if (e.action === m.actions.hit && m.actions.idle) {
              const isMoving = (m._cs && m._cs.moving) || (m._ps && m._ps.moving);
              let toAction = (isMoving && m.actions.walk) ? m.actions.walk : null;
              if (!toAction) {
                toAction = m.getIdleAction ? m.getIdleAction() : m.actions.idle;
                m._activeIdle = toAction;
                if (m.name === 'Minotaur' && toAction === m.actions.idle) {
                  playSoundByUrl('/monsters/minotaur/scream.mp3', 0.8);
                }
              }
              toAction.reset().play();
              m.actions.hit.crossFadeTo(toAction, 0.2, false);
              m._animState = isMoving ? 'walk' : 'idle';
            }
          });
        }
      });
    }

    // Load the block animation GLB if provided
    if (m.glbBlock) {
      _gltfLoader.load(m.glbBlock, (blockGltf) => {
        if (blockGltf.animations && blockGltf.animations.length > 0) {
          const blockClip = blockGltf.animations[0];
          const blockAction = m.mixer.clipAction(blockClip);
          m.actions.block = blockAction;
          blockAction.setLoop(THREE.LoopOnce, 1);
          blockAction.clampWhenFinished = true;

          // When block finishes, fade back to idle or walk
          m.mixer.addEventListener('finished', (e) => {
            if (e.action === m.actions.block && m.actions.idle) {
              const isMoving = (m._cs && m._cs.moving) || (m._ps && m._ps.moving);
              let toAction = (isMoving && m.actions.walk) ? m.actions.walk : null;
              if (!toAction) {
                toAction = m.getIdleAction ? m.getIdleAction() : m.actions.idle;
                m._activeIdle = toAction;
              }
              toAction.reset().play();
              m.actions.block.crossFadeTo(toAction, 0.2, false);
              m._animState = isMoving ? 'walk' : 'idle';
            }
          });
        }
      });
    }

    // Load the walking animation GLB if provided
    if (m.glbWalk) {
      _gltfLoader.load(m.glbWalk, (walkGltf) => {
        if (walkGltf.animations && walkGltf.animations.length > 0) {
          const walkClip = walkGltf.animations[0];
          const walkAction = m.mixer.clipAction(walkClip);
          m.actions.walk = walkAction;
        }
      });
    }
  });
}

let _sceneRef = null;

export function initMonsters(scene) {
  _sceneRef = scene;
  const currentLevel = window.currentLevel || 1;
  monsters.forEach((m) => {
    if (!m.alive) return;
    if ((m.level ?? 1) !== currentLevel) return; // defer other levels
    _loadMonster(m, scene);
  });
}

export function loadMonstersForLevel(scene, level) {
  monsters.forEach((m) => {
    if (!m.alive || m.mesh) return; // skip dead or already loaded
    if ((m.level ?? 1) !== level) return;
    _loadMonster(m, scene);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  PATROL  — random-wander AI for roaming monsters
// ─────────────────────────────────────────────────────────────────────────────

/** Shared directions array to avoid per-frame allocations during patrol AI */
const PATROL_DIRECTIONS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

/**
 * Moves a patrolling monster toward a random target cell within its patrol
 * bounds.  Called every frame from updateMonsters when the player is out of
 * attack range.
 *
 * Patrol state is stored on the monster object as `m._ps`:
 *   { moving: bool, targetRow, targetCol, waitTimer }
 */
function _updatePatrol(m, dt) {
  if (!m.mesh || !m.patrol) return;

  // Lazy-initialise patrol state; stagger start times so multiple patrol
  // monsters don't all move in lock-step.
  if (!m._ps) {
    m._ps = {
      moving: false,
      targetRow: m.gridRow,
      targetCol: m.gridCol,
      waitTimer: Math.random() * 3.0,   // staggered first move
    };
  }

  const ps = m._ps;
  const b = m.patrol.bounds;
  const spd = (m.patrol.speed ?? 0.6) * CELL;  // world-units / second

  if (!ps.moving) {
    // ── waiting at current cell ──────────────────────────────────────────
    ps.waitTimer -= dt;
    if (ps.waitTimer > 0) return;

    // Pick one random adjacent cell (N / S / E / W) that lies inside the
    // patrol bounds.  Moving one cell at a time keeps gridRow/gridCol
    // anchored to real cell centres — the mid-move approximation that caused
    // the half-grid combat gap is avoided entirely.
    // Fisher-Yates shuffle for unbiased direction selection
    for (let i = PATROL_DIRECTIONS.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [PATROL_DIRECTIONS[i], PATROL_DIRECTIONS[j]] = [PATROL_DIRECTIONS[j], PATROL_DIRECTIONS[i]];
    }
    let chosen = false;
    for (const d of PATROL_DIRECTIONS) {
      const nr = m.gridRow + d.dr;
      const nc = m.gridCol + d.dc;
      if (
        nr >= b.minRow && nr <= b.maxRow &&
        nc >= b.minCol && nc <= b.maxCol &&
        isPassable(nr, nc) &&
        !isStatueAt(nr, nc) &&
        !_isCellReserved(nr, nc, m.id)
      ) {
        ps.targetRow = nr;
        ps.targetCol = nc;
        ps.moving = true;
        chosen = true;
        break;
      }
    }
    if (!chosen) ps.waitTimer = 1.0; // hemmed in — retry shortly
    return;
  }

  // ── moving toward the adjacent target cell ───────────────────────────────
  const targetX = ps.targetCol * CELL + (m.offsetX ?? 0);
  const targetZ = ps.targetRow * CELL + (m.offsetZ ?? 0);
  const dx = targetX - m.mesh.position.x;
  const dz = targetZ - m.mesh.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < 0.05) {
    // Snap to exact cell centre and commit the new grid position.
    // gridRow/gridCol are ONLY updated here (on arrival), never mid-step,
    // so inRange checks always reference a true cell centre.
    m.mesh.position.x = targetX;
    m.mesh.position.z = targetZ;
    m.gridRow = ps.targetRow;
    m.gridCol = ps.targetCol;
    ps.moving = false;
    ps.waitTimer = (m.patrol.waitTime ?? 2.5) + Math.random() * 2.0;
  } else {
    const step = Math.min(spd * dt, dist);
    m.mesh.position.x += (dx / dist) * step;
    m.mesh.position.z += (dz / dist) * step;
    // Face the direction of travel (lookAt convention matches lookAtPlayer)
    m.mesh.lookAt(targetX, m.mesh.position.y, targetZ);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CHASE  — pursue the player once combat has been initiated
// ─────────────────────────────────────────────────────────────────────────────

const CHASE_SPEED = 0.9; // cells per second

/**
 * Moves an engaged monster one step toward the player's grid position.
 * Called every frame when the monster is engaged but out of melee range.
 */
function _updateChase(m, dt) {
  if (!m.mesh) return;

  if (!m._cs) {
    m._cs = { moving: false, targetRow: m.gridRow, targetCol: m.gridCol };
  }

  const cs = m._cs;
  const spd = CHASE_SPEED * CELL;

  if (!cs.moving) {
    const dr = player.gridRow - m.gridRow;
    const dc = player.gridCol - m.gridCol;

    // Already adjacent — nothing to do (inRange will take over)
    if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) return;

    // Try steps toward the player, prioritising the larger gap axis first
    const primary = Math.abs(dr) >= Math.abs(dc)
      ? [{ dr: Math.sign(dr), dc: 0 }, { dr: 0, dc: Math.sign(dc) }]
      : [{ dr: 0, dc: Math.sign(dc) }, { dr: Math.sign(dr), dc: 0 }];

    for (const d of primary) {
      if (d.dr === 0 && d.dc === 0) continue;
      const nr = m.gridRow + d.dr;
      const nc = m.gridCol + d.dc;
      if (isPassable(nr, nc) && !isStatueAt(nr, nc) && !_isCellReserved(nr, nc, m.id)) {
        cs.targetRow = nr;
        cs.targetCol = nc;
        cs.moving = true;
        break;
      }
    }
    return;
  }

  // Slide toward the target cell
  const targetX = cs.targetCol * CELL + (m.offsetX ?? 0);
  const targetZ = cs.targetRow * CELL + (m.offsetZ ?? 0);
  const dx = targetX - m.mesh.position.x;
  const dz = targetZ - m.mesh.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < 0.05) {
    m.mesh.position.x = targetX;
    m.mesh.position.z = targetZ;
    m.gridRow = cs.targetRow;
    m.gridCol = cs.targetCol;
    cs.moving = false;
  } else {
    const step = Math.min(spd * dt, dist);
    m.mesh.position.x += (dx / dist) * step;
    m.mesh.position.z += (dz / dist) * step;
    m.mesh.lookAt(targetX, m.mesh.position.y, targetZ);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATION  (called every frame from main.js)
// ─────────────────────────────────────────────────────────────────────────────

const FOG_CULL_SQ = 14 * 14; // slightly beyond fog end (12 units)

function _hasLineOfSight(r1, c1, r2, c2) {
  const dr = r2 - r1;
  const dc = c2 - c1;
  const absR = Math.abs(dr);
  const absC = Math.abs(dc);
  // Same cell or orthogonally adjacent — no cell between them, always visible
  if (absR + absC <= 1) return true;
  // Diagonally adjacent (1,1) — blocked only if BOTH corner cells are walls
  if (absR === 1 && absC === 1) return isPassable(r1, c1 + dc) || isPassable(r1 + dr, c1);
  // Straight lines (distance 2)
  if (dr === 0) return isPassable(r1, c1 + Math.sign(dc));
  if (dc === 0) return isPassable(r1 + Math.sign(dr), c1);
  // Mixed / full diagonals at distance 2
  if (absR === 2 && absC === 2) return isPassable(r1 + Math.sign(dr), c1 + Math.sign(dc));
  if (absR === 2 && absC === 1) return isPassable(r1 + Math.sign(dr), c1) || isPassable(r1 + Math.sign(dr), c1 + Math.sign(dc));
  if (absR === 1 && absC === 2) return isPassable(r1, c1 + Math.sign(dc)) || isPassable(r1 + Math.sign(dr), c1 + Math.sign(dc));
  return true;
}

export function updateMonsters(dt, playerCamera, scene) {
  const currentLevel = window.currentLevel || 1;
  const playerPos = playerCamera ? playerCamera.position : null;
  monsters.forEach((m) => {
    if (currentLevel !== (m.level ?? 1)) {
      if (m.hpLabel) m.hpLabel.visible = false;
      if (m.statsLabel) m.statsLabel.visible = false;
      if (m.sleepLabel) m.sleepLabel.visible = false;
      if (_huntersEyeTargetId === m.id) _huntersEyeTargetId = null;
      if (m.mesh) m.mesh.visible = false;
      return;
    }

    // If dead and mesh is already gone, skip
    if (!m.alive && !m.mesh) return;

    // Distance cull: skip full update for monsters beyond fog range
    if (m.mesh && playerPos && m.alive) {
      const dx = m.mesh.position.x - playerPos.x;
      const dz = m.mesh.position.z - playerPos.z;
      if (dx * dx + dz * dz > FOG_CULL_SQ) {
        if (m.mixer && m.mixer.timeScale !== 0) m.mixer.timeScale = 0;
        if (m.hpLabel) m.hpLabel.visible = false;
        if (m.statsLabel) m.statsLabel.visible = false;
        if (m.sleepLabel) m.sleepLabel.visible = false;
        m.mesh.visible = false;
        return;
      }
      // Resume if returning into range
      if (m.mixer && m.mixer.timeScale === 0) m.mixer.timeScale = 1;
    }

    if (m.mesh) m.mesh.visible = true;

    // Update animation mixer (crucial for death animation)
    if (m.mixer) m.mixer.update(dt);

    // If dead, we stop here (no attacks, no patrol, no labels)
    if (!m.alive) {
      if (m.hpLabel) m.hpLabel.visible = false;
      if (m.statsLabel) m.statsLabel.visible = false;
      if (m.sleepLabel) m.sleepLabel.visible = false;
      if (_huntersEyeTargetId === m.id) _huntersEyeTargetId = null;
      return;
    }

    // ── Process active status effects (poison ticks, stat debuffs, etc.) ──
    let isAsleep = false;
    if (m.activeDebuffs?.length) {
      const now = performance.now();
      m.activeDebuffs = m.activeDebuffs.filter(d => now < d.expiresAt);
      let panelDirty = false;
      m.activeDebuffs.forEach(d => {
        if (d.effectId === 'sleep') isAsleep = true;
        const def = STATUS_EFFECT_DEFS[d.effectId];
        if (!def?.tickInterval) return;
        d.tickAccum += dt;
        if (d.tickAccum >= def.tickInterval) {
          d.tickAccum -= def.tickInterval;
          const dmg = def.tickDamage || 0;
          if (dmg > 0) hitMonster(m.id, dmg, 'dot', false, d.caster ?? null);
          if (dmg < 0) m.hp = Math.min(m.hpMax, m.hp - dmg); // heal
          panelDirty = true;
        }
      });
      if (panelDirty && m.statsLabel?.visible) _updateStatsPanel(m);
    }

    if (m.sleepLabel) m.sleepLabel.visible = isAsleep;

    // Check if monster is suppressed by an action-preventing debuff (sleep, frozen, fear, etc.)
    // Expired debuffs have already been filtered above, so no extra time check needed here.
    // isAsleep is set above during the activeDebuffs loop.
    const isSuppressed = isAsleep || (m.activeDebuffs ?? []).some(d => STATUS_EFFECT_DEFS[d.effectId]?.preventsAction);

    // Proximity check — used for HP bar, Hunter's Eye, patrol, and attack logic
    const distRow = Math.abs(m.gridRow - player.gridRow);
    const distCol = Math.abs(m.gridCol - player.gridCol);
    let inRange = distRow <= 1 && distCol <= 1;

    // Monsters detect characters only within 1 grid square and when facing them
    if (!isSuppressed && !m.engaged && m.name !== 'Training Dummy' && distRow <= 1 && distCol <= 1) {
      if (_hasLineOfSight(m.gridRow, m.gridCol, player.gridRow, player.gridCol)) {
        let seesPlayer = true;
        if (m.mesh && playerPos) {
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(m.mesh.quaternion);
          forward.y = 0;
          forward.normalize();
          const toPlayer = new THREE.Vector3(playerPos.x - m.mesh.position.x, 0, playerPos.z - m.mesh.position.z).normalize();
          if (forward.dot(toPlayer) <= 0) seesPlayer = false; // Player must be in forward-facing hemisphere
        }
        if (seesPlayer) {
          m.engaged = true;
          setInCombat();
        }
      }
    }

    // Prevent attacking through walls if monster is somehow in a wall or cornered
    if (inRange) {
      if (!isPassable(m.gridRow, m.gridCol) || !isPassable(player.gridRow, player.gridCol)) {
        inRange = false;
      } else if (distRow === 1 && distCol === 1) {
        if (!isPassable(player.gridRow, m.gridCol) && !isPassable(m.gridRow, player.gridCol)) {
          inRange = false;
        }
      }
    }

    // Non-patrol monsters face the player when engaged or in range;
    // patrol monsters only turn to face the player once they are adjacent.
    // Suppressed (sleeping) monsters don't track the player.
    if (!isSuppressed && m.mesh && playerCamera && m.lookAtPlayer && ((!m.patrol && m.engaged) || inRange)) {
      m.lookAtPlayer(playerCamera.position);
    }

    // HP bar is only visible when the party is engaged in melee range with
    // this monster — same adjacency check used for proximity attacks.
    if (m.hpLabel) m.hpLabel.visible = inRange;

    // Auto-deactivate Hunter's Eye if the player disengages from this monster
    if (_huntersEyeTargetId === m.id && !inRange) {
      _huntersEyeTargetId = null;
      if (m.statsLabel) m.statsLabel.visible = false;
    }

    // Movement when player is out of attack range.
    // Suppressed (sleeping) monsters cannot chase or patrol.
    let isMoving = false;
    if (!inRange && !isSuppressed) {
      if (m.engaged && m.name !== 'Training Dummy') {
        // Combat has started — chase the player
        _updateChase(m, dt);
        if (m._cs && m._cs.moving) isMoving = true;
      } else if (m.patrol) {
        // Not yet engaged — continue normal patrol
        _updatePatrol(m, dt);
        if (m._ps && m._ps.moving) isMoving = true;
      }
    }

    // Handle animation transitions between walk and idle
    if (m.actions.walk && m.actions.idle) {
      // Only switch if we are NOT playing a priority animation (attack, hit, death)
      const isAttacking = m.actions.attack && m.actions.attack.isRunning();
      const isHitting = m.actions.hit && m.actions.hit.isRunning();
      const isDead = m.actions.death && m.actions.death.isRunning();

      if (!isAttacking && !isHitting && !isDead) {
        if (isMoving) {
          if (m._animState !== 'walk') {
            m.actions.walk.reset().play();
            (m._activeIdle || m.actions.idle).crossFadeTo(m.actions.walk, 0.3, true);
            m._animState = 'walk';
          }
        } else {
          if (m._animState !== 'idle') {
            const nextIdle = m.getIdleAction ? m.getIdleAction() : m.actions.idle;
            nextIdle.reset().play();
            m.actions.walk.crossFadeTo(nextIdle, 0.3, true);
            m._animState = 'idle';
            m._activeIdle = nextIdle;
            if (m.name === 'Minotaur' && nextIdle === m.actions.idle) {
              playSoundByUrl('/monsters/minotaur/scream.mp3', 0.8);
            }
          }
        }
      }
    }

    // Demon idle growl — plays when the party is within 1 grid square
    if (m.name === 'Demon' && m.alive && inRange && !m._demonSoundCooldown) {
      m._demonSoundCooldown = true;
      const audio = new Audio('/monsters/demon/no-mercy.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => { });
      // Cooldown so it doesn't spam every frame — wait until the clip finishes + a pause
      setTimeout(() => { m._demonSoundCooldown = false; }, 8000);
    }

    // Proximity attack logic: if player is adjacent, attack them periodically.
    // Suppressed (sleeping) monsters cannot attack but still mark combat engaged.
    if (inRange && m.name !== 'Training Dummy') {
      m.engaged = true;
      setInCombat();

      if (isSuppressed) {
        // Monster is asleep (or otherwise suppressed) — cannot attack
      } else if (m.stunUntil && performance.now() < m.stunUntil) {
        // Monster is stunned; cooldown timer doesn't tick down yet
      } else {
        m.attackCooldown = (m.attackCooldown || 0) - dt;
        if (m.attackCooldown <= 0) {
          triggerMonsterAttack(m.id);
          let nextAttack = (5.0 + (Math.random() * 2.0)) / (m.attackSpeed ?? 1); // Next attack in 5.0 - 7.0 seconds (scaled by attackSpeed)
          if (skillsState.entangle?.active && skillsState.entangle?.targetId === m.id) {
            nextAttack *= skillsState.entangle.magnitude;
          }
          m.attackCooldown = nextAttack;
        }
      }
    } else {
      // Ready to attack immediately when player steps close
      m.attackCooldown = 0;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER STATUS EFFECTS
//  Mirrors the party member activeDebuffs system so weapons, ammo, and spells
//  can apply any status effect defined in status-effects.json to monsters.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply (or refresh) a status effect on a monster.
 * effectId must match a key in STATUS_EFFECT_DEFS.
 */
/**
 * Apply (or refresh) a status effect on a monster.
 * effectId must match a key in STATUS_EFFECT_DEFS.
 * durationSec optionally overrides the duration defined in status-effects.json
 * (used by spells that store their own duration in spells.json).
 */
export function applyMonsterStatusEffect(monsterId, effectId, caster = null, durationSec = null) {
  const m = monsters.find(x => x.id === monsterId && x.alive);
  if (!m) return;
  const def = STATUS_EFFECT_DEFS[effectId];
  if (!def) return;

  const duration = durationSec ?? def.duration;

  if (!m.activeDebuffs) m.activeDebuffs = [];
  const existing = m.activeDebuffs.find(d => d.effectId === effectId);
  if (existing) {
    existing.expiresAt = performance.now() + duration * 1000;
    if (caster) existing.caster = caster; // refresh caster on re-apply
  } else {
    m.activeDebuffs.push({
      effectId,
      caster,
      expiresAt: performance.now() + duration * 1000,
      tickAccum: def.tickInterval ? def.tickInterval * 0.95 : 0, // fast first tick
    });
  }
  if (m.statsLabel?.visible) _updateStatsPanel(m);
}

// ─────────────────────────────────────────────────────────────────────────────
//  HIT / DAMAGE
// ─────────────────────────────────────────────────────────────────────────────

export function showMonsterDamage(monsterId, damage, isCrit) {
  const m = monsters.find(x => x.id === monsterId);
  if (!m || !m.mesh) return;

  // We use a wrapper div because CSS2DObject takes control of the element's transform.
  // If we animate 'transform' on the same element, they fight and the world-position 
  // following breaks. By animating only the inner div, we keep the follow-logic.
  const wrapper = document.createElement('div');
  wrapper.className = 'monster-damage-wrapper';

  const inner = document.createElement('div');
  inner.className = 'monster-damage-popup' + (isCrit ? ' damage-popup--crit' : '');
  inner.textContent = damage;
  wrapper.appendChild(inner);

  const label = new CSS2DObject(wrapper);
  // Place it near mid-body (HP bar is 1.8) so it can float up through the model
  label.position.set(0, 1.5, 0);
  m.mesh.add(label);

  setTimeout(() => {
    if (m.mesh) m.mesh.remove(label);
  }, 850);
}

export function hitMonster(monsterId, finalDamage, attackType, isCrit = false, killer = null) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return { hit: false, damage: 0, killed: false, monsterHp: 0 };

  // Any hit — including ranged — triggers the monster to chase if it survives.
  // If this is the first hit on a fresh monster (not already engaged) and we're
  // not currently mid-combat, this marks the start of a new fight — reset stats.
  const wasEngaged = m.engaged;
  if (m.name !== 'Training Dummy') m.engaged = true;
  if (!wasEngaged && !isInCombat() && m.name !== 'Training Dummy') {
    resetBattleStats(m.name);
  }

  // ── Skeleton Shield Block ──────────────────────────────────────────────────
  if (m.name.includes('Skeleton') && attackType !== 'poison-dot' && attackType !== 'fireball') {
    if (Math.random() <= 0.10) {
      addLogEntry({
        time: Date.now(), actor: 'player',
        attacker: killer || 'Player', target: m.name,
        attackType: attackType || 'attack', hitChance: 1, hit: true, crit: false,
        blocked: true,
      });

      if (m.name !== 'Training Dummy') {
        setInCombat();
      }

      // Sync visual/audio feedback with the action animation
      const delay = (attackType === 'poison-dot') ? 0 : 250;
      setTimeout(() => {
        if (!m.mesh) return;

        playShieldBlockSound();

        // UI Feedback for block
        const wrapper = document.createElement('div');
        wrapper.className = 'monster-damage-wrapper';
        const inner = document.createElement('div');
        inner.className = 'monster-damage-popup';
        inner.style.color = '#a0d8ff';
        inner.style.fontSize = '12px';
        inner.textContent = 'BLOCKED';
        wrapper.appendChild(inner);

        const label = new CSS2DObject(wrapper);
        label.position.set(0, 1.5, 0); // Above mid-body
        m.mesh.add(label);
        setTimeout(() => { if (m.mesh) m.mesh.remove(label); }, 850);

        _playBlockAnimation(m);
      }, delay);

      return { hit: false, damage: 0, killed: false, monsterHp: m.hp, blocked: true };
    }
  }

  const damage = Math.max(1, finalDamage);
  const hpBefore = m.hp;
  m.hp = Math.max(0, m.hp - damage);
  const hpAfter = m.hp;
  const killedByThisHit = (hpBefore > 0 && hpAfter === 0);

  // Any direct hit wakes a sleeping monster immediately
  if (attackType !== 'poison-dot' && m.activeDebuffs?.some(d => d.effectId === 'sleep')) {
    m.activeDebuffs = m.activeDebuffs.filter(d => d.effectId !== 'sleep');
    if (m.sleepLabel) m.sleepLabel.visible = false;
  }

  // Treeman "Awakening of the Woods" — triggers once when HP drops below 50%
  if (m.name === 'Treeman' && !m._awakeningUsed && m.alive
    && hpBefore > m.hpMax / 2 && hpAfter <= m.hpMax / 2 && _sceneRef) {
    _triggerTreemanAwakening(m, _sceneRef);
  }

  if (killedByThisHit) {
    m.alive = false;
  }

  // Track damage dealt for battle summary (Training Dummy excluded)
  if (killer && m.name !== 'Training Dummy') {
    recordDamageDealt(killer, damage);
  }

  // Sync visual/audio feedback with the action animation
  const delay = (attackType === 'poison-dot') ? 0 : 250;

  setTimeout(() => {
    if (!m.mesh) return; // Safeguard if level changed or monster destroyed

    if (attackType !== 'poison-dot') {
      playHitSound();
    }

    if (isCrit) {
      playCritSound(attackType);
    }

    showMonsterDamage(monsterId, damage, isCrit);

    // Update the HP bar above the monster's head
    if (m.hpBarFill) {
      const pct = m.hpMax > 0 ? (hpAfter / m.hpMax) * 100 : 0;
      m.hpBarFill.style.width = `${pct}%`;
    }

    if (m.statsLabel?.visible) _updateStatsPanel(m);

    if (m.name !== 'Training Dummy') {
      setInCombat();
    }

    if (killedByThisHit) {
      if (!getInRangeMonster()) clearCombat();
      playActionSound('death');

      // ── Drop table roll ─────────────────────────────────────────────────────
      // Roll each entry in the monster's drops table independently.
      const droppedItems = [];
      if (m.drops && m.drops.length > 0) {
        for (const drop of m.drops) {
          if (Math.random() < drop.chance) {
            droppedItems.push(drop.item);
          }
        }
      }

      if (m.name === 'Treeman') {
        setZoneMusic('/sounds/backing/demon-room.mp3');
      }

      spawnCorpse(m.gridCol, m.gridRow, droppedItems);
      if (m.hpBarFill) m.hpBarFill.parentElement.style.display = 'none';
      addLogEntry({ type: 'death', target: m.name, killer, damage, time: Date.now() });

      // Show battle summary icon now that the fight is over
      showBattleStatsIcon(m.name);

      // ── Award XP to living party members ──────────────────────────────────
      if (m.xp > 0) awardXP(m.xp);

      _playDeathAnimation(m);
    } else {
      _playHitAnimation(m, attackType, killer);
    }
  }, delay);

  return { hit: true, damage, killed: killedByThisHit, monsterHp: m.hp };
}

export function attackMonster(monsterId, character, weaponDef, attackType, ammoDef = null) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return { hit: false, damage: 0, killed: false, monsterHp: 0, crit: false, hitChance: 0, formula: null, monsterName: '' };

  // Apply status effect stat modifiers to the attacker's stats for this attack
  const effChar = { ...character, stats: getEffectiveStats(character) };

  let hitChance = playerHitChance(effChar, m, weaponDef);

  // True Shot: Never miss with ranged attacks
  const ts = skillsState.trueShot;
  const isRanged = attackType === 'shoot' || attackType === 'throw'; // assuming throw might also be ranged
  if (ts?.active && ts.actorName === character.name && isRanged) {
    hitChance = 1.0;
  }

  // DEX-based hit chance — higher DEX advantage means more reliable hits
  if (Math.random() >= hitChance) {
    return { hit: false, damage: 0, killed: false, monsterHp: m.hp, crit: false, hitChance, formula: null, monsterName: m.name };
  }

  // Fireball uses INT + monster magic resilience; all other attacks use STR + monster defence
  const isMagic = attackType === 'fireball';

  // Apply Sunder Armor penalty
  const isSundered = skillsState.sunderArmor?.active && skillsState.sunderArmor?.targetId === m.id;
  const sunderMag = skillsState.sunderArmor.magnitude;
  const effectiveDefence = isSundered ? Math.floor((m.defence ?? 0) * sunderMag) : (m.defence ?? 0);
  const effectiveResilience = isSundered ? Math.floor((m.stats?.resilience ?? 0) * sunderMag) : (m.stats?.resilience ?? 0);

  const mSunder = {
    ...m,
    defence: effectiveDefence,
    stats: { ...m.stats, resilience: effectiveResilience }
  };

  const preCritDamage = isMagic
    ? calcPlayerMagicDamage(effChar, weaponDef, mSunder)
    : calcPlayerPhysicalDamage(effChar, weaponDef, mSunder, ammoDef);

  // 5% chance to critically hit — triples the calculated damage
  const isCrit = Math.random() < CRIT_CHANCE;
  let damage = isCrit ? Math.round(preCritDamage * CRIT_MULTIPLIER) : preCritDamage;

  // Runic Scholar — doubles final spell damage after ALL other modifiers (including crit)
  const runicActive = isMagic && character.runicScholarActive;
  if (runicActive) {
    damage = damage * character.runicScholarMagnitude;
    character.runicScholarActive = false; // consume the buff
    refreshPartyCards();                  // remove the glow from the skill slot
  }

  // Berserk — applies a x1.2 damage multiplier after everything else
  const berserkActive = skillsState.berserk?.active && skillsState.berserk?.actorName === character.name;
  if (berserkActive) {
    damage = Math.round(damage * skillsState.berserk.magnitude);
  }

  // Warcry — applies a x1.1 damage multiplier to all party members
  if (skillsState.warcry?.active) {
    damage = Math.round(damage * skillsState.warcry.magnitude);
  }

  // Compute the weighted stat bonus and label for the battle log (uses effective stats)
  let formulaStatBonus;
  let statLabel;
  if (isMagic) {
    formulaStatBonus = effChar.stats?.intelligence ?? 10;
    statLabel = 'INT';
  } else {
    const intW = weaponDef?.statWeights?.intelligence ?? 0.0;
    const vitW = weaponDef?.statWeights?.vitality ?? 0.0;
    const resW = weaponDef?.statWeights?.resilience ?? 0.0;
    const strW = weaponDef?.statWeights?.str ?? 1.0;
    const dexW = weaponDef?.statWeights?.dex ?? 0.0;
    formulaStatBonus = Math.floor(
      (effChar.stats?.strength ?? 10) * strW +
      (effChar.stats?.dexterity ?? 10) * dexW +
      (effChar.stats?.intelligence ?? 10) * intW +
      (effChar.stats?.vitality ?? 10) * vitW +
      (effChar.stats?.resilience ?? 10) * resW
    );
    const labels = [];
    if (strW > 0) labels.push('STR');
    if (dexW > 0) labels.push('DEX');
    if (intW > 0) labels.push('INT');
    if (vitW > 0) labels.push('VIT');
    if (resW > 0) labels.push('RES');
    statLabel = labels.join('+') || 'NONE';
  }

  const formula = {
    weaponBase: weaponDef?.baseDamage ?? 0,
    statBonus: formulaStatBonus,
    statLabel,
    mitigation: isMagic ? effectiveResilience : effectiveDefence,
    preCritDamage,
    critMultiplier: isCrit ? CRIT_MULTIPLIER : 1,
    runicScholar: runicActive,
    berserkMultiplier: berserkActive ? 1.2 : 1.0,
    warcryMultiplier: skillsState.warcry?.active ? 1.1 : 1.0,
    ammoModifier: ammoDef?.damageModifier ?? null,
  };

  const result = hitMonster(monsterId, damage, attackType, isCrit, character.name);

  let stunned = false;
  if (attackType === 'shield-bash' && result.hit && !result.killed) {
    if (Math.random() < SHIELD_BASH_STUN_CHANCE) {
      stunned = true;
      m.stunUntil = performance.now() + SHIELD_BASH_STUN_DURATION_MS;
      showMessage(`${m.name} is stunned by the shield bash!`);
      if (m.statsLabel?.visible) _updateStatsPanel(m);
      setTimeout(() => { if (m.statsLabel?.visible) _updateStatsPanel(m); }, SHIELD_BASH_STUN_DURATION_MS); // refresh UI when it drops
    }
  }

  // Apply on-hit status effects from weapon and ammo (data-driven)
  const appliedEffects = [];
  if (result.hit && !result.killed) {
    const allOnHit = [
      ...(weaponDef?.onHitEffects ?? []),
      ...(ammoDef?.onHitEffects ?? []),
    ];
    allOnHit.forEach(effect => {
      if (Math.random() < calcOnHitChance(effect.chance, m.stats?.resilience ?? 0, null, effect.effectId)) {
        applyMonsterStatusEffect(monsterId, effect.effectId, character.name);
        const def = STATUS_EFFECT_DEFS[effect.effectId];
        showMessage(`${m.name} is afflicted with <b>${def?.name ?? effect.effectId}</b>!`);
        appliedEffects.push(effect.effectId);
      }
    });

    // Vampiric Dagger effect
    if (weaponDef?.name === 'Vampiric Dagger') {
      const pIndex = party.findIndex(p => p.name === character.name);
      if (pIndex !== -1) {
        const p = party[pIndex];
        if (p && !p.isDead && p.hp < p.hpMax) {
          setHp(pIndex, p.hp + 1);
          showMemberHeal(pIndex, 1);
        }
      }
    }
  }
  const poisoned = appliedEffects.includes('poison');

  return { ...result, crit: isCrit, hitChance, formula, monsterName: m.name, stunned, poisoned, sundered: isSundered, appliedEffects };
}

export function triggerMonsterAttack(monsterId) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m || m.name === 'Training Dummy') return;

  setInCombat();

  // ── Pick attack variant (or fall back to single attack) ──
  let attackAction, soundTimings, damageTimings, attackSound, activeVariant;

  if (m.attackVariants && m.attackVariants.length > 0) {
    const variant = _pickWeightedVariant(m.attackVariants);
    if (variant) {
      attackAction = variant.action;
      soundTimings = variant.soundTimings;
      damageTimings = variant.damageTimings;
      attackSound = variant.sound;
      activeVariant = variant;

      if (variant.name === 'iceCast' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createIceBurst(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> conjures a freezing blizzard!`, 2000);
      }
      if (variant.name === 'natureCast' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createNatureBurst(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> unleashes a nature surge!`, 2000);
      }
      if (variant.name === 'doubleCombo' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.3;
        setTimeout(() => { if (m.alive) createOgreSlam(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> unleashes a furious double strike!`, 2000);
      }
      if (variant.name === 'minotaurRage' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createMinotaurRage(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> roars with terrifying fury!`, 2000);
      }
      if (variant.name === 'demonCleave' && m.mesh) {
        const duration = attackAction.getClip().duration;
        const pts = (damageTimings && damageTimings.length > 0) ? damageTimings[0] : 0.5;
        setTimeout(() => { if (m.alive) createDemonCleave(m.mesh.position); }, duration * pts * 1000);
        showMessage(`<b>${m.name}</b> unleashes a nightmarish cleave!`, 2000);
      }
    }
  }
  // Legacy fallback
  if (!attackAction) {
    attackAction = m.actions.attack;
    soundTimings = null;
    damageTimings = null;
    attackSound = m.attackSound;

  }

  if (attackAction && m.actions.idle) {
    attackAction.reset();
    attackAction.setEffectiveTimeScale(1);
    attackAction.setEffectiveWeight(1);
    attackAction.play();
    const fromAction = (m.actions.walk && m._animState === 'walk') ? m.actions.walk : m.actions.idle;
    fromAction.crossFadeTo(attackAction, 0.2, true);

    // ── Sound scheduling ──
    if (attackSound) {
      const _playAttackSound = () => {
        const audio = new Audio(attackSound);
        audio.volume = 0.8;
        audio.play().catch(e => console.warn('Audio play prevented:', e));
      };
      if (soundTimings && soundTimings.length > 0) {
        const clipDuration = attackAction.getClip().duration;
        soundTimings.forEach(t => {
          setTimeout(_playAttackSound, clipDuration * t * 1000);
        });
      } else {
        _playAttackSound();
      }
    }

    // ── Damage scheduling ──
    if (damageTimings && damageTimings.length > 0) {
      const clipDuration = attackAction.getClip().duration;
      damageTimings.forEach(t => {
        setTimeout(() => {
          if (activeVariant?.specialAttack) {
            _applyMonsterSpecialAttack(m, activeVariant);
          } else {
            _applyMonsterDamage(m);
          }
        }, clipDuration * t * 1000);
      });
    } else {
      setTimeout(() => { _applyMonsterDamage(m); }, 300);
    }
  } else {
    // No animation — still apply damage
    setTimeout(() => { _applyMonsterDamage(m); }, 300);
  }
}

// Applies a monster's special attack.
// Default (AoE): hits all alive party members simultaneously.
// 'randomAny': picks one random alive member (ignoring formation).
// Uses variant.specialOnHitEffects to override the normal onHitEffects for the hit.
function _applyMonsterSpecialAttack(monster, variant) {
  const aliveMembers = party.filter(m => m && !m.isEmpty && !m.isDead);
  if (aliveMembers.length === 0) return;

  const effectsOverride = variant.specialOnHitEffects ?? null;

  if (variant.specialAttackType === 'randomAny') {
    // Pick one random alive party member (ignoring formation rules)
    const target = aliveMembers[Math.floor(Math.random() * aliveMembers.length)];
    _applyMonsterDamage(monster, {
      forceTarget: target,
      onHitEffectsOverride: effectsOverride,
      damageMultiplier: variant.damageMultiplier ?? 1,
    });
  } else {
    // Default AoE: hit all alive members
    aliveMembers.forEach(target => {
      _applyMonsterDamage(monster, { forceTarget: target, onHitEffectsOverride: effectsOverride });
    });
  }
}

function _applyMonsterDamage(monster, opts = {}) {
  // opts.forceTarget — bypass directional targeting (used for special/AoE attacks)
  // opts.onHitEffectsOverride — replace monster.onHitEffects for this hit
  // opts.damageMultiplier — multiply base damage (e.g. 2 for ogre double combo)
  const { forceTarget, onHitEffectsOverride, damageMultiplier } = opts;
  const isSpecial = forceTarget !== undefined;

  // Target whoever is on the face of the formation the monster is attacking from.
  // Falls back to any alive member if that face is completely wiped.
  const target = forceTarget ?? pickDirectionalTarget(party, monster, player.facing, player.gridRow, player.gridCol);
  if (!target) return;   // entire party wiped

  // Apply status effect stat modifiers to the target for this damage calculation
  const effTarget = { ...target, stats: getEffectiveStats(target) };

  // DEX-based hit chance — nimble characters are harder for slow monsters to land on
  const hitChance = monsterHitChance(monster, effTarget);
  if (Math.random() >= hitChance) {
    addLogEntry({
      time: Date.now(), actor: 'monster',
      attacker: monster.name, target: target.name,
      attackType: isSpecial ? 'special' : 'attack', hitChance, hit: false, crit: false,
    });
    return;
  }

  // Shield Block Check
  let blocked = false;
  const leftItem = target.equipment?.leftHand ? getItemDef(target.equipment.leftHand.name) : null;
  const rightItem = target.equipment?.rightHand ? getItemDef(target.equipment.rightHand.name) : null;

  const hasShield = leftItem?.weaponType === 'shield' || rightItem?.weaponType === 'shield';
  let shieldMasterBlockBonus = 0;
  if (hasShield && target.skills) {
    target.skills.forEach(skill => {
      const name = typeof skill === 'string' ? skill : skill.name;
      const skillDef = SKILLS_DATA[name];
      if (skillDef?.isPassive && skillDef.effectType === 'shieldMasterBonus') {
        shieldMasterBlockBonus += skillDef.blockChanceBonus ?? 0;
      }
    });
  }

  const blockChance = Math.max(
    leftItem?.blockChance ?? 0,
    rightItem?.blockChance ?? 0
  ) + shieldMasterBlockBonus;

  if (blockChance > 0 && Math.random() * 100 < blockChance) {
    blocked = true;
  }

  if (blocked) {
    addLogEntry({
      time: Date.now(), actor: 'monster',
      attacker: monster.name, target: target.name,
      attackType: isSpecial ? 'special' : 'attack', hitChance, hit: true, crit: false,
      blocked: true,
    });

    // Shield block sound
    playShieldBlockSound();

    // UI Feedback for block
    const memberTop = document.querySelector(`#member-${target.id} .member-top`);
    if (memberTop) {
      const popup = document.createElement('span');
      popup.className = 'damage-popup damage-popup--incoming';
      popup.style.color = '#a0d8ff';
      popup.textContent = 'BLOCKED';
      memberTop.appendChild(popup);
      setTimeout(() => popup.remove(), 900);
    }

    return;
  }

  // Calculate character's total physical defence from equipped armour + status effect modifiers
  let charDefence = 0;
  const _counted = new Set();
  Object.values(target.equipment ?? {}).forEach(item => {
    if (item && !_counted.has(item)) {
      _counted.add(item);
      const itemDef = getItemDef(item.name);
      if (itemDef?.defence) charDefence += itemDef.defence;
    }
  });
  if (target.skills) {
    target.skills.forEach(skill => {
      const name = typeof skill === 'string' ? skill : skill.name;
      const skillDef = SKILLS_DATA[name];
      if (skillDef?.isPassive && skillDef.effectType === 'shieldMasterBonus') {
        charDefence += skillDef.defenceBonus ?? 0;
      }
    });
  }
  charDefence = Math.max(0, charDefence + getDefenceModifier(target));
  const rampartActive = skillsState.rampart.active && skillsState.rampart.actorName === target.name && performance.now() < skillsState.rampart.expiresAt;
  if (rampartActive) {
    charDefence *= (skillsState.rampart.magnitude || 2);
  }

  const baseDamage = calcMonsterDamage(monster, effTarget, charDefence);
  const preCritDamage = damageMultiplier ? Math.round(baseDamage * damageMultiplier) : baseDamage;
  const resMitigation = Math.floor((effTarget.stats?.resilience ?? 0) * RESILIENCE_DAMAGE_FACTOR);

  // 5% chance to critically hit — triples the calculated damage
  const isCrit = Math.random() < CRIT_CHANCE;
  let damage = isCrit ? Math.round(preCritDamage * CRIT_MULTIPLIER) : preCritDamage;

  // Sanctuary buff — reduces all incoming party damage by a percentage.
  // magnitude is stored as a percentage (e.g. 10 = 10% reduction), capped at 100%.
  const sanctuaryUp = skillsState.sanctuary.active &&
    performance.now() < skillsState.sanctuary.expiresAt;
  if (sanctuaryUp) {
    const reductionMultiplier = 1 - Math.min(skillsState.sanctuary.magnitude, 100) / 100;
    damage = Math.max(1, Math.floor(damage * reductionMultiplier));
  }

  setHp(target.id, target.hp - damage);
  flashPortraitHit(target.id);
  playPartyHitSound();
  if (isCrit) playCritSound('bash');

  // Track damage taken for battle summary
  recordDamageTaken(target.name, damage);

  // Float the damage number above the character's portrait
  showMemberDamage(target.id, damage, isCrit);

  addLogEntry({
    time: Date.now(), actor: 'monster',
    attacker: monster.name, target: target.name,
    attackType: isSpecial ? 'special' : 'attack', hitChance, hit: true, crit: isCrit,
    statBonus: monster.stats?.strength ?? 10,
    baseBonus: MONSTER_BASE_ATTACK,
    mitigation: resMitigation,
    defenceMitigation: charDefence,
    preCritDamage,
    finalDamage: damage,
    critMultiplier: isCrit ? CRIT_MULTIPLIER : 1,
  });

  // Apply on-hit status effects defined on this monster type (or override for special attacks)
  if (!target.isDead) {
    (onHitEffectsOverride ?? monster.onHitEffects ?? []).forEach(effect => {
      const effectiveChance = calcOnHitChance(
        effect.chance,
        target.stats?.resilience ?? 0,
        getEffectiveStatusResistances(target),
        effect.effectId,
      );
      if (Math.random() < effectiveChance) {
        applyStatusEffect(target.id, effect.effectId, null, effect.durationSec);
        const def = STATUS_EFFECT_DEFS[effect.effectId];
        showMessage(`<b>${target.name}</b> is afflicted with <b>${def?.name ?? effect.effectId}</b>!`, 2500);
        addLogEntry({
          time: Date.now(),
          type: 'status-effect',
          actor: 'monster',
          attacker: monster.name,
          target: target.name,
          effectId: effect.effectId,
          effectName: def?.name ?? effect.effectId,
          effectColor: def?.color ?? null,
        });
      }
    });
  }

  // Only announce a kill — routine damage is shown on the portrait popup
  if (target.isDead) {
    showMessage(`<b>${target.name}</b> HAS FALLEN!`, 3500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HIT / DEATH TWEENS
// ─────────────────────────────────────────────────────────────────────────────

function _playBlockAnimation(m) {
  if (!m.mesh) return;
  const mesh = m.mesh;

  if (m.mixer && m.actions.block) {
    if (m.actions.hit && m.actions.hit.isRunning()) m.actions.hit.stop();
    if (m.actions.attack && m.actions.attack.isRunning()) m.actions.attack.stop();

    const currentAction = (m.actions.walk && m._animState === 'walk') ? m.actions.walk : m.actions.idle;
    if (currentAction && currentAction.isRunning()) {
      m.actions.block.reset().play();
      currentAction.crossFadeTo(m.actions.block, 0.1, true);
    } else {
      m.actions.block.reset().play();
    }
  }

  // Small defensive knockback for visual weight
  const origin = { z: mesh.position.z };
  new Tween(mesh.position, tweenGroup)
    .to({ z: origin.z + 0.05 }, 60)
    .easing(Easing.Quadratic.Out)
    .chain(
      new Tween(mesh.position, tweenGroup)
        .to({ z: origin.z }, 100)
        .easing(Easing.Quadratic.In)
    )
    .start();
}

function _playHitAnimation(m, attackType, killer) {
  if (!m.mesh) return;
  const mesh = m.mesh;

  if (m.name === 'Training Dummy') {
    // Only trigger for recruits (party members)
    const isRecruit = killer && party.some(p => p.name === killer);
    if (isRecruit && m.mixer && m.actions.attack) {
      m.actions.attack.stop(); // Stop anything current
      m.actions.attack.reset().play();
    }
    return; // Skip standard red flash/knockback for dummy
  }

  if (attackType === 'fireball') {
    createHitSpark(mesh.position);
  }

  // Standard hit flash and knockback logic below...

  if (m.mixer && m.actions.hit) {
    // If there are moving/idle animations, crossfade from the current one to hit
    const currentAction = (m.actions.walk && m._animState === 'walk') ? m.actions.walk : m.actions.idle;
    if (currentAction) {
      m.actions.hit.reset().play();
      currentAction.crossFadeTo(m.actions.hit, 0.1, true);
    } else {
      m.actions.hit.reset().play();
    }
  }

  // Flash red on emissive channel (or green for poison)
  mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(mat => {
        if (mat.emissive) {
          const origEmissive = mat.emissive.getHex();
          if (attackType === 'poison-dot') {
            mat.emissive.setHex(0x00aa00);
          } else {
            mat.emissive.setHex(0xaa0000);
          }
          setTimeout(() => { mat.emissive.setHex(origEmissive); }, 150);
        }
      });
    }
  });

  // Small knockback
  const origin = { z: mesh.position.z };
  new Tween(mesh.position, tweenGroup)
    .to({ z: origin.z + 0.18 }, 80)
    .easing(Easing.Quadratic.Out)
    .chain(
      new Tween(mesh.position, tweenGroup)
        .to({ z: origin.z }, 120)
        .easing(Easing.Quadratic.In)
    )
    .start();
}

function _playDeathAnimation(m) {
  if (!m.mesh) return;
  const mesh = m.mesh;

  if (m.actions.death) {
    if (m.actions.idle) m.actions.idle.stop();
    if (m.actions.walk) m.actions.walk.stop();
    if (m.actions.attack) m.actions.attack.stop();
    m.actions.death.reset().play();

    // Still perform the sinking/fade-out but delayed to allow animation to play
    setTimeout(() => {
      _startFadeOut(m);
    }, 1000);
  } else {
    _startFadeOut(m);
  }
}

function _startFadeOut(m) {
  if (!m.mesh) return;
  const mesh = m.mesh;
  const startY = mesh.position.y;
  const fadeObj = { y: startY, opacity: 1 };

  new Tween(fadeObj, tweenGroup)
    .to({ y: startY - 0.9, opacity: 0 }, 900)
    .easing(Easing.Quadratic.In)
    .onUpdate(() => {
      mesh.position.y = fadeObj.y;
      mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(mat => {
            mat.transparent = true;
            mat.opacity = fadeObj.opacity;
            mat.depthWrite = false;
          });
        }
      });
    })
    .onComplete(() => {
      if (mesh.parent) mesh.parent.remove(mesh);
      m.mesh = null;
    })
    .start();
}
