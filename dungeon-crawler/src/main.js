import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { buildLevel, findCell, CELL_START, changeMapArray, level1Map, level2Map, level3Map, cellToWorld, isPassable } from './map.js';
import { initPlayer, initInput, setCallbacks, tweenGroup, player, FACING_ANGLES, isInFrontOfPlayer } from './player.js';
import { initLighting, updateLighting } from './lighting.js';
import { initParticles, updateParticles } from './particles.js';
import { initMinimap, drawMinimap, updateStatus, showMessage } from './minimap.js';
import { initParty, updateParty, party, setPartyGold, refreshPartyCards, autoAttack, autoRangeAttack, setAutoAttack, setAutoRangeAttack } from './party.js';
import { initEquipment, hideDropButton, updateEffectiveStats, tickAutoAttack, clearAutoAttackTimers, tickAutoRangeAttack, clearAutoRangeAttackTimers } from './equipment.js';
import { initMonsters, loadMonstersForLevel, updateMonsters, triggerMonsterAttack, monsters, isMonsterAt, restoreMonsterStates } from './monster.js';
import { initRecruits, updateRecruitsMeshState, RECRUITS } from './recruits.js';
import { initObjects, clearObjects, spawnObjectsForLevel, isShopAt, isStatueAt, updateObjects, interactables, setWorldFlags, setPendingContainerOverrides, setMerchantStock } from './objects.js';
import { startMusic, updateAudio, setAmbientLevel, setZoneMusic } from './audio.js';
import { initBattleLog } from './battle-log.js';
import { initBattleStats } from './battle-stats.js';
import { initMainMenu } from './main-menu.js';
import { consumePendingLoad, snapshotCurrentLevel, setAccumulatedWorldState, getAccumulatedWorldState } from './save-game.js';
import { initQuarks, updateQuarks } from './quarks-intro.js';

import './style.css';

// ─────────────────────────────────────────────
//  RENDERER & GLOBALS
// ─────────────────────────────────────────────
window.currentLevel = 1;

