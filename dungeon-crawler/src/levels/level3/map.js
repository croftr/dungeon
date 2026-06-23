// Level 3 – The Abyssal Crypts (29 rows × 27 cols)
// Swamp Room (rows 1-5, cols 1-18) — NW secret room, accessible via 2-cell passage at col 3
// Passage to Swamp Room (rows 6-7, col 3)
// NW corner room: rows 8-10, cols 2-4
// Minotaur room (rows 14-20, cols 7-10) — shrunk to half size
// Elemental shrine corridor (rows 16-17, cols 11-17) — 2-wide, 6 paired elemental tiles + normal floor end with Red Crystal shrine
// Corner rooms: NW (row 8-10, col 2-4), NE (row 8-10, col 17-19), SW (row 24-26, col 2-4), SE (row 24-26, col 17-19)
// Start (2) at bottom center (row 27, col 11)
// Elemental floor cell IDs: 8=lava, 9=ice, 10=holy, 11=dark, 12=lightning, 13=water
//
// SWAMP CAULDRON (mirrors the Level 2 west-annex cauldron): in the swamp room's far
//   NE corner an alcove is recessed (indented) into the east wall — col 19, rows 2-4.
//   Two torches flank an interactive cauldron there. Feeding it 4 Ancient Bog Core
//   opens the CENTRE grid of the alcove's rear (east) wall at (3,20). A short east
//   passage (row 3, cols 21-22) opens into a small treasure room (rows 2-4, cols
//   23-25). The passage + room are pre-carved as floor but sealed: (3,20) stays a
//   wall until the cauldron is fed (level3CauldronWallOpened flips it — objects.js).
//   The alcove recess walls are left UNtextured (default) on purpose — a distinct
//   wall texture is planned there. The passage + room reuse the swamp floor/wall
//   textures (see applyLevel3Textures in main.js).
//
// FLAME ALCOVE (bottom outer loop): the east tip of the bottom corridor at (25,20)
//   is an open 1-cell alcove whose 3 inner faces (N/S/E) are textured with
//   flame-wall.webp and which holds a swirl portal to the Flame Zone. (Opened by
//   default — see the level3Map[25][20] = 0 assignment below.) The matching ice
//   alcove sits at (19,19) in the east corridor.
// cols:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26
export const level3Map = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  Border
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 1  Swamp Room
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1], // 2  Swamp Room + alcove (col 19) + treasure room (cols 23-25)
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], // 3  Swamp Room + cauldron (col 19); (3,20) SEALED wall opens; passage cols 21-22 → room
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1], // 4  Swamp Room + alcove (col 19) + treasure room (cols 23-25)
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 5  Swamp Room
  [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 6  Passage to Swamp Room
  [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 7  Passage to Swamp Room
  [1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1], // 8
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1], // 9  Outer Loop (Top)
  [1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1], // 10
  [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1,13,13,13, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 11
  [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,13,13,13, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 12
  [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1,13,13,13, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 13
  [1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 14 Minotaur Room Start
  [1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 15
  [1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1, 8, 9,10,11,12,13, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 16 Elemental Room
  [1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 8, 9,10,11,12,13, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 17 Passage(col 11) + Elemental Room
  [1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 18
  [1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 19
  [1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 20 Minotaur Room End
  [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 21 Center Room Entry
  [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 22
  [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 23
  [1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1], // 24
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1], // 25 Outer Loop (Bottom); (25,20) open flame alcove (portal) — see assignment below
  [1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1], // 26
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 2, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 27 Start Chamber
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 28
];

// ── East Crystal Bridge ──────────────────────────────────────────────────────
// A thin open-air bridge heads east out of the elemental-shrine corridor's end
// (the old Red Crystal egg spot at col 18, row 16) across a black chasm into a
// small room that now holds the egg. Bridge = CELL_BRIDGE (15, floor + creak,
// no ceiling); chasm = CELL_CHASM (14, lethal void — step off and the party
// falls to its death). (17,19) is left a wall lip so the 2-wide shrine's south
// row doesn't open straight onto the void. Cell ids mirror map.js: 0 = floor.
{
  const FLOOR = 0, CHASM = 14, BRIDGE = 15;
  // Bridge (row 16, cols 19-21).
  for (let c = 19; c <= 21; c++) level3Map[16][c] = BRIDGE;
  // Chasm flanking the bridge: north (row 15, cols 19-21) + south (row 17, cols 20-21).
  for (let c = 19; c <= 21; c++) level3Map[15][c] = CHASM;
  level3Map[17][20] = CHASM;
  level3Map[17][21] = CHASM;
  // Door (row 16, col 22) into the far room (rows 15-17, cols 23-25).
  level3Map[16][22] = FLOOR;
  for (let r = 15; r <= 17; r++) {
    for (let c = 23; c <= 25; c++) level3Map[r][c] = FLOOR;
  }
}

// ── Elemental realm alcoves ───────────────────────────────────────────────────
// The flame alcove (25,20) and ice alcove (19,19) are open from the start — each
// is a 1-cell recess off a corridor whose 3 inner faces carry flame-/ice-wall
// textures (painted in applyLevel3Textures) and holds a swirl portal to the
// Flame / Ice Zone (spawned in level3/objects.js). These used to be sealed walls
// fronted by a button; the walls have been removed so the portals stand exposed.
level3Map[25][20] = 0; // flame alcove (bottom corridor)
level3Map[19][19] = 0; // ice alcove (east corridor)
