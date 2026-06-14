import { addSwirlPortal } from '../swirl-portal.js';
import { FLAME_ZONE_RETURN } from './map.js';
import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  FLAME ZONE — side area reached via the swirl portal on the Level 3 flame
//  alcove floor. Everything here is spawned fresh on entry and torn down on exit
//  by the standard clearObjects() pass, so it adds zero load to Level 3.
//
//  Layout/architecture pass: no items. A return swirl in the entry hall, one
//  portcullis (gating the inner sanctum) with a button, and torches for light.
// ─────────────────────────────────────────────────────────────────────────────
export function spawnFlameZoneObjects(ctx) {
    const { group, loader, interactables, addDroppedTorch, addPortcullis, createWallButton, addChest } = ctx;

    const C = 2; // CELL size in world units

    // ── Return swirl (entry hall) ─────────────────────────────────────────────
    // Sends the party back to the corridor just outside the Level 3 flame alcove.
    addSwirlPortal(group, interactables, 5, 13,
        FLAME_ZONE_RETURN.level,
        FLAME_ZONE_RETURN.row,
        FLAME_ZONE_RETURN.col,
        FLAME_ZONE_RETURN.facing,
        { variant: 'red' });

    // ── Inner-sanctum gate ────────────────────────────────────────────────────
    // Portcullis across the north spine at (col 7, row 6). Starts closed; the
    // zone isn't saved, so it re-closes on every visit. rotY 0 → bars span E–W,
    // blocking N–S movement.
    addPortcullis(group, loader, 7, 6, 0);

    // Button on the south face of the hall's north wall at (col 6, row 6).
    // Player stands at (row 7, col 6) facing north to press it; the portcullis
    // one cell east at (6,7) opens. (Mirrors the Hall of Heroes gate buttons.)
    const { group: gateBtn } = createWallButton(+1,
        { portcullisRow: 6, portcullisCol: 7, wallRow: 6, wallCol: 6, animAxis: 'z', animDir: 1 },
        'z');
    gateBtn.position.set(6 * C, 1.25, 6 * C + 1.0);
    group.add(gateBtn);

    // ── Fire chests ───────────────────────────────────────────────────────────
    // Standard interactive chests (open/loot/persist like any other), just using
    // the fire-chest model. Both sit behind the gate in the inner sanctum, tucked
    // into its two corners against the north wall. Empty for now — loot later.
    const FIRE_CHEST = asset('/items/containers/fire-chest.glb');
    // West corner of the inner sanctum.
    addChest(group, loader, 5, 1, 0, -0.7, [
        "Flame Axe", "Flame Greataxe", "Flame Dagger", "Ancient Bog Core"
    ], FIRE_CHEST, true, 0, 'Fire Chest');
    // East corner of the inner sanctum.
    addChest(group, loader, 9, 1, 0, -0.7, [
        "Flame Staff", 'Scroll of Incinerate'
    ], FIRE_CHEST, true, 0, 'Fire Chest');

    // ── Torches (light + show off the flame textures) ─────────────────────────
    addDroppedTorch(group, loader, 4, 13, 0);  // entry hall, west
    addDroppedTorch(group, loader, 10, 13, 0); // entry hall, east
    addDroppedTorch(group, loader, 2, 8, 0);   // west chamber
    addDroppedTorch(group, loader, 12, 8, 0);  // east chamber
    addDroppedTorch(group, loader, 5, 7, 0);   // central hall, by the gate
    addDroppedTorch(group, loader, 7, 1, 0);   // inner sanctum, north wall between the chests
}
