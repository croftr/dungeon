// Level 4 – The Forgotten Vault (12 rows × 11 cols)
// Two rooms connected by a narrow passage with a trap.
//
// Entry room (rows 7–10): player spawns here; contains the ethereal egg
//   (return to level 3) and a blue portal (to level 0 east room).
// Passage (rows 4–6, col 5): single-cell-wide corridor; trap at row 5.
// Vault room (rows 1–3): guarded by a lizard-man; chest with Aether-Glass Silt.
//
// cols:  0  1  2  3  4  5  6  7  8  9 10
export const level4Map = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row  0 – north wall
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // row  1 – vault room
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // row  2 – vault room
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // row  3 – vault room
  [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1], // row  4 – wall + passage opening
  [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1], // row  5 – passage (TRAP here)
  [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1], // row  6 – passage
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // row  7 – entry room
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // row  8 – entry room
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // row  9 – entry room
  [1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1], // row 10 – entry room + Start (2) at col 5
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 11 – south wall
];
