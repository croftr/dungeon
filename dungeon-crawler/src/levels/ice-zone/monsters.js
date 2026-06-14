import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';
import { ICE_ZONE_LEVEL } from '../../map.js';

// ─────────────────────────────────────────────────────────────────────────────
//  ICE ZONE (level 71) monsters — only loaded while the party is in the zone.
//  Three Icemen and three Ice Mushrooms spread through the central hall + spine.
//  Asset wiring mirrors the Level 2 Iceman / Ice Mushroom spawns.
// ─────────────────────────────────────────────────────────────────────────────

const _iceman = (id, row, col) =>
  inst(D.iceman, id, row, col,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Walking_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb'),
    asset('/monsters/iceMan-animation/iceman-attack.mp3'), 0.6, 0, 0, ICE_ZONE_LEVEL, null,
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Dead_withSkin.glb'),
    asset('/monsters/iceMan-animation/Meshy_AI_Animation_Hit_Reaction_1_withSkin.glb'));

const _iceMushroom = (id, row, col) =>
  inst(D.ice_mushroom, id, row, col,
    asset('/monsters/ice-mushroom/idle.glb'),
    asset('/monsters/ice-mushroom/standard-attack.glb'),
    asset('/monsters/ice-mushroom/standard-attack.mp3'), 0.45, 0, 0, ICE_ZONE_LEVEL, null,
    asset('/monsters/ice-mushroom/dead.glb'),
    null,
    asset('/monsters/ice-mushroom/walk.glb'),
    null,
    asset('/monsters/ice-mushroom/combat-idle.glb'));

export const iceZoneMonsters = [
  // Icemen — west hall, east hall, and the spine just north of the hall
  _iceman(7100, 8, 3),
  _iceman(7101, 8, 11),
  _iceman(7102, 6, 7),
  // Ice Mushrooms — scattered through the hall and the south spine
  _iceMushroom(7103, 7, 5),
  _iceMushroom(7104, 9, 9),
  _iceMushroom(7105, 10, 7),
];
