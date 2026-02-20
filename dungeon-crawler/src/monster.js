import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup } from './player.js';
import { CELL } from './map.js';

// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER DATA
// ─────────────────────────────────────────────────────────────────────────────

export const monsters = [
  {
    id       : 0,
    name     : 'Shade Demon',
    gridRow  : 2,
    gridCol  : 3,
    hp       : 100,
    hpMax    : 100,
    stats    : { strength: 10, dexterity: 10, vitality: 10, intelligence: 10, resilience: 10 },
    defence  : 10,
    alive    : true,
    mesh     : null,   // Three.js Group, assigned in initMonsters()
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  GEOMETRY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildDemonMesh() {
  const root = new THREE.Group();

  // ── Materials ──────────────────────────────────────────────────────────────
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a0a2e });   // deep purple-black
  const boneMat = new THREE.MeshLambertMaterial({ color: 0xd4c090 });   // pale bone
  const eyeMat  = new THREE.MeshBasicMaterial ({ color: 0xff2200, transparent: true, opacity: 0.95 });
  const pupilMat= new THREE.MeshBasicMaterial ({ color: 0xff6600 });
  const hornMat = new THREE.MeshLambertMaterial({ color: 0x3a1a0a });   // dark horn
  const ribMat  = new THREE.MeshLambertMaterial({ color: 0x2a1a3e });   // rib cage accent
  const glow    = new THREE.MeshBasicMaterial ({ color: 0xff1100, transparent: true, opacity: 0.18 }); // aura

  // ── Body (tapered capsule-like torso) ──────────────────────────────────────
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.25, 0.55, 8),
    bodyMat
  );
  torso.position.y = 0.0;
  root.add(torso);

  // Shoulder flare
  const shoulders = new THREE.Mesh(
    new THREE.CylinderGeometry(0.30, 0.18, 0.12, 8),
    bodyMat
  );
  shoulders.position.y = 0.22;
  root.add(shoulders);

  // Waist taper
  const pelvis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.20, 0.14, 0.15, 8),
    bodyMat
  );
  pelvis.position.y = -0.30;
  root.add(pelvis);

  // Rib-cage lines (thin tori around the torso for a skeletal look)
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(0.21 - i * 0.01, 0.018, 4, 12),
      ribMat
    );
    rib.rotation.x = Math.PI / 2;
    rib.position.y = 0.10 - i * 0.13;
    root.add(rib);
  }

  // ── Arms ───────────────────────────────────────────────────────────────────
  [[-1, 1], [1, 1]].forEach(([side]) => {
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.06, 0.28, 6),
      bodyMat
    );
    upper.position.set(side * 0.32, 0.14, 0);
    upper.rotation.z = side * 0.55;
    root.add(upper);

    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.26, 6),
      bodyMat
    );
    lower.position.set(side * 0.46, -0.04, 0);
    lower.rotation.z = side * 0.85;
    root.add(lower);

    // Clawed hand — three sharp talon-like cones
    for (let f = -1; f <= 1; f++) {
      const claw = new THREE.Mesh(
        new THREE.ConeGeometry(0.025, 0.10, 4),
        boneMat
      );
      claw.position.set(side * 0.58 + f * 0.04, -0.18, 0.02 * f);
      claw.rotation.z = side * 1.0 + f * 0.15;
      root.add(claw);
    }
  });

  // ── Legs (vestigial — the demon floats, so just short stumps) ──────────────
  [-1, 1].forEach((side) => {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.035, 0.20, 6),
      bodyMat
    );
    leg.position.set(side * 0.10, -0.46, 0);
    leg.rotation.z = side * 0.2;
    root.add(leg);
  });

  // ── Head ───────────────────────────────────────────────────────────────────
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.40;

  // Skull base — slightly elongated sphere
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.20, 10, 8),
    boneMat
  );
  skull.scale.set(0.9, 1.05, 0.85);
  headGroup.add(skull);

  // Lower jaw — a flattened box
  const jaw = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.08, 0.18),
    boneMat
  );
  jaw.position.set(0, -0.13, 0.04);
  headGroup.add(jaw);

  // Teeth (upper) — 4 little rectangular spikes
  for (let t = -1; t <= 1; t += 0.67) {
    const tooth = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.06, 0.04),
      boneMat
    );
    tooth.position.set(t * 0.09, -0.10, 0.18);
    headGroup.add(tooth);
  }

  // Lower teeth
  for (let t = -1; t <= 1; t += 0.67) {
    const tooth = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.048, 0.035),
      boneMat
    );
    tooth.position.set(t * 0.09, -0.16, 0.16);
    headGroup.add(tooth);
  }

  // Cheek bones — two small raised ridges
  [-1, 1].forEach((side) => {
    const cheek = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.04, 0.06),
      boneMat
    );
    cheek.position.set(side * 0.16, -0.04, 0.12);
    cheek.rotation.y = side * 0.3;
    headGroup.add(cheek);
  });

  // Brow ridge
  const brow = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.04, 0.06),
    boneMat
  );
  brow.position.set(0, 0.09, 0.15);
  headGroup.add(brow);

  // ── Eyes (glowing) ─────────────────────────────────────────────────────────
  [-1, 1].forEach((side) => {
    // Eye socket recess (dark sphere behind the glow)
    const socket = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x0a0000 })
    );
    socket.position.set(side * 0.085, 0.05, 0.155);
    headGroup.add(socket);

    // Glowing iris
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.042, 8, 6),
      eyeMat.clone()
    );
    eye.position.set(side * 0.085, 0.05, 0.165);
    eye.userData.isEye = true;
    headGroup.add(eye);

    // Pupil slit (vertical)
    const pupil = new THREE.Mesh(
      new THREE.BoxGeometry(0.010, 0.038, 0.01),
      pupilMat
    );
    pupil.position.set(side * 0.085, 0.05, 0.207);
    headGroup.add(pupil);
  });

  // ── Horns ──────────────────────────────────────────────────────────────────
  [-1, 1].forEach((side) => {
    // Main curved horn — two tapered cylinders at an angle
    const hornBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.05, 0.22, 6),
      hornMat
    );
    hornBase.position.set(side * 0.13, 0.26, -0.02);
    hornBase.rotation.z = side * -0.4;
    hornBase.rotation.x = -0.15;
    headGroup.add(hornBase);

    const hornTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.18, 6),
      hornMat
    );
    hornTip.position.set(side * 0.20, 0.44, -0.07);
    hornTip.rotation.z = side * -0.6;
    hornTip.rotation.x = -0.3;
    headGroup.add(hornTip);

    // Small side horn nub
    const nub = new THREE.Mesh(
      new THREE.ConeGeometry(0.015, 0.09, 5),
      hornMat
    );
    nub.position.set(side * 0.18, 0.16, 0.02);
    nub.rotation.z = side * -1.1;
    headGroup.add(nub);
  });

  root.add(headGroup);
  root.userData.headGroup = headGroup;

  // ── Aura / glow halo ───────────────────────────────────────────────────────
  // A large semi-transparent sphere slightly bigger than the whole figure
  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 8),
    glow
  );
  aura.position.y = 0.05;
  aura.userData.isAura = true;
  root.add(aura);

  // ── Collect eye meshes for animation ──────────────────────────────────────
  root.userData.eyes = [];
  headGroup.traverse((child) => {
    if (child.userData.isEye) root.userData.eyes.push(child);
  });
  root.userData.aura = aura;

  return root;
}

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────

