import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 4 – The Forgotten Vault
//  Lizard den   (rows 1–3, cols 0–3):   lizard man patrols here.
//  Vault room   (rows 1–3, cols 6–14):  4 demon spawns patrol here.
//  Demon alcove (rows 3–5, cols 18–19): demon ogre lurks here.
// ─────────────────────────────────────────────────────────────────────────────

function _makeDemonSpawn(id, row, col) {
  const m = inst(D.demon_spawn, id, row, col,
    asset('/monsters/demon-spawn/idle-2.glb'),
    asset('/monsters/demon-spawn/basic-attack.glb'),
    asset('/monsters/demon-spawn/demon-spawn-attacl.mp3'),
    0.4, 0, 0, 4,
    { bounds: { minRow: 1, maxRow: 3, minCol: 6, maxCol: 14 }, speed: 0.5, waitTime: 1.5 },
    asset('/monsters/demon-spawn/dead.glb'),
    asset('/monsters/demon-spawn/getting-hit.glb'),
    asset('/monsters/demon-spawn/walking.glb'),
  );
  m.tauntSound = asset('/monsters/demon-spawn/evil-laugh.mp3');
  return m;
}

export const level4Monsters = [
  // ── Lizard den (west room, cols 0–3) ──────────────────────────────────────
  inst(D.lizardMan, 400, 2, 2,
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Walking_withSkin.glb'),
    asset('/monsters/lizard-man/standard-attack1.glb'),
    asset('/monsters/lizard-man/lizard-normal-attack.mp3'), 0.6, 0, 0, 4,
    { bounds: { minRow: 1, maxRow: 3, minCol: 0, maxCol: 3 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Dead_withSkin.glb'),
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Face_Punch_Reaction_withSkin.glb'),
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Walking_withSkin.glb')),

  // ── Vault room demon spawns (cols 6–14) ───────────────────────────────────
  _makeDemonSpawn(402, 1, 8),
  _makeDemonSpawn(403, 1, 12),
  _makeDemonSpawn(404, 3, 8),
  _makeDemonSpawn(405, 3, 12),

  // ── Demon alcove (cols 18–19) ─────────────────────────────────────────────
  inst(D.demon_ogre, 401, 4, 19,
    asset('/monsters/demon-ogre/idle.glb'),
    asset('/monsters/demon-ogre/standard-attack.glb'),
    asset('/monsters/demon-ogre/standard-attack.mp3'),
    0.7, 0, 0, 4,
    { bounds: { minRow: 3, maxRow: 5, minCol: 18, maxCol: 19 }, speed: 0.4, waitTime: 3.0 },
    asset('/monsters/demon-ogre/dying.glb'),
    asset('/monsters/demon-ogre/getting-hit.glb'),
    asset('/monsters/demon-ogre/walking.glb'),
    null,
    asset('/monsters/demon-ogre/combat-idle.glb')
  ),
];
