import * as THREE from 'three';
import { CELL } from '../../map.js';

// ─────────────────────────────────────────────────────────────────────────────
//  SCHEMATIC TRIALS  — side zone reached via portal in Level 2 giant room.
//
//  Layout: central hub (row 6, col 7) with four alcoves N/S/W/E. Each alcove
//  holds the reward chest for one of the four merchant schematic quests.
//  Chest contents persist via the normal _containerContentsPersistence
//  mechanism, so once a schematic is claimed it stays claimed — the player
//  cannot farm the same trial twice.
//
//  Everything in this zone is spawned fresh on entry and torn down on exit by
//  the standard clearObjects() pass, so it adds zero load to Level 2.
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEMATIC_TRIALS_RETURN = { row: 18, col: 4, facing: 1 }; // east-facing, one cell east of the entry portal on the treeman room west wall

export function spawnSchematicTrialsObjects(ctx) {
    const { group, addChest, addPortcullis, addKeyhole, interactables } = ctx;

    // ── Four locked gates, one outside each alcove ────────────────────────────
    // Each portcullis consumes one Schematic Key. The party starts with four
    // keys, so they can open every gate — but each gate is one-shot, so they
    // must choose the order. Keyholes sit on a side wall of the approach
    // corridor, mounted flush against the wall and facing the player.

    // North alcove gate (Savage) — portcullis at (col 7, row 4).
    // Keyhole on west wall of corridor cell (col 7, row 5), facing east.
    addPortcullis(group, loader, 7, 4, 0);
    addKeyhole(group, loader, 7, 5, Math.PI / 2, -0.85, 0, 4, 7, 'Schematic Key');

    // South alcove gate (Steel) — portcullis at (col 7, row 9).
    // Keyhole on west wall of corridor cell (col 7, row 8), facing east.
    addPortcullis(group, loader, 7, 9, 0);
    addKeyhole(group, loader, 7, 8, Math.PI / 2, -0.85, 0, 9, 7, 'Schematic Key');

    // West alcove gate (Trackers) — portcullis at (col 4, row 6).
    // Keyhole on north wall of corridor cell (col 5, row 6), facing south.
    addPortcullis(group, loader, 4, 6, Math.PI / 2);
    addKeyhole(group, loader, 5, 6, 0, 0, -0.85, 6, 4, 'Schematic Key');

    // East alcove gate (Wizard) — portcullis at (col 10, row 6).
    // Keyhole on north wall of corridor cell (col 9, row 6), facing south.
    addPortcullis(group, loader, 10, 6, Math.PI / 2);
    addKeyhole(group, loader, 9, 6, 0, 0, -0.85, 6, 10, 'Schematic Key');

    // ── Return swirl at the centre of the hub ─────────────────────────────────
    // A flat floor effect (two stacked, counter-rotating rune rings) replaces
    // the upright portal model — easier to centre in the room and clearer to
    // click. Targets Level 2's treeman-room entry portal cell.
    addSwirlPortal(group, interactables, 7, 6, 2,
        SCHEMATIC_TRIALS_RETURN.row,
        SCHEMATIC_TRIALS_RETURN.col,
        SCHEMATIC_TRIALS_RETURN.facing);

    // ── Four reward chests, one per alcove ────────────────────────────────────
    // North alcove — Savage Fury (orc tribal armour)
    addChest(group, loader, 7, 1, Math.PI, 0.7, [
        "Savage Schematics",
        { name: 'Gold Coins', quantity: 40 },
    ]);

    // South alcove — Steel Vanguard (heavy plate)
    addChest(group, loader, 7, 12, 0, -0.7, [
        "Steel Schematics",
        { name: 'Gold Coins', quantity: 40 },
    ]);

    // West alcove — Tracker's Guise (ranger leather)
    addChest(group, loader, 1, 6, Math.PI / 2, -0.7, [
        "Trackers Schematics",
        { name: 'Gold Coins', quantity: 40 },
    ]);

    // East alcove — Wizard's Regalia (mage robes)
    addChest(group, loader, 13, 6, -Math.PI / 2, 0.7, [
        "Wizard Schematics",
        { name: 'Gold Coins', quantity: 40 },
    ]);
}

// Flat floor "portal": two stacked rune rings counter-rotating with a glowing
// disc beneath them. Tagged isPortal so the existing portal click handler
// (objects.js) teleports the party back to Level 2 with no special-casing.
function addSwirlPortal(scene, interactables, col, row, targetLevel, targetRow, targetCol, targetFacing) {
    const x = col * CELL;
    const z = row * CELL;
    const swirl = new THREE.Group();
    swirl.position.set(x, 0.02, z);

    // Soft glow disc on the floor
    const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.95, 48),
        new THREE.MeshBasicMaterial({
            color: 0x3a9bff,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            side: THREE.DoubleSide,
        })
    );
    glow.rotation.x = -Math.PI / 2;
    swirl.add(glow);

    // Two rune rings, drawn as procedural canvas textures
    const outerRing = _buildRingMesh(0.95, 0x9be8ff, 12);
    swirl.add(outerRing);

    const innerRing = _buildRingMesh(0.65, 0xffd27a, 8);
    innerRing.position.y = 0.01; // avoid z-fight with outer ring
    swirl.add(innerRing);

    // Hit target — clickable plane covering the swirl
    const hit = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 1.8),
        new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    hit.rotation.x = -Math.PI / 2;
    hit.position.y = 0.05;
    hit.userData = {
        isPortal: true,
        targetLevel,
        targetRow,
        targetCol,
        targetFacing,
        gridRow: row,
        gridCol: col,
    };
    interactables.push(hit);
    swirl.add(hit);

    // Per-frame rotation — onBeforeRender runs whenever the mesh is rendered,
    // so we don't need to plug into any global update loop.
    outerRing.onBeforeRender = () => { outerRing.rotation.z += 0.012; };
    innerRing.onBeforeRender = () => { innerRing.rotation.z -= 0.02; };

    // Gentle blue-violet point light pulsing above the swirl
    const light = new THREE.PointLight(0x4aa8ff, 2.5, 4);
    light.position.set(0, 0.8, 0);
    swirl.add(light);
    glow.onBeforeRender = () => {
        const t = performance.now() * 0.003;
        light.intensity = 2.0 + Math.sin(t) * 0.6;
        glow.material.opacity = 0.45 + Math.sin(t) * 0.12;
    };

    scene.add(swirl);
}

function _buildRingMesh(radius, color, runeCount) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    const c = size / 2;

    // Outer + inner stroke
    const cs = `#${color.toString(16).padStart(6, '0')}`;
    g.strokeStyle = cs;
    g.lineWidth = 6;
    g.beginPath(); g.arc(c, c, size * 0.42, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3;
    g.beginPath(); g.arc(c, c, size * 0.30, 0, Math.PI * 2); g.stroke();

    // Rune ticks around the ring
    g.fillStyle = cs;
    for (let i = 0; i < runeCount; i++) {
        const a = (i / runeCount) * Math.PI * 2;
        const r = size * 0.36;
        const rx = c + Math.cos(a) * r;
        const ry = c + Math.sin(a) * r;
        g.save();
        g.translate(rx, ry);
        g.rotate(a + Math.PI / 2);
        g.fillRect(-3, -10, 6, 20);
        g.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;

    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(radius * 2, radius * 2),
        new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        })
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
}
