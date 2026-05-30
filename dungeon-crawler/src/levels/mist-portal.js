import * as THREE from 'three';
import { CELL, WALL_H } from '../map.js';

// ─────────────────────────────────────────────────────────────────────────────
//  MIST PORTAL  — a shimmering curtain of mist that spans a corridor and acts
//  as a threshold between two areas of a level.
//
//  A few layered, drifting cloud planes sit across the corridor with a soft
//  light behind them. An invisible hit plane tagged `isMistPortal` lets the
//  existing click handler (objects.js) and the per-step checker
//  (checkMistPortalStep) prompt the party with a "proceed into the mist?"
//  confirm before warping them across.
//
//  opts:
//    axis       'ew' (curtain blocks an east–west corridor) | 'ns'
//    enterDir   +1 => moving in the increasing col/row direction is "entering"
//    enterRow / enterCol / enterFacing  — warp destination when entering
//    color      mist tint
//    width      curtain width in world units (defaults to one cell)
// ─────────────────────────────────────────────────────────────────────────────

export function addMistPortal(scene, interactables, col, row, opts = {}) {
    const {
        axis = 'ew',
        enterDir = 1,
        targetLevel = null,   // when set, "yes" loads this level instead of an in-level warp
        enterRow = row,
        enterCol = col,
        enterFacing = null,
        color = 0xb9a8e6,
        width = CELL,
        offsetX = 0,   // world-space nudge for the visuals (grid cell unchanged)
        offsetZ = 0,
    } = opts;

    const group = new THREE.Group();
    group.position.set(col * CELL + offsetX, 0, row * CELL + offsetZ);
    // Default plane faces +Z. For an east–west corridor the curtain must face
    // ±X (so it spans the north–south corridor width), hence the 90° turn.
    if (axis === 'ew') group.rotation.y = Math.PI / 2;

    const LAYER_COUNT = 3;
    const layers = [];
    for (let i = 0; i < LAYER_COUNT; i++) {
        const tex = _buildMistTexture();
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            color,
            transparent: true,
            opacity: 0.34,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.04, WALL_H), mat);
        mesh.position.set(0, WALL_H / 2, (i - 1) * 0.07); // small depth stagger
        group.add(mesh);
        layers.push({
            mat,
            speed: 0.03 + i * 0.022,
            dir: i % 2 ? 1 : -1,
            phase: i * 1.7,
        });
    }

    // Soft glow from within the mist.
    const light = new THREE.PointLight(color, 1.6, 4.5);
    light.position.set(0, WALL_H * 0.55, 0);
    group.add(light);

    // Invisible clickable / raycast target.
    const hit = new THREE.Mesh(
        new THREE.PlaneGeometry(width, WALL_H),
        new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    hit.position.set(0, WALL_H / 2, 0);
    hit.userData = {
        isMistPortal: true,
        gridRow: row,
        gridCol: col,
        axis,
        enterDir,
        targetLevel,
        enterRow,
        enterCol,
        enterFacing,
    };
    interactables.push(hit);
    group.add(hit);

    // Drive the drift + pulse from the first layer's render hook (a Group has no
    // geometry, so onBeforeRender wouldn't fire on the group itself).
    const driver = group.children[0];
    driver.onBeforeRender = () => {
        const t = performance.now() * 0.001;
        for (const L of layers) {
            L.mat.map.offset.x = (t * L.speed * L.dir) % 1;
            L.mat.opacity = 0.26 + Math.sin(t * 0.8 + L.phase) * 0.12;
        }
        light.intensity = 1.3 + Math.sin(t * 1.2) * 0.5;
    };

    scene.add(group);
    return group;
}

// Builds a soft, cloudy alpha texture with faded top/bottom edges so the curtain
// blends into floor and ceiling instead of showing hard plane borders.
function _buildMistTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, size, size);

    for (let i = 0; i < 26; i++) {
        const cx = Math.random() * size;
        const cy = Math.random() * size;
        const r = 28 + Math.random() * 72;
        const a = 0.08 + Math.random() * 0.18;
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(255,255,255,${a})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
    }

    // Fade the top and bottom edges to zero alpha.
    const vg = g.createLinearGradient(0, 0, 0, size);
    vg.addColorStop(0, 'rgba(0,0,0,1)');
    vg.addColorStop(0.16, 'rgba(0,0,0,0)');
    vg.addColorStop(0.84, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = vg;
    g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    return texture;
}
