import { addSwirlPortal } from '../swirl-portal.js';
import { ICE_ZONE_RETURN } from './map.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  ICE ZONE — side area reached via the swirl portal on the Level 3 ice alcove
//  floor. Everything here is spawned fresh on entry and torn down on exit by the
//  standard clearObjects() pass, so it adds zero load to Level 3.
//
//  A return swirl in the entry chamber, one portcullis gating the north treasure
//  room (two chests holding every ice-element weapon in the game), and torches.
// ─────────────────────────────────────────────────────────────────────────────
export function spawnIceZoneObjects(ctx) {
    const { group, loader, interactables, addDroppedTorch, addPortcullis, createWallButton, addChest } = ctx;

    const C = 2; // CELL size in world units

    // ── Return swirl (entry chamber) ──────────────────────────────────────────
    // Sends the party back to the corridor just outside the Level 3 ice alcove.
    addSwirlPortal(group, interactables, 5, 13,
        ICE_ZONE_RETURN.level,
        ICE_ZONE_RETURN.row,
        ICE_ZONE_RETURN.col,
        ICE_ZONE_RETURN.facing,
        { variant: 'ice' });

    // ── Treasure-room gate ────────────────────────────────────────────────────
    // Portcullis across the north spine at (col 7, row 3). Starts closed; the zone
    // isn't saved, so it re-closes on every visit. rotY 0 → bars span E–W.
    addPortcullis(group, loader, 7, 3, 0);

    // Button on the south face of the junction's north wall at (col 6, row 3).
    // Player stands at (row 4, col 6) facing north to press it; the portcullis one
    // cell east at (3,7) opens. (Mirrors the Hall of Heroes / Flame Zone buttons.)
    const { group: gateBtn } = createWallButton(+1,
        { portcullisRow: 3, portcullisCol: 7, wallRow: 3, wallCol: 6, animAxis: 'z', animDir: 1 },
        'z');
    gateBtn.position.set(6 * C, 1.25, 3 * C + 1.0);
    group.add(gateBtn);

    // ── Chests ────────────────────────────────────────────────────────────────
    // Ice chests holding every ice-element weapon currently in the game. Tucked
    // into the two corners of the treasure room against the north wall, behind
    // the gate.
    const CHEST = asset('/items/containers/ice-chest.glb');
    // West corner — daggers & staves.
    addChest(group, loader, 5, 1, 0, -0.7, [
        "Ice Dagger", "Ice Staff", "Ancient Bog Core"
    ], CHEST, true, 0, 'Chest');
    // East corner — axes.
    addChest(group, loader, 9, 1, 0, -0.7, [
        "Ice Axe", "Ice Greataxe"
    ], CHEST, true, 0, 'Chest');

    // ── Torches (light + show off the ice textures) ───────────────────────────
    addDroppedTorch(group, loader, 5, 12, 0);  // entry chamber, west
    addDroppedTorch(group, loader, 9, 12, 0);  // entry chamber, east
    addDroppedTorch(group, loader, 1, 7, 0);   // hall, west end
    addDroppedTorch(group, loader, 13, 7, 0);  // hall, east end
    addDroppedTorch(group, loader, 7, 2, 0);   // treasure room, behind the gate
}