export function initMonsters(scene) {
  monsters.forEach((m) => {
    if (!m.alive) return;

    const mesh = buildDemonMesh();

    // Place at grid position — elevated so it hovers above floor
    const wx = m.gridCol * CELL;
    const wz = m.gridRow * CELL;
    mesh.position.set(wx, 0.82, wz);
    mesh.userData.baseY = 0.82;

    // Face toward the start (roughly south-west)
    mesh.rotation.y = Math.PI;

    scene.add(mesh);
    m.mesh = mesh;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATION  (called every frame from main.js)
// ─────────────────────────────────────────────────────────────────────────────

let _elapsed = 0;

export function updateMonsters(dt) {
  _elapsed += dt;

  monsters.forEach((m) => {
    if (!m.alive || !m.mesh) return;

    const mesh = m.mesh;
    const t    = _elapsed;

    // ── Float bob  (gentle up/down sine) ──
    mesh.position.y = mesh.userData.baseY + Math.sin(t * 1.4) * 0.055;

    // ── Slow body sway ──
    mesh.rotation.y = Math.PI + Math.sin(t * 0.7) * 0.12;

    // ── Head subtle tilt (looks around) ──
    if (mesh.userData.headGroup) {
      mesh.userData.headGroup.rotation.y = Math.sin(t * 0.5) * 0.18;
      mesh.userData.headGroup.rotation.x = Math.sin(t * 0.9 + 1.2) * 0.06;
    }

    // ── Eye pulse (brightness flicker) ──
    if (mesh.userData.eyes) {
      const pulse = 0.80 + Math.sin(t * 2.8) * 0.20;
      mesh.userData.eyes.forEach((eye) => {
        eye.material.opacity = Math.max(0.6, Math.min(1.0, pulse));
      });
    }

    // ── Aura breathe ──
    if (mesh.userData.aura) {
      const breathe = 1.0 + Math.sin(t * 1.1) * 0.08;
      mesh.userData.aura.scale.setScalar(breathe);
      mesh.userData.aura.material.opacity = 0.12 + Math.sin(t * 1.1) * 0.06;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  HIT / DAMAGE  (called from equipment.js when a hand attack lands)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies damage to the first living monster.
 * damage = baseDamage + attacker.stats.strength - monster.defence
 * Returns an object: { hit: bool, damage: number, killed: bool, monsterHp: number }
 */
export function hitMonster(monsterId, rawDamage) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return { hit: false, damage: 0, killed: false, monsterHp: 0 };

  const damage = Math.max(1, rawDamage - m.defence);
  m.hp = Math.max(0, m.hp - damage);

  if (m.hp === 0) {
    m.alive = false;
    _playDeathAnimation(m);
  } else {
    _playHitAnimation(m);
  }

  return { hit: true, damage, killed: m.hp === 0, monsterHp: m.hp };
}

/**
 * Given a weapon baseDamage and the attacking hero's strength,
 * computes rawDamage then calls hitMonster on monster 0.
 */
export function attackMonster(baseDamage, heroStrength) {
  const rawDamage = (baseDamage ?? 0) + (heroStrength ?? 10);
  return hitMonster(0, rawDamage);
}

// ─────────────────────────────────────────────────────────────────────────────
//  HIT / DEATH ANIMATIONS  (tween-driven, no extra deps)
// ─────────────────────────────────────────────────────────────────────────────

function _playHitAnimation(m) {
  if (!m.mesh) return;
  const mesh = m.mesh;

  // Brief red flash on all body materials
  mesh.traverse((child) => {
    if (child.isMesh && child.material && !child.userData.isEye && !child.userData.isAura) {
      const origColor = child.material.color.getHex();
      child.material.color.setHex(0xff2200);
      setTimeout(() => {
        if (child.material) child.material.color.setHex(origColor);
      }, 140);
    }
  });

  // Knockback recoil — push back slightly then return
  const origin = { z: mesh.position.z };
  const dir    = 0.18; // push away from player (toward +z here since monster faces -z)
  new Tween(mesh.position, tweenGroup)
    .to({ z: origin.z + dir }, 80)
    .easing(Easing.Quadratic.Out)
    .chain(
      new Tween(mesh.position, tweenGroup)
        .to({ z: origin.z }, 120)
        .easing(Easing.Quadratic.In)
    )
    .start();
}

function _playDeathAnimation(m) {
  if (!m.mesh) return;
  const mesh = m.mesh;

  // Sink into the ground while fading out
  const startY  = mesh.position.y;
  const fadeObj = { y: startY, opacity: 1 };

  new Tween(fadeObj, tweenGroup)
    .to({ y: startY - 0.9, opacity: 0 }, 900)
    .easing(Easing.Quadratic.In)
    .onUpdate(() => {
      mesh.position.y = fadeObj.y;
      mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.transparent = true;
          child.material.opacity     = fadeObj.opacity;
        }
      });
    })
    .onComplete(() => {
      mesh.parent?.remove(mesh);
      m.mesh = null;
    })
    .start();
}
