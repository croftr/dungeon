import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup } from './player.js';
import { CELL } from './map.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER DATA
// ─────────────────────────────────────────────────────────────────────────────

export const monsters = [
  {
    id: 0,
    type: 'fbx',
    name: 'Mixamo Zombie',
    gridRow: 2,
    gridCol: 10,
    hp: 100, hpMax: 100,
    stats: { strength: 10, dexterity: 10, vitality: 10, intelligence: 10, resilience: 10 },
    defence: 10, alive: true, mesh: null, mixer: null, actions: {}
  },
  {
    id: 1,
    type: 'sprite',
    name: '2D Sprite Zombie',
    gridRow: 2,
    gridCol: 9, // One cell to the left
    hp: 100, hpMax: 100,
    stats: { strength: 10, dexterity: 10, vitality: 10, intelligence: 10, resilience: 10 },
    defence: 10, alive: true, mesh: null, mixer: null, actions: {}
  },
  {
    id: 2,
    type: 'procedural',
    name: '3D Block Zombie',
    gridRow: 2,
    gridCol: 11, // One cell to the right
    hp: 100, hpMax: 100,
    stats: { strength: 10, dexterity: 10, vitality: 10, intelligence: 10, resilience: 10 },
    defence: 10, alive: true, mesh: null, mixer: null, actions: {}
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  PROCEDURAL & SPRITE GENERATORS
// ─────────────────────────────────────────────────────────────────────────────

function makeSpriteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 64, 128);

  // Body
  ctx.fillStyle = '#4e5c54';
  ctx.fillRect(16, 40, 32, 50);
  // Head
  ctx.fillStyle = '#56825c';
  ctx.fillRect(18, 12, 28, 28);
  // Eyes
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(22, 22, 6, 6);
  ctx.fillRect(36, 22, 6, 6);
  // Arms
  ctx.fillStyle = '#4e5c54';
  ctx.fillRect(4, 40, 12, 40);
  ctx.fillRect(48, 40, 12, 40);
  // Legs
  ctx.fillStyle = '#3a453e';
  ctx.fillRect(16, 90, 12, 38);
  ctx.fillRect(36, 90, 12, 38);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function makeProceduralZombie() {
  const group = new THREE.Group();
  const matBody = new THREE.MeshLambertMaterial({ color: 0x4e5c54 });
  const matHead = new THREE.MeshLambertMaterial({ color: 0x56825c });
  const matLegs = new THREE.MeshLambertMaterial({ color: 0x3a453e });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), matHead);
  head.position.y = 1.9;
  group.add(head);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.4), matBody);
  body.position.y = 1.1;
  group.add(body);

  const armGeo = new THREE.BoxGeometry(0.3, 0.9, 0.3);
  const armL = new THREE.Mesh(armGeo, matBody);
  armL.position.set(-0.6, 1.1, 0);
  group.add(armL);

  const armR = new THREE.Mesh(armGeo, matBody);
  armR.position.set(0.6, 1.1, 0);
  group.add(armR);

  const legGeo = new THREE.BoxGeometry(0.35, 0.6, 0.35);
  const legL = new THREE.Mesh(legGeo, matLegs);
  legL.position.set(-0.25, 0.3, 0);
  group.add(legL);

  const legR = new THREE.Mesh(legGeo, matLegs);
  legR.position.set(0.25, 0.3, 0);
  group.add(legR);

  armL.rotation.x = -Math.PI / 2;
  armR.rotation.x = -Math.PI / 2.2;
  armL.geometry.translate(0, -0.3, 0);
  armR.geometry.translate(0, -0.3, 0);

  group.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return { mesh: group, limbs: { armL, armR, legL, legR, head, body } };
}

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────

