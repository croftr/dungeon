import { inst } from '../../monster-factory.js';
import { MONSTER_DEFS as D } from '../../monster-defs.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 4 – The Forgotten Vault
//
//  Vault room   (rows 1–5, cols 6–14):   4 hellspawn patrol the northern half.
//  W-connector  (rows 6–16, col 1):      1 hellspawn patrols the narrow corridor.
//  East passage (row 4, cols 21–27):     1 hellspawn patrols the east approach.
//  East passage (row 4, cols 15–23):     1 hellspawn patrols the inner stretch.
//  West boss rm (rows 17–25, cols 0–10): Lizard Man — the lair boss.
//  East boss rm (rows 1–9, cols 28–32):  Demon Ogre — the vault guardian.
// ─────────────────────────────────────────────────────────────────────────────

function _makeDemonSpawn(id, row, col, bounds) {
  const m = inst(D.demon_spawn, id, row, col,
    asset('/monsters/demon-spawn/idle-2.glb'),
    asset('/monsters/demon-spawn/basic-attack.glb'),
    asset('/monsters/demon-spawn/demon-spawn-attacl.mp3'),
    0.4, 0, 0, 4,
    bounds ?? { bounds: { minRow: 1, maxRow: 5, minCol: 6, maxCol: 14 }, speed: 0.5, waitTime: 1.5 },
    asset('/monsters/demon-spawn/dead.glb'),
    asset('/monsters/demon-spawn/getting-hit.glb'),
    asset('/monsters/demon-spawn/walking.glb'),
  );
  m.tauntSound = asset('/monsters/demon-spawn/evil-laugh.mp3');
  return m;
}

export const level4Monsters = [
  // ── Vault room hellspawn – northern half (rows 1–2, cols 8 & 12) ──────────
  _makeDemonSpawn(402, 1, 8),
  _makeDemonSpawn(403, 1, 12),
  _makeDemonSpawn(404, 2, 8),
  _makeDemonSpawn(405, 2, 12),

  // ── West connector hellspawn – patrols the narrow south corridor ──────────
  _makeDemonSpawn(406, 11, 1,
    { bounds: { minRow: 6, maxRow: 16, minCol: 0, maxCol: 2 }, speed: 0.5, waitTime: 2.0 }),

  // ── East inner passage hellspawn – patrols cols 15–23, row 4 ─────────────
  _makeDemonSpawn(407, 4, 18,
    { bounds: { minRow: 3, maxRow: 5, minCol: 15, maxCol: 23 }, speed: 0.5, waitTime: 1.8 }),

  // ── East connector hellspawn – patrols the approach to the east boss rm ───
  _makeDemonSpawn(408, 4, 25,
    { bounds: { minRow: 3, maxRow: 5, minCol: 21, maxCol: 28 }, speed: 0.5, waitTime: 1.5 }),

  // ── West boss room — Lizard Man lair (rows 17–25, cols 0–10) ─────────────
  inst(D.lizardMan, 400, 21, 5,
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Walking_withSkin.glb'),
    asset('/monsters/lizard-man/standard-attack1.glb'),
    asset('/monsters/lizard-man/lizard-normal-attack.mp3'), 0.6, 0, 0, 4,
    { bounds: { minRow: 17, maxRow: 25, minCol: 0, maxCol: 10 }, speed: 0.5, waitTime: 2.0 },
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Dead_withSkin.glb'),
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Face_Punch_Reaction_withSkin.glb'),
    asset('/monsters/lizard-man/Meshy_AI_Galactic_Entity_Adven_biped_Animation_Walking_withSkin.glb')),

  // ── East boss room — Demon Ogre lair (rows 1–9, cols 28–32) ──────────────
  inst(D.demon_ogre, 401, 5, 30,
    asset('/monsters/demon-ogre/idle.glb'),
    asset('/monsters/demon-ogre/standard-attack.glb'),
    asset('/monsters/demon-ogre/standard-attack.mp3'),
    0.7, 0, 0, 4,
    { bounds: { minRow: 1, maxRow: 9, minCol: 28, maxCol: 32 }, speed: 0.4, waitTime: 3.0 },
    asset('/monsters/demon-ogre/dying.glb'),
    asset('/monsters/demon-ogre/getting-hit.glb'),
    asset('/monsters/demon-ogre/walking.glb'),
    null,
    asset('/monsters/demon-ogre/combat-idle.glb')
  ),
];