const canvas = document.getElementById('renderer-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// CSS2D renderer — renders HTML labels (monster HP bars) anchored in 3D space
const css2dRenderer = new CSS2DRenderer();
css2dRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
document.body.appendChild(css2dRenderer.domElement);

// ─────────────────────────────────────────────
//  SCENE  &  CAMERA
// ─────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 2, 12);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  css2dRenderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ─────────────────────────────────────────────
//  BUILD WORLD
// ─────────────────────────────────────────────
buildLevel(scene);

// ─────────────────────────────────────────────
//  LIGHTING
// ─────────────────────────────────────────────
const lights = initLighting(scene);
initParticles(scene, camera);

// ─────────────────────────────────────────────
//  PLAYER
// ─────────────────────────────────────────────
const start = findCell(CELL_START);
initPlayer(start.row, start.col, camera);

let hasSeenOgreVideo = false;
let hasSeenPrepVideo = false;
let hasSeenMinotaurVideo = false;
let hasSeenDemonVideo = false;
window.hasSeenTreemanVideo = false;
let prepVideoTimer = null;

// Bridge video flags to save system via window._saveFlags
window._saveFlags = { hasSeenOgreVideo, hasSeenPrepVideo, hasSeenMinotaurVideo, hasSeenDemonVideo };

setCallbacks({
  moved() {
    drawMinimap();
    updateStatus();
    // East room (merchant/large room) zone: cols 16-23, rows 7-15, level 1 only
    if (window.currentLevel === 1) {
      const inEastRoom = player.gridCol >= 16 && player.gridCol <= 23
        && player.gridRow >= 7 && player.gridRow <= 15;
      const inOgreRoom = player.gridCol >= 1 && player.gridCol <= 6
        && player.gridRow >= 1 && player.gridRow <= 9;
      const inMummyRoom = player.gridCol >= 11 && player.gridCol <= 15
        && player.gridRow >= 1 && player.gridRow <= 5;

      if (inEastRoom) {
        setZoneMusic('/sounds/level2-music.mp3');
      } else if (inOgreRoom && hasSeenOgreVideo) {
        setZoneMusic('/sounds/backing/ogre-room.mp3');
      } else if (inMummyRoom) {
        setZoneMusic('/sounds/backing/mummy-room.mp3');
      } else {
        setZoneMusic(null);
      }

      if (!hasSeenOgreVideo && player.gridRow === 6 && player.gridCol === 1) {
        hasSeenOgreVideo = true; window._saveFlags.hasSeenOgreVideo = true;
        playOgreVideo();
      }

      // Prep video triggers ONLY when confirming the NPC modal now,
      // so we remove the position-based trigger entirely.
    } else if (window.currentLevel === 2) {
      // Demon room: the big chamber at the south end of the passage
      const inDemonRoom = player.gridRow >= 14 && player.gridRow <= 20
        && player.gridCol >= 3 && player.gridCol <= 8;

      if (inDemonRoom && !hasSeenDemonVideo) {
        hasSeenDemonVideo = true; window._saveFlags.hasSeenDemonVideo = true;
        playDemonVideo();
      }

      const treeman = monsters.find(m => m.name === 'Treeman');
      if (treeman && !treeman.alive) {
        setZoneMusic('/sounds/backing/demon-room.mp3');
      }
    } else if (window.currentLevel === 3) {
      const inMinotaurRoom = player.gridRow >= 8 && player.gridRow <= 14
        && player.gridCol >= 8 && player.gridCol <= 14;

      if (inMinotaurRoom && !hasSeenMinotaurVideo) {
        hasSeenMinotaurVideo = true; window._saveFlags.hasSeenMinotaurVideo = true;
        if (window.playMinotaurVideo) window.playMinotaurVideo();
      }
    }
  },
  reached() {
    showMessage('YOU ESCAPED!<br><small style="font-size:14px;color:#aaa">The dungeon is conquered.</small>');
  },
  blocked(r, c) {
    return isMonsterAt(r, c) || isShopAt(r, c) || isStatueAt(r, c);
  }
});

initInput(camera);

// ─────────────────────────────────────────────
//  QUARKS PARTICLE EFFECTS
// ─────────────────────────────────────────────
initQuarks(scene, camera);

// ─────────────────────────────────────────────
//  MINIMAP, HUD & PARTY  (initial draw)
// ─────────────────────────────────────────────
initMinimap();
drawMinimap();
updateStatus();
initParty();
initEquipment();
initBattleLog();
initBattleStats();
initMainMenu();

// ─────────────────────────────────────────────
//  SAVE RESTORE — PRE-INIT PHASE
//  Set up overrides BEFORE objects/monsters init so the first spawn uses saved state.
// ─────────────────────────────────────────────
const _pendingSave = consumePendingLoad();
if (_pendingSave) {
  // Restore gate/portal flags before objects spawn
  setWorldFlags(_pendingSave.flags);

  // Restore recruit state before recruit meshes init
  if (_pendingSave.recruits) {
    for (const r of RECRUITS) {
      r.isRecruited = !!_pendingSave.recruits[r.id];
    }
  }

  // Set container overrides before spawnObjectsForLevel
  const _wsCurrentLevel = _pendingSave.worldState?.[_pendingSave.currentLevel ?? 1];
  if (_wsCurrentLevel?.containers) setPendingContainerOverrides(_wsCurrentLevel.containers);
  if (_pendingSave.worldState?.[1]?.merchantAvailable) setMerchantStock(_pendingSave.worldState[1].merchantAvailable);

  // Restore monster alive/hp before initMonsters loads models
  if (_wsCurrentLevel?.monsters) restoreMonsterStates(_wsCurrentLevel.monsters);

  // Seed accumulated world state for level transitions
  if (_pendingSave.worldState) setAccumulatedWorldState(_pendingSave.worldState);
}

initRecruits(scene, camera);
initObjects(scene, camera);

// ─────────────────────────────────────────────
//  MONSTERS
// ─────────────────────────────────────────────
initMonsters(scene);

// ─────────────────────────────────────────────
//  RENDER LOOP
// ─────────────────────────────────────────────
let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  tweenGroup.update(now);
  updateObjects(dt);
  updateLighting(lights, camera, dt);
  updateMonsters(dt, camera, scene);
  updateParticles(dt);
  updateQuarks(dt);
  updateAudio(dt);
  updateParty(dt);

  // Auto-attack: front row members attack automatically when a monster is in melee range
  if (autoAttack) {
    const currentLevel = window.currentLevel || 1;
    const hasTarget = monsters.some(t =>
      t.alive &&
      (t.level ?? 1) === currentLevel &&
      isInFrontOfPlayer(t.gridRow, t.gridCol, 1) &&
      isPassable(t.gridRow, t.gridCol) &&
      isPassable(player.gridRow, player.gridCol)
    );
    if (hasTarget) {
      for (const i of [0, 1]) {
        const m = party[i];
        if (!m || m.isEmpty || m.isDead) continue;
        tickAutoAttack(i);
      }
    } else {
      // Monster stepped away — clear any pending fire timers so they don't
      // fire the instant combat resumes, giving the player a fresh 1-second window
      clearAutoAttackTimers();
    }
  }

  // Auto-range-attack: any party member with a bow or crossbow shoots automatically
  // when a monster is within ranged range (3 cells).  The 1-second human-feel delay
  // is baked into tickAutoRangeAttack via AUTO_EXTRA_DELAY_MS.
  if (autoRangeAttack) {
    const currentLevel = window.currentLevel || 1;
    const hasRangedTarget = monsters.some(t =>
      t.alive &&
      (t.level ?? 1) === currentLevel &&
      isInFrontOfPlayer(t.gridRow, t.gridCol, 3) &&
      isPassable(t.gridRow, t.gridCol) &&
      isPassable(player.gridRow, player.gridCol)
    );
    if (hasRangedTarget) {
      for (const i of [0, 1, 2, 3]) {
        const m = party[i];
        if (!m || m.isEmpty || m.isDead) continue;
        tickAutoRangeAttack(i);
      }
    } else {
      // No target in range — reset pending timers for a clean start next encounter
      clearAutoRangeAttackTimers();
    }
  }

  renderer.render(scene, camera);
  css2dRenderer.render(scene, camera);
}

