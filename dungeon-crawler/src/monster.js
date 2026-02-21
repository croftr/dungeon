import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup, player } from './player.js';
import { CELL } from './map.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER DATA
// ─────────────────────────────────────────────────────────────────────────────

export const monsters = [
  {
    id: 0,
    type: 'glb',
    name: 'TreeKin',
    gridRow: 4,
    gridCol: 13,
    hp: 150, hpMax: 150,
    stats: { strength: 18, dexterity: 6, vitality: 15, intelligence: 12, resilience: 12 },
    defence: 15, alive: true, mesh: null, mixer: null, actions: {},
    glbIdle: '/monsters/meshy-AI-treeKin/Meshy_AI_Animation_Walking_withSkin.glb',
    glbAttack: '/monsters/meshy-AI-treeKin/Meshy_AI_Animation_mage_soell_cast_withSkin.glb',
    attackSound: '/monsters/meshy-AI-treeKin/treeKin-attack.mp3',
    scale: 0.45
  },
  {
    id: 1,
    type: 'glb',
    name: 'Goblin',
    gridRow: 4,
    gridCol: 9,
    hp: 80, hpMax: 80,
    stats: { strength: 12, dexterity: 15, vitality: 8, intelligence: 5, resilience: 5 },
    defence: 8, alive: true, mesh: null, mixer: null, actions: {},
    glbIdle: '/monsters/meshy-AI-goblin/Meshy_AI_Animation_Walking_withSkin.glb',
    glbAttack: '/monsters/meshy-AI-goblin/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    attackSound: '/monsters/meshy-AI-goblin/goblin-attack.wav',
    scale: 0.45
  },
  {
    id: 2,
    type: 'glb',
    name: 'IceMan',
    gridRow: 5,
    gridCol: 4,
    hp: 120, hpMax: 120,
    stats: { strength: 15, dexterity: 8, vitality: 12, intelligence: 10, resilience: 10 },
    defence: 12, alive: true, mesh: null, mixer: null, actions: {},
    glbIdle: '/monsters/meshy-AI-iceMan/Meshy_AI_Animation_Walking_withSkin.glb',
    glbAttack: '/monsters/meshy-AI-iceMan/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    attackSound: '/monsters/meshy-AI-iceMan/iceman-attack.mp3',
    scale: 0.6
  }
];

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────

export function initMonsters(scene) {
  const gltfLoader = new GLTFLoader();

  monsters.forEach((m) => {
    if (!m.alive) return;

    // Load the idle/walking GLB as the base mesh
    gltfLoader.load(m.glbIdle, (gltf) => {
      const model = gltf.scene;
      m.mesh = model;

      model.scale.setScalar(m.scale);

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
            child.material.transparent = false;
            child.material.depthWrite = true;
            if (child.material.metalness !== undefined) child.material.metalness = 0.0;
            if (child.material.roughness !== undefined) child.material.roughness = 1.0;

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

      // Load the attack animation GLB
      gltfLoader.load(m.glbAttack, (animGltf) => {
        if (animGltf.animations && animGltf.animations.length > 0) {
          const attackClip = animGltf.animations[0];
          const attackAction = m.mixer.clipAction(attackClip);
          m.actions.attack = attackAction;

          attackAction.setLoop(THREE.LoopOnce, 1);
          attackAction.clampWhenFinished = true;

          // When attack finishes, fade back to idle
          m.mixer.addEventListener('finished', (e) => {
            if (e.action === m.actions.attack && m.actions.idle) {
              m.actions.idle.reset().play();
              m.actions.attack.crossFadeTo(m.actions.idle, 0.25, false);
            }
          });
        }
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATION  (called every frame from main.js)
// ─────────────────────────────────────────────────────────────────────────────

export function updateMonsters(dt, playerCamera) {
  monsters.forEach((m) => {
    if (!m.alive) return;

    if (m.mixer) m.mixer.update(dt);

    if (m.mesh && playerCamera && m.lookAtPlayer) {
      m.lookAtPlayer(playerCamera.position);
    }

    // Proximity attack logic: if player is adjacent, attack them periodically
    const distRow = Math.abs(m.gridRow - player.gridRow);
    const distCol = Math.abs(m.gridCol - player.gridCol);
    if (distRow <= 1 && distCol <= 1) {
      m.attackCooldown = (m.attackCooldown || 0) - dt;
      if (m.attackCooldown <= 0) {
        triggerMonsterAttack(m.id);
        m.attackCooldown = 5.0 + (Math.random() * 2.0); // Next attack in 5.0 - 7.0 seconds
      }
    } else {
      // Ready to attack immediately when player steps close
      m.attackCooldown = 0;
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
    triggerMonsterAttack(monsterId);
    _playHitAnimation(m);
  }

  return { hit: true, damage, killed: m.hp === 0, monsterHp: m.hp };
}

export function attackMonster(monsterId, baseDamage, heroStrength) {
  const rawDamage = (baseDamage ?? 0) + (heroStrength ?? 10);
  return hitMonster(monsterId, rawDamage);
}

export function triggerMonsterAttack(monsterId) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return;

  if (m.actions.attack && m.actions.idle) {
    m.actions.attack.reset();
    m.actions.attack.setEffectiveTimeScale(1);
    m.actions.attack.setEffectiveWeight(1);
    m.actions.attack.play();
    m.actions.idle.crossFadeTo(m.actions.attack, 0.2, true);

    if (m.attackSound) {
      const audio = new Audio(m.attackSound);
      audio.volume = 0.6;
      audio.play().catch(e => console.warn('Audio play prevented:', e));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HIT / DEATH TWEENS
// ─────────────────────────────────────────────────────────────────────────────

function _playHitAnimation(m) {
  if (!m.mesh) return;
  const mesh = m.mesh;

  // Flash red on emissive channel
  mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(mat => {
        if (mat.emissive) {
          const origEmissive = mat.emissive.getHex();
          mat.emissive.setHex(0xaa0000);
          setTimeout(() => { mat.emissive.setHex(origEmissive); }, 150);
        }
      });
    }
  });

  // Small knockback
  const origin = { z: mesh.position.z };
  new Tween(mesh.position, tweenGroup)
    .to({ z: origin.z + 0.18 }, 80)
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
      mesh.position.y = fadeObj.y;
      mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(mat => {
            mat.transparent = true;
            mat.opacity = fadeObj.opacity;
            mat.depthWrite = false;
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
