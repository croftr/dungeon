// ─────────────────────────────────────────────────────────────────────────────
//  3D GLOWING SLASH TRAIL
//
//  A bright arc of light that sweeps diagonally across the viewport.
//  No weapon model — just a glowing ribbon trail.  Parented to the camera.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup } from './player.js';

let _camera = null;
let _trailMesh = null;
let _shieldMesh = null;
let _animating = false;
let _shieldAnimating = false;

const TRAIL_DURATION = 250;   // ms — quick slash
const TRAIL_SEGMENTS = 16;    // ribbon subdivisions
const TRAIL_WIDTH = 0.007;    // half-width — thin like a claw mark

// Slash arc control points (camera-local space)
// Tight arc across the centre of the screen, Grimrock-style
// 'left' party column (indices 0,2) — slash from upper-left to lower-right
const ARC_START_L = new THREE.Vector3(-0.18, 0.14, -0.45);
const ARC_MID_L   = new THREE.Vector3(0.02, 0.0, -0.4);
const ARC_END_L   = new THREE.Vector3(0.2, -0.16, -0.45);
// 'right' party column (indices 1,3) — slash from upper-right to lower-left
const ARC_START_R = new THREE.Vector3(0.18, 0.14, -0.45);
const ARC_MID_R   = new THREE.Vector3(-0.02, 0.0, -0.4);
const ARC_END_R   = new THREE.Vector3(-0.2, -0.16, -0.45);

// Shield bash arc — short vertical travel so the wide ribbon reads as round
const SHIELD_START = new THREE.Vector3(0.0, -0.18, -0.45);
const SHIELD_MID   = new THREE.Vector3(0.0, -0.08, -0.38);
const SHIELD_END   = new THREE.Vector3(0.0,  0.0,  -0.45);
const SHIELD_WIDTH = 0.07;    // broad shield disc

/** Quadratic bezier sample */
function bezier(a, b, c, t) {
  const s = 1 - t;
  return new THREE.Vector3(
    s * s * a.x + 2 * s * t * b.x + t * t * c.x,
    s * s * a.y + 2 * s * t * b.y + t * t * c.y,
    s * s * a.z + 2 * s * t * b.z + t * t * c.z,
  );
}

/** Build the ribbon geometry (positions + UVs), initially all at origin */
function createTrailGeometry() {
  const verts = TRAIL_SEGMENTS * 2;
  const positions = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const indices = [];

  for (let i = 0; i < TRAIL_SEGMENTS; i++) {
    const u = i / (TRAIL_SEGMENTS - 1);
    // Two verts per segment (top/bottom of ribbon)
    uvs[i * 4]     = u;  uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = u;  uvs[i * 4 + 3] = 1;

    if (i < TRAIL_SEGMENTS - 1) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * @param {THREE.Camera} camera
 */
export function initSlashTrail(camera) {
  _camera = camera;

  const geo = createTrailGeometry();

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffcc,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthTest: false,
  });

  _trailMesh = new THREE.Mesh(geo, mat);
  _trailMesh.renderOrder = 998;
  _trailMesh.visible = false;
  _trailMesh.frustumCulled = false;
  camera.add(_trailMesh);

  // Shield bash trail — separate mesh so both can play independently
  const shieldGeo = createTrailGeometry();
  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0xffffcc,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthTest: false,
  });
  _shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  _shieldMesh.renderOrder = 998;
  _shieldMesh.visible = false;
  _shieldMesh.frustumCulled = false;
  camera.add(_shieldMesh);
}

/**
 * Play the slash trail effect.
 * @param {'left'|'right'} hand — mirrors the arc for right-hand attacks
 * @param {number} memberIndex — party member index (0-3), used to pick arc direction
 */
