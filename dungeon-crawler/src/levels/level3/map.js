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
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1], // 25 Outer Loop (Bottom)
  [1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1], // 26
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 2, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 27 Start Chamber
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 28
];