animate(performance.now());

// ─────────────────────────────────────────────
//  DEV INFO
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  INTRO VIDEO & SPLASH
// ─────────────────────────────────────────────
const introOverlay = document.getElementById('intro-overlay');
const splashScreen = document.getElementById('splash-screen');
const videoContainer = document.getElementById('video-container');
const introVideo = document.getElementById('intro-video');
const startBtn = document.getElementById('start-adventure-btn');
const skipBtn = document.getElementById('skip-intro-btn');

function finishIntro() {
  if (!introOverlay) return;
  introOverlay.style.transition = 'opacity 1.5s ease';
  introOverlay.style.opacity = '0';
  setTimeout(() => {
    introVideo.pause();
    introOverlay.remove();
  }, 1500);
}

if (startBtn) {
  startBtn.addEventListener('click', () => {
    splashScreen.classList.add('hidden');
    videoContainer.classList.remove('hidden');
    introVideo.play().catch(e => {
      console.warn("Video play failed:", e);
      finishIntro();
    });
    // Trigger music/audio context via the same click
    handleFirstInteraction();
  });
}

if (introVideo) {
  introVideo.addEventListener('ended', finishIntro);
}
if (skipBtn) {
  skipBtn.addEventListener('click', finishIntro);
}

// ─────────────────────────────────────────────
//  OGRE VIDEO OVERLAY
// ─────────────────────────────────────────────
const ogreOverlay = document.getElementById('ogre-video-overlay');
const ogreVideo = document.getElementById('ogre-video');
const skipOgreBtn = document.getElementById('skip-ogre-btn');

function playOgreVideo() {
  if (!ogreOverlay || !ogreVideo) return;
  ogreOverlay.classList.remove('hidden');

  // Give the browser a moment to process the display change before animating opacity
  setTimeout(() => {
    ogreOverlay.style.opacity = '1';
    ogreVideo.play().catch(e => {
      console.warn("Ogre video play failed:", e);
      finishOgreVideo();
    });
  }, 50);
}

function finishOgreVideo() {
  if (!ogreOverlay) return;
  ogreOverlay.style.opacity = '0';

  // Start the Ogre Room music as the video fades out
  setZoneMusic('/sounds/backing/ogre-room.mp3');

  setTimeout(() => {
    ogreVideo.pause();
    ogreOverlay.remove();
  }, 1500);
}

if (skipOgreBtn) skipOgreBtn.addEventListener('click', finishOgreVideo);
if (ogreVideo) ogreVideo.addEventListener('ended', finishOgreVideo);

