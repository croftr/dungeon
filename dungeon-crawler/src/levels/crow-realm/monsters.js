import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';
import { CROW_REALM_LEVEL } from '../../map.js';

// ─────────────────────────────────────────────────────────────────────────────
//  CROW REALM (level 60) monsters — only loaded while the party is in the realm.
//  Coordinates match the old in-Level-2 crow region (see crow-realm/map.js).
// ─────────────────────────────────────────────────────────────────────────────

export const crowRealmMonsters = [

  // Crow Wizard — in the bigger room at the east end (row 8, col 55)
  inst(D.crow_wizard, 450, 8, 55,
    asset('/monsters/crow-wizard/idle.glb'),
    asset('/monsters/crow-wizard/standard-attack.glb'),
    asset('/monsters/crow-wizard/standard-attack.mp3'),
    0.5, 0, 0, CROW_REALM_LEVEL, null,
    asset('/monsters/crow-wizard/dead.glb'),
    asset('/monsters/crow-wizard/getting-hit.glb'),
    asset('/monsters/crow-wizard/walking.glb'),
    null,
    asset('/monsters/crow-wizard/combat-idle.glb')),

  // Summoned Crows — four individual crows guarding each of the two small rooms
  // east of the entry room, both before the Crow Wizard's chamber. Each is its
  // own monster (no longer a single quartet formation), arranged in a cross that
  // fills the room and blocks the row-8 passage so the party must clear them.
  //   Small Room 1 (rows 7-9, cols 40-42): N (7,41) S (9,41) W (8,40) E (8,42)
  //   Small Room 2 (rows 7-9, cols 46-48): N (7,47) S (9,47) W (8,46) E (8,48)
  // Weak fodder; rotate through all 4 attack anims. idleYaw nudges them a touch
  // to their own left so they face the party while idle.
  ...[
    [460, 7, 41], [461, 9, 41], [462, 8, 40], [463, 8, 42], // Small Room 1
    [464, 7, 47], [465, 9, 47], [466, 8, 46], [467, 8, 48], // Small Room 2
  ].map(([id, row, col]) =>
    Object.assign(inst(D.summoned_crow, id, row, col,
      asset('/monsters/summoned-crow/idle.glb'),
      asset('/monsters/summoned-crow/attack1.glb'),
      asset('/monsters/summoned-crow/attack.mp3'),
      0.45, 0, 0, CROW_REALM_LEVEL, null,
      asset('/monsters/summoned-crow/dead.glb'),
      null,
      asset('/monsters/summoned-crow/walking.glb'),
      asset('/monsters/summoned-crow/idle2.glb'),
      null), { idleYaw: -0.35 })),
];
