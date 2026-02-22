import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup, player } from './player.js';
import { createHitSpark } from './particles.js';
import { CELL } from './map.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { party, setHp, flashPortraitHit, showMemberDamage } from './party.js';
import { showMessage } from './minimap.js';
import {
  playerHitChance, monsterHitChance,
  calcPlayerPhysicalDamage, calcPlayerMagicDamage, calcMonsterDamage,
  pickRandomFrontLineTarget,
  CRIT_CHANCE, CRIT_MULTIPLIER,
  MONSTER_BASE_ATTACK, RESILIENCE_DAMAGE_FACTOR,
} from './combat-rules.js';
import { setInCombat, playCritSound } from './audio.js';
import { addLogEntry } from './battle-log.js';
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

// All monsters lined up in the test room (row 11, cols 18-25).
// Enter the test room from the starter room heading east — they're waiting in a row.
export const monsters = [
  inst(D.treekin, 0, 11, 18,
    '/monsters/meshy-AI-treeKin/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-treeKin/Meshy_AI_Animation_mage_soell_cast_withSkin.glb',
    '/monsters/meshy-AI-treeKin/treeKin-attack.mp3', 0.45),

  inst(D.goblin, 1, 11, 19,
    '/monsters/meshy-AI-goblin/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-goblin/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-goblin/goblin-attack.wav'),

  inst(D.albino_goblin, 2, 11, 20,
    '/monsters/meshy-AI-abbino-goblin/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-abbino-goblin/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-abbino-goblin/albino-goblin-attack.mp3'),

  inst(D.zombie, 3, 11, 21,
    '/monsters/meshy-AI-zombie/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-zombie/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-zombie/zombie-attack.mp3'),

  inst(D.ghoul, 4, 11, 22,
    '/monsters/meshy-AI-ghoul/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-ghoul/Meshy_AI_Animation_Basic_Jump_withSkin.glb',
    '/monsters/meshy-AI-ghoul/ghoul-attack.mp3'),

  inst(D.iceman, 5, 11, 23,
    '/monsters/meshy-AI-iceMan/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-iceMan/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-iceMan/iceman-attack.mp3', 0.6),

  inst(D.albino_goblin, 6, 11, 24,
    '/monsters/meshy-AI-abbino-goblin/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-abbino-goblin/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-abbino-goblin/albino-goblin-attack.mp3'),

  inst(D.orc, 7, 11, 25,
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

      // ── HP bar label (CSS2DObject) ──────────────────────────────────────
      const barWrap = document.createElement('div');
      barWrap.className = 'monster-hp-bar';
      const barFill = document.createElement('div');
      barFill.className = 'monster-hp-fill';
      barWrap.appendChild(barFill);
      m.hpBarFill = barFill;

      const hpLabel = new CSS2DObject(barWrap);
      hpLabel.position.set(0, 1.8, 0);
      model.add(hpLabel);
      m.hpLabel = hpLabel;

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

export function updateMonsters(dt, playerCamera, scene) {
  monsters.forEach((m) => {
    if (!m.alive) {
      if (m.hpLabel) m.hpLabel.visible = false;
      return;
    }

    if (m.mixer) m.mixer.update(dt);

    if (m.mesh && playerCamera && m.lookAtPlayer) {
      m.lookAtPlayer(playerCamera.position);
    }

    // HP bar is only visible when the party is engaged in melee range with
    // this monster — same adjacency check used for proximity attacks.
    const distRow = Math.abs(m.gridRow - player.gridRow);
    const distCol = Math.abs(m.gridCol - player.gridCol);
    const inRange = distRow <= 1 && distCol <= 1;

    if (m.hpLabel) m.hpLabel.visible = inRange;

    // Proximity attack logic: if player is adjacent, attack them periodically
    if (inRange) {
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

  // Update the HP bar above the monster's head
  if (m.hpBarFill) {
    const pct = m.hpMax > 0 ? (m.hp / m.hpMax) * 100 : 0;
    m.hpBarFill.style.width = `${pct}%`;
  }

  setInCombat();

  if (m.hp === 0) {
    m.alive = false;
    if (m.hpBarFill) m.hpBarFill.parentElement.style.display = 'none';
    addLogEntry({ type: 'death', target: m.name, time: Date.now() });
    _playDeathAnimation(m);
  } else {
    _playHitAnimation(m, attackType);
  }

  return { hit: true, damage, killed: m.hp === 0, monsterHp: m.hp };
}

export function attackMonster(monsterId, character, weaponDef, attackType) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return { hit: false, damage: 0, killed: false, monsterHp: 0, crit: false, hitChance: 0, formula: null, monsterName: '' };

  const hitChance = playerHitChance(character, m);

  // DEX-based hit chance — higher DEX advantage means more reliable hits
  if (Math.random() >= hitChance) {
    return { hit: false, damage: 0, killed: false, monsterHp: m.hp, crit: false, hitChance, formula: null, monsterName: m.name };
  }

  // Fireball uses INT + monster magic resilience; all other attacks use STR + monster defence
  const isMagic = attackType === 'fireball';
  const preCritDamage = isMagic
    ? calcPlayerMagicDamage(character, weaponDef, m)
    : calcPlayerPhysicalDamage(character, weaponDef, m);

  // 5% chance to critically hit — triples the calculated damage
  const isCrit = Math.random() < CRIT_CHANCE;
  const damage = isCrit ? Math.round(preCritDamage * CRIT_MULTIPLIER) : preCritDamage;

  const formula = {
    weaponBase: weaponDef?.baseDamage ?? 0,
    statBonus: isMagic ? (character.stats?.intelligence ?? 10) : (character.stats?.strength ?? 10),
    mitigation: isMagic ? (m.stats?.resilience ?? 0) : (m.defence ?? 0),
    preCritDamage,
    critMultiplier: isCrit ? CRIT_MULTIPLIER : 1,
  };

  const result = hitMonster(monsterId, damage, attackType);
  return { ...result, crit: isCrit, hitChance, formula, monsterName: m.name };
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
  const hitChance = monsterHitChance(monster, target);
  if (Math.random() >= hitChance) {
    addLogEntry({
      time: Date.now(), actor: 'monster',
      attacker: monster.name, target: target.name,
      attackType: 'attack', hitChance, hit: false, crit: false,
    });
    return;
  }

  const preCritDamage = calcMonsterDamage(monster, target);
  const mitigation = Math.floor((target.stats?.resilience ?? 0) * RESILIENCE_DAMAGE_FACTOR);

  // 5% chance to critically hit — triples the calculated damage
  const isCrit = Math.random() < CRIT_CHANCE;
  const damage = isCrit ? Math.round(preCritDamage * CRIT_MULTIPLIER) : preCritDamage;

  setHp(target.id, target.hp - damage);
  flashPortraitHit(target.id);
  if (isCrit) playCritSound('bash');

  // Float the damage number above the character's portrait
  showMemberDamage(target.id, damage, isCrit);

  addLogEntry({
    time: Date.now(), actor: 'monster',
    attacker: monster.name, target: target.name,
    attackType: 'attack', hitChance, hit: true, crit: isCrit,
    statBonus: monster.stats?.strength ?? 10,
    baseBonus: MONSTER_BASE_ATTACK,
    mitigation,
    preCritDamage,
    finalDamage: damage,
    critMultiplier: isCrit ? CRIT_MULTIPLIER : 1,
  });

  // Only announce a kill — routine damage is shown on the portrait popup
  if (target.isDead) {
    showMessage(`${monster.name} strikes <b>${target.name}</b> — they have fallen!`, 3500);
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