// ─────────────────────────────────────────────
//  TREEMAN VIDEO OVERLAY
// ─────────────────────────────────────────────
const treemanOverlay = document.getElementById('treeman-video-overlay');
const treemanVideo = document.getElementById('treeman-video');
const skipTreemanBtn = document.getElementById('skip-treeman-btn');
let _treemanCallback = null;

window.playTreemanVideo = function (onComplete) {
  window.hasSeenTreemanVideo = true;
  _treemanCallback = onComplete;
  if (!treemanOverlay || !treemanVideo) {
    if (_treemanCallback) _treemanCallback();
    return;
  }
  treemanOverlay.classList.remove('hidden');

  setTimeout(() => {
    treemanOverlay.style.opacity = '1';
    treemanVideo.play().catch(e => {
      console.warn("Treeman video play failed:", e);
      finishTreemanVideo();
    });
  }, 50);
};

function finishTreemanVideo() {
  if (!treemanOverlay) {
    if (_treemanCallback) _treemanCallback();
    return;
  }
  treemanOverlay.style.opacity = '0';

  // Fade out audio
  const startVol = treemanVideo.volume;
  const fadeInterval = setInterval(() => {
    if (treemanVideo.volume > 0.05) {
      treemanVideo.volume -= 0.05;
    } else {
      treemanVideo.volume = 0;
      clearInterval(fadeInterval);
    }
  }, 50);

  setTimeout(() => {
    treemanVideo.pause();
    clearInterval(fadeInterval);
    treemanVideo.volume = startVol; // Reset for next time
    treemanOverlay.classList.add('hidden');
    if (_treemanCallback) {
      _treemanCallback();
      _treemanCallback = null;
    }
  }, 1500);
}

if (skipTreemanBtn) skipTreemanBtn.addEventListener('click', finishTreemanVideo);
if (treemanVideo) treemanVideo.addEventListener('ended', finishTreemanVideo);

// ─────────────────────────────────────────────
//  MUMMY VIDEO OVERLAY
// ─────────────────────────────────────────────
const mummyOverlay = document.getElementById('mummy-video-overlay');
const mummyVideo = document.getElementById('mummy-video');
const skipMummyBtn = document.getElementById('skip-mummy-btn');
let _mummyCallback = null;

window.playMummyVideo = function (onComplete) {
  _mummyCallback = onComplete;
  if (!mummyOverlay || !mummyVideo) {
    if (_mummyCallback) _mummyCallback();
    return;
  }
  mummyOverlay.classList.remove('hidden');

  setTimeout(() => {
    mummyOverlay.style.opacity = '1';
    mummyVideo.play().catch(e => {
      console.warn("Mummy video play failed:", e);
      finishMummyVideo();
    });
  }, 50);
};

function finishMummyVideo() {
  if (!mummyOverlay) {
    if (_mummyCallback) _mummyCallback();
    return;
  }
  mummyOverlay.style.opacity = '0';

  setTimeout(() => {
    mummyVideo.pause();
    mummyOverlay.classList.add('hidden');
    if (_mummyCallback) {
      _mummyCallback();
      _mummyCallback = null;
    }
  }, 1500);
}

if (skipMummyBtn) skipMummyBtn.addEventListener('click', finishMummyVideo);
if (mummyVideo) mummyVideo.addEventListener('ended', finishMummyVideo);

// ─────────────────────────────────────────────
//  BATTLE PREP VIDEO OVERLAY
// ─────────────────────────────────────────────
const battlePrepOverlay = document.getElementById('battle-prep-video-overlay');
const battlePrepVideo = document.getElementById('battle-prep-video');
const skipBattlePrepBtn = document.getElementById('skip-battle-prep-btn');
let _battlePrepCallback = null;

window.playBattlePrepVideo = function (onComplete) {
  _battlePrepCallback = onComplete;
  if (!battlePrepOverlay || !battlePrepVideo) {
    if (_battlePrepCallback) _battlePrepCallback();
    return;
  }
  battlePrepOverlay.classList.remove('hidden');

  setTimeout(() => {
    battlePrepOverlay.style.opacity = '1';
    battlePrepVideo.play().catch(e => {
      console.warn("Battle prep video play failed:", e);
      finishBattlePrepVideo();
    });
  }, 50);
};

