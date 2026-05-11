// Schematic Trials — a self-contained side zone reached via a portal in
// Level 2's giant room. 14 rows × 15 cols. Player spawns in the central hub
// (row 6, col 7). Four corridors lead to four alcoves, each holding the
// reward chest for one of the four merchant schematic quests.
export const schematicTrialsMap = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 0
  [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1], // row 1  ← N alcove (Savage)
  [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1], // row 2
  [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1], // row 3
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // row 4  ← N corridor
  [1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1], // row 5  ← W & E alcoves
  [1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 1], // row 6  ← hub + spawn (2)
  [1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1], // row 7
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // row 8  ← S corridor
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // row 9
  [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1], // row 10 ← S alcove (Steel)
  [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1], // row 11
  [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1], // row 12
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 13
];
