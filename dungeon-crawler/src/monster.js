import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup, player } from './player.js';
import { createHitSpark } from './particles.js';
import { CELL } from './map.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { party, setHp, flashPortraitHit, showMemberDamage, refreshPartyCards, applyStatusEffect } from './party.js';
import { STATUS_EFFECT_DEFS } from './status-effects.js';
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
import { getItemDef } from './items.js';
import { MONSTER_DEFS as D } from './monster-defs.js';
import { skillsState } from './skills-state.js';

// ─────────────────────────────────────────────────────────────────────────────
//  HUNTER'S EYE STATE  — tracks which monster is currently being analysed
// ─────────────────────────────────────────────────────────────────────────────
let _huntersEyeTargetId = null;

/** Returns the id of the monster currently targeted by Hunter's Eye, or null. */
export function getHuntersEyeTargetId() { return _huntersEyeTargetId; }

/** Show or hide the detailed stats panel above the chosen monster. Pass null to hide all. */
export function setHuntersEyeTarget(id) {
  _huntersEyeTargetId = id;
  monsters.forEach((m) => {
    const show = id !== null && m.id === id && m.alive;
    if (m.statsLabel) m.statsLabel.visible = show;
    if (show && m.statsPanel) _updateStatsPanel(m);
  });
}

