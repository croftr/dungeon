// Flame Zone — a self-contained side area reached via the swirl portal on the
// floor of the Level 3 flame alcove (25,20). Built on entry / torn down on exit
// by the standard loadLevel pass, so Level 3 never carries this geometry.
//
// Layout (16 rows × 15 cols), all flame-wall / flame-ceiling textured:
//   • Entry hall (S, rows 12-14, cols 4-10) — party arrives here (start cell 2 at
//     row 13, col 7) with the red return swirl set into the floor.
//   • Three 1-wide corridors (cols 4 / 7 / 10) climb from the entry hall to the
//     central hall, forming a couple of loops.
//   • Central hall (rows 7-9) with a West chamber (cols 1-3) and East chamber
//     (cols 11-13) opening off it.
//   • A portcullis at (6,7) gates the north spine; a button in the hall opens it.
//   • Inner sanctum (N, rows 1-3, cols 5-9) lies behind the gate.
//   • Five lava/fire-element floor tiles (cell id 8) form a hazard patch across
//     the central hall + south spine (rows 8-10, around col 7).
//
// Deliberately item-free for now — this is a layout/architecture pass.
export const flameZoneMap = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 0
  [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // row 1  inner sanctum (cols 5-9)
  [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // row 2
  [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // row 3
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // row 4  north spine (col 7)
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // row 5
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // row 6  ← PORTCULLIS gate (6,7)
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], // row 7  W chamber + central hall + E chamber
  [1, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 1], // row 8  connecting band + lava floor (8)
  [1, 0, 0, 0, 0, 0, 8, 8, 8, 0, 0, 0, 0, 0, 1], // row 9  connecting band + lava floor across hall
  [1, 1, 1, 1, 0, 1, 1, 8, 1, 1, 0, 1, 1, 1, 1], // row 10 corridors (cols 4 / 7 / 10) + lava on spine
  [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1], // row 11
  [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1], // row 12 entry hall (cols 4-10)
  [1, 1, 1, 1, 0, 0, 0, 2, 0, 0, 0, 1, 1, 1, 1], // row 13 entry hall + arrival/start (col 7)
  [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1], // row 14 entry hall
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 15
];

// Where the Level 3 entry swirl drops the party inside the zone (entry hall,
// facing north up the central corridor).
export const FLAME_ZONE_ARRIVAL = { row: 13, col: 7, facing: 0 };

// Where the zone's return swirl sends the party — the corridor cell just west
// of the Level 3 flame alcove, facing east so the alcove + its swirl are in view.
export const FLAME_ZONE_RETURN = { level: 3, row: 25, col: 19, facing: 1 };

// Floor cells (everything that isn't a wall), used to paint the flame-wall
// texture on the inner wall faces and the flame ceiling. Derived from the map so
// it can't drift out of sync with the layout. Computed once at module load,
// before any runtime portcullis mutation.
export const FLAME_ZONE_FLOORS = (() => {
  const cells = [];
  for (let r = 0; r < flameZoneMap.length; r++) {
    for (let c = 0; c < flameZoneMap[r].length; c++) {
      if (flameZoneMap[r][c] !== 1) cells.push([r, c]);
    }
  }
  return cells;
})();