function finishBattlePrepVideo() {
  if (!battlePrepOverlay) {
    if (_battlePrepCallback) _battlePrepCallback();
    return;
  }
  battlePrepOverlay.style.opacity = '0';

  setTimeout(() => {
    battlePrepVideo.pause();
    battlePrepOverlay.classList.add('hidden');
    if (_battlePrepCallback) {
      _battlePrepCallback();
      _battlePrepCallback = null;
    }
    // Remove the option to drop party members after this dramatic event
    hideDropButton();
  }, 1500);
}

if (skipBattlePrepBtn) skipBattlePrepBtn.addEventListener('click', finishBattlePrepVideo);
if (battlePrepVideo) battlePrepVideo.addEventListener('ended', finishBattlePrepVideo);

// ─────────────────────────────────────────────
//  MINOTAUR VIDEO OVERLAY
// ─────────────────────────────────────────────
const minotaurOverlay = document.getElementById('minotaur-video-overlay');
const minotaurVideo = document.getElementById('minotaur-video');
const skipMinotaurBtn = document.getElementById('skip-minotaur-btn');
let _minotaurCallback = null;

window.playMinotaurVideo = function (onComplete) {
  _minotaurCallback = onComplete;
  if (!minotaurOverlay || !minotaurVideo) {
    if (_minotaurCallback) _minotaurCallback();
    return;
  }
  minotaurOverlay.classList.remove('hidden');

  setTimeout(() => {
    minotaurOverlay.style.opacity = '1';
    minotaurVideo.play().catch(e => {
      console.warn("Minotaur video play failed:", e);
      finishMinotaurVideo();
    });
  }, 50);
};

function finishMinotaurVideo() {
  if (!minotaurOverlay) {
    if (_minotaurCallback) _minotaurCallback();
    return;
  }
  minotaurOverlay.style.opacity = '0';

  setTimeout(() => {
    minotaurVideo.pause();
    minotaurOverlay.classList.add('hidden');
    if (_minotaurCallback) {
      _minotaurCallback();
      _minotaurCallback = null;
    }
  }, 1500);
}

if (skipMinotaurBtn) skipMinotaurBtn.addEventListener('click', finishMinotaurVideo);
if (minotaurVideo) minotaurVideo.addEventListener('ended', finishMinotaurVideo);

// ─────────────────────────────────────────────
//  DEMON VIDEO OVERLAY
// ─────────────────────────────────────────────
const demonOverlay = document.getElementById('demon-video-overlay');
const demonVideo = document.getElementById('demon-video');
const skipDemonBtn = document.getElementById('skip-demon-btn');

function playDemonVideo() {
  if (!demonOverlay || !demonVideo) return;
  demonOverlay.classList.remove('hidden');

  setTimeout(() => {
    demonOverlay.style.opacity = '1';
    demonVideo.play().catch(e => {
      console.warn("Demon video play failed:", e);
      finishDemonVideo();
    });
  }, 50);
}

function finishDemonVideo() {
  if (!demonOverlay) return;
  demonOverlay.style.opacity = '0';

  const startVol = demonVideo.volume;
  const fadeInterval = setInterval(() => {
    if (demonVideo.volume > 0.05) {
      demonVideo.volume -= 0.05;
    } else {
      demonVideo.volume = 0;
      clearInterval(fadeInterval);
    }
  }, 50);

  setTimeout(() => {
    demonVideo.pause();
    clearInterval(fadeInterval);
    demonVideo.volume = startVol;
    demonOverlay.classList.add('hidden');
  }, 1500);
}

if (skipDemonBtn) skipDemonBtn.addEventListener('click', finishDemonVideo);
if (demonVideo) demonVideo.addEventListener('ended', finishDemonVideo);

// ─────────────────────────────────────────────
//  PORTAL VIDEO OVERLAY
// ─────────────────────────────────────────────
const portalOverlay = document.getElementById('portal-video-overlay');
const portalVideo = document.getElementById('portal-video');
const skipPortalBtn = document.getElementById('skip-portal-btn');
let _portalCallback = null;

window.playPortalVideo = function (onComplete) {
  _portalCallback = onComplete;
  if (!portalOverlay || !portalVideo) {
    if (_portalCallback) _portalCallback();
    return;
  }
  portalOverlay.classList.remove('hidden');

  setTimeout(() => {
    portalOverlay.style.opacity = '1';
    portalVideo.play().catch(e => {
      console.warn("Portal video play failed:", e);
      finishPortalVideo();
    });
  }, 50);
};