/** Returns the first alive monster within melee range of the player, or null. */
export function getInRangeMonster() {
  return monsters.find(
    (m) => m.alive &&
      Math.abs(m.gridRow - player.gridRow) <= 1 &&
      Math.abs(m.gridCol - player.gridCol) <= 1
  ) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MONSTER INSTANCES
//  Stats (hp, defence, stats{}) come from monster-defs.js — edit there.
//  Only instance-specific data lives here: map position, assets, game state.
// ─────────────────────────────────────────────────────────────────────────────

function inst(def, id, gridRow, gridCol, glbIdle, glbAttack, attackSound, scale = 0.45, offsetX = 0, offsetZ = 0, level = 1, patrol = null) {
  return {
    id, type: 'glb',
    ...def,
    hpMax: def.hp,
    gridRow, gridCol,
    offsetX, offsetZ,
    alive: true, mesh: null, mixer: null, actions: {},
    glbIdle, glbAttack, attackSound, scale,
    level,
    patrol,
  };
}

// Monsters spread through the western dungeon. The big east room is merchant territory.
// Treekin lurks north of the portcullis — players must open it to face him.
export const monsters = [
  // North dead-end passage (behind the portcullis — opens when the wall button is pressed)
  inst(D.treekin, 0, 3, 7,
    '/monsters/meshy-AI-treeKin/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-treeKin/Meshy_AI_Animation_mage_soell_cast_withSkin.glb',
    '/monsters/meshy-AI-treeKin/treeKin-attack.mp3', 0.45),

  // Upper maze
  inst(D.goblin, 1, 9, 6,
    '/monsters/meshy-AI-goblin/Meshy_AI_Animation_Agree_Gesture_withSkin.glb',
    '/monsters/meshy-AI-goblin/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-goblin/goblin-attack.wav'),

  // Southern section
  inst(D.albino_goblin, 2, 15, 5,
    '/monsters/meshy-AI-abbino-goblin/Meshy_AI_Animation_Agree_Gesture_withSkin.glb',
    '/monsters/meshy-AI-abbino-goblin/Meshy_AI_Animation_Triple_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-abbino-goblin/albino-goblin-attack.mp3'),

  // Lower maze — zombie lurks in the far lower-right section, well past the row-14 barrier
  inst(D.zombie, 3, 17, 12,
    '/monsters/meshy-AI-zombie/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-zombie/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-zombie/zombie-attack.mp3'),

  // Lower maze
  inst(D.ghoul, 4, 17, 11,
    '/monsters/meshy-AI-ghoul/Meshy_AI_Animation_Agree_Gesture_withSkin.glb',
    '/monsters/meshy-AI-ghoul/Meshy_AI_Animation_Basic_Jump_withSkin.glb',
    '/monsters/meshy-AI-ghoul/ghoul-attack.mp3'),

  // Deeper south passage
  inst(D.orc, 7, 19, 8,
    '/monsters/meshy-AI-orc/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-orc/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-orc/orc-attack.mp3', 0.5),

  // Bottom long corridor
  inst(D.iceman, 5, 21, 5,
    '/monsters/meshy-AI-iceMan/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/meshy-AI-iceMan/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/meshy-AI-iceMan/iceman-attack.mp3', 0.6),

  // ── Level 2 ─────────────────────────────────────────────────────────────
  // One Treeman patrols the chamber. Patrol bounds match the level-2 map
  // interior: rows 1–5, cols 1–6.
  inst(D.treeman, 8, 5, 5,
    '/monsters/treeman/Meshy_AI_Animation_Walking_withSkin.glb',
    '/monsters/treeman/Meshy_AI_Animation_Double_Combo_Attack_withSkin.glb',
    '/monsters/treeman/attack-sound.mp3', 0.90, 0, 0, 2,
    { bounds: { minRow: 1, maxRow: 5, minCol: 1, maxCol: 6 }, speed: 1.2, waitTime: 2.5 }),
];

export function isMonsterAt(row, col) {
  return monsters.some(m => m.alive && m.gridRow === row && m.gridCol === col);
}

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────

/** Rebuild the HTML content of a monster's Hunter's Eye stats panel. */
function _updateStatsPanel(m) {
  if (!m.statsPanel) return;
  const s = m.stats ?? {};

  const isSundered = skillsState.sunderArmor?.active && skillsState.sunderArmor?.targetId === m.id;
  const defVal = m.defence ?? '—';
  const resVal = s.resilience ?? '—';

  const displayDef = isSundered && defVal !== '—' ? `<span style="color:#ff8080">${Math.floor(defVal / 2)}</span>` : defVal;
  const displayRes = isSundered && resVal !== '—' ? `<span style="color:#ff8080">${Math.floor(resVal / 2)}</span>` : resVal;

  const isEntangled = skillsState.entangle?.active && skillsState.entangle?.targetId === m.id;
  const isStunned = m.stunUntil && performance.now() < m.stunUntil;
  const isPoisoned = m.poisonUntil && performance.now() < m.poisonUntil;

  // On-hit effects section — shows what debuffs this monster type can inflict
  let onHitHtml = '';
  if (m.onHitEffects?.length) {
    onHitHtml += `<div class="hep-divider"></div><div class="hep-section-label">On-Hit Effects</div><div class="hep-debuffs">`;
    m.onHitEffects.forEach(effect => {
      const def = STATUS_EFFECT_DEFS[effect.effectId];
      const name = def?.name ?? effect.effectId;
      const chance = Math.round(effect.chance * 100);
      const desc = def?.tickDamage != null
        ? `${def.tickDamage} HP / ${def.tickInterval}s · ${def.duration}s`
        : '';
      const descPart = desc ? ` <span class="hep-effect-desc">(${desc})</span>` : '';
      onHitHtml += `<div class="hep-debuff hep-on-hit" style="color:#c0ff80">`
        + `<span class="hep-effect-name">${name}</span>`
        + `<span class="hep-effect-chance">${chance}%</span>`
        + descPart
        + `</div>`;
    });
    onHitHtml += `</div>`;
  }

  // Active debuffs currently applied to this monster from player skills
  let debuffsHtml = '';
  if (isSundered || isEntangled || isStunned || isPoisoned) {
    debuffsHtml += `<div class="hep-divider"></div><div class="hep-section-label">Active Effects</div><div class="hep-debuffs">`;
    if (isSundered) {
      debuffsHtml += `<div class="hep-debuff" style="color:#ff8080">Sunder Armor (DEF/RES ½)</div>`;
    }
    if (isEntangled) {
      debuffsHtml += `<div class="hep-debuff" style="color:#80ff80">Entangle (Atk Spd ½)</div>`;
    }
    if (isStunned) {
      debuffsHtml += `<div class="hep-debuff" style="color:#ffd040">Stunned (Cannot Act)</div>`;
    }
    if (isPoisoned) {
      debuffsHtml += `<div class="hep-debuff" style="color:#50ff50">Poisoned (1 HP / 2s)</div>`;
    }
    debuffsHtml += `</div>`;
  }

  m.statsPanel.innerHTML =
    `<div class="hep-name">${m.name}</div>` +
    `<div class="hep-row"><span class="hep-label">HP</span><span class="hep-val">${m.hp} / ${m.hpMax}</span></div>` +
    `<div class="hep-divider"></div>` +
    `<div class="hep-grid">` +
    `<span class="hep-stat">STR <b>${s.strength ?? '—'}</b></span>` +
    `<span class="hep-stat">DEX <b>${s.dexterity ?? '—'}</b></span>` +
    `<span class="hep-stat">VIT <b>${s.vitality ?? '—'}</b></span>` +
    `<span class="hep-stat">INT <b>${s.intelligence ?? '—'}</b></span>` +
    `<span class="hep-stat">RES <b>${displayRes}</b></span>` +
    `<span class="hep-stat">DEF <b>${displayDef}</b></span>` +
    `</div>` +
    onHitHtml +
    debuffsHtml;
}

export function initMonsters(scene) {
  const gltfLoader = new GLTFLoader();

  monsters.forEach((m) => {
    if (!m.alive) return;

    // Load the idle/walking GLB as the base mesh
    gltfLoader.load(m.glbIdle, (gltf) => {
      const model = gltf.scene;
      m.mesh = model;

      model.scale.setScalar(m.scale);

      const wx = m.gridCol * CELL + (m.offsetX ?? 0);
      const wz = m.gridRow * CELL + (m.offsetZ ?? 0);
      model.position.set(wx, 0.0, wz);

      m.lookAtPlayer = (playerPos) => {
        model.lookAt(playerPos.x, model.position.y, playerPos.z);
      };

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          // Fix pixelation on monster textures
          if (child.material && child.material.map) {
            child.material.map.magFilter = THREE.LinearFilter;
            child.material.map.minFilter = THREE.LinearMipmapLinearFilter;
            child.material.map.anisotropy = 16;
          }

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
        // Agree Gesture animations run fast — halve the speed so they look natural
        if (m.glbIdle.includes('Agree_Gesture')) {
          idleAction.setEffectiveTimeScale(0.5);
        }
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

      // ── Hunter's Eye stats panel (CSS2DObject) ─────────────────────────
      const statsDiv = document.createElement('div');
      statsDiv.className = 'monster-stats-panel';
      _updateStatsPanel({ ...m, statsPanel: statsDiv }); // seed initial HTML
      m.statsPanel = statsDiv;

      const statsLabel = new CSS2DObject(statsDiv);
      statsLabel.position.set(0, 2.6, 0); // above the HP bar
      statsLabel.visible = false;
      model.add(statsLabel);
      m.statsLabel = statsLabel;

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
//  PATROL  — random-wander AI for roaming monsters
// ─────────────────────────────────────────────────────────────────────────────

/** Shared directions array to avoid per-frame allocations during patrol AI */
const PATROL_DIRECTIONS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

/**
 * Moves a patrolling monster toward a random target cell within its patrol
 * bounds.  Called every frame from updateMonsters when the player is out of
 * attack range.
 *
 * Patrol state is stored on the monster object as `m._ps`:
 *   { moving: bool, targetRow, targetCol, waitTimer }
 */
function _updatePatrol(m, dt) {
  if (!m.mesh || !m.patrol) return;

  // Lazy-initialise patrol state; stagger start times so multiple patrol
  // monsters don't all move in lock-step.
  if (!m._ps) {
    m._ps = {
      moving: false,
      targetRow: m.gridRow,
      targetCol: m.gridCol,
      waitTimer: Math.random() * 3.0,   // staggered first move
    };
  }

  const ps = m._ps;
  const b = m.patrol.bounds;
  const spd = (m.patrol.speed ?? 1.2) * CELL;  // world-units / second

  if (!ps.moving) {
    // ── waiting at current cell ──────────────────────────────────────────
    ps.waitTimer -= dt;
    if (ps.waitTimer > 0) return;

    // Pick one random adjacent cell (N / S / E / W) that lies inside the
    // patrol bounds.  Moving one cell at a time keeps gridRow/gridCol
    // anchored to real cell centres — the mid-move approximation that caused
    // the half-grid combat gap is avoided entirely.
    // Fisher-Yates shuffle for unbiased direction selection
    for (let i = PATROL_DIRECTIONS.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [PATROL_DIRECTIONS[i], PATROL_DIRECTIONS[j]] = [PATROL_DIRECTIONS[j], PATROL_DIRECTIONS[i]];
    }
    let chosen = false;
    for (const d of PATROL_DIRECTIONS) {
      const nr = m.gridRow + d.dr;
      const nc = m.gridCol + d.dc;
      if (nr >= b.minRow && nr <= b.maxRow && nc >= b.minCol && nc <= b.maxCol) {
        ps.targetRow = nr;
        ps.targetCol = nc;
        ps.moving = true;
        chosen = true;
        break;
      }
    }
    if (!chosen) ps.waitTimer = 1.0; // hemmed in — retry shortly
    return;
  }

  // ── moving toward the adjacent target cell ───────────────────────────────
  const targetX = ps.targetCol * CELL + (m.offsetX ?? 0);
  const targetZ = ps.targetRow * CELL + (m.offsetZ ?? 0);
  const dx = targetX - m.mesh.position.x;
  const dz = targetZ - m.mesh.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < 0.05) {
    // Snap to exact cell centre and commit the new grid position.
    // gridRow/gridCol are ONLY updated here (on arrival), never mid-step,
    // so inRange checks always reference a true cell centre.
    m.mesh.position.x = targetX;
    m.mesh.position.z = targetZ;
    m.gridRow = ps.targetRow;
    m.gridCol = ps.targetCol;
    ps.moving = false;
    ps.waitTimer = (m.patrol.waitTime ?? 2.5) + Math.random() * 2.0;
  } else {
    const step = Math.min(spd * dt, dist);
    m.mesh.position.x += (dx / dist) * step;
    m.mesh.position.z += (dz / dist) * step;
    // Face the direction of travel (lookAt convention matches lookAtPlayer)
    m.mesh.lookAt(targetX, m.mesh.position.y, targetZ);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATION  (called every frame from main.js)
// ─────────────────────────────────────────────────────────────────────────────

export function updateMonsters(dt, playerCamera, scene) {
  const currentLevel = window.currentLevel || 1;
  monsters.forEach((m) => {
    if (!m.alive || currentLevel !== (m.level ?? 1)) {
      if (m.hpLabel) m.hpLabel.visible = false;
      if (m.statsLabel) m.statsLabel.visible = false;
      if (_huntersEyeTargetId === m.id) _huntersEyeTargetId = null;
      if (m.mesh) m.mesh.visible = false;
      return;
    }
    if (m.mesh) m.mesh.visible = true;

    // Poison Tick Logic
    if (m.poisonUntil && performance.now() < m.poisonUntil) {
      m.poisonTimer = (m.poisonTimer || 0) + dt;
      if (m.poisonTimer >= 2.0) {
        m.poisonTimer = 0;
        hitMonster(m.id, 1, 'poison-dot');
      }
    } else {
      m.poisonTimer = 0;
    }

    if (m.mixer) m.mixer.update(dt);

    // Proximity check — used for HP bar, Hunter's Eye, patrol, and attack logic
    const distRow = Math.abs(m.gridRow - player.gridRow);
    const distCol = Math.abs(m.gridCol - player.gridCol);
    const inRange = distRow <= 1 && distCol <= 1;

    // Non-patrol monsters always face the player; patrol monsters only turn
    // to face the player once they are adjacent (otherwise patrol handles rotation).
    if (m.mesh && playerCamera && m.lookAtPlayer && (!m.patrol || inRange)) {
      m.lookAtPlayer(playerCamera.position);
    }

    // HP bar is only visible when the party is engaged in melee range with
    // this monster — same adjacency check used for proximity attacks.
    if (m.hpLabel) m.hpLabel.visible = inRange;

    // Auto-deactivate Hunter's Eye if the player disengages from this monster
    if (_huntersEyeTargetId === m.id && !inRange) {
      _huntersEyeTargetId = null;
      if (m.statsLabel) m.statsLabel.visible = false;
    }

    // Patrol movement — only runs when the player is out of attack range
    if (m.patrol && !inRange) {
      _updatePatrol(m, dt);
    }

    // Proximity attack logic: if player is adjacent, attack them periodically
    if (inRange) {
      if (m.stunUntil && performance.now() < m.stunUntil) {
        // Monster is stunned; cooldown timer doesn't tick down yet
      } else {
        m.attackCooldown = (m.attackCooldown || 0) - dt;
        if (m.attackCooldown <= 0) {
          triggerMonsterAttack(m.id);
          let nextAttack = 5.0 + (Math.random() * 2.0); // Next attack in 5.0 - 7.0 seconds
          if (skillsState.entangle?.active && skillsState.entangle?.targetId === m.id) {
            nextAttack *= 2.0;
          }
          m.attackCooldown = nextAttack;
        }
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

export function showMonsterDamage(monsterId, damage, isCrit) {
  const m = monsters.find(x => x.id === monsterId);
  if (!m || !m.mesh) return;

  // We use a wrapper div because CSS2DObject takes control of the element's transform.
  // If we animate 'transform' on the same element, they fight and the world-position 
  // following breaks. By animating only the inner div, we keep the follow-logic.
  const wrapper = document.createElement('div');
  wrapper.className = 'monster-damage-wrapper';

  const inner = document.createElement('div');
  inner.className = 'monster-damage-popup' + (isCrit ? ' damage-popup--crit' : '');
  inner.textContent = damage;
  wrapper.appendChild(inner);

  const label = new CSS2DObject(wrapper);
  // Place it significantly above the health bar (1.8) and stats (2.6)
  label.position.set(0, 2.8, 0);
  m.mesh.add(label);

  setTimeout(() => {
    if (m.mesh) m.mesh.remove(label);
  }, 850);
}

export function hitMonster(monsterId, finalDamage, attackType, isCrit = false, killer = null) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return { hit: false, damage: 0, killed: false, monsterHp: 0 };

  // finalDamage is pre-calculated by attackMonster via combat-rules.js
  const damage = Math.max(1, finalDamage);
  m.hp = Math.max(0, m.hp - damage);

  showMonsterDamage(monsterId, damage, isCrit);

  // Update the HP bar above the monster's head
  if (m.hpBarFill) {
    const pct = m.hpMax > 0 ? (m.hp / m.hpMax) * 100 : 0;
    m.hpBarFill.style.width = `${pct}%`;
  }

  // Keep the Hunter's Eye panel in sync if it's currently showing
  if (m.statsLabel?.visible) _updateStatsPanel(m);

  setInCombat();

  if (m.hp === 0) {
    m.alive = false;
    if (m.hpBarFill) m.hpBarFill.parentElement.style.display = 'none';
    addLogEntry({ type: 'death', target: m.name, killer, damage, time: Date.now() });
    _playDeathAnimation(m);
  } else {
    _playHitAnimation(m, attackType);
  }

  return { hit: true, damage, killed: m.hp === 0, monsterHp: m.hp };
}

export function attackMonster(monsterId, character, weaponDef, attackType, ammoDef = null) {
  const m = monsters.find((x) => x.id === monsterId && x.alive);
  if (!m) return { hit: false, damage: 0, killed: false, monsterHp: 0, crit: false, hitChance: 0, formula: null, monsterName: '' };

  const hitChance = playerHitChance(character, m);

  // DEX-based hit chance — higher DEX advantage means more reliable hits
  if (Math.random() >= hitChance) {
    return { hit: false, damage: 0, killed: false, monsterHp: m.hp, crit: false, hitChance, formula: null, monsterName: m.name };
  }

  // Fireball uses INT + monster magic resilience; all other attacks use STR + monster defence
  const isMagic = attackType === 'fireball';

  // Apply Sunder Armor penalty
  const isSundered = skillsState.sunderArmor?.active && skillsState.sunderArmor?.targetId === m.id;
  const effectiveDefence = isSundered ? Math.floor((m.defence ?? 0) / 2) : (m.defence ?? 0);
  const effectiveResilience = isSundered ? Math.floor((m.stats?.resilience ?? 0) / 2) : (m.stats?.resilience ?? 0);

  const mSunder = {
    ...m,
    defence: effectiveDefence,
    stats: { ...m.stats, resilience: effectiveResilience }
  };

  const preCritDamage = isMagic
    ? calcPlayerMagicDamage(character, weaponDef, mSunder)
    : calcPlayerPhysicalDamage(character, weaponDef, mSunder, ammoDef);

  // 5% chance to critically hit — triples the calculated damage
  const isCrit = Math.random() < CRIT_CHANCE;
  let damage = isCrit ? Math.round(preCritDamage * CRIT_MULTIPLIER) : preCritDamage;

  // Runic Scholar — doubles final spell damage after ALL other modifiers (including crit)
  const runicActive = isMagic && character.runicScholarActive;
  if (runicActive) {
    damage = damage * 2;
    character.runicScholarActive = false; // consume the buff
    refreshPartyCards();                  // remove the glow from the skill slot
  }

  // Berserk — applies a x1.2 damage multiplier after everything else
  const berserkActive = skillsState.berserk?.active && skillsState.berserk?.actorName === character.name;
  if (berserkActive) {
    damage = Math.round(damage * 1.2);
  }

  // Compute the weighted stat bonus and label for the battle log
  let formulaStatBonus;
  let statLabel;
  if (isMagic) {
    formulaStatBonus = character.stats?.intelligence ?? 10;
    statLabel = 'INT';
  } else {
    const strW = weaponDef?.statWeights?.str ?? 1.0;
    const dexW = weaponDef?.statWeights?.dex ?? 0.0;
    formulaStatBonus = Math.floor(
      (character.stats?.strength ?? 10) * strW +
      (character.stats?.dexterity ?? 10) * dexW
    );
    statLabel = strW === 0 ? 'DEX' : dexW === 0 ? 'STR' : 'STR+DEX';
  }

  const formula = {
    weaponBase: weaponDef?.baseDamage ?? 0,
    statBonus: formulaStatBonus,
    statLabel,
    mitigation: isMagic ? effectiveResilience : effectiveDefence,
    preCritDamage,
    critMultiplier: isCrit ? CRIT_MULTIPLIER : 1,
    runicScholar: runicActive,
    berserkMultiplier: berserkActive ? 1.2 : 1.0,
    ammoModifier: ammoDef?.damageModifier ?? null,
  };

  const result = hitMonster(monsterId, damage, attackType, isCrit, character.name);

  let stunned = false;
  if (attackType === 'shield-bash' && result.hit && !result.killed) {
    if (Math.random() < 0.5) {
      stunned = true;
      m.stunUntil = performance.now() + 5000;
      showMessage(`${m.name} is stunned by the shield bash!`);
      if (m.statsLabel?.visible) _updateStatsPanel(m);
      setTimeout(() => { if (m.statsLabel?.visible) _updateStatsPanel(m); }, 5000); // refresh UI when it drops
    }
  }

  // Poison Logic
  let poisoned = false;
  if (ammoDef && ammoDef.damageType === 'poison' && result.hit && !result.killed) {
    m.poisonUntil = performance.now() + 30000;
    m.poisonTimer = 1.9; // Fast-forward first tick to feel impactful (0.1s later)
    showMessage(`${m.name} is poisoned!`);
    if (m.statsLabel?.visible) _updateStatsPanel(m);
    setTimeout(() => { if (m.statsLabel?.visible) _updateStatsPanel(m); }, 30000);
    poisoned = true;
  }

  return { ...result, crit: isCrit, hitChance, formula, monsterName: m.name, stunned, poisoned, sundered: isSundered };
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

  // Shield Block Check
  let blocked = false;
  const leftItem = target.equipment?.leftHand ? getItemDef(target.equipment.leftHand.name) : null;
  const rightItem = target.equipment?.rightHand ? getItemDef(target.equipment.rightHand.name) : null;

  const blockChance = Math.max(
    leftItem?.blockChance ?? 0,
    rightItem?.blockChance ?? 0
  );

  if (blockChance > 0 && Math.random() * 100 < blockChance) {
    blocked = true;
  }

  if (blocked) {
    addLogEntry({
      time: Date.now(), actor: 'monster',
      attacker: monster.name, target: target.name,
      attackType: 'attack', hitChance, hit: true, crit: false,
      blocked: true,
    });

    // UI Feedback for block
    const memberTop = document.querySelector(`#member-${target.id} .member-top`);
    if (memberTop) {
      const popup = document.createElement('span');
      popup.className = 'damage-popup damage-popup--incoming';
      popup.style.color = '#a0d8ff';
      popup.textContent = 'BLOCKED';
      memberTop.appendChild(popup);
      setTimeout(() => popup.remove(), 900);
    }

    return;
  }

  // Calculate character's total physical defence from equipped armour
  let charDefence = 0;
  const _counted = new Set();
  Object.values(target.equipment ?? {}).forEach(item => {
    if (item && !_counted.has(item)) {
      _counted.add(item);
      const itemDef = getItemDef(item.name);
      if (itemDef?.defence) charDefence += itemDef.defence;
    }
  });

  const preCritDamage = calcMonsterDamage(monster, target, charDefence);
  const resMitigation = Math.floor((target.stats?.resilience ?? 0) * RESILIENCE_DAMAGE_FACTOR);

  // 5% chance to critically hit — triples the calculated damage
  const isCrit = Math.random() < CRIT_CHANCE;
  let damage = isCrit ? Math.round(preCritDamage * CRIT_MULTIPLIER) : preCritDamage;

  // Sanctuary buff — Alaric's shield reduces all incoming party damage by 10%
  const sanctuaryUp = skillsState.sanctuary.active &&
    performance.now() < skillsState.sanctuary.expiresAt;
  if (sanctuaryUp) {
    damage = Math.max(1, Math.floor(damage * 0.9));
  }

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
    mitigation: resMitigation,
    defenceMitigation: charDefence,
    preCritDamage,
    finalDamage: damage,
    critMultiplier: isCrit ? CRIT_MULTIPLIER : 1,
  });

  // Apply on-hit status effects defined on this monster type
  if (!target.isDead) {
    (monster.onHitEffects ?? []).forEach(effect => {
      if (Math.random() < effect.chance) {
        applyStatusEffect(target.id, effect.effectId);
        const def = STATUS_EFFECT_DEFS[effect.effectId];
        addLogEntry({
          time: Date.now(),
          type: 'status-effect',
          actor: 'monster',
          attacker: monster.name,
          target: target.name,
          effectId: effect.effectId,
          effectName: def?.name ?? effect.effectId,
        });
      }
    });
  }

  // Only announce a kill — routine damage is shown on the portrait popup
  if (target.isDead) {
    showMessage(`<b>${target.name}</b> HAS FALLEN!`, 3500);
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
