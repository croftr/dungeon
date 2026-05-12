import * as THREE from 'three';
import { CELL } from '../map.js';

// ─────────────────────────────────────────────────────────────────────────────
//  SWIRL PORTAL  — flat floor teleport effect.
//
//  Two stacked, counter-rotating rune rings sit on a glowing disc; an
//  invisible hit plane sits just above them and is tagged isPortal so the
//  existing portal click handler (objects.js) teleports the party with no
//  special-casing. Rotation + pulse run from onBeforeRender, so no global
//  update-loop wiring is needed.
// ─────────────────────────────────────────────────────────────────────────────

export function addSwirlPortal(scene, interactables, col, row, targetLevel, targetRow, targetCol, targetFacing) {
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

    // Per-frame rotation
    outerRing.onBeforeRender = () => { outerRing.rotation.z += 0.012; };
    innerRing.onBeforeRender = () => { innerRing.rotation.z -= 0.02; };

    // Gentle blue point light pulsing above the swirl
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

    const cs = `#${color.toString(16).padStart(6, '0')}`;
    g.strokeStyle = cs;
    g.lineWidth = 6;
    g.beginPath(); g.arc(c, c, size * 0.42, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3;
    g.beginPath(); g.arc(c, c, size * 0.30, 0, Math.PI * 2); g.stroke();

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
