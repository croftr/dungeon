import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup } from './player.js';
import { CELL } from './map.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
    type: 'procedural',
    name: '3D Block Zombie',
    gridRow: 2,
    gridCol: 11, // One cell to the right
    hp: 100, hpMax: 100,
    stats: { strength: 10, dexterity: 10, vitality: 10, intelligence: 10, resilience: 10 },
    defence: 10, alive: true, mesh: null, mixer: null, actions: {}
  },
  {
    id: 2,
    type: 'glb',
    name: 'Goblin',
    gridRow: 2,
    gridCol: 12, // One cell to the right of the block zombie
    hp: 80, hpMax: 80,
    stats: { strength: 12, dexterity: 15, vitality: 8, intelligence: 5, resilience: 5 },
    defence: 8, alive: true, mesh: null, mixer: null, actions: {}
  },
  {
    id: 3,
    type: 'glb',
    name: 'TreeKin',
    gridRow: 2,
    gridCol: 13, // One cell to the right of the Goblin
    hp: 150, hpMax: 150, // Tree kin are tanky
    stats: { strength: 18, dexterity: 6, vitality: 15, intelligence: 12, resilience: 12 },
    defence: 15, alive: true, mesh: null, mixer: null, actions: {},
    glbIdle: '/monsters/meshy-AI-treeKin/Meshy_AI_Animation_Walking_withSkin.glb',
    glbAttack: '/monsters/meshy-AI-treeKin/Meshy_AI_Animation_mage_soell_cast_withSkin.glb',
    scale: 0.45 // Standard Meshy scale from our guide
  }
];

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  PROCEDURAL GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

function makeProceduralZombie() {
  const group = new THREE.Group();
  const matBody = new THREE.MeshLambertMaterial({ color: 0x4e5c54 });
  const matHead = new THREE.MeshLambertMaterial({ color: 0x56825c });
  const matLegs = new THREE.MeshLambertMaterial({ color: 0x3a453e });

  // Use capsules / cylinders to soften the rigid box look
  const headGeo = new THREE.CylinderGeometry(0.3, 0.25, 0.6, 12);
  const head = new THREE.Mesh(headGeo, matHead);
  head.position.y = 1.9;

  // Facial features
  const matEye = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const matNose = new THREE.MeshLambertMaterial({ color: 0x2a352e });
  const matMouth = new THREE.MeshLambertMaterial({ color: 0x000000 });

  const eyeGeo = new THREE.BoxGeometry(0.08, 0.05, 0.08);
  const eyeL = new THREE.Mesh(eyeGeo, matEye);
  eyeL.position.set(-0.12, 0.1, 0.26);
  head.add(eyeL);

  const eyeR = new THREE.Mesh(eyeGeo, matEye);
  eyeR.position.set(0.12, 0.1, 0.26);
  head.add(eyeR);

  const noseGeo = new THREE.BoxGeometry(0.06, 0.06, 0.08);
  const nose = new THREE.Mesh(noseGeo, matNose);
  nose.position.set(0, 0, 0.27);
  head.add(nose);

  const mouthGeo = new THREE.BoxGeometry(0.18, 0.04, 0.08);
  const mouth = new THREE.Mesh(mouthGeo, matMouth);
  mouth.position.set(0, -0.15, 0.25);
  head.add(mouth);

  group.add(head);

  // Soften body
  const bodyGeo = new THREE.CylinderGeometry(0.45, 0.35, 1.0, 10);
  const body = new THREE.Mesh(bodyGeo, matBody);
  body.position.y = 1.1;
  // Flatten cylinder front-to-back to look like a torso
  bodyGeo.scale(1, 1, 0.6);
  group.add(body);

  const armGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.9, 8);
  const armL = new THREE.Mesh(armGeo, matBody);
  armL.position.set(-0.6, 1.25, 0);
  group.add(armL);

  const armR = new THREE.Mesh(armGeo, matBody);
  armR.position.set(0.6, 1.25, 0);
  group.add(armR);

  const legGeo = new THREE.CylinderGeometry(0.18, 0.15, 0.6, 8);
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

  // Make it a lot smaller
  group.scale.set(0.35, 0.35, 0.35);

  return { mesh: group, limbs: { armL, armR, legL, legR, head, body } };
}

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────

export function initMonsters(scene) {
  const loader = new FBXLoader();

  monsters.forEach((m) => {
    if (!m.alive) return;

    if (m.type === 'procedural') {
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
    } else if (m.type === 'glb') {
      const gltfLoader = new GLTFLoader();

      // Use properties if defined on the object, else fall back to hardcoded goblin paths
      const idlePath = m.glbIdle || '/monsters/meshy_AI_goblin/Meshy_AI_Animation_Idle_withSkin.glb';
      const attackPath = m.glbAttack || '/monsters/meshy_AI_goblin/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb';
      const meshScale = m.scale || 0.45;

      // Load the idle/main GLB
      gltfLoader.load(idlePath, (gltf) => {
        const model = gltf.scene;
        m.mesh = model;

        // Scale it appropriately 
        model.scale.setScalar(meshScale);

        const wx = m.gridCol * CELL;
        const wz = m.gridRow * CELL;
        model.position.set(wx, 0.0, wz);

        m.lookAtPlayer = (playerPos) => {
          model.lookAt(playerPos.x, model.position.y, playerPos.z);
        };

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              // Fix weird texture rendering often found in Meshy outputs
              child.material.transparent = false;
              child.material.depthWrite = true;
              if (child.material.metalness !== undefined) child.material.metalness = 0.0;
              if (child.material.roughness !== undefined) child.material.roughness = 1.0;

              // Apply a green tint ONLY if it's the Goblin without a specific config
              if (m.name === 'Goblin' && child.material.color) {
                child.material.color.setHex(0x55aa55);
              }
            }
          }
        });

        m.mixer = new THREE.AnimationMixer(model);

        if (gltf.animations && gltf.animations.length > 0) {
          const idleAction = m.mixer.clipAction(gltf.animations[0]);
          m.actions.idle = idleAction;
          idleAction.play();
        }

        scene.add(model);

        // Load attack animation
        gltfLoader.load(attackPath, (animGltf) => {
          if (animGltf.animations && animGltf.animations.length > 0) {
            const attackClip = animGltf.animations[0];
            const attackAction = m.mixer.clipAction(attackClip);
            m.actions.attack = attackAction;

            attackAction.setLoop(THREE.LoopOnce, 1);
            attackAction.clampWhenFinished = true;

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

  if ((m.type === 'fbx' || m.type === 'glb') && m.actions.attack && m.actions.idle) {
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