function finishPortalVideo() {
  if (!portalOverlay) {
    if (_portalCallback) _portalCallback();
    return;
  }
  portalOverlay.style.opacity = '0';

  setTimeout(() => {
    portalVideo.pause();
    portalOverlay.classList.add('hidden');
    if (_portalCallback) {
      _portalCallback();
      _portalCallback = null;
    }
  }, 1500);
}

if (skipPortalBtn) skipPortalBtn.addEventListener('click', finishPortalVideo);
if (portalVideo) portalVideo.addEventListener('ended', finishPortalVideo);

// ─────────────────────────────────────────────
//  STATUE PORTAL VIDEO OVERLAY
// ─────────────────────────────────────────────
const statuePortalOverlay = document.getElementById('statue-portal-video-overlay');
const statuePortalVideo = document.getElementById('statue-portal-video');
const skipStatuePortalBtn = document.getElementById('skip-statue-portal-btn');
let _statuePortalCallback = null;

window.playStatuePortalVideo = function (onComplete) {
  _statuePortalCallback = onComplete;
  if (!statuePortalOverlay || !statuePortalVideo) {
    if (_statuePortalCallback) _statuePortalCallback();
    return;
  }
  statuePortalOverlay.classList.remove('hidden');

  setTimeout(() => {
    statuePortalOverlay.style.opacity = '1';
    statuePortalVideo.play().catch(e => {
      console.warn("Statue portal video play failed:", e);
      finishStatuePortalVideo();
    });
  }, 50);
};

function finishStatuePortalVideo() {
  if (!statuePortalOverlay) {
    if (_statuePortalCallback) _statuePortalCallback();
    return;
  }
  statuePortalOverlay.style.opacity = '0';

  setTimeout(() => {
    statuePortalVideo.pause();
    statuePortalOverlay.classList.add('hidden');
    if (_statuePortalCallback) {
      _statuePortalCallback();
      _statuePortalCallback = null;
    }
  }, 1500);
}

if (skipStatuePortalBtn) skipStatuePortalBtn.addEventListener('click', finishStatuePortalVideo);
if (statuePortalVideo) statuePortalVideo.addEventListener('ended', finishStatuePortalVideo);
function handleFirstInteraction() {
  startMusic();
  window.removeEventListener('click', handleFirstInteraction);
  window.removeEventListener('keydown', handleFirstInteraction);
}
window.addEventListener('click', handleFirstInteraction);
window.addEventListener('keydown', handleFirstInteraction);

// ─────────────────────────────────────────────
//  LEVEL LOADING
// ─────────────────────────────────────────────
window.loadLevel = function (levelNum) {
  // Snapshot departing level's world state before destroying it
  // (skip during save restore — accumulated state was already seeded from save)
  if (!window._isRestoring) snapshotCurrentLevel();

  const oldLevel = window.currentLevel;
  window.currentLevel = levelNum;

  // Switch ambient music to match the new level
  setAmbientLevel(levelNum);

  // 1. Swap Map Array
  const maps = [null, level1Map, level2Map, level3Map];
  changeMapArray(maps[levelNum] || level1Map);

  // 2. Rebuild map meshes for walls/floors
  buildLevel(scene);

  // 3. Restore accumulated state for arriving level (containers + monsters)
  const ws = getAccumulatedWorldState(levelNum);
  if (ws?.containers) setPendingContainerOverrides(ws.containers);
  if (ws?.monsters) restoreMonsterStates(ws.monsters);
  if (levelNum === 1 && ws?.merchantAvailable) setMerchantStock(ws.merchantAvailable);

  // 4. Clear and respawn level objects (reads pending container overrides)
  clearObjects(scene);
  spawnObjectsForLevel();
  updateRecruitsMeshState();

  // 5. Load monster models for this level (skips dead monsters)
  loadMonstersForLevel(scene, levelNum);

  // 4. Move player to start of new map
  const start = findCell(CELL_START);
  player.gridRow = start.row;
  player.gridCol = start.col;
  const w = cellToWorld(start.row, start.col);
  camera.position.set(w.x, w.y, w.z);

  if (levelNum === 3 && oldLevel === 1) {
    player.facing = (player.facing + 2) % 4; // Turn 180 degrees
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  } else if (levelNum === 2) {
    // Face South to see the room and Treeman
    player.facing = 2;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = FACING_ANGLES[player.facing];
  }

  // 5. Update Minimap bounds
  drawMinimap();
  updateStatus();

  // If Treeman is dead, ensure Level 2 music is override
  if (levelNum === 2) {
    const treeman = monsters.find(m => m.name === 'Treeman');
    if (treeman && !treeman.alive) {
      setZoneMusic('/sounds/backing/demon-room.mp3');
    }
  }
};