export function initMonsters(scene) {
  const loader = new FBXLoader();

  monsters.forEach((m) => {
    if (!m.alive) return;

    if (m.type === 'sprite') {
      const tex = makeSpriteTexture();
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
      // Width 1.25, Height 2.5
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.5), mat);
      m.mesh = plane;
      const wx = m.gridCol * CELL;
      const wz = m.gridRow * CELL;

      plane.position.set(wx, 1.25, wz);
      m.lookAtPlayer = (playerPos) => {
        plane.lookAt(playerPos.x, plane.position.y, playerPos.z);
      };

      // Make it cast shadows! Wait, a simple plane casting shadows is fine
      plane.castShadow = true;
      plane.receiveShadow = true;

      scene.add(plane);

    } else if (m.type === 'procedural') {
      const { mesh, limbs } = makeProceduralZombie();
      m.mesh = mesh;
      m.limbs = limbs;

      const wx = m.gridCol * CELL;
      const wz = m.gridRow * CELL;
      mesh.position.set(wx, 0.0, wz);

      m.lookAtPlayer = (playerPos) => {
        mesh.lookAt(playerPos.x, mesh.position.y, playerPos.z);
      };
      scene.add(mesh);

    } else if (m.type === 'fbx') {
      // Load the main skinned mesh which contains the skeleton and IDLE animation
      loader.load('/monsters/zombie-skin.fbx', (fbx) => {
        m.mesh = fbx;

        // Mixamo FBX models are usually 100x bigger than our 1-unit=1-meter scale
        // Shrunk from 0.0125 to 0.0085 based on feedback
        fbx.scale.setScalar(0.0085);

        // Place at grid position
        const wx = m.gridCol * CELL;
        const wz = m.gridRow * CELL;

        // We set Y to 0 so it stands on the floor
        fbx.position.set(wx, 0.0, wz);

        m.lookAtPlayer = (playerPos) => {
          // Use lookAt but keep the Y fixed to avoid tilting
          fbx.lookAt(playerPos.x, fbx.position.y, playerPos.z);
        };

        // Ensure shadows and materials look right
        fbx.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Sometimes Mixamo textures appear too shiny by default
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach(mat => {
                if (mat.shininess !== undefined) mat.shininess = 2;
              });
            }
          }
        });

        // Setup Animation Mixer
        m.mixer = new THREE.AnimationMixer(fbx);

        // Play the Idle animation if it exists in the skin FBX
        if (fbx.animations && fbx.animations.length > 0) {
          // Find the idle clip (it's usually the only one in the skin file)
          const idleAction = m.mixer.clipAction(fbx.animations[0]);
          m.actions.idle = idleAction;
          idleAction.play();
        }

        scene.add(fbx);

        // ── Now load the standalone punching animation data ──
        loader.load('/monsters/zombie-punch-no-skin.fbx', (animFbx) => {
          if (animFbx.animations && animFbx.animations.length > 0) {
            const attackClip = animFbx.animations[0];
            const attackAction = m.mixer.clipAction(attackClip);
            m.actions.attack = attackAction;

            // Set attack to play exactly ONCE
            attackAction.setLoop(THREE.LoopOnce, 1);
            // Stay on the last frame so it doesn't instantly snap until we fade it out
            attackAction.clampWhenFinished = true;

            // Event listener: when the punch is done, go seamlessly back to Idle
            m.mixer.addEventListener('finished', (e) => {
              if (e.action === m.actions.attack && m.actions.idle) {
                m.actions.idle.reset().play();
                m.actions.attack.crossFadeTo(m.actions.idle, 0.25, false);
              }
            });
          }
        });
      });
    }
  });

  // Basic raycaster setup to test the punch attack on click
  window.addEventListener('click', (e) => {
    // Only raycast if we actually have monsters loaded
    if (monsters.length === 0 || !scene) return;

    // We need the camera! We assume the main camera is passed around, but for a global click event 
    // we can grab it from a raycaster or we just expose a global click handler tied to main.js.
    // Actually, instead of creating an isolated DOM event here that struggles to find the camera,
    // let's assign a custom userData to the mesh so main.js or equipment.js can easily raycast it.
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATION  (called every frame from main.js)
// ─────────────────────────────────────────────────────────────────────────────

export function updateMonsters(dt, playerCamera) {
  monsters.forEach((m) => {
    if (!m.alive) return;

    // Advance the skeletal animations!
    if (m.mixer) {
      m.mixer.update(dt);
    }

    // Procedural simple animations
    if (m.type === 'procedural' && m.limbs) {
      const t = performance.now() * 0.002;
      m.mesh.position.y = Math.sin(t * 2) * 0.04;
      m.limbs.armL.rotation.x = -Math.PI / 2 + Math.sin(t * 3) * 0.1;
      m.limbs.armR.rotation.x = -Math.PI / 2 + Math.cos(t * 3) * 0.1;
    }

    if (m.type === 'sprite' && m.mesh) {
      const t = performance.now() * 0.002;
      m.mesh.position.y = 1.25 + Math.sin(t * 2.5) * 0.08;
    }

    // Make the monster look at the player camera if it's alive and loaded
    if (m.mesh && playerCamera && m.lookAtPlayer) {
      m.lookAtPlayer(playerCamera.position);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  HIT / DAMAGE
// ─────────────────────────────────────────────────────────────────────────────

export function hitMonster(monsterId, rawDamage) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return { hit: false, damage: 0, killed: false, monsterHp: 0 };

  const damage = Math.max(1, rawDamage - m.defence);
  m.hp = Math.max(0, m.hp - damage);

  if (m.hp === 0) {
    m.alive = false;
    _playDeathAnimation(m);
  } else {
    // Temporarily overriding the hit animation so he punches when struck!
    triggerMonsterAttack(monsterId);
    _playHitAnimation(m);
  }

  return { hit: true, damage, killed: m.hp === 0, monsterHp: m.hp };
}

export function attackMonster(monsterId, baseDamage, heroStrength) {
  const rawDamage = (baseDamage ?? 0) + (heroStrength ?? 10);
  return hitMonster(monsterId, rawDamage);
}

// NEW: Call this anywhere in the app to make the zombie punch!
export function triggerMonsterAttack(monsterId) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return;

  if (m.type === 'fbx' && m.actions.attack && m.actions.idle) {
    // Reset and enable the attack action
    m.actions.attack.reset();
    m.actions.attack.setEffectiveTimeScale(1);
    m.actions.attack.setEffectiveWeight(1);

    // Play it and crossfade OUT of idle into attack
    m.actions.attack.play();
    m.actions.idle.crossFadeTo(m.actions.attack, 0.2, true);
  } else if (m.type === 'procedural' && m.limbs) {
    // Quick jolt forward with arm
    const origZ = m.limbs.armR.position.z;
    new Tween(m.limbs.armR.position, tweenGroup)
      .to({ z: origZ + 0.5 }, 150)
      .yoyo(true).repeat(1).start();
  } else if (m.type === 'sprite' && m.mesh) {
    // Rapid shake
    const origX = m.mesh.position.x;
    new Tween(m.mesh.position, tweenGroup)
      .to({ x: origX + 0.3 }, 50)
      .yoyo(true).repeat(3)
      .onComplete(() => m.mesh.position.x = origX).start();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HIT / DEATH TWEENS
// ─────────────────────────────────────────────────────────────────────────────

function _playHitAnimation(m) {
  if (!m.mesh) return;
  const mesh = m.mesh;

  // Flash red using 'emissive' rather than replacing diffuse colors
  mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];

      materials.forEach(mat => {
        if (mat.emissive) {
          const origEmissive = mat.emissive.getHex();
          mat.emissive.setHex(0xaa0000); // Glow dark red
          setTimeout(() => {
            mat.emissive.setHex(origEmissive);
          }, 150);
        }
      });
    }
  });

  // Small physical knockback
  const origin = { z: mesh.position.z };
  const dir = 0.18;
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

  const startY = mesh.position.y;
  const fadeObj = { y: startY, opacity: 1 };

  new Tween(fadeObj, tweenGroup)
    .to({ y: startY - 0.9, opacity: 0 }, 900)
    .easing(Easing.Quadratic.In)
    .onUpdate(() => {
      // Sink into ground
      mesh.position.y = fadeObj.y;

      // Gradually make transparent
      mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(mat => {
            mat.transparent = true;
            mat.opacity = fadeObj.opacity;
            mat.depthWrite = false; // Prevents weird sorting issues during fade out
          });
        }
      });
    })
    .onComplete(() => {
      if (mesh.parent) mesh.parent.remove(mesh);
      m.mesh = null;
    })
    .start();
}