export function playSlashTrail(hand = 'left', memberIndex = 0) {
  if (!_trailMesh || _animating) return;
  _animating = true;

  // Party column: indices 0,2 = left column, 1,3 = right column
  const rightColumn = memberIndex % 2 === 1;
  const arcStart = rightColumn ? ARC_START_R : ARC_START_L;
  const arcMid   = rightColumn ? ARC_MID_R   : ARC_MID_L;
  const arcEnd   = rightColumn ? ARC_END_R   : ARC_END_L;

  const mirror = hand === 'right' ? -1 : 1;
  _trailMesh.visible = true;

  // Pre-compute the full arc path (mirrored for hand)
  const start = new THREE.Vector3(arcStart.x * mirror, arcStart.y, arcStart.z);
  const mid   = new THREE.Vector3(arcMid.x * mirror, arcMid.y, arcMid.z);
  const end   = new THREE.Vector3(arcEnd.x * mirror, arcEnd.y, arcEnd.z);

  // Direction perpendicular to the arc for ribbon width
  const up = new THREE.Vector3(0, 0, 1);

  const posAttr = _trailMesh.geometry.getAttribute('position');
  const obj = { t: 0 };

  new Tween(obj, tweenGroup)
    .to({ t: 1 }, TRAIL_DURATION)
    .easing(Easing.Cubic.Out)
    .onUpdate(() => {
      const progress = obj.t;

      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        const segT = i / (TRAIL_SEGMENTS - 1);

        // The trail "head" is at `progress`, segments behind it fade to the start
        // trailT maps each segment to its position along the arc
        const trailT = segT * progress;

        const pt = bezier(start, mid, end, trailT);

        // Tangent for perpendicular offset
        const tangent = bezier(start, mid, end, Math.min(trailT + 0.01, 1))
          .sub(bezier(start, mid, end, Math.max(trailT - 0.01, 0)))
          .normalize();
        const perp = new THREE.Vector3().crossVectors(tangent, up).normalize();

        // Taper: thickest in the middle, thin at head and tail
        const taper = Math.sin(segT * Math.PI) * TRAIL_WIDTH;

        // Fade opacity: brighter at head (high segT), dim at tail (low segT)
        // (handled by geometry shape — thin tail = visual fade)

        const i2 = i * 2;
        posAttr.setXYZ(i2,     pt.x + perp.x * taper, pt.y + perp.y * taper, pt.z + perp.z * taper);
        posAttr.setXYZ(i2 + 1, pt.x - perp.x * taper, pt.y - perp.y * taper, pt.z - perp.z * taper);
      }

      posAttr.needsUpdate = true;

      // Fade out opacity near the end
      _trailMesh.material.opacity = 0.9 * (1 - progress * 0.6);
    })
    .onComplete(() => {
      _trailMesh.visible = false;
      _trailMesh.material.opacity = 0.9;
      _animating = false;
    })
    .start();
}

/**
 * Play a chunky shield bash trail — rises from bottom to mid-screen.
 * @param {'left'|'right'} hand
 * @param {number} memberIndex — party member index (0-3), used to pick arc direction
 */
export function playShieldTrail(hand = 'left') {
  if (!_shieldMesh || _shieldAnimating) return;
  _shieldAnimating = true;

  const mirror = hand === 'right' ? -1 : 1;
  _shieldMesh.visible = true;

  const start = new THREE.Vector3(SHIELD_START.x * mirror, SHIELD_START.y, SHIELD_START.z);
  const mid   = new THREE.Vector3(SHIELD_MID.x * mirror,   SHIELD_MID.y,   SHIELD_MID.z);
  const end   = new THREE.Vector3(SHIELD_END.x * mirror,   SHIELD_END.y,   SHIELD_END.z);

  const up = new THREE.Vector3(0, 0, 1);
  const posAttr = _shieldMesh.geometry.getAttribute('position');
  const obj = { t: 0 };

  new Tween(obj, tweenGroup)
    .to({ t: 1 }, TRAIL_DURATION)
    .easing(Easing.Cubic.Out)
    .onUpdate(() => {
      const progress = obj.t;

      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        const segT = i / (TRAIL_SEGMENTS - 1);
        const trailT = segT * progress;

        const pt = bezier(start, mid, end, trailT);

        const tangent = bezier(start, mid, end, Math.min(trailT + 0.01, 1))
          .sub(bezier(start, mid, end, Math.max(trailT - 0.01, 0)))
          .normalize();
        const perp = new THREE.Vector3().crossVectors(tangent, up).normalize();

        // Flat plateau with smooth rounded edges — shield disc profile
        // smoothstep ramps from 0→1 over the first 15% and back to 0 over the last 15%
        const edge = 0.15;
        const lo = Math.min(segT / edge, 1);
        const hi = Math.min((1 - segT) / edge, 1);
        const flat = Math.min(lo, hi);
        const smooth = flat * flat * (3 - 2 * flat); // smoothstep
        const taper = smooth * SHIELD_WIDTH;

        const i2 = i * 2;
        posAttr.setXYZ(i2,     pt.x + perp.x * taper, pt.y + perp.y * taper, pt.z + perp.z * taper);
        posAttr.setXYZ(i2 + 1, pt.x - perp.x * taper, pt.y - perp.y * taper, pt.z - perp.z * taper);
      }

      posAttr.needsUpdate = true;
      _shieldMesh.material.opacity = 0.9 * (1 - progress * 0.6);
    })
    .onComplete(() => {
      _shieldMesh.visible = false;
      _shieldMesh.material.opacity = 0.9;
      _shieldAnimating = false;
    })
    .start();
}
