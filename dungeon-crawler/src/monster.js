import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup, player } from './player.js';
import { createHitSpark } from './particles.js';
import { CELL } from './map.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { party, setHp, flashPortraitHit } from './party.js';
import { showMessage } from './minimap.js';
import {
  playerHitChance, monsterHitChance,
  calcPlayerPhysicalDamage, calcPlayerMagicDamage, calcMonsterDamage,
  pickRandomFrontLineTarget,
  CRIT_CHANCE, CRIT_MULTIPLIER,
} from './combat-rules.js';
import { setInCombat, playCritSound } from './audio.js';
import { MONSTER_DEFS as D } from './monster-defs.js';

// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER INSTANCES
//  Stats (hp, defence, stats{}) come from monster-defs.js — edit there.
//  Only instance-specific data lives here: map position, assets, game state.
// ─────────────────────────────────────────────────────────────────────────────

function inst(def, id, gridRow, gridCol, glbIdle, glbAttack, attackSound, scale = 0.45) {
  return {
    id, type: 'glb',
    ...def,
    hpMax: def.hp,
    gridRow, gridCol,
    alive: true, mesh: null, mixer: null, actions: {},
    glbIdle, glbAttack, attackSound, scale,
  };
}

export const monsters = [
  inst(D.treekin,      0, 13,  5,
    '/monsters/meshy-AI-treeKin/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-treeKin/Meshy_AI_Animation_mage_soell_cast_withSkin.glb',
    '/monsters/meshy-AI-treeKin/treeKin-attack.mp3', 0.45),

  inst(D.goblin,       1,  9,  2,
    '/monsters/meshy-AI-goblin/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-goblin/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-goblin/goblin-attack.wav'),

  inst(D.albino_goblin, 2, 15,  3,
    '/monsters/meshy-AI-abbino-goblin/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-abbino-goblin/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-abbino-goblin/albino-goblin-attack.mp3'),

  inst(D.zombie,       4, 19,  7,
    '/monsters/meshy-AI-zombie/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-zombie/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-zombie/zombie-attack.mp3'),

  inst(D.ghoul,        5, 17,  3,
    '/monsters/meshy-AI-ghoul/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-ghoul/Meshy_AI_Animation_Basic_Jump_withSkin.glb',
    '/monsters/meshy-AI-ghoul/ghoul-attack.mp3'),

  inst(D.iceman,       3, 21,  1,
    '/monsters/meshy-AI-iceMan/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-iceMan/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-iceMan/iceman-attack.mp3', 0.6),

  inst(D.albino_goblin, 6, 19,  3,
    '/monsters/meshy-AI-abbino-goblin/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-abbino-goblin/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-abbino-goblin/albino-goblin-attack.mp3'),

  inst(D.orc,          7, 21, 12,
    '/monsters/meshy-AI-orc/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-orc/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-orc/orc-attack.mp3', 0.5),
];

export function isMonsterAt(row, col) {
  return monsters.some(m => m.alive && m.gridRow === row && m.gridCol === col);
}

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

export function hitMonster(monsterId, finalDamage, attackType) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return { hit: false, damage: 0, killed: false, monsterHp: 0 };

  // finalDamage is pre-calculated by attackMonster via combat-rules.js
  const damage = Math.max(1, finalDamage);
  m.hp = Math.max(0, m.hp - damage);

  setInCombat();

  if (m.hp === 0) {
    m.alive = false;
    _playDeathAnimation(m);
  } else {
    _playHitAnimation(m, attackType);
  }

  return { hit: true, damage, killed: m.hp === 0, monsterHp: m.hp };
}

export function attackMonster(monsterId, character, weaponDef, attackType) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return { hit: false, damage: 0, killed: false, monsterHp: 0, crit: false };

  // DEX-based hit chance — higher DEX advantage means more reliable hits
  if (Math.random() >= playerHitChance(character, m)) {
    return { hit: false, damage: 0, killed: false, monsterHp: m.hp, crit: false };
  }

  // Fireball uses INT + monster magic resilience; all other attacks use STR + monster defence
  const isMagic = attackType === 'fireball';
  let damage    = isMagic
    ? calcPlayerMagicDamage(character, weaponDef, m)
    : calcPlayerPhysicalDamage(character, weaponDef, m);

  // 5% chance to critically hit — triples the calculated damage
  const isCrit = Math.random() < CRIT_CHANCE;
  if (isCrit) damage = Math.round(damage * CRIT_MULTIPLIER);

  const result = hitMonster(monsterId, damage, attackType);
  return { ...result, crit: isCrit };
}

export function triggerMonsterAttack(monsterId) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return;

  setInCombat();

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

  // Apply damage timed to mid-swing (~300ms in)
  setTimeout(() => { _applyMonsterDamage(m); }, 300);
}

function _applyMonsterDamage(monster) {
  const target = pickRandomFrontLineTarget(party);
  if (!target) return;   // entire party wiped

  // DEX-based hit chance — nimble characters are harder for slow monsters to land on
  if (Math.random() >= monsterHitChance(monster, target)) {
    showMessage(`${monster.name} swings at <b>${target.name}</b> — and misses!`);
    return;
  }

  let damage = calcMonsterDamage(monster, target);

  // 5% chance to critically hit — triples the calculated damage
  const isCrit = Math.random() < CRIT_CHANCE;
  if (isCrit) damage = Math.round(damage * CRIT_MULTIPLIER);

  setHp(target.id, target.hp - damage);

  flashPortraitHit(target.id);
  if (isCrit) playCritSound('bash');

  if (target.isDead) {
    showMessage(`${monster.name} strikes <b>${target.name}</b> — they have fallen!`, 3500);
  } else if (isCrit) {
    showMessage(`<span style="color:#ff8800">⚡ CRITICAL!</span> ${monster.name} smashes <b>${target.name}</b> for <b>${damage}</b> damage! (${target.hp}/${target.hpMax} HP)`, 3000);
  } else {
    showMessage(`${monster.name} hits <b>${target.name}</b> for <b>${damage}</b> damage! (${target.hp}/${target.hpMax} HP)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HIT / DEATH TWEENS
// ─────────────────────────────────────────────────────────────────────────────

function _playHitAnimation(m, attackType) {
  if (!m.mesh) return;
  const mesh = m.mesh;

  if (attackType === 'fireball') {
    createHitSpark(mesh.position);
  }

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