const raycaster = new THREE.Raycaster();
raycaster.far = 6;
const mouse = new THREE.Vector2();
let _lastRayTime = 0;

window.addEventListener('mousemove', (e) => {
  // Only apply 3D world raycasting if interacting with the canvas directly
  if (e.target !== canvas) {
    document.body.classList.remove('cursor-interact');
    return;
  }

  const now = performance.now();
  if (now - _lastRayTime < 66) return;
  _lastRayTime = now;

  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactables, false);

  let isHoveringInteractable = false;
  for (let hit of intersects) {
    const ud = hit.object.userData;
    if (ud && (ud.isButton || ud.isChest || ud.isCrystal || ud.isBonePile || ud.isRecruit || ud.isPartyConfirmNPC)) {
      if (hit.object.visible) {
        isHoveringInteractable = true;
        break;
      }
    }
  }

  if (isHoveringInteractable) {
    document.body.classList.add('cursor-interact');
  } else {
    document.body.classList.remove('cursor-interact');
  }
});

console.log('%c Grid Dungeon Crawler ', 'background:#333;color:#e8c87a;font-size:14px;padding:4px 8px;');
console.log('Map: 0=floor 1=wall 2=start 3=exit | Controls: W/S=move  Q/E=turn  A/D=strafe  Arrows=move+turn');

// ─────────────────────────────────────────────
//  SAVE GAME — RESTORE ON LOAD
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  SAVE RESTORE — POST-INIT PHASE
//  Restore party, gold, position, and level after objects/monsters are initialized.
//  World state (containers, monsters, flags, recruits) was already applied in the pre-init phase.
// ─────────────────────────────────────────────
(function _applyPendingLoad() {
  const save = _pendingSave;
  if (!save) return;

  // 1. Restore party members
  for (let i = 0; i < 4; i++) {
    const src = save.party[i];
    const dest = party[i];
    for (const k of Object.keys(dest)) delete dest[k];
    Object.assign(dest, JSON.parse(JSON.stringify(src)));
    dest.cooldownTimers = {};
    if (!dest.isEmpty) updateEffectiveStats(dest);
  }

  // 2. Restore gold
  setPartyGold(save.partyGold ?? 0);

  // 3. Restore video flags
  if (save.flags) {
    hasSeenOgreVideo = !!save.flags.hasSeenOgreVideo;
    hasSeenPrepVideo = !!save.flags.hasSeenPrepVideo;
    hasSeenMinotaurVideo = !!save.flags.hasSeenMinotaurVideo;
    hasSeenDemonVideo = !!save.flags.hasSeenDemonVideo;
    window.hasSeenTreemanVideo = !!save.flags.hasSeenTreemanVideo;
    window._saveFlags = { hasSeenOgreVideo, hasSeenPrepVideo, hasSeenMinotaurVideo, hasSeenDemonVideo };
  }

  // 4. Restore auto-attack toggles
  if (save.autoAttack !== undefined) setAutoAttack(save.autoAttack);
  if (save.autoRangeAttack !== undefined) setAutoRangeAttack(save.autoRangeAttack);

  // 5. Level — load if different from default (1)
  //    Skip snapshotCurrentLevel inside loadLevel during restore (we just seeded the state)
  const currentLevel = save.currentLevel ?? 1;
  window._isRestoring = true;
  if (currentLevel && currentLevel !== window.currentLevel) {
    window.loadLevel(currentLevel);
  }
  window._isRestoring = false;

  // 6. Player position
  player.gridRow = save.player.gridRow;
  player.gridCol = save.player.gridCol;
  player.facing = save.player.facing;
  const w = cellToWorld(player.gridRow, player.gridCol);
  camera.position.set(w.x, w.y, w.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = FACING_ANGLES[player.facing];

  // 7. Refresh HUD
  refreshPartyCards();
  drawMinimap();
  updateStatus();

  // Skip the intro overlay so the player is dropped straight into the game
  finishIntro();
})();

