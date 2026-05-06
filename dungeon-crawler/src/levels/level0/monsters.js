import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 0 – The Starter Room
//  Only the training dummy lives here — no combat monsters.
// ─────────────────────────────────────────────────────────────────────────────

const _dummy = inst(D.dummy, 10, 7, 23,
    null, // no idle animation — dummy stands still
    asset('/monsters/dummy-annimation/dummy-attack.glb'),
    null, 0.5, 0, 0, 0, // level = 0
    null, // patrol
    null, // glbDeath
    asset('/monsters/dummy-annimation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb')); // glbHit

// Dev-tool fields for the Training Console (not persisted across reloads)
_dummy.faceSouth = true;
_dummy.combatMode = false;
_dummy.drainStamina = false;
_dummy.originalStats = { ...D.dummy.stats };
_dummy.originalAttackSpeed = D.dummy.attackSpeed;

const _ironWarden = inst(D.iron_warden, 11, 11, 21,
    asset('/monsters/iron-warden/idle.glb'),
    asset('/monsters/iron-warden/standard-attack.glb'),
    asset('/monsters/iron-warden/attack-sound.mp3'),
    0.45, 0, 0, 0,
    null, // patrol
    asset('/monsters/iron-warden/dying.glb'),
    asset('/monsters/iron-warden/getting-hit.glb'),
    asset('/monsters/iron-warden/walking.glb'),
    null, // glbIdleAlt
    asset('/monsters/iron-warden/combat-idle.glb'));

const _rabbit = inst(D.rabbit, 12, 11, 18,
    asset('/monsters/rabbit/Meshy_AI_Iron_Hoof_Warlord_biped_Animation_Walking_withSkin.glb'), // idle
    asset('/monsters/rabbit/Meshy_AI_Iron_Hoof_Warlord_biped_Animation_Triple_Combo_Attack_withSkin.glb'), // attack
    null, 0.35, 0, 0, 1,
    null, // patrol
    null, // glbDeath
    null, // glbHit
    asset('/monsters/rabbit/Meshy_AI_Iron_Hoof_Warlord_biped_Animation_Walking_withSkin.glb')); // walk = idle

export const level0Monsters = [_dummy, _rabbit];
