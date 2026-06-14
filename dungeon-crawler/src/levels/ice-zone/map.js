// Ice Zone — a self-contained side area reached via the swirl portal on the floor
// of the Level 3 ice alcove (19,19). Built on entry / torn down on exit by the
// standard loadLevel pass, so Level 3 never carries this geometry. Sibling of the
// Flame Zone but with a distinct layout.
//
// Layout (16 rows × 15 cols), all ice-wall / dungeon-ice-floor textured:
//   • Entry chamber (S, rows 12-14, cols 5-9) — party arrives here (start cell 2
//     at row 13, col 7) with the white return swirl set into the floor.
//   • A central spine (col 7) runs north from the entry chamber, through a wide
//     full-width hall (rows 7-9) split by two ice pillars, up to a junction.
//   • A single portcullis at (3,7) gates the north treasure room (rows 1-2,
//     cols 5-9), which holds the two chests.
//   • Five ice-element floor tiles (cell id 9) form a hazard patch across the
//     hall/spine the party must cross (rows 7-9, around col 7).
export const iceZoneMap = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 0
  [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // row 1  treasure room (cols 5-9)
  [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // row 2
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // row 3  ← PORTCULLIS gate (3,7)
  [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1], // row 4  junction (cols 6-8)
  [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1], // row 5
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // row 6  spine (col 7)
  [1, 0, 0, 0, 0, 0, 9, 9, 9, 0, 0, 0, 0, 0, 1], // row 7  full-width hall (ice floor 9 across spine)
  [1, 0, 0, 0, 1, 0, 0, 9, 0, 0, 1, 0, 0, 0, 1], // row 8  hall + two ice pillars (cols 4 / 10) + ice floor
  [1, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 1], // row 9  hall + ice floor
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // row 10 spine (col 7)
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // row 11
  [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // row 12 entry chamber (cols 5-9)
  [1, 1, 1, 1, 1, 0, 0, 2, 0, 0, 1, 1, 1, 1, 1], // row 13 entry chamber + arrival/start (col 7)
  [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // row 14 entry chamber
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 15
];

// Where the Level 3 entry swirl drops the party inside the zone (entry chamber,
// facing north up the spine).
export const ICE_ZONE_ARRIVAL = { row: 13, col: 7, facing: 0 };

// Where the zone's return swirl sends the party — the corridor cell just west of
// the Level 3 ice alcove, facing east so the alcove + its swirl are in view.
export const ICE_ZONE_RETURN = { level: 3, row: 19, col: 18, facing: 1 };

// Floor cells (everything that isn't a wall), used to paint the ice-wall texture
// on the inner wall faces, the dungeon-ice floor, and the ceiling. Derived from
// the map so it can't drift; computed once before any runtime portcullis mutation.
export const ICE_ZONE_FLOORS = (() => {
  const cells = [];
  for (let r = 0; r < iceZoneMap.length; r++) {
    for (let c = 0; c < iceZoneMap[r].length; c++) {
      if (iceZoneMap[r][c] !== 1) cells.push([r, c]);
    }
  }
  return cells;
})();
