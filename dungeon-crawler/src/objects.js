import * as THREE from 'three';
import { createBlobShadow } from './blob-shadow.js';
import { gltfLoader as _gltfLoader } from './gltf-loader.js';
import { CELL, dungeonMap, CELL_FLOOR, CELL_PORTCULLIS, cellToWorld, buildLevel, level1Map, level2Map } from './map.js';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup, isInFrontOfPlayer, player, FACING_ANGLES, setPlayerFrozen } from './player.js';
import { showMessage, drawMinimap, updateStatus } from './minimap.js';
import { getItemDef, ITEMS } from './items.js';
import { party, drawPortrait, resurrectAll, partyGold, removeGold, addGold, refreshPartyCards, setHp, applyStatusEffect } from './party.js';
import { addLogEntry } from './battle-log.js';
import { playHealSound, playBoneSound, playPortalSound, playShopkeeperSound, playAlchemySound, playAlchemyFailSound, playAnvilSound, playKeyLockSound, playGateOpeningSound, playItemSound, playChestOpenSound, playWeaponRackSound, playSpellCabinetSound, playButtonClickSound, playTrapSound, playSuccessSound, playLearntSound, playSoundByUrl, playQuestAudio, fadeOutQuestAudio, playPartyHitSound, playInventorySortSound, playCraftFailSound, playCraftHqSound, playNpcDialogue, isNpcDialoguePlaying } from './audio.js';
import MERCHANT_DATA from './data/merchant.json';
import POTION_MERCHANT_DATA from './data/potion-merchant.json';
import STANCE_MERCHANT_DATA from './data/stance-npc-merchant.json';
import POTIONS_DATA from './data/items/potions.json';
import FORGE_DATA from './data/forge.json';
import { rollCraftOutcome, isEssenceIngredient, hqDisplayName } from './crafting.js';
import BARNABY_DATA from './data/barnaby.json';
import WEAPONS_DATA from './data/items/weapons.json';
import { triggerMummyAmbush, monsters } from './monster.js';
import * as equip from './equipment.js';
import { showInlineHelp } from './help.js';
import { asset } from './assets.js';
import { spawnLevel0Objects } from './levels/level0/objects.js';
import { spawnLevel1Objects } from './levels/level1/objects.js';
import { spawnLevel2Objects } from './levels/level2/objects.js';
import { spawnLevel3Objects } from './levels/level3/objects.js';
import { spawnLevel4Objects } from './levels/level4/objects.js';
import { spawnLevel5Objects } from './levels/level5/objects.js';
import { spawnSchematicTrialsObjects } from './levels/schematic-trials/objects.js';
import { showNpcChoice, openQuestDialog, renderMerchantQuestPanel } from './quest.js';

export const objects = [];
export const interactables = [];

export function partyHasItem(itemName) {
    for (const m of party) {
        if (m && !m.isEmpty && m.inventory) {
            if (m.inventory.some(item => item && item.name === itemName)) return true;
        }
    }
    return false;
}

export function getCrystalShrineState() { return _state.crystalShrineState; }
export function getSeenEssences() { return _seenEssences; }

const _clickRaycaster = new THREE.Raycaster();
const _clickMouse = new THREE.Vector2();

const _mixers = [];
const _intervals = [];

export function updateObjects(dt) {
    for (const mixer of _mixers) mixer.update(dt);

    if (_proximityAudios.length > 0 && player) {
        for (const item of _proximityAudios) {
            const distRow = Math.abs(player.gridRow - item.row);
            const distCol = Math.abs(player.gridCol - item.col);

            const isClose = (distRow + distCol) <= (item.range ?? 2);

            if (isClose) {
                const now = Date.now();
                if (!item.isPlaying && (now - item.lastPlayTime) > 5000) {
                    item.isPlaying = true;
                    item.lastPlayTime = now;
                    playSoundByUrl(item.audioUrl, 0.8).then(source => {
                        if (source) {
                            source.onended = () => {
                                item.isPlaying = false;
                            };
                        } else {
                            item.isPlaying = false;
                        }
                    });
                }
            }
        }
    }
}

// ─────────────────────────────────────────────
//  SARCOPHAGUS STATE
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  CANONICAL WORLD STATE — must be captured by the save system.
//
//  Every save-relevant gate/portal/NPC progression flag lives on this single
//  object. Adding a new flag = one line here. The `getWorldFlags` /
//  `setWorldFlags` boundary just spreads / Object.assigns this object plus a
//  few side-bags (disarmedTraps, seenEssences, unlockedRecipes, monsterNpcStock)
//  that still need conversion (Set ↔ array, etc).
//
//  Crystal shrine state: 0=empty, 1=red crystal placed, 2=red+blue placed.
// ─────────────────────────────────────────────────────────────────────────────
const _state = {
  mummyGateOpened: false,
  mummyEscapeGateOpened: false, // true once escape button pressed — keeps entrance open after zone
  starterGateOpened: false,     // persists across level reloads — once open, never re-closes
  starterPortalEnabled: false,
  crystalShrineState: 0,
  level3PortalEnabled: false,
  level4PortalEnabled: false,
  level2PortcullisOpened: false,
  level2GiantPortcullisOpened: false,
  level2HoleClosed: false,
  level1HoleRoomSpawned: false,
  monsterNpcSaved: false,
  stanceNpcDeparted: false,
  level1BtnPortcullisOpened: false,
  level1OgrePortcullisOpened: false,
  level1ShrineGateOpened: false,
};

// Scene/THREE refs — transient, NOT saved.
let _crystalShrineMesh = null;
let _crystalShrineScene = null;
let _crystalShrineLoader = null;
let _crystalShrineParams = null;
let _disabledPortalMesh = null;       // level 2 disabled portal mesh
let _level3DisabledPortalMesh = null; // level 3 disabled portal mesh
let _level4DisabledPortalMesh = null; // level 4 disabled portal mesh
let _partyConfirmNPCModel = null; // true once the player confirms — prevents re-triggering
let _starterGate = null; // portcullis behind the party-confirm NPC; opens only via dialogue

let _npcMixer = null;
let _npcIdleAction = null;
let _npcTalkAction = null;

// Track NPCs with proximity-based audio triggers
const _proximityAudios = [];

// ─────────────────────────────────────────────
//  CHEST / MERCHANT SHARED STATE
// ─────────────────────────────────────────────
let _chestCtxOpen = false;
// Tracks which modal's "Sent to" label to update ('chest-sent-label' or 'merchant-sent-label')
let _activeSentLabelId = 'chest-sent-label';
// Tracks the currently open chest's contents/slots so items can be deposited
let _activeChestContents = null;
let _activeChestSlots = null;
// Which party member's inventory is shown in the chest deposit panel
let _chestPartyMemberIdx = 0;

// ─────────────────────────────────────────────
//  ARMOR STAND SHARED STATE
// ─────────────────────────────────────────────
// Tracks the currently open armor stand's contents (equipment slots)
let _activeArmorStandObj = null;
// Which party member's inventory is shown in the armor stand deposit panel
let _armorStandPartyMemberIdx = 0;

// ─────────────────────────────────────────────
//  SHOP GRID BLOCKING
// ─────────────────────────────────────────────
const _shopGridCells = new Set(); // "row,col" keys — treated as impassable
const _statueGridCells = new Set();

export function isShopAt(r, c) {
    return _shopGridCells.has(`${r},${c}`);
}

export function isStatueAt(r, c) {
    return _statueGridCells.has(`${r},${c}`);
}

// ─────────────────────────────────────────────
//  MERCHANT STOCK & PRICES
// ─────────────────────────────────────────────
// A stock entry can be a plain string ("Healing Potion") or an object
// ({ name: "Healing Potion", hq: true }). _normStock converts both forms into
// the canonical { name, hq } shape so downstream code only has to handle one.
function _normStock(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return { name: entry, hq: false };
  if (typeof entry === 'object' && entry.name) return { name: entry.name, hq: !!entry.hq };
  return null;
}
const MERCHANT_STOCK = MERCHANT_DATA.stock.map(_normStock).filter(Boolean);
const POTION_MERCHANT_STOCK = POTION_MERCHANT_DATA.stock.map(_normStock).filter(Boolean);
const STANCE_MERCHANT_STOCK = STANCE_MERCHANT_DATA.stock.map(_normStock).filter(Boolean);

// Initial-count map per (name|hq) key — caps how high replenishment can refill the potion merchant
const POTION_MERCHANT_INITIAL_COUNTS = new Map();
for (const it of POTION_MERCHANT_STOCK) {
  const k = `${it.name}|${it.hq ? 1 : 0}`;
  POTION_MERCHANT_INITIAL_COUNTS.set(k, (POTION_MERCHANT_INITIAL_COUNTS.get(k) ?? 0) + 1);
}

// Items still available for sale (items bought are removed permanently)
let _merchantAvailable = [...MERCHANT_STOCK];
let _potionMerchantAvailable = [...POTION_MERCHANT_STOCK];
let _stanceMerchantAvailable = [...STANCE_MERCHANT_STOCK];

// Points to whichever stock array is active for the currently open merchant
let _activeMerchantAvailable = _merchantAvailable;
// Items the player has added to the basket this session (cleared on close without buying)
let _merchantBasket = [];
// Items the player has selected to sell { charIndex, invIndex, name }
let _merchantSellBasket = [];
// Current merchant tab
let _merchantMode = 'buy';

const ALCHEMY_SLOTS = 9; // 8 ingredients + 1 result
const _alchemyContents = Array(ALCHEMY_SLOTS).fill(null);
let _alchemyModalOpen = false;
const _knownAlchemyRecipes = new Set(); // result item names learned by the party

// Monster NPC Special Shop State
let _seenEssences = new Set();
let _unlockedRecipes = new Set();
let _monsterNpcStock = BARNABY_DATA.stock.map(_normStock).filter(Boolean); // parchments (HQ n/a)


const FORGE_SLOTS = 9; // 8 materials + 1 result
const _forgeContents = Array(FORGE_SLOTS).fill(null);
let _forgeModalOpen = false;
const _knownForgeRecipes = new Set(); // result item names learned by the party
let _forgeRecipeFilter = 'all';   // 'all' | 'craftable'
let _alchemyRecipeFilter = 'all'; // 'all' | 'craftable'

const _FORGE_WEAPON_NAMES = new Set(WEAPONS_DATA.map(w => w.name));

// Dynamically generate essence parchment item defs from forge.json and inject into ITEMS,
// so getItemDef() can resolve them without manual entries in parchments.json.
(function _buildEssenceParchments() {
    const essenceToRecipes = {};
    FORGE_DATA.forEach(recipe => {
        recipe.ingredients.forEach(ing => {
            if (ing.name.endsWith(' Essence') && ing.name !== 'Life Essence') {
                (essenceToRecipes[ing.name] ??= []).push(recipe.name);
            }
        });
    });
    Object.entries(essenceToRecipes).forEach(([essence, recipeNames]) => {
        const baseName = essence.replace(' Essence', '');
        const uniqueNames = [...new Set(recipeNames)];
        const hasArmour = uniqueNames.some(r => !_FORGE_WEAPON_NAMES.has(r));
        const hasWeapons = uniqueNames.some(r => _FORGE_WEAPON_NAMES.has(r));
        if (hasArmour) {
            ITEMS.push({
                name: `${baseName} Armour Parchment`,
                icon: '/icons/parchments/forge-armour.webp',
                description: `An ancient looking piece of parchment. It documents the secrets of forging ${baseName} armour.`,
                type: 'parchment',
                parchmentType: 'essence-armour',
                essenceName: essence,
                value: 25,
                weight: 0.1,
            });
        }
        if (hasWeapons) {
            ITEMS.push({
                name: `${baseName} Weapons Parchment`,
                icon: '/icons/parchments/forge-weapons.webp',
                description: `An ancient looking piece of parchment. It documents the secrets of forging ${baseName} weapons.`,
                type: 'parchment',
                parchmentType: 'essence-weapons',
                essenceName: essence,
                value: 25,
                weight: 0.1,
            });
        }
    });
})();

/**
 * Returns true if the current party is holding a monster essence that the NPC has NOT seen yet.
 */
function _hasNewEssencesForNpc(questNpcId) {
    if (questNpcId !== 'monster-npc') return false;
    let foundNew = false;
    party.forEach(member => {
        if (member.isEmpty) return;
        member.inventory.forEach(item => {
            if (item && item.name.endsWith(' Essence') && item.name !== 'Life Essence') {
                if (!_seenEssences.has(item.name)) foundNew = true;
            }
        });
    });
    return foundNew;
}

// ─────────────────────────────────────────────
//  SAVE GAME — container tracking
// ─────────────────────────────────────────────
// Starter stash persistence — the single chest on Level 0 tagged with title='Stash'
// is a true persistent bank. Its contents live in this module between level visits.
let _persistedStarterStashItems = null;
export function getPersistedStarterStashItems() { return _persistedStarterStashItems; }
export function setPersistedStarterStashItems(items) {
    _persistedStarterStashItems = Array.isArray(items) ? [...items] : null;
}
/** Snapshot the current starter-stash chest contents into the persisted field.
 *  Call this just before leaving Level 0 so the scene's live state is preserved. */
export function snapshotStarterStash() {
    for (const obj of interactables) {
        if (obj.userData?.isStarterStash) {
            _persistedStarterStashItems = JSON.parse(JSON.stringify(obj.userData.contents ?? []));
            return;
        }
    }
}

// ─────────────────────────────────────────────
//  TRAP STATE
// ─────────────────────────────────────────────
// Stores "row,col" keys of traps that have been disarmed
const _trapDisarmedSet = new Set();
let _activeTrapObj = null; // the trap mesh currently showing the disarm modal

// Container persistence — tracks the contents of every chest, spell cabinet, etc.
// so items taken/deposited survive level transitions. Keyed by "level,col,row".
let _containerContentsPersistence = {};
// Legacy tracking for Ethereal Egg emptied state
let _eggEmptiedSet = new Set();

let objectsGroup = new THREE.Group();


export function clearObjects(scene) {
    scene.remove(objectsGroup);
    objectsGroup = new THREE.Group();
    scene.add(objectsGroup);

    // Clear mixers and intervals to prevent memory leaks and performance lag
    _mixers.length = 0;
    while (_intervals.length > 0) {
        clearInterval(_intervals.pop());
    }
    _shopGridCells.clear();
    _statueGridCells.clear();
    interactables.length = 0;
    _crystalShrineMesh = null;
}

// Animates a wall button press relative to its current rest position,
// so it works regardless of where the model was centered on the wall.
function _animateButtonPress(obj) {
    const pt = obj.userData.pressTarget ?? obj;
    const ax = obj.userData.animAxis ?? 'x';
    const dir = obj.userData.animDir ?? 1;
    const rest = pt.position[ax];
    const pressed = rest - dir * 0.04;
    new Tween(pt.position)
        .to({ [ax]: pressed }, 100)
        .easing(Easing.Quadratic.Out)
        .chain(new Tween(pt.position).to({ [ax]: rest }, 100).easing(Easing.Quadratic.In))
        .start();
}

export function initObjects(scene, camera) {
    scene.add(objectsGroup);

    spawnObjectsForLevel();

    window.addEventListener('click', (e) => {
        // If any modal overlay is currently visible, let the DOM handle it — don't raycast.
        const weaponRackOverlay = document.getElementById('weapon-rack-overlay');
        const cabinetOverlay = document.getElementById('cabinet-overlay');
        const chestOverlay = document.getElementById('chest-overlay');
        const corpseOverlay = document.getElementById('corpse-overlay');
        const equipOverlay = document.getElementById('equip-overlay');
        const merchantOverlay = document.getElementById('merchant-overlay');
        const alchemyOverlay = document.getElementById('alchemy-overlay');
        const charDevOverlay = document.getElementById('char-dev-overlay');
        const partyConfirmOverlay = document.getElementById('party-confirm-overlay');
        const trapDisarmOverlay = document.getElementById('trap-disarm-overlay');
        const shrineLootOverlay = document.getElementById('shrine-loot-overlay');
        const tcOverlay = document.getElementById('training-console-overlay');
        if (
            (weaponRackOverlay && !weaponRackOverlay.classList.contains('chest-hidden')) ||
            (cabinetOverlay && !cabinetOverlay.classList.contains('chest-hidden')) ||
            (chestOverlay && !chestOverlay.classList.contains('chest-hidden')) ||
            (corpseOverlay && !corpseOverlay.classList.contains('chest-hidden')) ||
            (equipOverlay && !equipOverlay.classList.contains('equip-hidden')) ||
            (merchantOverlay && !merchantOverlay.classList.contains('merchant-hidden')) ||
            (trapDisarmOverlay && !trapDisarmOverlay.classList.contains('chest-hidden')) ||
            (alchemyOverlay && !alchemyOverlay.classList.contains('chest-hidden')) ||
            (charDevOverlay && !charDevOverlay.classList.contains('char-dev-hidden')) ||
            (partyConfirmOverlay && !partyConfirmOverlay.classList.contains('chest-hidden')) ||
            (shrineLootOverlay && !shrineLootOverlay.classList.contains('chest-hidden')) ||
            (tcOverlay && !tcOverlay.classList.contains('tc-hidden')) ||
            e.target.closest('button[id^="skip-"]') ||
            e.target.closest('[id$="-video-overlay"]')
        ) return;

        // Raycast
        _clickMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        _clickMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        _clickRaycaster.setFromCamera(_clickMouse, camera);
        const intersects = _clickRaycaster.intersectObjects(interactables, false);

        for (let hit of intersects) {
            let obj = hit.object;
            if (obj.userData.isButton) {
                if (obj.userData.target === 'escape_mummy_room') {
                    // Check if player is facing the wall at (3, 21) from (3, 20)
                    if (isInFrontOfPlayer(3, 21, 1)) {
                        playButtonClickSound();
                        _animateButtonPress(obj);
                        _state.mummyEscapeGateOpened = true;
                        const trapDoor = objects.find(o => o.name === 'Portcullis' && o.gridRow === 1 && o.gridCol === 10);
                        if (trapDoor) openPortcullis(trapDoor);
                    } else {
                        showMessage("You can't reach that from here.");
                    }
                } else if (obj.userData.target === 'demon_room') {
                    // Player at (33, 3) facing west presses button on east face of col-2 wall
                    if (isInFrontOfPlayer(33, 2, 1)) {
                        playButtonClickSound();
                        _animateButtonPress(obj);
                        const vaultDoor = objects.find(o => o.name === 'Portcullis' && o.gridRow === 32 && o.gridCol === 2);
                        if (vaultDoor) openPortcullis(vaultDoor);
                    } else {
                        showMessage("You can't reach that from here.");
                    }
                } else if (obj.userData.target === 'close_hole') {
                    if (isInFrontOfPlayer(31, 25, 1)) {
                        playButtonClickSound();
                        if (!_state.level2HoleClosed) {
                            _animateButtonPress(obj);
                            _state.level2HoleClosed = true;
                            dungeonMap[32][23] = CELL_FLOOR;
                            level2Map[32][23] = CELL_FLOOR;
                            buildLevel(objectsGroup.parent);
                            showMessage("You hear mechanisms grinding. The pit is closed.");
                        } else {
                            showMessage("The hole is already closed.");
                        }
                    } else {
                        showMessage("You can't reach that from here.");
                    }
                } else if (obj.userData.target === 'essentiary_unlock_all') {
                    if (isInFrontOfPlayer(12, 8, 1)) {
                        playButtonClickSound();
                        _animateButtonPress(obj);
                        if (window.openEssentiary) window.openEssentiary({ unlockAll: true });
                    } else {
                        showMessage("You can't reach that from here.");
                    }
                } else if (obj.userData.target === 'teleport_level3') {
                    if (isInFrontOfPlayer(11, 8, 1)) {
                        playButtonClickSound();
                        _animateButtonPress(obj);

                        if (window.loadLevel) {
                            window.loadLevel(3);
                            setTimeout(() => {
                                player.gridRow = 21;
                                player.gridCol = 11;
                                player.facing = 0; // North
                                const w = cellToWorld(21, 11);
                                camera.position.set(w.x, w.y, w.z);
                                camera.rotation.order = 'YXZ';
                                camera.rotation.y = FACING_ANGLES[player.facing];
                                showMessage("You are transported to the Abyssal Crypts.");
                            }, 50);
                        }
                    } else {
                        showMessage("You can't reach that from here.");
                    }
                } else if (obj.userData.target === 'teleport_giant') {
                    if (isInFrontOfPlayer(11, 11, 1)) {
                        playButtonClickSound();
                        _animateButtonPress(obj);

                        if (window.loadLevel) {
                            window.loadLevel(2);
                            // Delay position overwrite to happen after loadLevel resets the player.
                            setTimeout(() => {
                                player.gridRow = 19;
                                player.gridCol = 6;
                                player.facing = 2; // South
                                const w = cellToWorld(19, 6);
                                camera.position.set(w.x, w.y, w.z);
                                camera.rotation.order = 'YXZ';
                                camera.rotation.y = FACING_ANGLES[player.facing];
                                showMessage("Teleported to the Giant's Room!");
                            }, 50);
                        }
                    } else {
                        showMessage("You can't reach that from here.");
                    }
                } else if (obj.userData.portcullisRow !== undefined) {
                    // Generic portcullis button — used by Hall of Heroes and any future levels.
                    // wallRow/wallCol: the wall cell the player must face (1 step away).
                    // portcullisRow/Col: the portcullis object to open.
                    // animAxis ('x'|'z') and animDir (+1|-1) control the press animation.
                    if (isInFrontOfPlayer(obj.userData.wallRow, obj.userData.wallCol, 1)) {
                        playButtonClickSound();
                        _animateButtonPress(obj);
                        const p = objects.find(o =>
                            o.name === 'Portcullis' &&
                            o.gridRow === obj.userData.portcullisRow &&
                            o.gridCol === obj.userData.portcullisCol);
                        if (p) openPortcullis(p);
                    } else {
                        showMessage("You can't reach that from here.");
                    }
                } else if (obj.userData.target === 'portcullis_ogre_room') {
                    // Button on east face of col-2 wall at row 7 — player at (7,1) facing east
                    if (isInFrontOfPlayer(7, 2, 1)) {
                        playButtonClickSound();
                        _animateButtonPress(obj);
                        const p = objects.find(o => o.name === 'Portcullis' && o.gridRow === 6 && o.gridCol === 1);
                        if (p && !_state.level1OgrePortcullisOpened) {
                            openPortcullis(p);
                            _state.level1OgrePortcullisOpened = true;
                            // Trigger the ogre encounter video when the gate opens
                            if (window.playOgreVideo) window.playOgreVideo();
                        }
                    } else {
                        showMessage("You can't reach that from here.");
                    }
                } else {
                    // Check if player is facing the wall at (8, 8) from (8, 7)
                    if (isInFrontOfPlayer(8, 8, 1)) {
                        playButtonClickSound();
                        _animateButtonPress(obj);
                        // Hardcoded portcullis open
                        const p = objects.find(o => o.name === 'Portcullis' && o.gridRow === 7 && o.gridCol === 7);
                        if (p) {
                            openPortcullis(p);
                            _state.level1BtnPortcullisOpened = true;
                        }
                    } else {
                        showMessage("You can't reach that from here.");
                    }
                }
                break;
            } else if (obj.userData.isChest) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    openChestModal(obj);
                } else {
                    showMessage("Stand near the chest to open it.");
                }
                break;
            } else if (obj.userData.isArmorStand) {
                // Check if player is standing on the same square as the armor stand
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);

                if (isOnSameSquare) {
                    openArmorStandModal(obj);
                } else {
                    showMessage("Stand on the armor stand to use it.");
                }
                break;
            } else if (obj.userData.isCrystal) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    resurrectAll();
                    playHealSound();
                    showMessage("The glowing crystals pulse with life-giving energy!");

                    // Small flash of light animation
                    if (obj.userData.light) {
                        const originalIntensity = obj.userData.light.intensity;
                        new Tween({ i: originalIntensity })
                            .to({ i: originalIntensity * 4 }, 200)
                            .easing(Easing.Quadratic.Out)
                            .onUpdate((o) => { obj.userData.light.intensity = o.i; })
                            .chain(
                                new Tween({ i: originalIntensity * 4 })
                                    .to({ i: originalIntensity }, 800)
                                    .easing(Easing.Quadratic.In)
                                    .onUpdate((o) => { obj.userData.light.intensity = o.i; })
                            )
                            .start();
                    }
                } else {
                    showMessage("The crystals pulse with a faint glow.");
                }
                break;
            } else if (obj.userData.isDamageTrap) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    openTrapDisarmModal(obj);
                } else {
                    showMessage("You spot what looks like a trap on the floor.");
                }
                break;
            } else if (obj.userData.isEgg) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    if (obj.userData.decorative) {
                        showMessage("The egg pulses with an otherworldly energy, its purpose now fulfilled.");
                    } else if (obj.userData.isActive) {
                        // Always-active egg (e.g. the return egg on level 4) — no guardian check.
                        playPortalSound();
                        const tl = obj.userData.targetLevel ?? 4;
                        const tr = obj.userData.targetRow;
                        const tc = obj.userData.targetCol;
                        if (window.loadLevel) {
                            window.loadLevel(tl);
                            if (tr != null && tc != null) {
                                setTimeout(() => {
                                    player.gridRow = tr;
                                    player.gridCol = tc;
                                    player.facing = obj.userData.targetFacing ?? 2;
                                    const w = cellToWorld(tr, tc);
                                    camera.position.set(w.x, w.y, w.z);
                                    camera.rotation.order = 'YXZ';
                                    camera.rotation.y = FACING_ANGLES[player.facing];
                                }, 50);
                            }
                        }
                    } else {
                        // Standard level-3 egg: check live minotaur state — works whether it
                        // died this session or was already dead when the level loaded.
                        const minotaur = monsters.find(m => m.id === 300);
                        const minotaurDead = minotaur ? !minotaur.alive : true;
                        if (minotaurDead) {
                            playPortalSound();
                            if (window.playEggVideo) {
                                window.playEggVideo(() => { if (window.loadLevel) window.loadLevel(4); });
                            } else if (window.loadLevel) {
                                window.loadLevel(4);
                            }
                        } else {
                            showMessage("The egg pulses with a faint energy, but something holds it back...");
                        }
                    }
                } else {
                    showMessage("The egg radiates a strange golden light.");
                }
                break;

            } else if (obj.userData.isBonePile) {
                // Check if player is in front of the bone pile (within 1 square)
                if (isInFrontOfPlayer(obj.userData.gridRow, obj.userData.gridCol, 1)) {
                    playBoneSound();
                    openCorpseModal(obj);
                } else {
                    showMessage("The corpse lies just out of reach.");
                }
            } else if (obj.userData.isDisabledPortal) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    showMessage("Its some kind of portal but appears not to be working");
                } else {
                    showMessage("The dormant portal waits silently.");
                }
                break;
            } else if (obj.userData.isPortalActivatorStatue) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 2 && distCol <= 2) {
                    const contents = obj.userData.contents || [];
                    if (contents.filter(c => c !== null).length > 0) {
                        openShrineLootModal(obj);
                    } else {
                        showMessage("The ethereal egg is empty and dormant.");
                    }
                } else {
                    showMessage("The ancient statue watches you.");
                }
                break;
            } else if (obj.userData.isHeroDoor) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    const doorTarget = obj.userData.targetLevel ?? 5;
                    const doorMsg = doorTarget === 0
                        ? "You step back through the hero's door..."
                        : "You push open the great hero's door...";
                    showMessage(doorMsg);
                    playPortalSound();
                    if (doorTarget === 5 && window.playHeroDoorVideo) {
                        window.playHeroDoorVideo(() => { if (window.loadLevel) window.loadLevel(doorTarget); });
                    } else {
                        if (window.loadLevel) window.loadLevel(doorTarget);
                    }
                } else {
                    showMessage("An ornate door stands before you. Approach to enter.");
                }
                break;
            } else if (obj.userData.isPortal) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    const targetLevel = obj.userData.targetLevel;
                    if (targetLevel === -1) {
                        showMessage('YOU ESCAPED!<br><small style="font-size:14px;color:#aaa">The dungeon is conquered.</small>');
                        return;
                    }

                    showMessage("You step into the swirling blue portal...");
                    playPortalSound();

                    if (obj.userData.isArenaExit) {
                        if (window._arenaExit) window._arenaExit(true);
                        return;
                    }

                    const tr = obj.userData.targetRow;
                    const tc = obj.userData.targetCol;
                    const tf = obj.userData.targetFacing;

                    function _doLoad() {
                        if (window.loadLevel) {
                            window.loadLevel(targetLevel);
                            if (tr != null && tc != null) {
                                setTimeout(() => {
                                    player.gridRow = tr;
                                    player.gridCol = tc;
                                    const w = cellToWorld(tr, tc);
                                    camera.position.set(w.x, w.y, w.z);
                                    if (tf != null) {
                                        player.facing = tf;
                                        camera.rotation.order = 'YXZ';
                                        camera.rotation.y = FACING_ANGLES[tf];
                                    }
                                }, 50);
                            }
                        }
                    }

                    if (window.currentLevel === 0 && targetLevel > 0) {
                        // All outgoing warps from the starter room play the portal entry video first
                        if (window.playPortalVideo) {
                            window.playPortalVideo(() => _doLoad());
                        } else {
                            _doLoad();
                        }
                    } else {
                        // Return portals and all other transitions — load immediately
                        _doLoad();
                    }
                } else {
                    showMessage("Step closer to the portal to enter.");
                }
                break;
            } else if (obj.userData.isShop) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    const skipGreeting = window.currentLevel === 0 && _hasNewEssencesForNpc(obj.userData.questNpcId);
                    if (!skipGreeting) {
                        if (obj.userData.greetingCallback) {
                            obj.userData.greetingCallback();
                        } else {
                            playShopkeeperSound();
                        }
                    }
                    if (obj.userData.questNpcId !== 'monster-npc' || window.currentLevel === 0) {
                        openMerchantModal(obj.userData.shopType || 'weapons', obj.userData.questNpcId || null);
                    }

                    // Relocate quest: If this is the monster npc in the pit trap room (now an isShop entity)
                    if (window.currentLevel === 1 && obj.userData.gridRow === 26 && obj.userData.gridCol === 2) {
                        _state.monsterNpcSaved = true;
                        console.log("Antigravity: Monster NPC saved via shop interaction!");
                    }
                } else {
                    showMessage("The merchant watches you from behind the counter.");
                }
                break;
            } else if (obj.userData.isDialogueNPC) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 3 && distCol <= 3) {
                    if (obj.userData.dialogue) {
                        showMessage(obj.userData.dialogue);
                    }
                    
                    if (obj.userData.clickAudio) {
                        const npcRow = obj.userData.gridRow;
                        const npcCol = obj.userData.gridCol;
                        if (!isNpcDialoguePlaying(npcRow, npcCol)) {
                            const url = obj.userData.clickAudio;

                            if (obj.userData.fallbackClickAudio) {
                                obj.userData.clickAudio = obj.userData.fallbackClickAudio;
                            } else {
                                obj.userData.clickAudio = null;
                            }

                            // Consume the one-shot onAudioEnd callback and clear it from all sibling meshes
                            const onAudioEnd = obj.userData.onAudioEnd ?? null;
                            if (onAudioEnd) {
                                let modelRoot = obj;
                                while (modelRoot.parent && modelRoot.parent !== objectsGroup) modelRoot = modelRoot.parent;
                                modelRoot.traverse(c => { if (c.userData) c.userData.onAudioEnd = null; });
                            }

                            playNpcDialogue(npcRow, npcCol, url, 0.8, onAudioEnd);

                            // Otter NPC level 4 first-click video sequence trigger
                            if (url.includes('post-minotaur.mp3') && window.playOtterVideoSequence) {
                                setTimeout(() => {
                                    window.playOtterVideoSequence();
                                }, 10000);
                            }
                        }
                    }
                    
                    // Turn to face the player
                    let root = obj;
                    while (root.parent && root.parent !== objectsGroup) root = root.parent;
                    
                    if (root) {
                        const px = player.gridCol * CELL;
                        const pz = player.gridRow * CELL;
                        const targetAngle = Math.atan2(px - root.position.x, pz - root.position.z);
                        let diff = targetAngle - root.rotation.y;
                        while (diff > Math.PI) diff -= 2 * Math.PI;
                        while (diff < -Math.PI) diff += 2 * Math.PI;
                        new Tween(root.rotation, tweenGroup)
                            .to({ y: root.rotation.y + diff }, 600)
                            .easing(Easing.Quadratic.Out)
                            .start();

                        // Crossfade idle → talking
                        if (root.userData.idleAction && root.userData.talkAction) {
                            root.userData.idleAction.fadeOut(0.3);
                            root.userData.talkAction.reset().fadeIn(0.3).play();
                            
                            // Return to idle after a duration (~5s is a good default for dialogue audio)
                            setTimeout(() => {
                                if (root.userData.talkAction && root.userData.idleAction) {
                                    root.userData.talkAction.fadeOut(0.3);
                                    root.userData.idleAction.reset().fadeIn(0.3).play();
                                }
                            }, 5000);
                        }
                    }

                    // Relocate quest: If this is the monster npc in the pit trap room
                    if (window.currentLevel === 1 && obj.userData.gridRow === 26 && obj.userData.gridCol === 2) {
                        _state.monsterNpcSaved = true;
                        console.log("Antigravity: Monster NPC saved! _state.monsterNpcSaved is now true.");
                    }
                }
                break;
            } else if (obj.userData.isWeaponRack) {
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);
                if (isOnSameSquare) {
                    openWeaponRackModal(obj);
                } else {
                    showMessage("Stand by the weapon rack to inspect it.");
                }
                break;
            } else if (obj.userData.isSpellCabinet) {
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);
                if (isOnSameSquare) {
                    openSpellCabinetModal(obj);
                } else {
                    showMessage("Stand on the cabinet to open it.");
                }
                break;
            } else if (obj.userData.isAlchemyWorkshop) {
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);
                if (isOnSameSquare) {
                    openAlchemyModal();
                } else {
                    showMessage("Stand by the workshop to use it.");
                }
                break;
            } else if (obj.userData.isPitLadder) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    // Teleport back up – near the hole (1, 15)
                    player.gridRow = 1;
                    player.gridCol = 14;
                    player.facing = 3; // West – facing away from the hole at (1, 15)
                    const w = cellToWorld(1, 14);
                    camera.position.set(w.x, w.y, w.z);
                    camera.rotation.order = 'YXZ';
                    camera.rotation.y = FACING_ANGLES[player.facing];
                    drawMinimap();
                    updateStatus();
                    fadeOutQuestAudio(0.5);
                    showMessage("You climb back up the ladder.");
                } else {
                    showMessage("You are too far from the ladder.");
                }
                break;
            } else if (obj.userData.isTrainingConsole) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 2 && distCol <= 2) {
                    openTrainingConsole();
                } else {
                    showMessage("You need to get closer to the console.");
                }
                break;
            } else if (obj.userData.isDroppedItem) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    if (obj.userData.itemName === 'Gold Coins') {
                        const amount = obj.userData.quantity || 1;
                        addGold(amount);
                        showMessage(`Picked up ${amount} Gold Coins.`);
                        obj.parent.remove(obj);
                    } else {
                        {
                            let added = false;
                            for (let i = 0; i < 4; i++) {
                                if (equip.addItemToInventory(i, obj.userData.itemName)) {
                                    added = true;
                                    addLogEntry({ type: 'item', subtype: 'loot', itemName: obj.userData.itemName, time: Date.now() });
                                    showMessage(`Picked up ${obj.userData.itemName}.`);
                                    playItemSound(obj.userData.itemName);
                                    if (obj.userData.modelContainer) {
                                        obj.userData.modelContainer.parent.remove(obj.userData.modelContainer);
                                    } else {
                                        obj.parent.remove(obj);
                                    }
                                    showInlineHelp('first-item-pickup', {
                                        text: 'Items are picked up by the first available party member. To move an item to another member, open the inventory (<strong>I</strong>), then <strong>right click</strong> the item and select the target party member.'
                                    });
                                    const pickedDef = getItemDef(obj.userData.itemName);
                                    if (pickedDef?.type === 'spellbook') {
                                        showInlineHelp('first-scroll-pickup', {
                                            text: 'To learn a scroll, open the inventory (<strong>I</strong>), then <strong>right click</strong> the scroll and select <strong>Learn</strong>.'
                                        });
                                    }
                                    break;
                                }
                            }
                            if (!added) {
                                showMessage("Inventory is full!");
                            }
                        }
                    }
                } else {
                    showMessage("Move closer to pick it up.");
                }
                break;
            } else if (obj.userData.isAnvil) {
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);
                if (isOnSameSquare) {
                    openAnvilModal();
                } else {
                    showMessage("Stand by the forge to use it.");
                }
                break;
            } else if (obj.userData.isKeyhole) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 3 && distCol <= 3) {
                    const p = objects.find(o => o.name === 'Portcullis' && o.gridRow === obj.userData.targetRow && o.gridCol === obj.userData.targetCol);
                    if (p) {
                        if (!p.isOpen) {
                            if (p.gridRow === 30 && p.gridCol === 9) {
                                let keyFound = false;
                                for (let i = 0; i < party.length; i++) {
                                    if (party[i] && !party[i].isEmpty && party[i].inventory) {
                                        const invIndex = party[i].inventory.findIndex(item => item && item.name === 'Bone Key');
                                        if (invIndex !== -1) {
                                            keyFound = true;
                                            party[i].inventory[invIndex] = null; // Consume the key
                                            break;
                                        }
                                    }
                                }

                                if (keyFound) {
                                    showMessage("You insert the Bone Key into the strange keyhole. Internal mechanisms shift and the portcullis grinds open.");
                                    playKeyLockSound();
                                    setTimeout(() => {
                                        openPortcullis(p);
                                        _state.level2GiantPortcullisOpened = true;
                                        if (window.playGiantVideo) {
                                            window.playGiantVideo();
                                        }
                                    }, 400);
                                } else {
                                    showMessage("This gate requires a Bone Key to open!");
                                    playKeyLockSound(); // Play a clunk or locked sound, reusing keyLock sound is fine or skip it
                                }
                                break; // Skip the normal bronze key search
                            }

                            const keyName = obj.userData.requiredKey || 'Bronze Key';
                            let keyFound = false;
                            for (let i = 0; i < party.length; i++) {
                                if (party[i] && !party[i].isEmpty && party[i].inventory) {
                                    const invIndex = party[i].inventory.findIndex(item => item && item.name === keyName);
                                    if (invIndex !== -1) {
                                        keyFound = true;
                                        party[i].inventory[invIndex] = null;
                                        break;
                                    }
                                }
                            }

                            if (keyFound) {
                                showMessage(`You use the ${keyName}. The portcullis grinds open.`);
                                playKeyLockSound();
                                setTimeout(() => {
                                    openPortcullis(p);
                                    if (window.currentLevel === 2 && p.gridRow === 23 && p.gridCol === 7) {
                                        _state.level2PortcullisOpened = true;
                                    }
                                    if (window.currentLevel === 1 && p.gridRow === 10 && p.gridCol === 17) {
                                        _state.level1ShrineGateOpened = true;
                                    }
                                }, 400);
                                refreshPartyCards();
                            } else {
                                showMessage(`The portcullis is locked. It needs a ${keyName}.`);
                            }
                        } else {
                            showMessage("The portcullis is already open.");
                        }
                    }
                } else {
                    showMessage("You can't reach the keyhole from here.");
                }
                break;
            } else if (obj.userData.isStatue) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 2 && distCol <= 2) {
                    // Gate already open — nothing more to do
                    if (_state.mummyGateOpened) break;

                    // Show the sarcophagus confirmation modal
                    const overlay = document.getElementById('sarcophagus-overlay');
                    if (overlay) overlay.classList.remove('chest-hidden');
                } else {
                    showMessage("The sarcophagus looms silently across the room.");
                }
                break;
            } else if (obj.userData.isCrystalShrine) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 2 && distCol <= 2) {
                    if (_state.crystalShrineState === 2) {
                        showMessage("The shrine radiates with brilliant red and blue energy.");
                    } else if (_state.crystalShrineState === 1) {
                        // Red placed — look for blue crystal
                        let blueIdx = -1, blueMember = null;
                        for (let i = 0; i < party.length; i++) {
                            if (party[i] && !party[i].isEmpty && party[i].inventory) {
                                const idx = party[i].inventory.findIndex(item => item && item.name === 'Blue Crystal');
                                if (idx !== -1) { blueIdx = idx; blueMember = party[i]; break; }
                            }
                        }
                        if (blueMember) {
                            blueMember.inventory[blueIdx] = null;
                            _state.crystalShrineState = 2;
                            _swapCrystalShrine();
                            playSoundByUrl(asset('/items/crystal-shrine/crystal-portal.mp3'), 0.9);
                            showMessage("The portal opens!");
                            if (window.playCrystalShrineRedBlueVideo) {
                                window.playCrystalShrineRedBlueVideo(() => {
                                    if (_state.starterPortalEnabled && _state.level3PortalEnabled) {
                                        _activateLevel4Portal();
                                    } else if (_state.starterPortalEnabled) {
                                        _activateLevel3Portal();
                                    } else {
                                        _activateStarterPortal();
                                    }
                                });
                            } else {
                                if (_state.starterPortalEnabled && _state.level3PortalEnabled) {
                                    _activateLevel4Portal();
                                } else if (_state.starterPortalEnabled) {
                                    _activateLevel3Portal();
                                } else {
                                    _activateStarterPortal();
                                }
                            }
                        } else {
                            showMessage("The shrine pulses with red energy. It seems to need a Blue Crystal.");
                        }
                    } else {
                        // State 0 — look for red crystal
                        let redIdx = -1, redMember = null;
                        for (let i = 0; i < party.length; i++) {
                            if (party[i] && !party[i].isEmpty && party[i].inventory) {
                                const idx = party[i].inventory.findIndex(item => item && item.name === 'Red Crystal');
                                if (idx !== -1) { redIdx = idx; redMember = party[i]; break; }
                            }
                        }
                        if (redMember) {
                            redMember.inventory[redIdx] = null;
                            _state.crystalShrineState = 1;
                            _swapCrystalShrine();
                            playSoundByUrl(asset('/items/crystal-shrine/crystal-portal.mp3'), 0.9);
                            if (window.playCrystalShrineRedVideo) {
                                window.playCrystalShrineRedVideo(() => { });
                            }
                        } else {
                            showMessage("It looks like it needs some crystals to activate it.");
                        }
                    }
                } else {
                    showMessage("It looks like it needs some crystals to activate it.");
                }
                break;
            } else if (obj.userData.isJester) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 2 && distCol <= 2) {
                    if (!isNpcDialoguePlaying(obj.userData.gridRow, obj.userData.gridCol)) {
                        playNpcDialogue(obj.userData.gridRow, obj.userData.gridCol, '/sounds/npcs/welcome-adventure.mp3', 0.7);
                    }
                    showMessage("The Jester greets you with a cackle!");

                    // Walk up to the root model (which holds mixer / animations)
                    let root = obj;
                    while (root && !root.userData.mixer) root = root.parent;

                    // Turn to face the player
                    if (root) {
                        const px = player.gridCol * CELL;
                        const pz = player.gridRow * CELL;
                        const targetAngle = Math.atan2(px - root.position.x, pz - root.position.z);
                        let diff = targetAngle - root.rotation.y;
                        while (diff > Math.PI) diff -= 2 * Math.PI;
                        while (diff < -Math.PI) diff += 2 * Math.PI;
                        new Tween(root.rotation, tweenGroup)
                            .to({ y: root.rotation.y + diff }, 600)
                            .easing(Easing.Quadratic.Out)
                            .start();
                    }

                    // Crossfade idle → talking
                    if (root && root.userData.idleAction && root.userData.talkAction) {
                        root.userData.idleAction.fadeOut(0.3);
                        root.userData.talkAction.reset().fadeIn(0.3).play();
                    }
                } else {
                    showMessage("The Jester beckons you from afar.");
                }
                break;
            } else if (obj.userData.isPartyConfirmNPC || (obj.parent && obj.parent.userData && obj.parent.userData.isPartyConfirmNPC)) {
                // Determine which object holds the grid info (submesh or parent)
                const data = obj.userData.isPartyConfirmNPC ? obj.userData : obj.parent.userData;
                const distRow = Math.abs(player.gridRow - data.gridRow);
                const distCol = Math.abs(player.gridCol - data.gridCol);
                // Increased range to 3 for better accessibility
                if (distRow <= 3 && distCol <= 3) {
                    // Turn to face the player
                    if (_partyConfirmNPCModel) {
                        const npcPos = _partyConfirmNPCModel.position;
                        const px = player.gridCol * CELL;
                        const pz = player.gridRow * CELL;
                        const targetAngle = Math.atan2(px - npcPos.x, pz - npcPos.z);
                        // Normalise to shortest rotation arc from current angle
                        let diff = targetAngle - _partyConfirmNPCModel.rotation.y;
                        while (diff > Math.PI) diff -= 2 * Math.PI;
                        while (diff < -Math.PI) diff += 2 * Math.PI;
                        new Tween(_partyConfirmNPCModel.rotation, tweenGroup)
                            .to({ y: _partyConfirmNPCModel.rotation.y + diff }, 600)
                            .easing(Easing.Quadratic.Out)
                            .start();
                    }
                    // Switch to talking animation
                    if (_npcIdleAction && _npcTalkAction) {
                        _npcIdleAction.fadeOut(0.3);
                        _npcTalkAction.reset().fadeIn(0.3).play();
                    }
                    const partyFull = party.every(m => !m.isEmpty);
                    if (!isNpcDialoguePlaying(data.gridRow, data.gridCol)) {
                        if (partyFull) {
                            playNpcDialogue(data.gridRow, data.gridCol, '/sounds/npcs/party-chosen.mp3').then(source => {
                                if (source?.buffer) {
                                    const delay = Math.max(0, (source.buffer.duration - 0.8) * 1000);
                                    setTimeout(() => {
                                        const overlay = document.getElementById('party-confirm-overlay');
                                        if (overlay) overlay.classList.remove('chest-hidden');
                                    }, delay);
                                }
                            });
                        } else {
                            playNpcDialogue(data.gridRow, data.gridCol, '/sounds/npcs/incomplete-party.mp3');
                        }
                    }
                } else {
                    showMessage("The mysterious figure beckons you from afar.");
                }
                break;
            }
        }
    });

    // Shrine loot modal close
    const shrineLootCloseBtn = document.getElementById('shrine-loot-close');
    if (shrineLootCloseBtn) {
        shrineLootCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('shrine-loot-overlay').classList.add('chest-hidden');
            _activeShrineLootObj = null;
            equip.hideTooltip();
        };
    }

    // Modal Close Logic
    const closeBtn = document.getElementById('chest-close');
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('chest-overlay').classList.add('chest-hidden');
            _activeChestContents = null;
            _activeChestSlots = null;
            _hideChestCtxMenu();
            equip.hideTooltip();
        };
    }

    // Armor stand modal close
    const armorStandCloseBtn = document.getElementById('armor-stand-close');
    if (armorStandCloseBtn) {
        armorStandCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('armor-stand-overlay').classList.add('chest-hidden');
            _activeArmorStandObj = null;
            equip.hideTooltip();
        };
    }

    // Merchant modal close
    const merchantCloseBtn = document.getElementById('merchant-close');
    if (merchantCloseBtn) {
        merchantCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('merchant-overlay').classList.add('merchant-hidden');
            _hideChestCtxMenu();
            equip.hideTooltip();
        };
    }

    // Sarcophagus modal
    const sarcophagusClose = document.getElementById('sarcophagus-close');
    if (sarcophagusClose) {
        sarcophagusClose.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('sarcophagus-overlay').classList.add('chest-hidden');
        };
    }

    const sarcophagusNo = document.getElementById('sarcophagus-no');
    if (sarcophagusNo) {
        sarcophagusNo.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('sarcophagus-overlay').classList.add('chest-hidden');
        };
    }

    const sarcophagusYes = document.getElementById('sarcophagus-yes');
    if (sarcophagusYes) {
        sarcophagusYes.onclick = (e) => {
            e.stopPropagation();
            _state.mummyGateOpened = true;

            // Close the modal immediately
            const overlay = document.getElementById('sarcophagus-overlay');
            if (overlay) overlay.classList.add('chest-hidden');

            playGateOpeningSound();

            // Engage mummies 
            triggerMummyAmbush();

            // Open the three-wide portcullis 
            objects
                .filter(o => o.name === 'Portcullis' && o.gridCol === 16 && o.gridRow >= 2 && o.gridRow <= 4)
                .forEach(p => openPortcullis(p, true));

            // Close the entrance portcullis to trap the players
            const trapDoor = objects.find(o => o.name === 'Portcullis' && o.gridRow === 1 && o.gridCol === 10);
            if (trapDoor) closePortcullis(trapDoor);

            if (window.playMummyVideo) {
                window.playMummyVideo();
            }
        };
    }

    const partyConfirmNo = document.getElementById('party-confirm-no');
    if (partyConfirmNo) {
        partyConfirmNo.onclick = (e) => {
            e.stopPropagation();
            const overlay = document.getElementById('party-confirm-overlay');
            if (overlay) overlay.classList.add('chest-hidden');
            // Return to idle animation
            if (_npcTalkAction && _npcIdleAction) {
                _npcTalkAction.fadeOut(0.3);
                _npcIdleAction.reset().fadeIn(0.3).play();
            }
        };
    }

    const partyConfirmYes = document.getElementById('party-confirm-yes');
    if (partyConfirmYes) {
        partyConfirmYes.onclick = (e) => {
            e.stopPropagation();
            const overlay = document.getElementById('party-confirm-overlay');
            if (overlay) overlay.classList.add('chest-hidden');

            // Hide the NPC
            if (_partyConfirmNPCModel) {
                if (_partyConfirmNPCModel.parent) _partyConfirmNPCModel.parent.remove(_partyConfirmNPCModel);
                _partyConfirmNPCModel.traverse((child) => {
                    const idx = interactables.indexOf(child);
                    if (idx !== -1) interactables.splice(idx, 1);
                });
                _partyConfirmNPCModel = null;
            }

            _state.starterGateOpened = true;
            if (window.playBattlePrepVideo) {
                window.playBattlePrepVideo(() => {
                    if (_starterGate) openPortcullis(_starterGate);
                });
            } else {
                if (_starterGate) openPortcullis(_starterGate);
            }
            
        };
    }

    // Anvil / Forge modal close
    const anvilCloseBtn = document.getElementById('anvil-close');
    if (anvilCloseBtn) {
        anvilCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('anvil-overlay').classList.add('chest-hidden');
            _forgeModalOpen = false;
            _hideForgeItemPicker();
            _hideChestCtxMenu();
            equip.hideTooltip();
        };
    }

    // Forge button
    const anvilForgeBtn = document.getElementById('anvil-forge-btn');
    if (anvilForgeBtn) {
        anvilForgeBtn.onclick = () => _forge();
    }

    // Forge picker close
    const anvilPickerClose = document.getElementById('anvil-picker-close');
    if (anvilPickerClose) {
        anvilPickerClose.onclick = () => _hideForgeItemPicker();
    }

    // Merchant buy button
    const merchantBuyBtn = document.getElementById('merchant-buy-btn');
    if (merchantBuyBtn) {
        merchantBuyBtn.onclick = (e) => {
            e.stopPropagation();
            _buyItems();
        };
    }

    // Merchant sell button
    const merchantSellBtn = document.getElementById('merchant-sell-btn');
    if (merchantSellBtn) {
        merchantSellBtn.onclick = (e) => {
            e.stopPropagation();
            _sellItems();
        };
    }

    // Merchant tab buttons
    const tabBuy = document.getElementById('merchant-tab-buy');
    const tabSell = document.getElementById('merchant-tab-sell');
    if (tabBuy) tabBuy.onclick = (e) => { e.stopPropagation(); _switchMerchantTab('buy'); };
    if (tabSell) tabSell.onclick = (e) => { e.stopPropagation(); _switchMerchantTab('sell'); };

    // Weapon rack modal close
    const weaponRackCloseBtn = document.getElementById('weapon-rack-close');
    if (weaponRackCloseBtn) {
        weaponRackCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('weapon-rack-overlay').classList.add('chest-hidden');
            _hideChestCtxMenu();
            equip.hideTooltip();
        };
    }

    // Cabinet modal close
    const cabinetCloseBtn = document.getElementById('cabinet-close');
    if (cabinetCloseBtn) {
        cabinetCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('cabinet-overlay').classList.add('chest-hidden');
            _hideChestCtxMenu();
            equip.hideTooltip();
        };
    }

    // Corpse modal close
    const corpseCloseBtn = document.getElementById('corpse-close');
    if (corpseCloseBtn) {
        corpseCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('corpse-overlay').classList.add('chest-hidden');
            _hideChestCtxMenu();
            equip.hideTooltip();
        };
    }

    // Alchemy modal close
    const alchemyCloseBtn = document.getElementById('alchemy-close');
    if (alchemyCloseBtn) {
        alchemyCloseBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('alchemy-overlay').classList.add('chest-hidden');
            _alchemyModalOpen = false;
            _hideAlchemyItemPicker();
            _hideChestCtxMenu();
            equip.hideTooltip();
        };
    }

    // Alchemy picker close
    const alchemyPickerCloseBtn = document.getElementById('alchemy-picker-close');
    if (alchemyPickerCloseBtn) {
        alchemyPickerCloseBtn.onclick = (e) => {
            e.stopPropagation();
            _hideAlchemyItemPicker();
        };
    }

    // Transmute button
    const transmuteBtn = document.getElementById('alchemy-transmute-btn');
    if (transmuteBtn) {
        transmuteBtn.onclick = (e) => {
            e.stopPropagation();
            _transmute();
        };
    }

    // Alchemy parchment button
    const alchemyParchmentBtn = document.getElementById('alchemy-parchment-btn');
    if (alchemyParchmentBtn) {
        alchemyParchmentBtn.onclick = (e) => {
            e.stopPropagation();
            _showAlchemyParchmentPicker(e.clientX, e.clientY);
        };
    }

    // Alchemy parchment picker close
    const alchemyParchmentPickerClose = document.getElementById('alchemy-parchment-picker-close');
    if (alchemyParchmentPickerClose) {
        alchemyParchmentPickerClose.onclick = (e) => { e.stopPropagation(); _hideAlchemyParchmentPicker(); };
    }

    // Forge parchment button
    const anvilParchmentBtn = document.getElementById('anvil-parchment-btn');
    if (anvilParchmentBtn) {
        anvilParchmentBtn.onclick = (e) => {
            e.stopPropagation();
            _showAnvilParchmentPicker(e.clientX, e.clientY);
        };
    }

    // Forge parchment picker close
    const anvilParchmentPickerClose = document.getElementById('anvil-parchment-picker-close');
    if (anvilParchmentPickerClose) {
        anvilParchmentPickerClose.onclick = (e) => { e.stopPropagation(); _hideAnvilParchmentPicker(); };
    }

    // Return Items buttons (alchemy + forge)
    const alchemyReturnBtn = document.getElementById('alchemy-return-btn');
    if (alchemyReturnBtn) {
        alchemyReturnBtn.onclick = (e) => {
            e.stopPropagation();
            _returnAlchemyIngredients();
        };
    }
    const anvilReturnBtn = document.getElementById('anvil-return-btn');
    if (anvilReturnBtn) {
        anvilReturnBtn.onclick = (e) => {
            e.stopPropagation();
            _returnForgeIngredients();
        };
    }

    // Alchemy recipe filter tabs
    document.querySelectorAll('#alchemy-filter-tabs .bench-filter-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _alchemyRecipeFilter = btn.dataset.filter;
            document.querySelectorAll('#alchemy-filter-tabs .bench-filter-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _renderKnownAlchemyRecipes();
        });
    });

    // Forge recipe filter tabs
    document.querySelectorAll('#anvil-filter-tabs .bench-filter-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _forgeRecipeFilter = btn.dataset.filter;
            document.querySelectorAll('#anvil-filter-tabs .bench-filter-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _renderKnownForgeRecipes();
        });
    });

    // Stop ALL clicks inside the weapon rack overlay from reaching the window listener
    const weaponRackOverlayEl = document.getElementById('weapon-rack-overlay');
    if (weaponRackOverlayEl) {
        weaponRackOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Stop ALL clicks inside the cabinet overlay from reaching the window listener
    // (so clicking items inside doesn't trigger world raycasting either)
    const cabinetOverlay = document.getElementById('cabinet-overlay');
    if (cabinetOverlay) {
        cabinetOverlay.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for chest overlay
    const chestOverlayEl = document.getElementById('chest-overlay');
    if (chestOverlayEl) {
        chestOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for corpse overlay
    const corpseOverlayEl = document.getElementById('corpse-overlay');
    if (corpseOverlayEl) {
        corpseOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for merchant overlay
    const merchantOverlayEl = document.getElementById('merchant-overlay');
    if (merchantOverlayEl) {
        merchantOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for alchemy overlay
    const alchemyOverlayEl = document.getElementById('alchemy-overlay');
    if (alchemyOverlayEl) {
        alchemyOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for char dev overlay
    const charDevOverlayEl = document.getElementById('char-dev-overlay');
    if (charDevOverlayEl) {
        charDevOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for anvil/forge overlay
    const anvilOverlayEl = document.getElementById('anvil-overlay');
    if (anvilOverlayEl) {
        anvilOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // Ditto for armor stand overlay
    const armorStandOverlayEl = document.getElementById('armor-stand-overlay');
    if (armorStandOverlayEl) {
        armorStandOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // ── Training Console event wiring ──────────────────────────────────────
    const tcOverlayEl = document.getElementById('training-console-overlay');
    if (tcOverlayEl) {
        tcOverlayEl.addEventListener('click', (e) => e.stopPropagation());
    }
    const tcCloseBtn = document.getElementById('tc-close');
    if (tcCloseBtn) {
        tcCloseBtn.onclick = (e) => { e.stopPropagation(); closeTrainingConsole(); };
    }

    // Combat mode toggle
    const tcToggle = document.getElementById('tc-combat-toggle');
    if (tcToggle) {
        tcToggle.onclick = () => {
            const dummy = _getDummy();
            if (!dummy) return;
            dummy.combatMode = !dummy.combatMode;
            if (!dummy.combatMode) {
                dummy.engaged = false;
            }
            _tcSyncUI();
        };
    }

    // Stamina drain toggle
    const tcStaminaToggle = document.getElementById('tc-stamina-toggle');
    if (tcStaminaToggle) {
        tcStaminaToggle.onclick = () => {
            const dummy = _getDummy();
            if (!dummy) return;
            dummy.drainStamina = !dummy.drainStamina;
            _tcSyncUI();
        };
    }

    // Stat +/- buttons
    document.querySelectorAll('#tc-body .tc-btn[data-stat]').forEach(btn => {
        btn.onclick = () => {
            const dummy = _getDummy();
            if (!dummy) return;
            const stat = btn.dataset.stat;
            const delta = parseFloat(btn.dataset.delta);
            if (stat === 'attackSpeed') {
                dummy.attackSpeed = Math.max(0.5, Math.round(((dummy.attackSpeed ?? 1) + delta) * 10) / 10);
            } else {
                if (!dummy.stats) dummy.stats = {};
                dummy.stats[stat] = Math.max(0, (dummy.stats[stat] ?? 0) + delta);
            }
            _tcSyncUI();
        };
    });

    // On-hit effect checkboxes & sliders
    for (const eid of ['poison', 'rot', 'frozen', 'stun']) {
        const cb = document.getElementById(`tc-eff-${eid}`);
        const range = document.getElementById(`tc-eff-${eid}-chance`);
        const valSpan = document.getElementById(`tc-eff-${eid}-val`);
        const update = () => {
            if (valSpan && range) valSpan.textContent = range.value + '%';
            const dummy = _getDummy();
            if (dummy) dummy.onHitEffects = _tcBuildEffectsArray();
        };
        if (cb) cb.onchange = update;
        if (range) range.oninput = update;
    }

    // Presets
    document.querySelectorAll('#tc-body .tc-preset[data-preset]').forEach(btn => {
        btn.onclick = () => {
            const dummy = _getDummy();
            if (!dummy) return;
            const p = _TC_PRESETS[btn.dataset.preset];
            if (!p) return;
            if (!dummy.stats) dummy.stats = {};
            dummy.stats.strength = p.strength;
            dummy.stats.dexterity = p.dexterity;
            dummy.attackSpeed = p.attackSpeed;
            dummy.onHitEffects = JSON.parse(JSON.stringify(p.effects));
            _tcSyncUI();
        };
    });

    // Reset button
    const tcResetBtn = document.getElementById('tc-reset');
    if (tcResetBtn) {
        tcResetBtn.onclick = () => {
            const dummy = _getDummy();
            if (!dummy) return;
            dummy.stats = { ...(dummy.originalStats ?? { strength: 0, dexterity: 0, vitality: 10, intelligence: 0, resilience: 10 }) };
            dummy.attackSpeed = dummy.originalAttackSpeed ?? 1;
            dummy.onHitEffects = [];
            dummy.combatMode = false;
            dummy.drainStamina = false;
            dummy.engaged = false;
            _tcSyncUI();
        };
    }

    // Escape key closes
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _trainingConsoleOpen) {
            e.stopPropagation();
            closeTrainingConsole();
        }
    });

}

export function addChest(scene, loader, col, row, rotY, offsetZ = 0, contents = [], modelPath = asset('/items/Meshy_AI_Treasure_Chest_0221184131_texture.glb'), interactive = true, offsetX = 0, title = 'Chest', scale = 0.3) {
    const isStarterStash = title === 'Stash';
    const persistenceKey = `${window.currentLevel},${col},${row}`;

    if (interactive) {
        if (isStarterStash && _persistedStarterStashItems !== null) {
            contents = [..._persistedStarterStashItems];
        } else if (_containerContentsPersistence.hasOwnProperty(persistenceKey)) {
            contents = _containerContentsPersistence[persistenceKey];
        }
    }
    loader.load(asset(modelPath), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(scale);
        model.position.set(col * CELL + offsetX, 0.0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (interactive) {
                    child.userData.isChest = true;
                    child.userData.gridRow = row;
                    child.userData.gridCol = col;
                    child.userData.contents = contents;
                    child.userData.persistenceKey = persistenceKey;
                    child.userData.title = title;
                    if (isStarterStash) child.userData.isStarterStash = true;
                    interactables.push(child);
                }

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

function addStatue(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0) {
    _statueGridCells.add(`${row},${col}`);
    loader.load(asset('/items/statue.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.45);
        model.position.set(col * CELL + offsetX, 0.0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isStatue = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                interactables.push(child);

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

export function addDecoration(scene, loader, col, row, rotY = 0, modelPath, scale = 0.5, blockCell = true, offsetX = 0, offsetZ = 0, offsetY = 0.5) {
    if (blockCell) _statueGridCells.add(`${row},${col}`);
    loader.load(asset(modelPath), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(scale);
        model.position.set(col * CELL + offsetX, offsetY, row * CELL + offsetZ);
        model.rotation.y = rotY;
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });
        scene.add(model);
    });
}

function addCrystalShrine(scene, loader, col, row, rotY, scale, offsetX, offsetZ, offsetY) {
    const modelPath = _state.crystalShrineState === 2
        ? asset('/items/crystal-shrine/crysta-temple-red-and-blue.glb')
        : _state.crystalShrineState === 1
            ? asset('/items/crystal-shrine/crysta-temple-red.glb')
            : asset('/items/crystal-shrine/crystal-temple-empty.glb');

    _crystalShrineScene = scene;
    _crystalShrineLoader = loader;
    _crystalShrineParams = { col, row, rotY, scale, offsetX, offsetZ, offsetY };

    loader.load(asset(modelPath), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(scale);
        model.position.set(col * CELL + offsetX, offsetY, row * CELL + offsetZ);
        model.rotation.y = rotY;
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isCrystalShrine = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
                interactables.push(child);
            }
        });
        scene.add(model);
        _crystalShrineMesh = model;
    });
}

function _swapCrystalShrine() {
    if (_crystalShrineMesh) {
        _crystalShrineMesh.traverse((child) => {
            const idx = interactables.indexOf(child);
            if (idx !== -1) interactables.splice(idx, 1);
        });
        if (_crystalShrineMesh.parent) _crystalShrineMesh.parent.remove(_crystalShrineMesh);
        _crystalShrineMesh = null;
    }
    const p = _crystalShrineParams;
    if (p) addCrystalShrine(_crystalShrineScene, _crystalShrineLoader, p.col, p.row, p.rotY, p.scale, p.offsetX, p.offsetZ, p.offsetY);
}

function _activateStarterPortal() {
    _state.starterPortalEnabled = true;
    if (_disabledPortalMesh) {
        _disabledPortalMesh.traverse((child) => {
            const idx = interactables.indexOf(child);
            if (idx !== -1) interactables.splice(idx, 1);
        });
        if (_disabledPortalMesh.parent) _disabledPortalMesh.parent.remove(_disabledPortalMesh);
        _disabledPortalMesh = null;
    }
    addPortal(objectsGroup, _gltfLoader, 13, 13, 2, 0, 0, 0.85); // Left -> Level 2
    // Reset shrine to empty so it can be reused for the level 3 portal
    _state.crystalShrineState = 0;
    _swapCrystalShrine();
    showMessage("The crystal shrine blazes with power — a portal has opened!");
}

function _activateLevel3Portal() {
    _state.level3PortalEnabled = true;
    if (_level3DisabledPortalMesh) {
        _level3DisabledPortalMesh.traverse((child) => {
            const idx = interactables.indexOf(child);
            if (idx !== -1) interactables.splice(idx, 1);
        });
        if (_level3DisabledPortalMesh.parent) _level3DisabledPortalMesh.parent.remove(_level3DisabledPortalMesh);
        _level3DisabledPortalMesh = null;
    }
    addPortal(objectsGroup, _gltfLoader, 12, 13, 3, 0, 0, 0.85, 21, 11, 0); // Middle -> Level 3
    // Reset shrine to empty
    _state.crystalShrineState = 0;
    _swapCrystalShrine();
    showMessage("The crystal shrine blazes with power — the portal to the Abyssal Crypts has opened!");
}

function _activateLevel4Portal() {
    _state.level4PortalEnabled = true;
    if (_level4DisabledPortalMesh) {
        _level4DisabledPortalMesh.traverse((child) => {
            const idx = interactables.indexOf(child);
            if (idx !== -1) interactables.splice(idx, 1);
        });
        if (_level4DisabledPortalMesh.parent) _level4DisabledPortalMesh.parent.remove(_level4DisabledPortalMesh);
        _level4DisabledPortalMesh = null;
    }
    addPortal(objectsGroup, _gltfLoader, 11, 13, 4, 0, 0, 0.85, 14, 10, 2); // Right -> Level 4
    // Reset shrine to empty
    _state.crystalShrineState = 0;
    _swapCrystalShrine();
    showMessage("The crystal shrine blazes with power — the portal to the Egg Chamber has opened!");
}

let _activeShrineLootObj = null;

function openShrineLootModal(shrineObj) {
    _activeShrineLootObj = shrineObj;
    _activeSentLabelId = null;
    _chestPartyMemberIdx = party.findIndex(m => !m.isEmpty);
    if (_chestPartyMemberIdx === -1) _chestPartyMemberIdx = 0;

    const overlay = document.getElementById('shrine-loot-overlay');
    if (!overlay) return;
    overlay.classList.remove('chest-hidden');

    const contents = shrineObj.userData.contents || [];
    const slot = document.querySelector('.shrine-loot-slot');
    if (slot) _bindChestSlots(equip, [slot], contents);
}

function addHeroDoor(scene, loader, col, row, rotY = Math.PI, targetLevel = 5) {
    loader.load(asset('/items/hero-door.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        model.position.set(col * CELL, 0.0, row * CELL + 0.95);
        model.rotation.y = rotY;
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isHeroDoor = true;
                child.userData.targetLevel = targetLevel;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                interactables.push(child);
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });
        scene.add(model);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  TRAP SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

/** Damage per party member by dungeon level. */
const TRAP_DAMAGE = {
    1: { min: 16, max: 28 },
    2: { min: 36, max: 56 },
    3: { min: 64, max: 90 },
};

/** Base chance to successfully disarm a trap (15%). */
const TRAP_DISARM_CHANCE = 0.15;

/** Freeze duration in ms after a trap fires. */
const TRAP_FREEZE_MS = 10000;

/**
 * Fires the trap at (row, col): deals level-scaled damage to the whole party,
 * freezes movement for TRAP_FREEZE_MS, plays the trap sound, and removes the
 * trap model from the scene.
 */
function _fireTrap(trapObj) {
    const row = trapObj.userData.gridRow;
    const col = trapObj.userData.gridCol;
    const key = `${row},${col}`;

    // Prevent double-triggering
    if (_trapDisarmedSet.has(key)) return;
    _trapDisarmedSet.add(key);

    playTrapSound();

    const level = window.currentLevel ?? 0;
    const dmgRange = TRAP_DAMAGE[level] ?? TRAP_DAMAGE[1];

    let damageMessage = 'The trap springs! ';
    let anyHit = false;
    party.forEach((m, i) => {
        if (m.isEmpty || m.isDead) return;
        const dmg = Math.floor(dmgRange.min + Math.random() * (dmgRange.max - dmgRange.min + 1));
        const before = m.hp;
        setHp(i, before - dmg);
        damageMessage += `${m.name} takes ${dmg} damage. `;
        anyHit = true;
    });
    if (anyHit) playPartyHitSound();

    showMessage(damageMessage.trim());

    // Apply 'trapped' status effect to all living party members + log each one
    party.forEach((m) => {
        if (m.isEmpty || m.isDead) return;
        applyStatusEffect(m.id, 'trapped');
        addLogEntry({
            type: 'status-effect',
            target: m.name,
            effectName: 'Trapped',
            attacker: 'a trap',
            effectColor: '#c07030',
            time: Date.now(),
        });
    });

    // Freeze movement for 5 seconds
    setPlayerFrozen(true);
    setTimeout(() => {
        setPlayerFrozen(false);
        showMessage('The party recovers and can move again.');
    }, TRAP_FREEZE_MS);

    // Remove trap model from scene
    const model = trapObj.userData.modelContainer;
    if (model) {
        objectsGroup.remove(model);
        model.traverse((child) => {
            const idx = interactables.indexOf(child);
            if (idx !== -1) interactables.splice(idx, 1);
        });
    }
}

/**
 * Called from main.js onMoved (arrival only) to check if the player stepped on a trap.
 */
export function checkTrapAtPosition(row, col) {
    for (const obj of interactables) {
        if (obj.userData.isDamageTrap &&
            obj.userData.gridRow === row &&
            obj.userData.gridCol === col) {
            _fireTrap(obj);
            return;
        }
    }
}

/**
 * Opens the trap disarm modal for an adjacent trap object.
 */
function openTrapDisarmModal(trapObj) {
    _activeTrapObj = trapObj;

    const overlay = document.getElementById('trap-disarm-overlay');
    if (!overlay) return;

    // Sum trapDisarmBonus from all living party members' equipped items
    const partyTrapBonus = party.reduce((total, m) => {
        if (m.isEmpty || m.isDead) return total;
        let bonus = 0;
        Object.values(m.equipment || {}).forEach(item => {
            if (item) bonus += getItemDef(item.name)?.trapDisarmBonus ?? 0;
        });
        return total + bonus;
    }, 0);
    const effectiveChance = Math.min(TRAP_DISARM_CHANCE + partyTrapBonus, 1);

    const chanceEl = document.getElementById('trap-disarm-chance');
    if (chanceEl) {
        if (partyTrapBonus > 0) {
            chanceEl.innerHTML = `<span style="color:#ffd700">${Math.round(effectiveChance * 100)}%</span> <span style="color:#aaa;font-size:0.85em">(${Math.round(TRAP_DISARM_CHANCE * 100)}% + ${Math.round(partyTrapBonus * 100)}% bonus)</span>`;
        } else {
            chanceEl.textContent = `${Math.round(effectiveChance * 100)}%`;
        }
    }

    const resultEl = document.getElementById('trap-disarm-result');
    if (resultEl) { resultEl.textContent = ''; resultEl.className = ''; }

    overlay.classList.remove('chest-hidden');

    // Wire up buttons (replace to avoid duplicate listeners)
    const attemptBtn = document.getElementById('trap-disarm-attempt');
    const leaveBtn = document.getElementById('trap-disarm-leave');

    const newAttempt = attemptBtn.cloneNode(true);
    const newLeave = leaveBtn.cloneNode(true);
    newAttempt.disabled = false;
    attemptBtn.replaceWith(newAttempt);
    leaveBtn.replaceWith(newLeave);

    const closeOverlay = () => {
        _activeTrapObj = null;
        overlay.classList.add('chest-hidden');
    };

    newAttempt.addEventListener('click', () => {
        if (!_activeTrapObj) return;
        const success = Math.random() < effectiveChance;
        const resultEl2 = document.getElementById('trap-disarm-result');

        if (success) {
            playSuccessSound();
            if (resultEl2) {
                resultEl2.textContent = 'Success! The trap has been disarmed.';
                resultEl2.className = 'trap-result-success';
            }
            // Mark disarmed and remove model
            const key = `${_activeTrapObj.userData.gridRow},${_activeTrapObj.userData.gridCol}`;
            _trapDisarmedSet.add(key);

            const model = _activeTrapObj.userData.modelContainer;
            if (model) {
                objectsGroup.remove(model);
                _activeTrapObj.userData.modelContainer.traverse((child) => {
                    const idx = interactables.indexOf(child);
                    if (idx !== -1) interactables.splice(idx, 1);
                });
            }
            _activeTrapObj = null;

            setTimeout(closeOverlay, 1500);
        } else {
            playSoundByUrl(asset('/sounds/actions/disarm-trap.mp3'));
            if (resultEl2) {
                resultEl2.textContent = 'Failed! The trap goes off!';
                resultEl2.className = 'trap-result-fail';
            }
            const trapToFire = _activeTrapObj;
            _activeTrapObj = null;
            setTimeout(() => {
                closeOverlay();
                _fireTrap(trapToFire);
            }, 1200);
        }
        // Disable attempt button after first try
        newAttempt.disabled = true;
    });

    newLeave.addEventListener('click', closeOverlay);

    const closeBtn = document.getElementById('trap-disarm-close');
    if (closeBtn) {
        const newClose = closeBtn.cloneNode(true);
        closeBtn.replaceWith(newClose);
        newClose.addEventListener('click', closeOverlay);
    }
}

function addTrap1(scene, loader, row, col, rotY = 0, scale = 0.6) {
    const key = `${row},${col}`;
    if (_trapDisarmedSet.has(key)) return; // already disarmed — don't spawn

    loader.load(asset('/items/trap1.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(scale);
        model.position.set(col * CELL, 0.0, row * CELL);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isDamageTrap = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.modelContainer = model;
                interactables.push(child);
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        objectsGroup.add(model);
    });
}

function addDroppedTorch(container, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0) {
    loader.load(asset('/items/torch.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.35);
        model.position.set(col * CELL + offsetX, 0.25, row * CELL + offsetZ);
        model.rotation.y = rotY;

        const light = new THREE.PointLight(0xffaa00, 2.5, 4);
        light.position.set(0, 0.4, 0);
        model.add(light);

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isDroppedItem = true;
                child.userData.itemName = 'Torch';
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.modelContainer = model;
                interactables.push(child);

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        container.add(model);
    });
}

function addStairs(scene, loader, col, row, rotY = 0, scale = 0.7, offsetX = 0, offsetZ = 0) {
    loader.load(asset('/items/stairs-up.glb'), (gltf) => {
        const model = gltf.scene;
        if (typeof scale === 'number') {
            model.scale.setScalar(scale);
        } else {
            model.scale.set(scale.x ?? 0.7, scale.y ?? 0.7, scale.z ?? 0.7);
        }
        model.position.set(col * CELL + offsetX, 0.0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}




export function spawnObjectsForLevel() {
    const level = window.currentLevel ?? 0;
    objects.length = 0; // clear logical array

    // Check if the minotaur (id 300) has been defeated — used to activate the egg portal
    const minotaur = monsters.find(m => m.id === 300);
    const minotaurDead = minotaur ? !minotaur.alive : false;

    // Build context object — passes all spawn helpers and current state flags to
    // per-level files so they stay completely decoupled from objects.js internals.
    const ctx = {
        group: objectsGroup,
        loader: _gltfLoader,
        // Spawn helpers
        addChest, addWeaponRack, addSpellCabinet, addShop,
        addCrystals, addBonePile, addDecoration, addCrystalShrine, addHeroDoor,
        addPortal, addDisabledPortal, addPortcullis, addKeyhole,
        addStatue, addPortalActivatorStatue, addPartyConfirmNPC, addDialogueNPC, addCustomNPC,
        addAnvil, addAlchemyWorkshop, addDroppedTorch, addEtherealEgg, addStairs,
        addTrap1, createWallButton, addArmourStand, addTrainingConsole, addPitLadder,
        // Level 1 state flags
        starterPortalEnabled: _state.starterPortalEnabled,
        starterGateOpened: _state.starterGateOpened,
        mummyGateOpened: _state.mummyGateOpened,
        mummyEscapeGateOpened: _state.mummyEscapeGateOpened,
        crystalShrineState: _state.crystalShrineState,
        level1HoleRoomSpawned: _state.level1HoleRoomSpawned,
        level1BtnPortcullisOpened: _state.level1BtnPortcullisOpened,
        level1OgrePortcullisOpened: _state.level1OgrePortcullisOpened,
        level1ShrineGateOpened: _state.level1ShrineGateOpened,
        monsterNpcSaved: _state.monsterNpcSaved,
        stanceNpcDeparted: _state.stanceNpcDeparted,
        setStanceNpcDeparted: (val) => { _state.stanceNpcDeparted = val; },
        // Level 2 state flags
        level2PortcullisOpened: _state.level2PortcullisOpened,
        level2GiantPortcullisOpened: _state.level2GiantPortcullisOpened,
        level2HoleClosed: _state.level2HoleClosed,
        // Level 3 state flags
        level3PortalEnabled: _state.level3PortalEnabled,
        // Level 4 state flags
        level4PortalEnabled: _state.level4PortalEnabled,
        minotaurDead,
        // State setters (values written back to objects.js module scope)
        setStarterGate: (g) => { _starterGate = g; },
        setLevel1HoleRoomSpawned: (val) => { _state.level1HoleRoomSpawned = val; },
        // Shared refs for custom object loading code in level files
        interactables,
    };

    if (level === 0) spawnLevel0Objects(ctx);
    else if (level === 1) spawnLevel1Objects(ctx);
    else if (level === 2) spawnLevel2Objects(ctx);
    else if (level === 3) spawnLevel3Objects(ctx);
    else if (level === 4) spawnLevel4Objects(ctx);
    else if (level === 5) spawnLevel5Objects(ctx);
    else if (level === 50) spawnSchematicTrialsObjects(ctx);
    else if (level === 99) {
        // Arena – place 4 torches evenly around the edge
        addDroppedTorch(objectsGroup, _gltfLoader, 1, 1, 0);
        addDroppedTorch(objectsGroup, _gltfLoader, 1, 7, 0);
        addDroppedTorch(objectsGroup, _gltfLoader, 7, 1, 0);
        addDroppedTorch(objectsGroup, _gltfLoader, 7, 7, 0);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  WALL BUTTON FACTORY
//  Single source of truth for every portcullis button in the dungeon.
//  To restyle all buttons at once, edit only this function.
//
//  protrusionDir  +1 = button face points east  (+X) or south (+Z)
//                 -1 = button face points west  (-X) or north (-Z)
//  userData       merged onto the interactive sphere (must include `target`)
//  axis           'x' (default, east/west wall) or 'z' (north/south wall)
// ─────────────────────────────────────────────────────────────────────────────
function createWallButton(protrusionDir, userData, axis = 'x') {
    const group = new THREE.Group();

    // ── Invisible interaction hitbox (available immediately for raycasting) ──
    const hitGeo = new THREE.SphereGeometry(0.10, 8, 6);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const btn = new THREE.Mesh(hitGeo, hitMat);
    if (axis === 'z') btn.position.z = protrusionDir * 0.04;
    else btn.position.x = protrusionDir * 0.04;
    btn.position.y = -0.2;
    btn.userData = {
        isButton: true, animAxis: axis, animDir: protrusionDir, ...userData,
        pressTarget: btn, glowMeshes: []
    };
    interactables.push(btn);
    group.add(btn);

    // ── Load GLB model asynchronously ──
    _gltfLoader.load(asset('/items/button.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.12);

        // Rotate model so the button face points in protrusionDir along the correct axis.
        // GLB default: assume button face points +Z.
        if (axis === 'z' && protrusionDir === +1) { /* default — faces south (+Z) */ }
        else if (axis === 'z' && protrusionDir === -1) model.rotation.y = Math.PI;
        else if (axis === 'x' && protrusionDir === +1) model.rotation.y = -Math.PI / 2;
        else if (axis === 'x' && protrusionDir === -1) model.rotation.y = Math.PI / 2;

        const glowMeshes = [];
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                glowMeshes.push(child);
            }
        });

        // Update hitbox userData with loaded glow meshes
        btn.userData.glowMeshes = glowMeshes;

        model.position.y = -0.2;
        group.add(model);
    });

    return { group, btn };
}

function addPortcullis(scene, loader, col, row, rotY = 0, startOpen = false) {
    const portcullis = {
        name: 'Portcullis',
        path: asset('/items/Meshy_AI_Iron_Portcullis_0221184348_texture.glb'),
        gridRow: row,
        gridCol: col,
        x: col * CELL,
        z: row * CELL,
        isOpen: startOpen
    };
    // Sync map cell with portcullis state
    if (startOpen) {
        if (dungeonMap[row]?.[col] === CELL_PORTCULLIS) {
            dungeonMap[row][col] = CELL_FLOOR;
        }
    } else {
        if (dungeonMap[row]?.[col] !== undefined) {
            dungeonMap[row][col] = CELL_PORTCULLIS;
        }
    }
    loader.load(portcullis.path, (gltf) => {
        const model = gltf.scene;
        model.scale.set(1.15, 0.9, 1.15);
        model.position.set(portcullis.x, startOpen ? 3.3 : 1.1, portcullis.z);
        model.rotation.y = rotY;
        scene.add(model);
        portcullis.mesh = model;
    });
    objects.push(portcullis);
    return portcullis;
}

function addKeyhole(scene, loader, col, row, rotY, offsetX = 0, offsetZ = 0, targetRow = null, targetCol = null, requiredKey = 'Bronze Key') {
    loader.load(asset('/items/keyhole.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.2); // half the previous size (0.4)
        model.position.set(col * CELL + offsetX, 0.95, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isKeyhole = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                // Which portcullis does it open? If not specified, open the one on its own cell
                child.userData.targetRow = targetRow !== null ? targetRow : row;
                child.userData.targetCol = targetCol !== null ? targetCol : col;
                child.userData.requiredKey = requiredKey;
                interactables.push(child);

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

export function spawnArenaPortal(row, col) {
    addPortal(objectsGroup, _gltfLoader, col, row, 0, 0, 0, 0, null, null, null, true);
}

export function addPortal(scene, loader, col, row, targetLevel, rotY = 0, offsetX = 0, offsetZ = 0, targetRow = null, targetCol = null, targetFacing = null, isArenaExit = false) {
    loader.load(asset('/items/Meshy_AI_Blue_Portal_0222102604_texture.glb'), (gltf) => {
        // Clone the scene so each portal instance has its own independent mesh
        // children and userData objects. Without this, the GLTF loader's internal
        // cache returns the same parsed scene for every call with the same URL,
        // meaning all portals share the same child meshes and the last
        // userData.targetLevel assignment overwrites all previous ones.
        const model = gltf.scene.clone();
        model.scale.setScalar(0.7);
        model.position.set(col * CELL + offsetX, 0.6, row * CELL + offsetZ);
        model.rotation.y = rotY;

        const light = new THREE.PointLight(0x0088ff, 4, 4);
        light.position.set(col * CELL + offsetX, 0.6, row * CELL + offsetZ);
        scene.add(light);

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = false;
                child.userData = {}; // Ensure a clean, isolated userData on the clone
                child.userData.isPortal = true;
                child.userData.targetLevel = targetLevel;
                child.userData.targetRow = targetRow;
                child.userData.targetCol = targetCol;
                child.userData.targetFacing = targetFacing;
                child.userData.isArenaExit = isArenaExit;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                interactables.push(child);

                console.log(`Antigravity: Portal spawned at col=${col} row=${row} -> Level ${targetLevel}`);

                // Ensure smooth texture filtering
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

function addDisabledPortal(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0, tag = 'default') {
    loader.load(asset('/items/disabled-portal.glb'), (gltf) => {
        const model = gltf.scene.clone(); // Clone to avoid shared userData with other disabled portals
        model.scale.setScalar(0.7);
        model.position.set(col * CELL + offsetX, 0.6, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = false;
                child.userData.isDisabledPortal = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                interactables.push(child);
            }
        });

        scene.add(model);
        if (tag === 'level3') {
            _level3DisabledPortalMesh = model;
        } else if (tag === 'level4') {
            _level4DisabledPortalMesh = model;
        } else {
            _disabledPortalMesh = model;
        }
    });
}

function _applyEggGlow(model, contents) {
    if (!model) return;
    const crystal = contents ? contents.find(c => c != null) : null;
    let emissiveColor = null;
    if (crystal === 'Red Crystal')       emissiveColor = new THREE.Color(1.0, 0.15, 0.05);
    else if (crystal === 'Blue Crystal') emissiveColor = new THREE.Color(0.05, 0.3, 1.0);

    model.traverse(child => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => {
            if (!('emissive' in m)) return;
            if (emissiveColor) {
                m.emissive.copy(emissiveColor);
                m.emissiveIntensity = 0.7;
            } else {
                m.emissive.set(0, 0, 0);
                m.emissiveIntensity = 0;
            }
        });
    });
}

function addPortalActivatorStatue(scene, loader, col, row, rotY = 0, scale = 0.45, initialContents = ['Red Crystal'], offsetX = 0, offsetZ = 0) {
    _statueGridCells.add(`${row},${col}`); // block player movement through this cell
    const persistenceKey = `${window.currentLevel},${col},${row}`;
    let contents = [...initialContents];
    if (_containerContentsPersistence[persistenceKey]) {
        contents = _containerContentsPersistence[persistenceKey];
    }
    loader.load(asset('/items/ethereal_egg.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(scale);
        model.position.set(col * CELL + offsetX, 0.02, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isPortalActivatorStatue = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = contents;
                child.userData.persistenceKey = persistenceKey;
                child.userData.eggModel = model;
                interactables.push(child);
            }
        });

        _applyEggGlow(model, contents);
        scene.add(model);
    });
}

function addShop(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0, shopType = 'weapons', modelPath = null, options = {}) {
    _shopGridCells.add(`${row},${col}`); // block player movement through this cell
    loader.load(asset(modelPath ?? '/npcs/merchant1/merchant-idle.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(options.scale ?? 0.5);
        model.position.set(col * CELL + offsetX, 0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        let mixer = null;
        let idleAction = null;
        let greetingAction = null;
        let audioIndex = 0;

        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            idleAction = mixer.clipAction(gltf.animations[0]);
            idleAction.play();
            _mixers.push(mixer);
        }

        if (options.greetingModel && mixer) {
            loader.load(asset(options.greetingModel), (greetGltf) => {
                if (greetGltf.animations && greetGltf.animations.length > 0) {
                    greetingAction = mixer.clipAction(greetGltf.animations[0]);
                    greetingAction.setLoop(THREE.LoopOnce, 1);
                    greetingAction.clampWhenFinished = true;
                    mixer.addEventListener('finished', (e) => {
                        if (e.action === greetingAction) {
                            greetingAction.stop();
                            if (idleAction) idleAction.reset().play();
                        }
                    });
                }
            });
        }

        let greetingPlayed = false;
        const greetingCallback = (options.greetingAudio?.length || options.greetingModel) ? () => {
            if (options.playOnce && greetingPlayed) return;
            greetingPlayed = true;

            if (options.greetingAudio?.length) {
                if (!isNpcDialoguePlaying(row, col)) {
                    playNpcDialogue(row, col, options.greetingAudio[audioIndex % options.greetingAudio.length]);
                    audioIndex++;
                }
            }
            if (mixer && idleAction && greetingAction) {
                idleAction.stop();
                greetingAction.reset().play();
            }
            if (typeof options.onGreeting === 'function') {
                try { options.onGreeting(); } catch (e) { console.warn('[shop] onGreeting failed:', e); }
            }
        } : null;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isShop = true;
                child.userData.shopType = shopType;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                if (options.questNpcId) child.userData.questNpcId = options.questNpcId;
                if (greetingCallback) child.userData.greetingCallback = greetingCallback;
                interactables.push(child);

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        const _mBlob = createBlobShadow(0.5);
        _mBlob.position.set(model.position.x, 0.05, model.position.z);
        scene.add(_mBlob);
        scene.add(model);
    });
}





function addWeaponRack(scene, loader, col, row, rotY, offsetX = 0, offsetZ = 0, contents = []) {
    const persistenceKey = `${window.currentLevel},${col},${row}`;
    if (_containerContentsPersistence[persistenceKey]) {
        contents = _containerContentsPersistence[persistenceKey];
    }
    loader.load(asset('/items/weapon-rack.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.46);
        model.position.set(col * CELL + offsetX, 0.02, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isWeaponRack = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = contents;
                child.userData.persistenceKey = persistenceKey;
                interactables.push(child);

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

function addSpellCabinet(scene, loader, col, row, rotY, offsetX = 0, offsetZ = 0, contents = []) {
    const persistenceKey = `${window.currentLevel},${col},${row}`;
    if (_containerContentsPersistence[persistenceKey]) {
        contents = _containerContentsPersistence[persistenceKey];
    }
    loader.load(asset('/items/spell-cabinet.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        model.position.set(col * CELL + offsetX, 0.0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isSpellCabinet = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = contents;
                child.userData.persistenceKey = persistenceKey;
                interactables.push(child);

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

function addCrystals(scene, loader, col, row, rotY, offsetX = 0) {
    _statueGridCells.add(`${row},${col}`);
    loader.load(asset('/items/Meshy_AI_Crystals_0221193313_texture.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        // Positioned at 0.0 to touch the floor
        model.position.set(col * CELL + offsetX, 0.0, row * CELL);
        model.rotation.y = rotY;

        // Add a mystical light source at the crystals
        const light = new THREE.PointLight(0x00ffff, 5, 3);
        light.position.set(col * CELL + offsetX, 0.3, row * CELL);
        scene.add(light);

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isCrystal = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.light = light; // Store light reference for animation
                interactables.push(child);

                if (child.material) {
                    // Give them a nice cyan mystical glow
                    child.material.emissive = new THREE.Color(0x00ffff);
                    child.material.emissiveIntensity = 0.5;

                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

function addEtherealEgg(scene, loader, col, row, rotY = 0, isActive = false, targetLevel = 4, targetRow = null, targetCol = null, decorative = false, targetFacing = null) {
    _statueGridCells.add(`${row},${col}`);
    loader.load(asset('/items/ethereal_egg.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.5);
        // Put it on the floor
        model.position.set(col * CELL, 0.0, row * CELL);
        model.rotation.y = rotY;

        // Active eggs glow gold (portal to next level); inactive glow purple (restore)
        const lightColor = isActive ? 0xffaa00 : 0xff00ff;
        const pulseMax = isActive ? 12 : 8;
        const emissiveColor = isActive ? 0xaa6600 : 0xaa00aa;

        const light = new THREE.PointLight(lightColor, 4, 3);
        light.position.set(col * CELL, 0.3, row * CELL);
        scene.add(light);

        // Pulsing light effect
        new Tween({ i: 4 })
            .to({ i: pulseMax }, 1500)
            .easing(Easing.Quadratic.InOut)
            .yoyo(true)
            .repeat(Infinity)
            .onUpdate((o) => { light.intensity = o.i; })
            .start();

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    child.material.emissive = new THREE.Color(emissiveColor);
                    child.material.emissiveIntensity = 0.3;
                }
                // Always register for raycasting so hover cursor works regardless of
                // when the minotaur dies — activation is checked at click time.
                child.userData.isEgg = true;
                child.userData.isActive = isActive;
                child.userData.decorative = decorative;
                child.userData.targetLevel = targetLevel;
                child.userData.targetFacing = targetFacing;
                child.userData.targetRow = targetRow;
                child.userData.targetCol = targetCol;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                interactables.push(child);
            }
        });

        scene.add(model);
    });
}

function addAlchemyWorkshop(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0, interactive = true) {
    loader.load(asset('/items/Alchemy_Workshop.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        model.position.set(col * CELL + offsetX, 0.0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (interactive) {
                    child.userData.isAlchemyWorkshop = true;
                    child.userData.gridRow = row;
                    child.userData.gridCol = col;
                    interactables.push(child);
                }

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            mixer.clipAction(gltf.animations[0]).play();
            _mixers.push(mixer);
        }

        scene.add(model);

        // Add a subtle alchemical glow
        const light = new THREE.PointLight(0x44ff44, 3, 4);
        light.position.set(col * CELL + offsetX, 1.2, row * CELL + offsetZ);
        scene.add(light);
    });
}

// ── Training Console (dev tool) ────────────────────────────────────────────
// Places a clickable pedestal near the Training Dummy. Opens a stat editor.
let _trainingConsoleOpen = false;

const _TC_PRESETS = {
    weak: { strength: 8, dexterity: 5, attackSpeed: 0.8, effects: [] },
    medium: { strength: 20, dexterity: 15, attackSpeed: 1.2, effects: [{ effectId: 'poison', chance: 0.2 }] },
    strong: { strength: 35, dexterity: 25, attackSpeed: 2.0, effects: [{ effectId: 'poison', chance: 0.4 }, { effectId: 'rot', chance: 0.2 }] },
    boss: { strength: 45, dexterity: 30, attackSpeed: 2.5, effects: [{ effectId: 'poison', chance: 0.5 }, { effectId: 'frozen', chance: 0.15 }, { effectId: 'stun', chance: 0.1 }] },
};

function addTrainingConsole(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0) {
    loader.load(asset('/items/dummy-controller.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.5);
        model.position.set(col * CELL + offsetX, 0.0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isTrainingConsole = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                interactables.push(child);
            }
        });

        scene.add(model);

        const light = new THREE.PointLight(0xe94560, 2, 3);
        light.position.set(col * CELL + offsetX, 1.2, row * CELL + offsetZ);
        scene.add(light);
    });
}

function _getDummy() {
    return monsters.find(m => m.name === 'Training Dummy' && m.alive);
}

function _tcUpdatePreview() {
    const dummy = _getDummy();
    if (!dummy) return;
    const str = dummy.stats?.strength ?? 0;
    const dex = dummy.stats?.dexterity ?? 0;
    // Est. damage vs 0 defence: raw = STR + 4, min 1
    const estDmg = Math.max(1, str + 4);
    document.getElementById('tc-est-dmg').textContent = estDmg;
    // Hit chance vs 10 DEX target
    const hitPct = Math.min(0.97, Math.max(0.15, 0.45 + (dex - 10) * 0.015));
    document.getElementById('tc-est-hit').textContent = Math.round(hitPct * 100) + '%';
}

function _tcSyncUI() {
    const dummy = _getDummy();
    if (!dummy) return;
    document.getElementById('tc-strength').textContent = dummy.stats?.strength ?? 0;
    document.getElementById('tc-dexterity').textContent = dummy.stats?.dexterity ?? 0;
    document.getElementById('tc-attackSpeed').textContent = dummy.attackSpeed ?? 1;

    const toggle = document.getElementById('tc-combat-toggle');
    toggle.textContent = dummy.combatMode ? 'ON' : 'OFF';
    toggle.classList.toggle('active', !!dummy.combatMode);

    const drainToggle = document.getElementById('tc-stamina-toggle');
    if (drainToggle) {
        drainToggle.textContent = dummy.drainStamina ? 'ON' : 'OFF';
        drainToggle.classList.toggle('active', !!dummy.drainStamina);
    }

    // Keep window flag in sync for party.js SP regen (avoids circular import)
    window._dummyCombatDrain = !!(dummy.combatMode && dummy.drainStamina);

    // Sync on-hit effect checkboxes
    const effects = dummy.onHitEffects ?? [];
    for (const eid of ['poison', 'rot', 'frozen', 'stun']) {
        const eff = effects.find(e => e.effectId === eid);
        const cb = document.getElementById(`tc-eff-${eid}`);
        const range = document.getElementById(`tc-eff-${eid}-chance`);
        const valSpan = document.getElementById(`tc-eff-${eid}-val`);
        if (cb) cb.checked = !!eff;
        if (range && eff) range.value = Math.round(eff.chance * 100);
        if (valSpan) valSpan.textContent = (eff ? Math.round(eff.chance * 100) : range ? range.value : 30) + '%';
    }
    _tcUpdatePreview();
}

function _tcBuildEffectsArray() {
    const effects = [];
    for (const eid of ['poison', 'rot', 'frozen', 'stun']) {
        const cb = document.getElementById(`tc-eff-${eid}`);
        const range = document.getElementById(`tc-eff-${eid}-chance`);
        if (cb && cb.checked) {
            effects.push({ effectId: eid, chance: (parseInt(range.value, 10) || 30) / 100 });
        }
    }
    return effects;
}

function openTrainingConsole() {
    const dummy = _getDummy();
    if (!dummy) { showMessage('No Training Dummy found.'); return; }
    _trainingConsoleOpen = true;
    const overlay = document.getElementById('training-console-overlay');
    overlay.classList.remove('tc-hidden');
    _tcSyncUI();
}

function closeTrainingConsole() {
    _trainingConsoleOpen = false;
    document.getElementById('training-console-overlay').classList.add('tc-hidden');
}

export function isTrainingConsoleOpen() { return _trainingConsoleOpen; }

/** Returns true when the dummy is in combat mode AND stamina drain is enabled.
 *  Also exposed as window._dummyCombatDrain to avoid circular imports in party.js. */
export function isDummyCombatActive() {
    const dummy = _getDummy();
    return !!(dummy && dummy.combatMode && dummy.drainStamina);
}

function addAnvil(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0, contents = []) {
    const persistenceKey = `${window.currentLevel},${col},${row}`;
    if (_containerContentsPersistence[persistenceKey]) {
        contents = _containerContentsPersistence[persistenceKey];
    }
    loader.load(asset('/items/forge.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        model.position.set(col * CELL + offsetX, 0.0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isAnvil = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = contents;
                child.userData.persistenceKey = persistenceKey;
                interactables.push(child);

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

function addJester(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0) {
    const path = asset('/npcs/otter/Meshy_AI_Animation_Idle_withSkin.glb');
    loader.load(path, (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        model.position.set(col * CELL + offsetX, 0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isJester = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                interactables.push(child);
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            const idleAction = mixer.clipAction(gltf.animations[0]);
            idleAction.setLoop(THREE.LoopRepeat);
            idleAction.play();

            model.userData.mixer = mixer;
            model.userData.idleAction = idleAction;
            _mixers.push(mixer);

            // Preload talking animation on the same mixer
            loader.load(asset('/npcs/otter/talking.glb'), (talkGltf) => {
                if (talkGltf.animations && talkGltf.animations.length > 0) {
                    const talkAction = mixer.clipAction(talkGltf.animations[0]);
                    talkAction.setLoop(THREE.LoopRepeat);
                    model.userData.talkAction = talkAction;
                }
            });
        }

        const _jBlob = createBlobShadow(0.5);
        _jBlob.position.set(model.position.x, 0.05, model.position.z);
        scene.add(_jBlob);
        scene.add(model);
    });
}

function addPartyConfirmNPC(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0) {
    const path = asset('/npcs/otter/Meshy_AI_Animation_Idle_withSkin.glb');
    loader.load(path, (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.55);
        model.position.set(col * CELL + offsetX, 0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isPartyConfirmNPC = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                interactables.push(child);
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            _npcMixer = mixer;
            const idleAction = mixer.clipAction(gltf.animations[0]);
            idleAction.setLoop(THREE.LoopRepeat);
            idleAction.play();
            _npcIdleAction = idleAction;
            _mixers.push(mixer);

            // Preload talking animation from separate GLB, registered on the same mixer
            loader.load(asset('/npcs/otter/talking.glb'), (talkGltf) => {
                if (talkGltf.animations && talkGltf.animations.length > 0) {
                    const talkAction = mixer.clipAction(talkGltf.animations[0]);
                    talkAction.setLoop(THREE.LoopRepeat);
                    _npcTalkAction = talkAction;
                }
            });
        }

        model.name = 'PartyConfirmNPCModel';
        _partyConfirmNPCModel = model;
        const _pcBlob = createBlobShadow(0.5);
        _pcBlob.position.set(model.position.x, 0.05, model.position.z);
        scene.add(_pcBlob);
        scene.add(model);
    });
}

function addCustomNPC(scene, loader, col, row, glbPath, dialogue, scale = 0.55, rotY = 0, offsetX = 0, offsetZ = 0, proximityAudio = null, proximityRange = 2) {
    loader.load(asset(glbPath), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(scale);
        model.position.set(col * CELL + offsetX, 0, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isDialogueNPC = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.dialogue = dialogue;
                child.userData.proximityAudio = proximityAudio;
                child.userData.proximityRange = proximityRange;
                child.userData.clickAudio = arguments[12]; // Support for clickAudio in 13th arg
                child.userData.fallbackClickAudio = arguments[14]; // Support for fallbackClickAudio in 15th arg
                child.userData.onAudioEnd = arguments[15]; // optional one-shot callback after click audio ends
                interactables.push(child);
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            const idleAction = mixer.clipAction(gltf.animations[0]);
            idleAction.setLoop(THREE.LoopRepeat).play();
            model.userData.mixer = mixer;
            model.userData.idleAction = idleAction;
            _mixers.push(mixer);

            const talkAnimPath = arguments[13];
            if (talkAnimPath) {
                loader.load(asset(talkAnimPath), (talkGltf) => {
                    if (talkGltf.animations && talkGltf.animations.length > 0) {
                        const talkAction = mixer.clipAction(talkGltf.animations[0]);
                        talkAction.setLoop(THREE.LoopRepeat);
                        model.userData.talkAction = talkAction;
                    }
                });
            }
        }

        if (proximityAudio) {
            _proximityAudios.push({
                row: row,
                col: col,
                audioUrl: asset(proximityAudio),
                range: proximityRange,
                lastPlayTime: 0,
                isPlaying: false
            });
        }

        const _cnBlob = createBlobShadow(0.5);
        _cnBlob.position.set(model.position.x, 0.05, model.position.z);
        scene.add(_cnBlob);
        scene.add(model);

        const onModelLoaded = arguments[16];
        if (typeof onModelLoaded === 'function') onModelLoaded(model);
    });
}

function addDialogueNPC(scene, loader, col, row, dialogue, rotY = 0, offsetX = 0, offsetZ = 0) {
    addCustomNPC(scene, loader, col, row, '/npcs/otter/Meshy_AI_Animation_Idle_withSkin.glb', dialogue, 0.55, rotY, offsetX, offsetZ);
}


export function openPortcullis(p, skipEverything = false) {
    if (p.isOpen) return;
    p.isOpen = true;
    if (!skipEverything) {
        showMessage("The portcullis slowly grinds open...");
        playGateOpeningSound();
    }

    // Animate mesh up
    new Tween(p.mesh.position, tweenGroup)
        .to({ y: 3.3 }, 2500)
        .easing(Easing.Quadratic.InOut)
        .onComplete(() => {
            // Update map passability
            dungeonMap[p.gridRow][p.gridCol] = CELL_FLOOR;
        })
        .start();
}

export function closePortcullis(p, skipEverything = false) {
    if (!p.isOpen) return;
    p.isOpen = false;
    if (!skipEverything) {
        showMessage("A portcullis slams shut!");
        playGateOpeningSound();
    }

    // Update map passability immediately to block movement
    dungeonMap[p.gridRow][p.gridCol] = 4; // CELL_PORTCULLIS

    // Animate mesh down
    new Tween(p.mesh.position, tweenGroup)
        .to({ y: 1.1 }, 1000)
        .easing(Easing.Quadratic.In)
        .start();
}

function _renderChestPartyInv() {
    const tabsEl = document.getElementById('chest-party-tabs');
    const gridEl = document.getElementById('chest-party-inv-grid');
    if (!tabsEl || !gridEl) return;

    // ── Tabs ──
    tabsEl.innerHTML = '';
    party.forEach((m, i) => {
        if (m.isEmpty) return;
        const btn = document.createElement('button');
        btn.className = 'chest-party-tab' + (i === _chestPartyMemberIdx ? ' active' : '');
        btn.title = m.name;
        const canvas = document.createElement('canvas');
        canvas.width = 30;
        canvas.height = 30;
        drawPortrait(canvas, m);
        btn.appendChild(canvas);
        btn.addEventListener('click', () => {
            _chestPartyMemberIdx = i;
            _renderChestPartyInv();
        });
        tabsEl.appendChild(btn);
    });

    // ── Inventory grid ──
    gridEl.innerHTML = '';
    const m = party[_chestPartyMemberIdx];
    if (!m || m.isEmpty) return;

    m.inventory.forEach((item, invIdx) => {
        const slot = document.createElement('div');
        slot.className = 'chest-inv-slot' + (item ? ' occupied' : '');
        if (item) {
            const def = getItemDef(item.name);
            if (def) {
                // Render icon and count badge using shared logic
                equip.renderItemIcon(item, slot);

                // Left-click → deposit into chest
                slot.addEventListener('click', () => {
                    if (!_activeChestContents || !_activeChestSlots) return;

                    // Scan all currently available chest slots for a hole
                    let freeIdx = -1;
                    for (let ci = 0; ci < _activeChestSlots.length; ci++) {
                        if (_activeChestContents[ci] == null) {
                            freeIdx = ci;
                            break;
                        }
                    }

                    // If no empty slot found among existing ones, grow the chest
                    if (freeIdx === -1) {
                        freeIdx = _activeChestContents.length;
                        
                        // Dynamically add a new slot to the DOM to match
                        const grid = document.getElementById('chest-grid');
                        if (grid) {
                            const newSlot = document.createElement('div');
                            newSlot.className = 'chest-slot';
                            newSlot.dataset.index = freeIdx;
                            grid.appendChild(newSlot);
                            // Refresh our reference to the slots
                            _activeChestSlots = grid.querySelectorAll('.chest-slot');
                        }
                    }

                    // Transfer item(s). HQ items are stored as { name, hq: true }
                    // so the flag survives the chest round-trip; stacks keep their
                    // quantity shape. HQ never stacks so the two branches don't overlap.
                    const currentCount = item.count ?? 1;
                    if (currentCount > 1) {
                        _activeChestContents[freeIdx] = { name: item.name, quantity: currentCount };
                        m.inventory[invIdx] = null;
                    } else if (item.hq) {
                        _activeChestContents[freeIdx] = { name: item.name, hq: true };
                        m.inventory[invIdx] = null;
                    } else {
                        _activeChestContents[freeIdx] = item.name;
                        m.inventory[invIdx] = null;
                    }

                    equip.updateEffectiveStats(m);
                    refreshPartyCards();
                    _bindChestSlots(equip, _activeChestSlots, _activeChestContents);
                    _renderChestPartyInv();

                    // Save state immediately if it's a persistent container
                    if (_activeShrineLootObj?.userData.persistenceKey) {
                        _containerContentsPersistence[_activeShrineLootObj.userData.persistenceKey] = _activeChestContents;
                    }
                });

                equip.attachTooltipListeners(slot, () => ({ 
                    name: item.name,
                    quantity: item.count || null 
                }));
            }
        }
        gridEl.appendChild(slot);
    });

    const targetSlots = _activeChestSlots ? _activeChestSlots.length : m.inventory.length;
    for (let i = m.inventory.length; i < targetSlots; i++) {
        const slot = document.createElement('div');
        slot.className = 'chest-inv-slot';
        gridEl.appendChild(slot);
    }
}

function _renderArmorStandPartyInv() {
    const tabsEl = document.getElementById('armor-stand-party-tabs');
    const gridEl = document.getElementById('armor-stand-party-inv-grid');
    if (!tabsEl || !gridEl) return;

    // ── Tabs ──
    tabsEl.innerHTML = '';
    party.forEach((m, i) => {
        if (m.isEmpty) return;
        const btn = document.createElement('button');
        btn.className = 'armor-stand-party-tab' + (i === _armorStandPartyMemberIdx ? ' active' : '');
        btn.title = m.name;
        const canvas = document.createElement('canvas');
        canvas.width = 30;
        canvas.height = 30;
        drawPortrait(canvas, m);
        btn.appendChild(canvas);
        btn.addEventListener('click', () => {
            _armorStandPartyMemberIdx = i;
            _renderArmorStandPartyInv();
        });
        tabsEl.appendChild(btn);
    });

    // ── Inventory grid ──
    gridEl.innerHTML = '';
    const m = party[_armorStandPartyMemberIdx];
    if (!m || m.isEmpty) return;

    m.inventory.forEach((item, invIdx) => {
        const slot = document.createElement('div');
        slot.className = 'armor-stand-inv-slot' + (item ? ' occupied' : '');
        if (item) {
            const def = getItemDef(item.name);
            if (def) {
                const img = document.createElement('img');
                img.src = asset(def.icon);
                slot.appendChild(img);

                // Left-click → place on armor stand if slot is available
                slot.addEventListener('click', () => {
                    if (!_activeArmorStandObj) return;
                    const slotType = def.slot;
                    if (!slotType) {
                        showMessage(`${def.name} cannot be equipped on an armor stand.`);
                        return;
                    }
                    // Check if that slot is already occupied
                    const contents = _activeArmorStandObj.userData.contents;
                    if (contents[slotType]) {
                        showMessage(`The ${slotType} slot is already occupied.`);
                        return;
                    }
                    contents[slotType] = item.name;
                    m.inventory[invIdx] = null;
                    equip.updateEffectiveStats(m);
                    refreshPartyCards();
                    _bindArmorStandSlots(equip, contents);
                    _renderArmorStandPartyInv();

                    // Save state immediately
                    if (_activeShrineLootObj?.userData.persistenceKey) {
                        _containerContentsPersistence[_activeShrineLootObj.userData.persistenceKey] = contents;
                    }
                });

                equip.attachTooltipListeners(slot, () => ({ name: item.name }));
            }
        }
        gridEl.appendChild(slot);
    });
}

export function openChestModal(chestObj) {
    _activeShrineLootObj = chestObj;
    playChestOpenSound();
    _activeSentLabelId = 'chest-sent-label';
    const overlay = document.getElementById('chest-overlay');
    overlay.classList.remove('chest-hidden');
    document.getElementById('chest-sent-label').textContent = '';
    document.getElementById('chest-title').textContent = chestObj.userData.title || 'Chest';

    document.getElementById('chest-body').scrollTop = 0;

    // Default to first non-empty party member
    _chestPartyMemberIdx = party.findIndex(m => !m.isEmpty);
    if (_chestPartyMemberIdx === -1) _chestPartyMemberIdx = 0;

    const m = party[_chestPartyMemberIdx];
    const partyInvLen = (m && !m.isEmpty && m.inventory) ? m.inventory.length : 40;

    const grid = document.getElementById('chest-grid');
    const contents = chestObj.userData.contents || [];
    const targetSlots = Math.max(partyInvLen, contents.length);
    
    let slots = grid.querySelectorAll('.chest-slot');
    // Dynamically adjust slots to match targetSlots exactly
    if (slots.length < targetSlots) {
        for (let i = slots.length; i < targetSlots; i++) {
            const newSlot = document.createElement('div');
            newSlot.className = 'chest-slot';
            newSlot.dataset.index = i;
            grid.appendChild(newSlot);
        }
    } else if (slots.length > targetSlots) {
        for (let i = slots.length - 1; i >= targetSlots; i--) {
            grid.removeChild(slots[i]);
        }
    }
    slots = grid.querySelectorAll('.chest-slot');

    _activeChestContents = contents;
    _activeChestSlots = slots;

    const sortBtn = document.getElementById('chest-sort-btn');
    if (sortBtn) {
        sortBtn.onclick = (e) => {
            e.stopPropagation();
            _sortChest(chestObj);
        };
    }

    {
        _bindChestSlots(equip, slots, contents);
    }
    _renderChestPartyInv();
}

function _sortChest(chestObj) {
    playInventorySortSound();
    let contents = chestObj.userData.contents || [];
    console.log("[sortChest] start contents:", JSON.stringify(contents));

    // Filter out null/empty entries, sort them, then repack
    const items = contents.filter(item => {
        if (!item) return false;
        if (typeof item === 'string') return true;
        if (typeof item === 'object' && item.name) return true;
        return false;
    });

    console.log("[sortChest] filtered items:", JSON.stringify(items));

    items.sort((a, b) => {
        const nameA = typeof a === 'string' ? a : a.name;
        const nameB = typeof b === 'string' ? b : b.name;
        const pa = equip._getItemSortPriority({ name: nameA });
        const pb = equip._getItemSortPriority({ name: nameB });
        if (pa !== pb) return pa - pb;
        return nameA.localeCompare(nameB);
    });

    console.log("[sortChest] sorted items:", JSON.stringify(items));

    // Replace contents with sorted items
    for (let i = 0; i < contents.length; i++) {
        contents[i] = items[i] ?? null;
    }

    // Since contents was modified in place (it's the same array reference), 
    // we just need to re-bind the slots to the DOM.
    const grid = document.getElementById('chest-grid');
    const slots = grid.querySelectorAll('.chest-slot');
    _bindChestSlots(equip, slots, contents);
}


export function openWeaponRackModal(rackObj) {
    _activeShrineLootObj = rackObj;
    playWeaponRackSound();
    _activeSentLabelId = 'weapon-rack-sent-label';
    const overlay = document.getElementById('weapon-rack-overlay');
    overlay.classList.remove('chest-hidden');
    document.getElementById('weapon-rack-sent-label').textContent = '';

    const slots = document.querySelectorAll('.weapon-rack-slot');
    const contents = rackObj.userData.contents || [];

    {
        _bindChestSlots(equip, slots, contents);
    }
}

export function openSpellCabinetModal(cabinetObj) {
    _activeShrineLootObj = cabinetObj;
    playSpellCabinetSound();
    _activeSentLabelId = 'cabinet-sent-label';
    const overlay = document.getElementById('cabinet-overlay');
    overlay.classList.remove('chest-hidden');
    document.getElementById('cabinet-sent-label').textContent = '';

    const slots = document.querySelectorAll('.cabinet-slot');
    const contents = cabinetObj.userData.contents || [];

    {
        _bindChestSlots(equip, slots, contents);
    }
}

export function openArmorStandModal(armorStandObj) {
    playItemSound('armor-stand');
    _activeSentLabelId = 'armor-stand-sent-label';
    const overlay = document.getElementById('armor-stand-overlay');
    overlay.classList.remove('chest-hidden');
    document.getElementById('armor-stand-sent-label').textContent = '';
    document.getElementById('armor-stand-title').textContent = armorStandObj.userData.title || 'Armor Stand';

    _activeArmorStandObj = armorStandObj;
    const contents = armorStandObj.userData.contents || {};

    // Default to first non-empty party member
    _armorStandPartyMemberIdx = party.findIndex(m => !m.isEmpty);
    if (_armorStandPartyMemberIdx === -1) _armorStandPartyMemberIdx = 0;

    {
        _bindArmorStandSlots(equip, contents);
    }
    _renderArmorStandPartyInv();
}

export function addArmorStand(scene, loader, col, row, rotY, modelPath = asset('/items/armour-stand1.glb'), scale = 0.4, offsetX = 0, offsetZ = 0, contents = {}, title = 'Armor Stand', offsetY = 0) {
    const persistenceKey = `${window.currentLevel},${col},${row}`;
    if (_containerContentsPersistence[persistenceKey]) {
        contents = _containerContentsPersistence[persistenceKey];
    }
    loader.load(asset(modelPath), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(scale);
        model.position.set(col * CELL + offsetX, 0.3 + offsetY, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isArmorStand = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = contents;
                child.userData.persistenceKey = persistenceKey;
                child.userData.title = title;
                interactables.push(child);

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

// British spelling alias for compatibility with level files
export const addArmourStand = addArmorStand;

export function openAnvilModal() {
    _forgeModalOpen = true;
    playAnvilSound();
    _clearForgeMessage();
    const overlay = document.getElementById('anvil-overlay');
    overlay.classList.remove('chest-hidden');
    _renderForgeSlots();
    _renderKnownForgeRecipes();
}

// ── Forge message bar ──────────────────────────────────────────────────────────
let _forgeMsgTimer = null;

function showForgeMessage(text, type = 'info') {
    const bar = document.getElementById('anvil-message-bar');
    const span = document.getElementById('anvil-message-text');
    if (!bar || !span) return;

    if (_forgeMsgTimer) { clearTimeout(_forgeMsgTimer); _forgeMsgTimer = null; }

    span.textContent = text;
    bar.className = `anvil-msg-visible anvil-msg-${type}`;

    _forgeMsgTimer = setTimeout(() => {
        bar.className = '';
        _forgeMsgTimer = null;
    }, 4000);
}

function _clearForgeMessage() {
    if (_forgeMsgTimer) { clearTimeout(_forgeMsgTimer); _forgeMsgTimer = null; }
    const bar = document.getElementById('anvil-message-bar');
    if (bar) bar.className = '';
}

// ── Forge recipes from forge.json ─────────────────────────────────────────────
function _getForgeRecipes() {
    return FORGE_DATA.filter(r => Array.isArray(r.ingredients) && r.ingredients.length > 0);
}

function _forge() {
    if (_forgeContents[8] !== null) {
        showForgeMessage('Take the item from the result slot before forging again.', 'info');
        return;
    }

    const materials = _forgeContents.slice(0, 8).filter(Boolean);

    if (materials.length === 0) {
        showForgeMessage('Add materials before forging.', 'info');
        return;
    }

    playSoundByUrl(asset('/sounds/forge-fire.mp3'));
    const _forgeImgs = [
        document.getElementById('anvil-header-icon'),
        document.querySelector('.workbench-deco-forge .workbench-deco-img'),
    ].filter(Boolean);
    const _forgeFlame = asset('/icons/forge-flame.webp');
    _forgeImgs.forEach(img => { img._origSrc = img.src; img.src = _forgeFlame; });
    setTimeout(() => _forgeImgs.forEach(img => { img.src = img._origSrc; }), 500);
    const recipes = _getForgeRecipes();

    let matchedResult = null;
    for (const recipe of recipes) {
        const pool = [...materials];
        let matched = true;
        for (const needed of recipe.ingredients) {
            let remaining = needed.quantity;
            while (remaining > 0) {
                const idx = pool.indexOf(needed.name);
                if (idx === -1) { matched = false; break; }
                pool.splice(idx, 1);
                remaining--;
            }
            if (!matched) break;
        }
        if (matched && pool.length === 0) {
            matchedResult = recipe.name;
            break;
        }
    }

    if (matchedResult) {
        const outcome = rollCraftOutcome('forge');
        const usedMaterials = [...materials];

        if (outcome === 'fail') {
            for (let i = 0; i < 8; i++) {
                if (_forgeContents[i] && isEssenceIngredient(_forgeContents[i])) {
                    _forgeContents[i] = null;
                }
            }
            addLogEntry({ type: 'item', subtype: 'forge-fail', materials: usedMaterials, time: Date.now() });
            setTimeout(() => {
                showForgeMessage('The forge sputters — the essences are ruined.', 'fail');
                playCraftFailSound();
                _renderForgeSlots();
            }, 500);
        } else {
            const isHQ = outcome === 'hq';
            for (let i = 0; i < 8; i++) _forgeContents[i] = null;
            const isNew = !_knownForgeRecipes.has(matchedResult);
            _knownForgeRecipes.delete(matchedResult);
            _knownForgeRecipes.add(matchedResult);
            addLogEntry({ type: 'item', subtype: 'forge', itemName: matchedResult, hq: isHQ, materials: usedMaterials, time: Date.now() });
            _renderKnownForgeRecipes();
            setTimeout(() => {
                _forgeContents[8] = { name: matchedResult, hq: isHQ };
                const displayName = isHQ ? hqDisplayName(matchedResult) : matchedResult;
                const msg = isHQ
                    ? `Forging complete! You crafted an ${displayName}!`
                    : (isNew
                        ? `Forging complete! You discovered the recipe for ${matchedResult}!`
                        : `Forging complete! You crafted a ${matchedResult}.`);
                showForgeMessage(msg, 'success');
                if (isHQ) playCraftHqSound();
                else playSuccessSound();
                _renderForgeSlots();
            }, 500);
        }
    } else {
        setTimeout(() => {
            showForgeMessage('These materials cannot be forged into anything.', 'fail');
            playAnvilSound();
        }, 500);
    }

    _renderForgeSlots();
}

function _renderForgeSlots() {
    const slots = document.querySelectorAll('.anvil-slot');
    slots.forEach((slot, i) => {
        slot.innerHTML = '';
        slot.classList.remove('occupied');
        slot.onclick = null;
        slot.oncontextmenu = null;

        const entry = _forgeContents[i];
        if (!entry) {
            if (i < 8) {
                slot.onclick = (e) => _showForgeItemPicker(e.clientX, e.clientY, i);
                equip.attachTooltipListeners(slot, () => ({ name: "Empty Material Slot", description: "Click to select a material from your party's inventory." }));
            }
            return;
        }

        const itemName = typeof entry === 'string' ? entry : entry.name;
        const isHQ = typeof entry === 'object' && !!entry.hq;
        const itemDef = getItemDef(itemName);
        if (!itemDef) return;

        slot.classList.add('occupied');
        equip.renderItemIcon({ name: itemName, hq: isHQ }, slot, { showCount: false });

        // Left-click → return to first available party member
        slot.onclick = () => {
            const defaultIdx = party.findIndex(m => !m.isEmpty);
            if (defaultIdx !== -1) {
                const success = equip.addItemToInventory(defaultIdx, itemName, 1, { hq: isHQ });
                if (success) {
                    _forgeContents[i] = null;
                    _renderForgeSlots();
                    equip.hideTooltip();
                } else {
                    showForgeMessage(`${party[defaultIdx].name}'s inventory is full!`, 'info');
                }
            }
        };

        // Right-click → pick recipient
        slot.oncontextmenu = (e) => {
            e.preventDefault();
            _showForgeCtxMenu(e.clientX, e.clientY, equip, i, itemDef, isHQ);
        };

        if (i === 8) {
            equip.attachTooltipListeners(slot, () => _forgeContents[8]
                ? { name: itemName, hq: isHQ, description: 'Click to take into your inventory. Right-click to choose who receives it.' }
                : null);
        } else {
            equip.attachTooltipListeners(slot, () => _forgeContents[i]
                ? { name: itemName, hq: isHQ, description: 'Click to return to inventory. Right-click to choose who receives it.' }
                : null);
        }
    });
}

function _showForgeCtxMenu(x, y, equip, slotIdx, itemDef, isHQ = false) {
    const menu = document.getElementById('chest-ctx-menu');
    const list = document.getElementById('chest-ctx-list');
    list.innerHTML = '';

    party.filter(m => !m.isEmpty).forEach(target => {
        const targetIdx = party.indexOf(target);
        const row = document.createElement('div');
        row.className = 'inv-ctx-give-item';

        const canvas = document.createElement('canvas');
        canvas.width = 26;
        canvas.height = 26;
        drawPortrait(canvas, target);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = target.name;

        row.appendChild(canvas);
        row.appendChild(nameSpan);
        row.addEventListener('click', () => {
            const success = equip.addItemToInventory(targetIdx, itemDef.name, 1, { hq: isHQ });
            if (success) {
                _forgeContents[slotIdx] = null;
                _renderForgeSlots();
                equip.hideTooltip();
            } else {
                showForgeMessage(`${target.name}'s inventory is full!`, 'info');
            }
            _hideChestCtxMenu();
        });
        list.appendChild(row);
    });

    menu.classList.remove('chest-ctx-hidden');
    _chestCtxOpen = true;
    document.addEventListener('mousedown', _outsideClickHandler);

    const mw = menu.offsetWidth || 160;
    const mh = menu.offsetHeight || 100;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let lx = x + 6;
    let ly = y + 4;
    if (lx + mw > vw - 8) lx = x - mw - 6;
    if (ly + mh > vh - 8) ly = y - mh - 4;
    menu.style.left = lx + 'px';
    menu.style.top = ly + 'px';
}

function _showForgeItemPicker(x, y, slotIdx) {
    const picker = document.getElementById('anvil-picker');
    const grid = document.getElementById('anvil-picker-grid');
    grid.innerHTML = '';

    let hasItems = false;

    party.forEach((member, memberIdx) => {
        if (member.isEmpty) return;

        member.inventory.forEach((item, invIdx) => {
            if (!item) return;
            const itemName = item.name;
            const def = getItemDef(itemName);
            if (!def) return;

            hasItems = true;
            const slot = document.createElement('div');
            slot.className = 'picker-slot';

            const img = document.createElement('img');
            img.src = asset(def.icon);
            slot.appendChild(img);

            const count = item.count ?? 1;
            if (count > 1) {
                const badge = document.createElement('div');
                badge.className = 'inv-count-badge';
                badge.textContent = count;
                slot.appendChild(badge);
            }

            slot.onclick = () => {
                _forgeContents[slotIdx] = itemName;
                const currentCount = item.count ?? 1;
                if (currentCount > 1) {
                    item.count = currentCount - 1;
                } else {
                    member.inventory[invIdx] = null;
                }
                _renderForgeSlots();
                _hideForgeItemPicker();
                equip.hideTooltip();
            };

            equip.attachTooltipListeners(slot, () => ({ name: def.name, description: `Held by ${member.name}. Click to add to forge.` }));
            grid.appendChild(slot);
        });
    });

    if (!hasItems) {
        const msg = document.createElement('div');
        msg.className = 'picker-empty-msg';
        msg.textContent = "No items found in party inventory.";
        grid.appendChild(msg);
    }

    picker.classList.remove('picker-hidden');

    const pw = picker.offsetWidth || 280;
    const ph = picker.offsetHeight || 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let lx = x - (pw / 2);
    let ly = y - ph - 10;

    if (lx < 10) lx = 10;
    if (lx + pw > vw - 10) lx = vw - pw - 10;
    if (ly < 10) ly = y + 20;
    if (ly + ph > vh - 10) ly = vh - ph - 10;

    picker.style.left = lx + 'px';
    picker.style.top = ly + 'px';
}

function _hideForgeItemPicker() {
    const picker = document.getElementById('anvil-picker');
    if (picker) picker.classList.add('picker-hidden');
}

export function isForgeModalOpen() {
    return _forgeModalOpen;
}

export function openCorpseModal(corpseObj) {
    _activeShrineLootObj = corpseObj;
    _activeSentLabelId = 'corpse-sent-label';
    const overlay = document.getElementById('corpse-overlay');
    overlay.classList.remove('chest-hidden');
    document.getElementById('corpse-sent-label').textContent = '';

    const slots = document.querySelectorAll('.corpse-slot');
    const contents = corpseObj.userData.contents || [];

    {
        _bindChestSlots(equip, slots, contents);
    }
}

export function openMerchantModal(shopType = 'weapons', questNpcId = null) {
    _merchantBasket = [];
    _merchantSellBasket = [];
    _merchantMode = 'buy';
    if (shopType === 'potions') _activeMerchantAvailable = _potionMerchantAvailable;
    else if (shopType === 'stances') _activeMerchantAvailable = _stanceMerchantAvailable;
    else _activeMerchantAvailable = _merchantAvailable;

    let title = 'Merchant';
    if (shopType === 'potions') title = 'Apothecary';
    else if (shopType === 'stances') title = 'Stance Master';
    else if (shopType === 'none' || shopType === 'barnaby') title = 'Barnaby';

    document.getElementById('merchant-title').textContent = title;

    const modal = document.getElementById('merchant-modal');
    const questPanel = document.getElementById('merchant-quest-panel');
    if (questNpcId) {
        modal.classList.add('merchant-has-quests');
        questPanel.classList.remove('merchant-hidden');
        renderMerchantQuestPanel(questNpcId);
    } else {
        modal.classList.remove('merchant-has-quests');
        questPanel.classList.add('merchant-hidden');
    }

    document.getElementById('merchant-overlay').classList.remove('merchant-hidden');

    // Show / hide the Essentiary shortcut for Barnaby
    const essentiaryBtn = document.getElementById('barnaby-essentiary-btn');
    if (essentiaryBtn) {
        const isBarnabyShop = (questNpcId === 'monster-npc' || shopType === 'barnaby');
        essentiaryBtn.style.display = isBarnabyShop ? '' : 'none';
        essentiaryBtn.onclick = () => {
            document.getElementById('merchant-overlay').classList.add('merchant-hidden');
            window.openEssentiary?.();
        };
    }

    const tabs = document.getElementById('merchant-tabs');
    const mainCol = document.getElementById('merchant-main-col');
    if (shopType === 'none' && questNpcId !== 'monster-npc') {
        tabs.style.display = 'none';
        document.getElementById('merchant-body').style.display = 'none';
        document.getElementById('merchant-sell-body').style.display = 'none';
    } else {
        tabs.style.display = 'flex';
        if (questNpcId === 'monster-npc' || shopType === 'barnaby') {
            title = 'Barnaby';
            document.getElementById('merchant-title').textContent = title;
            // tabs.style.display = 'none'; // allow selling to Barnaby now

            _activeMerchantAvailable = _monsterNpcStock;

            // Check for new essences to update stock
            const essencesHeld = [];
            party.forEach(member => {
                if (member.isEmpty) return;
                member.inventory.forEach(item => {
                    if (item && item.name.endsWith(' Essence') && item.name !== 'Life Essence') {
                        essencesHeld.push(item.name);
                    }
                });
            });

            let playNewAudio = false;
            essencesHeld.forEach(essence => {
                if (!_seenEssences.has(essence)) {
                    _seenEssences.add(essence);
                    playNewAudio = true;
                    const baseName = essence.replace(' Essence', '');
                    for (const suffix of ['Armour Parchment', 'Weapons Parchment']) {
                        const pName = `${baseName} ${suffix}`;
                        if (getItemDef(pName) && !_monsterNpcStock.some(e => e.name === pName)) {
                            _monsterNpcStock.push({ name: pName, hq: false });
                            showMessage(`Barnaby recognises the ${essence}! A ${pName} is now available in his shop.`);
                        }
                    }
                }
            });

            if (playNewAudio) {
                playSuccessSound();
                setTimeout(() => {
                    playSoundByUrl(asset('/npcs/monster-npc/new-essence.mp3'), 1.0);
                }, 1000);
            }
        }

        _switchMerchantTab('buy');
    }
}

function _switchMerchantTab(mode) {
    _merchantMode = mode;
    const buyBody = document.getElementById('merchant-body');
    const sellBody = document.getElementById('merchant-sell-body');
    const tabBuy = document.getElementById('merchant-tab-buy');
    const tabSell = document.getElementById('merchant-tab-sell');

    if (mode === 'buy') {
        buyBody.style.display = 'flex';
        sellBody.style.display = 'none';
        tabBuy.classList.add('merchant-tab-active');
        tabSell.classList.remove('merchant-tab-active');
        _renderMerchantShop();
        _renderMerchantBasket();
        _updateMerchantTotals();
    } else {
        buyBody.style.display = 'none';
        sellBody.style.display = 'flex';
        tabBuy.classList.remove('merchant-tab-active');
        tabSell.classList.add('merchant-tab-active');
        _renderMerchantPartyItems();
        _renderMerchantSellBasket();
        _updateMerchantSellTotals();
    }
}

// HQ items cost double the base item's buy price. Change HQ_PRICE_MULT to
// tune (or move into crafting.json if you want it data-driven).
const HQ_PRICE_MULT = 2;
function _entryPrice(entry) {
    const base = getItemDef(entry.name)?.value ?? 0;
    return entry.hq ? base * HQ_PRICE_MULT : base;
}

// Find the first stock entry that matches a basket entry by both name and hq,
// so HQ and regular copies are tracked independently.
function _findStockIdx(stockArr, target) {
    return stockArr.findIndex(e => e.name === target.name && !!e.hq === !!target.hq);
}

function _renderMerchantShop() {
    const grid = document.getElementById('merchant-grid');
    grid.innerHTML = '';

    {
        // Build display list: remove one entry per basket item (not all copies)
        const displayAvailable = _activeMerchantAvailable.map(e => ({ ...e }));
        for (const basketItem of _merchantBasket) {
            const idx = _findStockIdx(displayAvailable, basketItem);
            if (idx > -1) displayAvailable.splice(idx, 1);
        }

        displayAvailable.forEach(entry => {
            const { name, hq } = entry;
            const itemDef = getItemDef(name);
            if (!itemDef) return;

            const slot = document.createElement('div');
            slot.className = 'merch-slot';

            // Add "eye" icon for parchments in the monster shop to view ingredients
            if (_activeMerchantAvailable === _monsterNpcStock && itemDef.type === 'parchment'
                    && (itemDef.recipeName || itemDef.essenceName)) {
                const eye = document.createElement('div');
                eye.className = 'merchant-slot-inspect';
                eye.innerHTML = '👁';
                eye.title = 'View Ingredients';
                eye.onclick = (e) => {
                    e.stopPropagation();
                    const recipes = _getForgeRecipesForParchment(itemDef.parchmentType, itemDef.recipeName, itemDef.essenceName);
                    _showParchmentViewer(recipes);
                };
                slot.appendChild(eye);
            }

            // Render icon into a sub-container so the eye icon / price appended
            // to the outer slot aren't wiped by renderItemIcon's innerHTML reset.
            const iconBox = document.createElement('div');
            iconBox.className = 'merch-icon-box';
            slot.appendChild(iconBox);
            equip.renderItemIcon({ name, hq }, iconBox, { showCount: false });

            const price = document.createElement('div');
            price.className = 'merch-price';
            price.textContent = `${_entryPrice(entry)}g`;
            slot.appendChild(price);

            slot.addEventListener('click', () => {
                playItemSound(name);
                _merchantBasket.push({ name, hq });
                equip.hideTooltip();
                _renderMerchantShop();
                _renderMerchantBasket();
                _updateMerchantTotals();
            });

            equip.attachTooltipListeners(slot, () => ({ name, hq }), false, true);

            grid.appendChild(slot);
        });
    }
}

function _renderMerchantBasket() {
    const grid = document.getElementById('merchant-basket-grid');
    grid.innerHTML = '';

    {
        _merchantBasket.forEach((entry, idx) => {
            const { name, hq } = entry;
            const itemDef = getItemDef(name);
            if (!itemDef) return;

            const slot = document.createElement('div');
            slot.className = 'merch-slot';

            const iconBox = document.createElement('div');
            iconBox.className = 'merch-icon-box';
            slot.appendChild(iconBox);
            equip.renderItemIcon({ name, hq }, iconBox, { showCount: false });

            const price = document.createElement('div');
            price.className = 'merch-price';
            price.textContent = `${_entryPrice(entry)}g`;
            slot.appendChild(price);

            // Click basket item → return it to the shop
            slot.addEventListener('click', () => {
                playItemSound(name);
                _merchantBasket.splice(idx, 1);
                equip.hideTooltip();
                _renderMerchantShop();
                _renderMerchantBasket();
                _updateMerchantTotals();
            });

            equip.attachTooltipListeners(slot, () => ({ name, hq }), false, true);

            grid.appendChild(slot);
        });
    }
}

function _updateMerchantTotals() {
    const total = _merchantBasket.reduce((sum, e) => sum + _entryPrice(e), 0);

    document.getElementById('merchant-total-val').textContent = total;
    document.getElementById('merchant-gold-val').textContent = partyGold;

    const buyBtn = document.getElementById('merchant-buy-btn');
    buyBtn.disabled = _merchantBasket.length === 0 || partyGold < total;
}

function _buyItems() {
    const total = _merchantBasket.reduce((sum, e) => sum + _entryPrice(e), 0);
    if (partyGold < total) return;

    {
        const boughtItems = [];
        const failedItems = [];

        // Try to add each item to inventory
        for (const entry of _merchantBasket) {
            let added = false;
            // Try to find a slot in any party member's inventory
            for (let i = 0; i < 4; i++) {
                if (party[i].isEmpty) continue;
                if (equip.addItemToInventory(i, entry.name, 1, { hq: entry.hq })) {
                    added = true;
                    boughtItems.push(entry);
                    break;
                }
            }
            if (!added) {
                failedItems.push(entry);
            }
        }

        // Calculate cost of successfully bought items
        const spent = boughtItems.reduce((sum, e) => sum + _entryPrice(e), 0);

        if (spent > 0) {
            removeGold(spent);
            showMessage(`Bought ${boughtItems.length} items for ${spent} gold.`);
            for (const entry of boughtItems) {
                const displayName = entry.hq ? `HQ ${entry.name}` : entry.name;
                addLogEntry({ type: 'item', subtype: 'buy', itemName: displayName, gold: _entryPrice(entry), time: Date.now() });
            }
        }

        if (failedItems.length > 0) {
            showMessage(`Could not carry ${failedItems.length} items (inventory full).`);
        }

        // Remove bought items from available stock (match on name + hq).
        for (const entry of boughtItems) {
            const stockIdx = _findStockIdx(_activeMerchantAvailable, entry);
            if (stockIdx > -1) _activeMerchantAvailable.splice(stockIdx, 1);
        }

        // Basket should now only contain failed items
        _merchantBasket = failedItems;

        _renderMerchantShop();
        _renderMerchantBasket();
        _updateMerchantTotals();
    }
}

// ── Sell-side helpers ────────────────────────────────────────────────────

// Sell price is 1/10th of the item's buy value, ceiled. HQ items sell for
// HQ_PRICE_MULT× more to match the buy-side multiplier.
function _getMerchantSellPrice(name, isHQ = false) {
    const def = getItemDef(name);
    if (!def) return 0;
    const base = Math.ceil((def.value ?? 0) / 10);
    return isHQ ? base * HQ_PRICE_MULT : base;
}

function _renderMerchantPartyItems() {
    const grid = document.getElementById('merchant-party-grid');
    grid.innerHTML = '';

    const CHARACTER_LABELS = ['A', 'B', 'C', 'D'];

    {
        for (let ci = 0; ci < 4; ci++) {
            const member = party[ci];
            if (!member || member.isEmpty) continue;

            member.inventory.forEach((item, invIdx) => {
                if (!item) return;
                // Skip if already in the sell basket
                if (_merchantSellBasket.some(e => e.charIndex === ci && e.invIndex === invIdx)) return;

                const def = getItemDef(item.name);
                if (!def) return;

                const stackQty = item.count ?? 1;
                const sellPrice = _getMerchantSellPrice(item.name, !!item.hq) * stackQty;

                const slot = document.createElement('div');
                slot.className = 'merch-slot';

                const tag = document.createElement('div');
                tag.className = 'merch-char-tag';
                tag.textContent = CHARACTER_LABELS[ci];
                slot.appendChild(tag);

                // Render icon into a sub-container so the char tag / price
                // aren't wiped by renderItemIcon's innerHTML reset. The shared
                // renderer draws the icon, count badge, and HQ star overlay.
                const iconBox = document.createElement('div');
                iconBox.className = 'merch-icon-box';
                slot.appendChild(iconBox);
                equip.renderItemIcon(item, iconBox);

                const price = document.createElement('div');
                price.className = 'merch-price';
                price.textContent = `${sellPrice}g`;
                slot.appendChild(price);

                slot.addEventListener('click', () => {
                    playItemSound(item.name);
                    _merchantSellBasket.push({ charIndex: ci, invIndex: invIdx, name: item.name, hq: !!item.hq });
                    equip.hideTooltip();
                    _renderMerchantPartyItems();
                    _renderMerchantSellBasket();
                    _updateMerchantSellTotals();
                });

                equip.attachTooltipListeners(slot, () => ({ name: item.name, hq: !!item.hq }));

                grid.appendChild(slot);
            });
        }
    }
}

function _renderMerchantSellBasket() {
    const grid = document.getElementById('merchant-sell-basket-grid');
    grid.innerHTML = '';

    {
        _merchantSellBasket.forEach((entry, idx) => {
            const def = getItemDef(entry.name);
            if (!def) return;

            const invItem = party[entry.charIndex]?.inventory?.[entry.invIndex];
            const stackQty = invItem?.count ?? 1;
            const sellPrice = _getMerchantSellPrice(entry.name, !!entry.hq) * stackQty;

            const slot = document.createElement('div');
            slot.className = 'merch-slot';

            // Prefer the live inventory entry so render picks up the actual
            // stack count and HQ flag; fall back to the basket entry if the
            // inventory slot was somehow cleared between renders.
            const renderItem = invItem ?? { name: entry.name, hq: !!entry.hq, count: stackQty };
            const iconBox = document.createElement('div');
            iconBox.className = 'merch-icon-box';
            slot.appendChild(iconBox);
            equip.renderItemIcon(renderItem, iconBox);

            const price = document.createElement('div');
            price.className = 'merch-price';
            price.textContent = `${sellPrice}g`;
            slot.appendChild(price);

            // Click → return item to party panel
            slot.addEventListener('click', () => {
                playItemSound(entry.name);
                _merchantSellBasket.splice(idx, 1);
                equip.hideTooltip();
                _renderMerchantPartyItems();
                _renderMerchantSellBasket();
                _updateMerchantSellTotals();
            });

            equip.attachTooltipListeners(slot, () => ({ name: entry.name, hq: !!entry.hq }));

            grid.appendChild(slot);
        });
    }
}

function _updateMerchantSellTotals() {
    const total = _merchantSellBasket.reduce((sum, e) => {
        const invItem = party[e.charIndex]?.inventory?.[e.invIndex];
        const stackQty = invItem?.count ?? 1;
        return sum + _getMerchantSellPrice(e.name, !!e.hq) * stackQty;
    }, 0);

    document.getElementById('merchant-sell-total-val').textContent = total;
    document.getElementById('merchant-sell-gold-val').textContent = partyGold;

    const sellBtn = document.getElementById('merchant-sell-btn');
    sellBtn.disabled = _merchantSellBasket.length === 0;
}

function _sellItems() {
    if (_merchantSellBasket.length === 0) return;

    // Snapshot stack counts up front so price & per-item log entries agree.
    const entries = _merchantSellBasket.map(e => {
        const invItem = party[e.charIndex]?.inventory?.[e.invIndex];
        return { ...e, stackQty: invItem?.count ?? 1 };
    });
    const total = entries.reduce((sum, e) => sum + _getMerchantSellPrice(e.name, !!e.hq) * e.stackQty, 0);
    const totalUnits = entries.reduce((sum, e) => sum + e.stackQty, 0);

    // Remove items from inventory (whole stack per slot; reverse order to keep indices stable).
    const byChar = {};
    for (const entry of entries) {
        if (!byChar[entry.charIndex]) byChar[entry.charIndex] = [];
        byChar[entry.charIndex].push(entry.invIndex);
    }
    for (const ci of Object.keys(byChar)) {
        const indices = byChar[ci].sort((a, b) => b - a); // descending so splicing doesn't shift
        for (const idx of indices) {
            party[ci].inventory[idx] = null;
        }
    }

    addGold(total);
    showMessage(`Sold ${totalUnits} item${totalUnits > 1 ? 's' : ''} for ${total} gold.`);
    for (const e of entries) {
        const displayName = e.hq ? `HQ ${e.name}` : e.name;
        addLogEntry({ type: 'item', subtype: 'sell', itemName: displayName, gold: _getMerchantSellPrice(e.name, !!e.hq) * e.stackQty, time: Date.now() });
    }

    _merchantSellBasket = [];
    _renderMerchantPartyItems();
    _renderMerchantSellBasket();
    _updateMerchantSellTotals();
}

function _bindArmorStandSlots(equip, contents) {
    const slots = document.querySelectorAll('.armor-stand-slot');
    slots.forEach((slot) => {
        const slotType = slot.getAttribute('data-slot');
        slot.innerHTML = '';
        slot.classList.remove('occupied');
        slot.onclick = null;

        const itemName = contents[slotType];
        if (itemName) {
            const itemDef = getItemDef(itemName);
            if (itemDef) {
                slot.classList.add('occupied');
                const img = document.createElement('img');
                img.src = asset(itemDef.icon);
                slot.appendChild(img);

                // Left-click → remove from armor stand back to inventory
                slot.onclick = () => {
                    const targetIdx = _armorStandPartyMemberIdx;
                    const target = party[targetIdx];
                    const success = equip.addItemToInventory(targetIdx, itemName);
                    if (success) {
                        playItemSound(itemName);
                        if (_activeSentLabelId) {
                            const label = document.getElementById(_activeSentLabelId);
                            if (label) label.textContent = `Taken by ${target.name}`;
                        }
                        contents[slotType] = null;
                        equip.hideTooltip();
                        equip.updateEffectiveStats(target);
                        refreshPartyCards();
                        _bindArmorStandSlots(equip, contents);
                        _renderArmorStandPartyInv();
                    } else {
                        showMessage(`${target.name}'s inventory is full!`);
                    }
                };
            }
        }

        // Hover tooltip
        equip.attachTooltipListeners(slot, () => {
            if (!contents[slotType]) return null;
            return {
                name: contents[slotType]
            };
        });
    });
}

function _bindChestSlots(equip, slots, contents) {
    slots.forEach((slot, i) => {
        slot.innerHTML = '';
        slot.classList.remove('occupied');
        slot.onclick = null;
        slot.oncontextmenu = null;

        const entry = contents[i];
        const itemName = typeof entry === 'string' ? entry : entry?.name;
        const isHQ = typeof entry === 'object' && !!entry?.hq;
        if (itemName) {
            const itemDef = getItemDef(itemName);
            if (itemDef) {
                slot.classList.add('occupied');

                // Construct a temporary item object for the shared renderer
                const tempItem = {
                    name: itemName,
                    hq: isHQ,
                    count: typeof entry === 'object' ? entry.quantity : 1
                };
                equip.renderItemIcon(tempItem, slot);

                // Left-click → send to the currently selected party member tab
                slot.onclick = () => {
                    _sendChestItem(equip, slots, contents, i, itemDef, _chestPartyMemberIdx);
                };

                // Right-click → pick recipient
                if (itemName !== 'Gold Coins') {
                    slot.oncontextmenu = (e) => {
                        e.preventDefault();
                        _showChestCtxMenu(e.clientX, e.clientY, equip, slots, contents, i, itemDef);
                    };
                } else {
                    slot.oncontextmenu = (e) => { e.preventDefault(); };
                }
            }
        }

        // Hover tooltip — call this for ALL slots to ensure listeners are updated or cleared
        equip.attachTooltipListeners(slot, () => {
            if (!contents[i]) return null;
            const entry = contents[i];
            const isObj = typeof entry === 'object';
            return {
                name: itemName,
                hq: isObj && !!entry.hq,
                quantity: isObj && entry.quantity ? entry.quantity : null
            };
        });
    });
}

function _sendChestItem(equip, slots, contents, slotIdx, itemDef, targetIdx) {
    const entry = contents[slotIdx];
    const isGold = (typeof entry === 'string' ? entry : entry?.name) === 'Gold Coins';
    if (isGold) {
        const amount = typeof entry === 'object' && entry.quantity ? entry.quantity : 1;
        addGold(amount);
        showMessage(`Picked up ${amount} Gold Coins.`);
        contents[slotIdx] = null;
        const slot = slots[slotIdx];
        slot.innerHTML = '';
        slot.classList.remove('occupied');
        slot.onclick = null;
        slot.oncontextmenu = null;
        equip.hideTooltip();
        if (_activeShrineLootObj?.userData.isPortalActivatorStatue) {
            _applyEggGlow(_activeShrineLootObj.userData.eggModel, contents);
            if (contents.filter(c => c !== null).length === 0) {
                const ud = _activeShrineLootObj.userData;
                _eggEmptiedSet.add(`${window.currentLevel},${ud.gridRow},${ud.gridCol}`);
            }
        }
        // Save state immediately
        if (_activeShrineLootObj?.userData.persistenceKey) {
            _containerContentsPersistence[_activeShrineLootObj.userData.persistenceKey] = contents;
        }
        return;
    }

    const target = party[targetIdx];
    const itemQuantity = typeof entry === 'object' && entry.quantity ? entry.quantity : 1;
    const isHQ = typeof entry === 'object' && !!entry.hq;
    const success = equip.addItemToInventory(targetIdx, itemDef.name, itemQuantity, { hq: isHQ });
    if (success) {
        addLogEntry({ type: 'item', subtype: 'loot', itemName: itemDef.name, time: Date.now() });
        playItemSound(itemDef.name);
        if (_activeSentLabelId) {
            const label = document.getElementById(_activeSentLabelId);
            if (label) label.textContent = `Sent to ${target.name}`;
        }
        contents[slotIdx] = null;
        const slot = slots[slotIdx];
        slot.innerHTML = '';
        slot.classList.remove('occupied');
        slot.onclick = null;
        slot.oncontextmenu = null;
        equip.hideTooltip();
        if (_activeShrineLootObj?.userData.isPortalActivatorStatue) {
            _applyEggGlow(_activeShrineLootObj.userData.eggModel, contents);
            // If empty, mark as emptied in persistence
            if (contents.filter(c => c !== null).length === 0) {
                const ud = _activeShrineLootObj.userData;
                _eggEmptiedSet.add(`${window.currentLevel},${ud.gridRow},${ud.gridCol}`);
            }
        }
        // Save state immediately
        if (_activeShrineLootObj?.userData.persistenceKey) {
            _containerContentsPersistence[_activeShrineLootObj.userData.persistenceKey] = contents;
        }
        // Refresh the deposit panel so the received item shows up
        if (targetIdx === _chestPartyMemberIdx) _renderChestPartyInv();
    } else {
        showMessage(`${target.name}'s inventory is full!`);
    }
}

function _outsideClickHandler(e) {
    const menu = document.getElementById('chest-ctx-menu');
    if (!menu.contains(e.target)) {
        _hideChestCtxMenu();
        document.removeEventListener('mousedown', _outsideClickHandler);
    }
}

function _showChestCtxMenu(x, y, equip, slots, contents, slotIdx, itemDef) {
    const menu = document.getElementById('chest-ctx-menu');
    const list = document.getElementById('chest-ctx-list');
    list.innerHTML = '';

    party.filter(m => !m.isEmpty).forEach(target => {
        const targetIdx = party.indexOf(target);
        const row = document.createElement('div');
        row.className = 'inv-ctx-give-item';

        const canvas = document.createElement('canvas');
        canvas.width = 26;
        canvas.height = 26;
        drawPortrait(canvas, target);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = target.name;

        row.appendChild(canvas);
        row.appendChild(nameSpan);
        row.addEventListener('click', () => {
            _sendChestItem(equip, slots, contents, slotIdx, itemDef, targetIdx);
            _hideChestCtxMenu();
        });
        list.appendChild(row);
    });

    menu.classList.remove('chest-ctx-hidden');
    _chestCtxOpen = true;
    document.addEventListener('mousedown', _outsideClickHandler);

    // Position near cursor, flip if near viewport edges
    const mw = menu.offsetWidth || 160;
    const mh = menu.offsetHeight || 100;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let lx = x + 6;
    let ly = y + 4;
    if (lx + mw > vw - 8) lx = x - mw - 6;
    if (ly + mh > vh - 8) ly = y - mh - 4;
    menu.style.left = lx + 'px';
    menu.style.top = ly + 'px';
}

// ── Alchemy message bar ───────────────────────────────────────────────────────
// Displays feedback inside the modal rather than using the global showMessage.
// type: 'success' | 'fail' | 'info'
let _alchemyMsgTimer = null;

function showAlchemyMessage(text, type = 'info') {
    const bar = document.getElementById('alchemy-message-bar');
    const span = document.getElementById('alchemy-message-text');
    if (!bar || !span) return;

    if (_alchemyMsgTimer) { clearTimeout(_alchemyMsgTimer); _alchemyMsgTimer = null; }

    span.textContent = text;
    bar.className = `alchemy-msg-visible alchemy-msg-${type}`;

    _alchemyMsgTimer = setTimeout(() => {
        bar.className = '';
        _alchemyMsgTimer = null;
    }, 4000);
}

function _clearAlchemyMessage() {
    if (_alchemyMsgTimer) { clearTimeout(_alchemyMsgTimer); _alchemyMsgTimer = null; }
    const bar = document.getElementById('alchemy-message-bar');
    if (bar) bar.className = '';
}

// ── Recipes: derived at runtime from potions.json entries that have an
//    "ingredients" field. To add or change a recipe, edit potions.json only.
//    Ingredient entries: { name: string, quantity: number }
function _getAlchemyRecipes() {
    return POTIONS_DATA
        .filter(p => Array.isArray(p.ingredients) && p.ingredients.length > 0)
        .map(p => ({ ingredients: p.ingredients, result: p.name }));
}

function _transmute() {
    // Block if a potion is already waiting in the result slot
    if (_alchemyContents[8] !== null) {
        showAlchemyMessage('Take the potion from the result slot before transmuting again.', 'info');
        return;
    }

    // Gather ingredients (slots 0-7)
    const ingredients = _alchemyContents.slice(0, 8).filter(Boolean);

    if (ingredients.length === 0) {
        showAlchemyMessage('Add ingredients before transmuting.', 'info');
        return;
    }

    playAlchemySound();
    const _alchemyImgs = [
        document.getElementById('alchemy-header-icon'),
        document.querySelector('.workbench-deco-alchemy .workbench-deco-img'),
    ].filter(Boolean);
    const _alchemyFlame = asset('/icons/alchemy2.webp');
    _alchemyImgs.forEach(img => { img._origSrc = img.src; img.src = _alchemyFlame; });
    setTimeout(() => _alchemyImgs.forEach(img => { img.src = img._origSrc; }), 500);
    const recipes = _getAlchemyRecipes();

    // Try each recipe — quantity-aware matching
    let matchedResult = null;
    for (const recipe of recipes) {
        const pool = [...ingredients];
        let matched = true;
        for (const needed of recipe.ingredients) {
            let remaining = needed.quantity;
            while (remaining > 0) {
                const idx = pool.indexOf(needed.name);
                if (idx === -1) { matched = false; break; }
                pool.splice(idx, 1);
                remaining--;
            }
            if (!matched) break;
        }
        if (matched && pool.length === 0) {
            matchedResult = recipe.result;
            break;
        }
    }

    if (matchedResult) {
        const outcome = rollCraftOutcome('alchemy');
        const usedIngredients = [...ingredients];

        if (outcome === 'fail') {
            // Lose only essence ingredients; everything else stays in its slot
            for (let i = 0; i < 8; i++) {
                if (_alchemyContents[i] && isEssenceIngredient(_alchemyContents[i])) {
                    _alchemyContents[i] = null;
                }
            }
            addLogEntry({ type: 'item', subtype: 'alchemy-fail', ingredients: usedIngredients, time: Date.now() });
            setTimeout(() => {
                showAlchemyMessage('The reaction fails — the essences are spoiled.', 'fail');
                playCraftFailSound();
                _renderAlchemySlots();
            }, 500);
        } else {
            const isHQ = outcome === 'hq';
            for (let i = 0; i < 8; i++) _alchemyContents[i] = null;
            const isNew = !_knownAlchemyRecipes.has(matchedResult);
            _knownAlchemyRecipes.delete(matchedResult);
            _knownAlchemyRecipes.add(matchedResult);
            addLogEntry({ type: 'item', subtype: 'alchemy', itemName: matchedResult, hq: isHQ, ingredients: usedIngredients, time: Date.now() });
            _renderKnownAlchemyRecipes();
            setTimeout(() => {
                _alchemyContents[8] = { name: matchedResult, hq: isHQ };
                const displayName = isHQ ? hqDisplayName(matchedResult) : matchedResult;
                const msg = isHQ
                    ? `Transmutation successful! You created an ${displayName}!`
                    : (isNew
                        ? `Transmutation successful! You discovered the recipe for ${matchedResult}!`
                        : `Transmutation successful! You created a ${matchedResult}.`);
                showAlchemyMessage(msg, 'success');
                if (isHQ) playCraftHqSound();
                else playSuccessSound();
                _renderAlchemySlots();
            }, 500);
        }
    } else {
        // Ingredients are preserved — nothing is consumed
        showAlchemyMessage('The ingredients do not react — nothing happens.', 'fail');
    }

    _renderAlchemySlots();
}

export function openAlchemyModal() {
    _alchemyModalOpen = true;
    playAlchemySound();
    _activeSentLabelId = null;
    _clearAlchemyMessage();
    const overlay = document.getElementById('alchemy-overlay');
    overlay.classList.remove('chest-hidden');

    _renderAlchemySlots();
    _renderKnownAlchemyRecipes();
}

/**
 * Renders the current _alchemyContents into the alchemy modal slots.
 */
function _renderAlchemySlots() {
    const slots = document.querySelectorAll('.alchemy-slot');
    {
        slots.forEach((slot, i) => {
            slot.innerHTML = '';
            slot.classList.remove('occupied');
            slot.onclick = null;
            slot.oncontextmenu = null;

            const entry = _alchemyContents[i];
            if (!entry) {
                // Empty slot hint
                if (i < 8) { // Only for ingredient slots, not result
                    slot.onclick = (e) => _showAlchemyItemPicker(e.clientX, e.clientY, i);
                    equip.attachTooltipListeners(slot, () => ({ name: "Empty Ingredient Slot", description: "Click to select an ingredient from your party's inventory." }));
                }
                return;
            }

            const itemName = typeof entry === 'string' ? entry : entry.name;
            const isHQ = typeof entry === 'object' && !!entry.hq;
            const itemDef = getItemDef(itemName);
            if (!itemDef) return;

            slot.classList.add('occupied');
            equip.renderItemIcon({ name: itemName, hq: isHQ }, slot, { showCount: false });

            // Left-click → send to first available party member (remove from academy)
            slot.onclick = () => {
                const defaultIdx = party.findIndex(m => !m.isEmpty);
                if (defaultIdx !== -1) {
                    const success = equip.addItemToInventory(defaultIdx, itemName, 1, { hq: isHQ });
                    if (success) {
                        _alchemyContents[i] = null;
                        _renderAlchemySlots();
                        equip.hideTooltip();
                    } else {
                        showAlchemyMessage(`${party[defaultIdx].name}'s inventory is full!`, 'info');
                    }
                }
            };

            // Right-click → pick recipient
            slot.oncontextmenu = (e) => {
                e.preventDefault();
                _showAlchemyCtxMenu(e.clientX, e.clientY, equip, i, itemDef, isHQ);
            };

            // Hover tooltip — result slot gets a "take it" hint
            if (i === 8) {
                equip.attachTooltipListeners(slot, () => _alchemyContents[8]
                    ? { name: itemName, hq: isHQ, description: 'Click to take into your inventory. Right-click to choose who receives it.' }
                    : null);
            } else {
                equip.attachTooltipListeners(slot, () => _alchemyContents[i]
                    ? { name: itemName, hq: isHQ, description: 'Click to return to inventory. Right-click to choose who receives it.' }
                    : null);
            }
        });
    }
}

/**
 * Shows a context menu to pick which party member takes the item from alchemy.
 */
function _showAlchemyCtxMenu(x, y, equip, slotIdx, itemDef, isHQ = false) {
    const menu = document.getElementById('chest-ctx-menu');
    const list = document.getElementById('chest-ctx-list');
    list.innerHTML = '';

    party.filter(m => !m.isEmpty).forEach(target => {
        const targetIdx = party.indexOf(target);
        const row = document.createElement('div');
        row.className = 'inv-ctx-give-item';

        const canvas = document.createElement('canvas');
        canvas.width = 26;
        canvas.height = 26;
        drawPortrait(canvas, target);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = target.name;

        row.appendChild(canvas);
        row.appendChild(nameSpan);
        row.addEventListener('click', () => {
            const success = equip.addItemToInventory(targetIdx, itemDef.name, 1, { hq: isHQ });
            if (success) {
                _alchemyContents[slotIdx] = null;
                _renderAlchemySlots();
                equip.hideTooltip();
            } else {
                showAlchemyMessage(`${target.name}'s inventory is full!`, 'info');
            }
            _hideChestCtxMenu();
        });
        list.appendChild(row);
    });

    menu.classList.remove('chest-ctx-hidden');
    _chestCtxOpen = true;
    document.addEventListener('mousedown', _outsideClickHandler);

    // Position near cursor
    const mw = menu.offsetWidth || 160;
    const mh = menu.offsetHeight || 100;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let lx = x + 6;
    let ly = y + 4;
    if (lx + mw > vw - 8) lx = x - mw - 6;
    if (ly + mh > vh - 8) ly = y - mh - 4;
    menu.style.left = lx + 'px';
    menu.style.top = ly + 'px';
}

/**
 * Shows a picker with all unequipped loot items from the party's collective inventory.
 */
function _showAlchemyItemPicker(x, y, slotIdx) {
    const picker = document.getElementById('alchemy-picker');
    const grid = document.getElementById('alchemy-picker-grid');
    grid.innerHTML = '';

    let hasLoot = false;

    {
        party.forEach((member, memberIdx) => {
            if (member.isEmpty) return;

            member.inventory.forEach((item, invIdx) => {
                if (!item) return;
                const itemName = item.name; // inventory stores { name, slot } objects
                const def = getItemDef(itemName);
                if (def?.slot !== 'loot') return;

                hasLoot = true;
                const slot = document.createElement('div');
                slot.className = 'picker-slot';

                const img = document.createElement('img');
                img.src = asset(def.icon);
                slot.appendChild(img);

                const count = item.count ?? 1;
                if (count > 1) {
                    const badge = document.createElement('div');
                    badge.className = 'inv-count-badge';
                    badge.textContent = count;
                    slot.appendChild(badge);
                }

                slot.onclick = () => {
                    _alchemyContents[slotIdx] = itemName;
                    const currentCount = item.count ?? 1;
                    if (currentCount > 1) {
                        item.count = currentCount - 1;
                    } else {
                        member.inventory[invIdx] = null;
                    }
                    _renderAlchemySlots();
                    _hideAlchemyItemPicker();
                    equip.hideTooltip();
                };

                equip.attachTooltipListeners(slot, () => ({ name: def.name, description: `Held by ${member.name}. Click to add to workshop.` }));
                grid.appendChild(slot);
            });
        });

        if (!hasLoot) {
            const msg = document.createElement('div');
            msg.className = 'picker-empty-msg';
            msg.textContent = "No ingredients found in party inventory.";
            grid.appendChild(msg);
        }

        picker.classList.remove('picker-hidden');

        // Position near clicked slot
        const pw = picker.offsetWidth || 280;
        const ph = picker.offsetHeight || 200;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Prefer showing it above the clicked point
        let lx = x - (pw / 2);
        let ly = y - ph - 10;

        if (lx < 10) lx = 10;
        if (lx + pw > vw - 10) lx = vw - pw - 10;
        if (ly < 10) ly = y + 20; // Flip below if no space above
        if (ly + ph > vh - 10) ly = vh - ph - 10;

        picker.style.left = lx + 'px';
        picker.style.top = ly + 'px';
    }
}

function _hideAlchemyItemPicker() {
    const picker = document.getElementById('alchemy-picker');
    if (picker) picker.classList.add('picker-hidden');
}

/**
 * Returns true if the alchemy modal is currently visible.
 */
export function isAlchemyModalOpen() {
    return _alchemyModalOpen;
}

/**
 * Tries to add an item to the first available ingredient slot (0-7).
 */
export function addItemToAlchemy(itemName) {
    for (let i = 0; i < 8; i++) {
        if (_alchemyContents[i] === null) {
            _alchemyContents[i] = itemName;
            if (_alchemyModalOpen) _renderAlchemySlots();
            return true;
        }
    }
    showAlchemyMessage('The ingredient slots are full!', 'info');
    return false;
}

function _hideChestCtxMenu() {
    document.getElementById('chest-ctx-menu').classList.add('chest-ctx-hidden');
    _chestCtxOpen = false;
}

function addBonePile(scene, loader, col, row, contents = []) {
    const persistenceKey = `${window.currentLevel},${col},${row}`;
    if (_containerContentsPersistence[persistenceKey]) {
        contents = _containerContentsPersistence[persistenceKey];
    }
    loader.load(asset('/items/Meshy_AI_Bone_pile_0221211647_texture.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.4);
        model.position.set(col * CELL, 0.05, row * CELL);
        model.rotation.y = Math.random() * Math.PI * 2;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isBonePile = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = contents;
                child.userData.persistenceKey = persistenceKey;
                interactables.push(child);

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        scene.add(model);
    });
}

export function spawnCorpse(col, row, droppedItems = []) {
    // Create corpse with 25 inventory slots — fill first slots with any dropped items
    const corpseContents = [
        null, null, null, null, null,
        null, null, null, null, null,
        null, null, null, null, null,
        null, null, null, null, null,
        null, null, null, null, null
    ];

    // Place dropped items into the first available slots
    let slotIdx = 0;
    for (const itemName of droppedItems) {
        if (slotIdx >= corpseContents.length) break;
        corpseContents[slotIdx] = itemName;
        slotIdx++;
    }

    _gltfLoader.load(asset('/items/Meshy_AI_Bone_pile_0221211647_texture.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.4);
        model.position.set(col * CELL, 0.05, row * CELL);
        model.rotation.y = Math.random() * Math.PI * 2;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isBonePile = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = corpseContents;
                interactables.push(child);

                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(mapName => {
                            if (mat[mapName]) {
                                mat[mapName].magFilter = THREE.LinearFilter;
                                mat[mapName].minFilter = THREE.LinearMipmapLinearFilter;
                                mat[mapName].anisotropy = 16;
                            }
                        });
                    });
                }
            }
        });

        objectsGroup.add(model);
    });
}

export function spawnDroppedItem(col, row, itemName, quantity = 1) {
    if (itemName === 'Gold Coins') {
        const spriteMat = new THREE.SpriteMaterial({ color: 0xffffff });
        const sprite = new THREE.Sprite(spriteMat);

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = asset('/icons/gold_coins.webp');
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 256, 256);

            ctx.font = 'bold 80px Arial';
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 6;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.strokeText(quantity.toString(), 128, 128);
            ctx.fillText(quantity.toString(), 128, 128);

            const tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearFilter;
            sprite.material.map = tex;
            sprite.material.needsUpdate = true;
        };

        sprite.position.set(col * CELL, 0.5, row * CELL);
        sprite.scale.set(0.8, 0.8, 0.8);

        sprite.userData.isDroppedItem = true;
        sprite.userData.itemName = itemName;
        sprite.userData.quantity = quantity;
        sprite.userData.gridCol = col;
        sprite.userData.gridRow = row;
        interactables.push(sprite);

        const light = new THREE.PointLight(0xffaa00, 1, 3);
        light.position.set(0, 0.2, 0);
        sprite.add(light);

        const originY = sprite.position.y;
        new Tween(sprite.position, tweenGroup)
            .to({ y: originY + 0.2 }, 1000)
            .easing(Easing.Quadratic.InOut)
            .yoyo(true)
            .repeat(Infinity)
            .start();

        objectsGroup.add(sprite);
        return;
    }

    const geometry = new THREE.SphereGeometry(0.15, 8, 8);
    const material = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        emissive: 0xff8800,
        emissiveIntensity: 0.8
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(col * CELL, 0.5, row * CELL);

    mesh.userData.isDroppedItem = true;
    mesh.userData.itemName = itemName;
    mesh.userData.gridCol = col;
    mesh.userData.gridRow = row;
    interactables.push(mesh);

    // Optional: add a light
    const light = new THREE.PointLight(0xffaa00, 1, 3);
    light.position.set(0, 0.2, 0);
    mesh.add(light);

    // Animation
    const originY = mesh.position.y;
    new Tween(mesh.position, tweenGroup)
        .to({ y: originY + 0.2 }, 1000)
        .easing(Easing.Quadratic.InOut)
        .yoyo(true)
        .repeat(Infinity)
        .start();

    objectsGroup.add(mesh);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SAVE GAME — world state serialization
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all gate/portal progression flags. */
export function getWorldFlags() {
    return {
        ..._state,
        disarmedTraps: [..._trapDisarmedSet],
        seenEssences: [..._seenEssences],
        unlockedRecipes: [..._unlockedRecipes],
        monsterNpcStock: _monsterNpcStock.map(e => ({ ...e })),
    };
}

export function setLevel1HoleRoomSpawned(val) { _state.level1HoleRoomSpawned = val; }
export function setStanceNpcDeparted(val) { _state.stanceNpcDeparted = val; }

/** Restores gate/portal flags. Call BEFORE spawnObjectsForLevel(). */
export function setWorldFlags(flags) {
    if (!flags) return;
    // Reset _state to its initial defaults, then overlay any keys present in
    // the incoming flags. This ensures a save with fewer keys doesn't leave
    // stale values from a prior session on _state.
    for (const key of Object.keys(_state)) {
        if (flags[key] !== undefined) {
            _state[key] = flags[key];
        } else {
            // Default: 0 for crystalShrineState (number), false otherwise.
            _state[key] = (typeof _state[key] === 'number') ? 0 : false;
        }
    }
    _seenEssences = new Set(flags.seenEssences ?? []);
    _unlockedRecipes = new Set(flags.unlockedRecipes ?? []);
    _monsterNpcStock = (flags.monsterNpcStock ?? []).map(_normStock).filter(Boolean);
    // Migration: old saves used per-item parchment names (e.g. "Ogre Helm Parchment").
    // If essences were seen but no new-style grouped parchments are in stock, reset
    // _seenEssences so Barnaby re-offers the correct grouped parchments on next visit.
    const hasNewStyleParchment = _monsterNpcStock.some(
        e => e.name.endsWith(' Armour Parchment') || e.name.endsWith(' Weapons Parchment')
    );
    if (_seenEssences.size > 0 && !hasNewStyleParchment) {
        _seenEssences.clear();
    }
    // The Aqua Man pit lives at (32, 23) on level 2. Restoring the "hole closed"
    // flag must mutate that cell so the pit stops swallowing the party after a
    // save+refresh. (Previously wrote to [17][23] by mistake — giant room, not the pit.)
    if (_state.level2HoleClosed) level2Map[32][23] = CELL_FLOOR;
    if (_state.level1HoleRoomSpawned) {
        for (let r = 24; r <= 26; r++) {
            for (let c = 1; c <= 3; c++) {
                level1Map[r][c] = CELL_FLOOR;
            }
        }
    }
    _trapDisarmedSet.clear();
    if (Array.isArray(flags.disarmedTraps)) {
        for (const key of flags.disarmedTraps) _trapDisarmedSet.add(key);
    }
}

function addPitLadder(scene, loader, col, row, rotY, offsetX = 0, offsetZ = 0, scale = 0.5) {
    loader.load(asset('/items/ladder.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.set(scale, scale * 1.5, scale);
        model.position.set(col * CELL + offsetX, 0, row * CELL + offsetZ);
        model.rotation.y = rotY;
        model.traverse((child) => {
            if (child.isMesh) {
                child.userData.isPitLadder = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                interactables.push(child);
            }
        });
        scene.add(model);
    });
}

/** Returns a snapshot of merchant stock. */
export function getMerchantStock() { return _merchantAvailable.map(e => ({ ...e })); }

/** Restores merchant stock. Accepts legacy string-array saves via _normStock. */
export function setMerchantStock(stock) { if (stock) _merchantAvailable = stock.map(_normStock).filter(Boolean); }

/** Returns a snapshot of potion merchant stock. */
export function getPotionMerchantStock() { return _potionMerchantAvailable.map(e => ({ ...e })); }

/** Restores potion merchant stock. Accepts legacy string-array saves via _normStock. */
export function setPotionMerchantStock(stock) { if (stock) _potionMerchantAvailable = stock.map(_normStock).filter(Boolean); }

/**
 * Tops up the potion merchant's stock toward initial counts. Adds at most `units`
 * items per call, preferring slots with the largest deficit so refill stays balanced.
 * Never exceeds the per-slot initial count, so unbought stock stays unchanged.
 */
export function replenishPotionMerchant(units = 2) {
  const cur = new Map();
  for (const it of _potionMerchantAvailable) {
    const k = `${it.name}|${it.hq ? 1 : 0}`;
    cur.set(k, (cur.get(k) ?? 0) + 1);
  }
  const deficits = [];
  for (const [k, init] of POTION_MERCHANT_INITIAL_COUNTS) {
    const have = cur.get(k) ?? 0;
    if (have < init) deficits.push({ k, missing: init - have });
  }
  deficits.sort((a, b) => b.missing - a.missing);
  let added = 0;
  while (added < units && deficits.some(d => d.missing > 0)) {
    for (const d of deficits) {
      if (added >= units) break;
      if (d.missing <= 0) continue;
      const [name, hqFlag] = d.k.split('|');
      _potionMerchantAvailable.push({ name, hq: hqFlag === '1' });
      d.missing--;
      added++;
    }
  }
}

/** Returns a snapshot of stance merchant stock. */
export function getStanceMerchantStock() { return _stanceMerchantAvailable.map(e => ({ ...e })); }

/** Restores stance merchant stock. */
export function setStanceMerchantStock(stock) { if (stock) _stanceMerchantAvailable = stock.map(_normStock).filter(Boolean); }

// ─────────────────────────────────────────────
//  KNOWN RECIPES — RENDER
// ─────────────────────────────────────────────

function _countPartyItem(itemName) {
    let count = 0;
    for (const member of party) {
        if (member.isEmpty) continue;
        for (const item of member.inventory) {
            if (item && item.name === itemName) count += (item.count ?? 1);
        }
    }
    return count;
}

function _renderKnownAlchemyRecipes() {
    const list = document.getElementById('alchemy-known-recipes-list');
    if (!list) return;
    list.innerHTML = '';
    if (_knownAlchemyRecipes.size === 0) {
        list.innerHTML = '<div class="bench-no-recipes">No recipes discovered yet.</div>';
        return;
    }
    const allNames = [..._knownAlchemyRecipes].reverse();
    const filtered = _alchemyRecipeFilter === 'craftable'
        ? allNames.filter(name => {
              const r = POTIONS_DATA.find(p => p.name === name);
              return r && r.ingredients.every(ing => _countPartyItem(ing.name) >= ing.quantity);
          })
        : allNames;
    if (filtered.length === 0) {
        list.innerHTML = '<div class="bench-no-recipes">No craftable recipes available.</div>';
        return;
    }
    filtered.forEach(resultName => {
        const recipe = POTIONS_DATA.find(p => p.name === resultName);
        if (!recipe) return;
        const entry = document.createElement('div');
        entry.className = 'bench-recipe-entry';
        entry.title = 'Click to load ingredients';

        let canCraft = true;
        let ingredientsHtml = '';
        for (const ing of recipe.ingredients) {
            const hasQty = _countPartyItem(ing.name);
            const isSufficient = hasQty >= ing.quantity;
            if (!isSufficient) canCraft = false;

            const colorClass = isSufficient ? 'bench-ing-have' : 'bench-ing-missing';
            ingredientsHtml += `<span class="bench-recipe-ing ${colorClass}">• ${ing.quantity}× ${ing.name}</span>`;
        }

        entry.innerHTML = `<span class="bench-recipe-name ${canCraft ? 'recipe-ready' : ''}">${resultName}</span>` + ingredientsHtml;
        entry.onclick = () => _autoPopulateAlchemySlots(recipe);
        list.appendChild(entry);
    });
}

function _renderKnownForgeRecipes() {
    const list = document.getElementById('anvil-known-recipes-list');
    if (!list) return;
    list.innerHTML = '';
    if (_knownForgeRecipes.size === 0) {
        list.innerHTML = '<div class="bench-no-recipes">No recipes discovered yet.</div>';
        return;
    }
    const allNames = [..._knownForgeRecipes].reverse();
    const filtered = _forgeRecipeFilter === 'craftable'
        ? allNames.filter(name => {
              const r = FORGE_DATA.find(r => r.name === name);
              return r && r.ingredients.every(ing => _countPartyItem(ing.name) >= ing.quantity);
          })
        : allNames;
    if (filtered.length === 0) {
        list.innerHTML = '<div class="bench-no-recipes">No craftable recipes available.</div>';
        return;
    }
    filtered.forEach(resultName => {
        const recipe = FORGE_DATA.find(r => r.name === resultName);
        if (!recipe) return;
        const entry = document.createElement('div');
        entry.className = 'bench-recipe-entry';
        entry.title = 'Click to load materials';

        let canCraft = true;
        let ingredientsHtml = '';
        for (const ing of recipe.ingredients) {
            const hasQty = _countPartyItem(ing.name);
            const isSufficient = hasQty >= ing.quantity;
            if (!isSufficient) canCraft = false;

            const colorClass = isSufficient ? 'bench-ing-have' : 'bench-ing-missing';
            ingredientsHtml += `<span class="bench-recipe-ing ${colorClass}">• ${ing.quantity}× ${ing.name}</span>`;
        }

        entry.innerHTML = `<span class="bench-recipe-name ${canCraft ? 'recipe-ready' : ''}">${resultName}</span>` + ingredientsHtml;
        entry.onclick = () => _autoPopulateForgeSlots(recipe);
        list.appendChild(entry);
    });
}

function _returnItemToParty(itemName) {
    for (let pi = 0; pi < party.length; pi++) {
        if (party[pi].isEmpty) continue;
        if (equip.addItemToInventory(pi, itemName)) return true;
    }
    return false;
}

function _returnAlchemyIngredients() {
    let returnedAny = false;
    let fullInventory = false;
    for (let i = 0; i < 8; i++) {
        if (_alchemyContents[i]) {
            if (_returnItemToParty(_alchemyContents[i])) {
                _alchemyContents[i] = null;
                returnedAny = true;
            } else {
                fullInventory = true;
            }
        }
    }
    if (fullInventory) {
        showMessage('Not enough room in party inventory to return all items!');
    }
    if (returnedAny) {
        _renderAlchemySlots();
    }
}

function _returnForgeIngredients() {
    let returnedAny = false;
    let fullInventory = false;
    for (let i = 0; i < 8; i++) {
        if (_forgeContents[i]) {
            if (_returnItemToParty(_forgeContents[i])) {
                _forgeContents[i] = null;
                returnedAny = true;
            } else {
                fullInventory = true;
            }
        }
    }
    if (fullInventory) {
        showMessage('Not enough room in party inventory to return all items!');
    }
    if (returnedAny) {
        _renderForgeSlots();
    }
}

function _autoPopulateAlchemySlots(recipe) {
    // Move to most recently used
    _knownAlchemyRecipes.delete(recipe.name);
    _knownAlchemyRecipes.add(recipe.name);
    _renderKnownAlchemyRecipes();

    // Return any existing ingredient slot contents to inventory
    for (let i = 0; i < 8; i++) {
        if (_alchemyContents[i]) {
            if (_returnItemToParty(_alchemyContents[i])) {
                _alchemyContents[i] = null;
            }
        }
    }
    // Fill slots from party inventory, ingredient by ingredient.
    // Stacked slots (count > 1) may feed multiple alchemy slots from one inventory entry.
    let slotIdx = 0;
    for (const needed of recipe.ingredients) {
        let remaining = needed.quantity;
        outer: for (const member of party) {
            if (member.isEmpty) continue;
            for (let invIdx = 0; invIdx < member.inventory.length; invIdx++) {
                while (remaining > 0 && slotIdx < 8) {
                    const item = member.inventory[invIdx];
                    if (!item || item.name !== needed.name) break;
                    _alchemyContents[slotIdx++] = item.name;
                    equip.consumeItemAt(member, invIdx, 1);
                    remaining--;
                }
                if (remaining === 0 || slotIdx >= 8) break outer;
            }
        }
    }
    _renderAlchemySlots();
}

function _autoPopulateForgeSlots(recipe) {
    // Move to most recently used
    _knownForgeRecipes.delete(recipe.name);
    _knownForgeRecipes.add(recipe.name);
    _renderKnownForgeRecipes();

    // Return any existing material slot contents to inventory
    for (let i = 0; i < 8; i++) {
        if (_forgeContents[i]) {
            if (_returnItemToParty(_forgeContents[i])) {
                _forgeContents[i] = null;
            }
        }
    }
    // Fill slots from party inventory, ingredient by ingredient.
    // Stacked slots (count > 1) may feed multiple forge slots from one inventory entry.
    let slotIdx = 0;
    for (const needed of recipe.ingredients) {
        let remaining = needed.quantity;
        outer: for (const member of party) {
            if (member.isEmpty) continue;
            for (let invIdx = 0; invIdx < member.inventory.length; invIdx++) {
                while (remaining > 0 && slotIdx < 8) {
                    const item = member.inventory[invIdx];
                    if (!item || item.name !== needed.name) break;
                    _forgeContents[slotIdx++] = item.name;
                    equip.consumeItemAt(member, invIdx, 1);
                    remaining--;
                }
                if (remaining === 0 || slotIdx >= 8) break outer;
            }
        }
    }
    _renderForgeSlots();
}

// ─────────────────────────────────────────────
//  KNOWN RECIPES — PARCHMENT SUBMISSION
// ─────────────────────────────────────────────

const _ALCHEMY_PARCHMENT_TYPES = new Set(['minor-potions', 'party-potions', 'potions']);
const _FORGE_PARCHMENT_TYPES = new Set(['forge-armour', 'forge-weapons', 'essence-armour', 'essence-weapons', 'essence-recipe']);

function _getAlchemyRecipesForParchment(parchmentType) {
    return POTIONS_DATA.filter(p => {
        if (parchmentType === 'minor-potions') return !p.partyPotion && p.name.startsWith('Minor');
        if (parchmentType === 'party-potions') return p.partyPotion;
        if (parchmentType === 'potions') return !p.partyPotion && !p.name.startsWith('Minor');
        return false;
    }).map(p => p.name);
}

function _getForgeRecipesForParchment(parchmentType, recipeName, essenceName) {
    if (parchmentType === 'essence-recipe' && recipeName) {
        return [recipeName];
    }
    if ((parchmentType === 'essence-armour' || parchmentType === 'essence-weapons') && essenceName) {
        return [...new Set(FORGE_DATA
            .filter(item => item.ingredients.some(i => i.name === essenceName))
            .filter(item => parchmentType === 'essence-weapons'
                ? _FORGE_WEAPON_NAMES.has(item.name)
                : !_FORGE_WEAPON_NAMES.has(item.name))
            .map(item => item.name))];
    }
    return FORGE_DATA.filter(item => {
        if (parchmentType === 'forge-weapons') return _FORGE_WEAPON_NAMES.has(item.name);
        if (parchmentType === 'forge-armour') return !_FORGE_WEAPON_NAMES.has(item.name);
        return false;
    }).map(item => item.name);
}

function _submitParchmentToAlchemy(parchmentDef, memberIdx, invIdx) {
    const names = _getAlchemyRecipesForParchment(parchmentDef.parchmentType);
    const newCount = names.filter(n => !_knownAlchemyRecipes.has(n)).length;
    names.forEach(n => {
        _knownAlchemyRecipes.delete(n);
        _knownAlchemyRecipes.add(n);
    });
    party[memberIdx].inventory[invIdx] = null;
    _renderKnownAlchemyRecipes();
    _hideAlchemyParchmentPicker();
    const msg = newCount > 0
        ? `Parchment studied! ${newCount} new recipe${newCount > 1 ? 's' : ''} learned.`
        : 'Parchment studied — all recipes already known.';
    showAlchemyMessage(msg, newCount > 0 ? 'success' : 'info');
    playLearntSound();
}

function _submitParchmentToForge(parchmentDef, memberIdx, invIdx) {
    const names = _getForgeRecipesForParchment(parchmentDef.parchmentType, parchmentDef.recipeName, parchmentDef.essenceName);
    const newCount = names.filter(n => !_knownForgeRecipes.has(n)).length;
    names.forEach(n => {
        _knownForgeRecipes.delete(n);
        _knownForgeRecipes.add(n);
    });
    party[memberIdx].inventory[invIdx] = null;
    _renderKnownForgeRecipes();
    _hideAnvilParchmentPicker();
    const msg = newCount > 0
        ? `Parchment studied! ${newCount} new recipe${newCount > 1 ? 's' : ''} learned.`
        : 'Parchment studied — all recipes already known.';
    showForgeMessage(msg, newCount > 0 ? 'success' : 'info');
    playLearntSound();
}

function _showAlchemyParchmentPicker(x, y) {
    const picker = document.getElementById('alchemy-parchment-picker');
    const grid = document.getElementById('alchemy-parchment-picker-grid');
    grid.innerHTML = '';
    let found = false;
    party.forEach((member, memberIdx) => {
        if (member.isEmpty) return;
        member.inventory.forEach((item, invIdx) => {
            if (!item) return;
            const def = getItemDef(item.name);
            if (!def || def.type !== 'parchment' || !_ALCHEMY_PARCHMENT_TYPES.has(def.parchmentType)) return;
            found = true;
            const slot = document.createElement('div');
            slot.className = 'picker-slot';
            const img = document.createElement('img');
            img.src = asset(def.icon);
            slot.appendChild(img);
            const owner = document.createElement('div');
            owner.className = 'picker-slot-owner';
            const canvas = document.createElement('canvas');
            canvas.width = 14; canvas.height = 14;
            drawPortrait(canvas, member);
            owner.appendChild(canvas);
            slot.appendChild(owner);
            slot.onclick = () => _submitParchmentToAlchemy(def, memberIdx, invIdx);
            equip.attachTooltipListeners(slot, () => ({ name: def.name, description: `Held by ${member.name}. Click to study.` }));
            grid.appendChild(slot);
        });
    });
    if (!found) {
        const msg = document.createElement('div');
        msg.className = 'picker-empty-msg';
        msg.textContent = 'No alchemy parchments in party inventory.';
        grid.appendChild(msg);
    }
    picker.classList.remove('picker-hidden');
    const pw = picker.offsetWidth || 280;
    const ph = picker.offsetHeight || 160;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let lx = x - pw / 2;
    let ly = y - ph - 10;
    if (lx < 10) lx = 10;
    if (lx + pw > vw - 10) lx = vw - pw - 10;
    if (ly < 10) ly = y + 20;
    if (ly + ph > vh - 10) ly = vh - ph - 10;
    picker.style.left = lx + 'px';
    picker.style.top = ly + 'px';
}

function _hideAlchemyParchmentPicker() {
    const picker = document.getElementById('alchemy-parchment-picker');
    if (picker) picker.classList.add('picker-hidden');
}

/**
 * Shows the visual parchment viewer for one or more forge recipes.
 * @param {string[]} recipeNames - array of recipe names to display
 */
function _showParchmentViewer(recipeNames) {
    const overlay = document.getElementById('parchment-viewer-overlay');
    const content = document.getElementById('parchment-viewer-content');
    if (!overlay || !content) return;

    content.innerHTML = '';
    const recipes = recipeNames.map(n => FORGE_DATA.find(r => r.name === n)).filter(Boolean);
    if (recipes.length === 0) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'essence-parchment-wrapper';

    const parchment = document.createElement('div');
    parchment.className = 'essence-parchment';

    recipes.forEach((recipe, i) => {
        const headerContainer = document.createElement('div');
        headerContainer.className = 'parchment-header';
        headerContainer.innerHTML = `
            <h3 class="parchment-title">${recipe.name}</h3>
            <div class="parchment-subtitle">Ancient Crafting Recipe</div>
        `;
        parchment.appendChild(headerContainer);

        const ingredientsList = document.createElement('div');
        ingredientsList.className = 'parchment-ingredients';

        recipe.ingredients.forEach(ing => {
            const itemDef = getItemDef(ing.name);
            if (!itemDef) return;

            const itemDiv = document.createElement('div');
            itemDiv.className = 'parchment-item';
            itemDiv.innerHTML = `
                <img src="${asset(itemDef.icon)}" alt="${ing.name}">
                <div class="parchment-item-info">
                    <span class="parchment-item-name">${ing.name}</span>
                    <span class="parchment-item-qty">Quantity: ${ing.quantity}</span>
                </div>
            `;
            ingredientsList.appendChild(itemDiv);
        });

        parchment.appendChild(ingredientsList);

        if (i < recipes.length - 1) {
            const divider = document.createElement('hr');
            divider.className = 'parchment-divider';
            parchment.appendChild(divider);
        }
    });

    const footer = document.createElement('div');
    footer.className = 'parchment-footer';
    footer.textContent = "The monster's scribbles are hard to read, but the instructions are clear.";
    parchment.appendChild(footer);

    wrapper.appendChild(parchment);
    content.appendChild(wrapper);

    overlay.classList.remove('merchant-hidden');
}

function _showAnvilParchmentPicker(x, y) {
    const picker = document.getElementById('anvil-parchment-picker');
    const grid = document.getElementById('anvil-parchment-picker-grid');
    grid.innerHTML = '';
    let found = false;
    party.forEach((member, memberIdx) => {
        if (member.isEmpty) return;
        member.inventory.forEach((item, invIdx) => {
            if (!item) return;
            const def = getItemDef(item.name);
            if (!def || def.type !== 'parchment') return;
            if (_FORGE_PARCHMENT_TYPES.has(def.parchmentType)) {
                found = true;
                const slot = document.createElement('div');
                slot.className = 'picker-slot';
                const img = document.createElement('img');
                img.src = asset(def.icon);
                slot.appendChild(img);
                const owner = document.createElement('div');
                owner.className = 'picker-slot-owner';
                const canvas = document.createElement('canvas');
                canvas.width = 14; canvas.height = 14;
                drawPortrait(canvas, member);
                owner.appendChild(canvas);
                slot.appendChild(owner);
                slot.onclick = () => _submitParchmentToForge(def, memberIdx, invIdx);
                equip.attachTooltipListeners(slot, () => ({ name: def.name, description: `Held by ${member.name}. Click to study.` }));
                grid.appendChild(slot);
            }
        });
    });
    if (!found) {
        const msg = document.createElement('div');
        msg.className = 'picker-empty-msg';
        msg.textContent = 'No forge parchments in party inventory.';
        grid.appendChild(msg);
    }
    picker.classList.remove('picker-hidden');
    const pw = picker.offsetWidth || 280;
    const ph = picker.offsetHeight || 160;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let lx = x - pw / 2;
    let ly = y - ph - 10;
    if (lx < 10) lx = 10;
    if (lx + pw > vw - 10) lx = vw - pw - 10;
    if (ly < 10) ly = y + 20;
    if (ly + ph > vh - 10) ly = vh - ph - 10;
    picker.style.left = lx + 'px';
    picker.style.top = ly + 'px';
}

function _hideAnvilParchmentPicker() {
    const picker = document.getElementById('anvil-parchment-picker');
    if (picker) picker.classList.add('picker-hidden');
}

// ─────────────────────────────────────────────
//  SAVE / RESTORE
// ─────────────────────────────────────────────

/**
 * Capture this module's world state for a future save system. Pure getter —
 * no side effects, no orchestration. Pair with `restoreWorldState`.
 */
export function captureWorldState() {
    return {
        flags: getWorldFlags(),
        merchantStock: getMerchantStock(),
        potionMerchantStock: getPotionMerchantStock(),
        stanceMerchantStock: getStanceMerchantStock(),
        knownAlchemyRecipes: [..._knownAlchemyRecipes],
        knownForgeRecipes: [..._knownForgeRecipes],
        eggEmptied: Array.from(_eggEmptiedSet),
        containerContents: _containerContentsPersistence,
    };
}

export function restoreWorldState(data) {
    if (!data) return;
    setWorldFlags(data.flags ?? null);
    if (data.merchantStock) setMerchantStock(data.merchantStock);
    if (data.potionMerchantStock) setPotionMerchantStock(data.potionMerchantStock);
    if (data.stanceMerchantStock) setStanceMerchantStock(data.stanceMerchantStock);
    if (data.knownAlchemyRecipes) data.knownAlchemyRecipes.forEach(r => _knownAlchemyRecipes.add(r));
    if (data.knownForgeRecipes) data.knownForgeRecipes.forEach(r => _knownForgeRecipes.add(r));
    if (data.eggEmptied) _eggEmptiedSet = new Set(data.eggEmptied);
    if (data.containerContents) _containerContentsPersistence = data.containerContents;
}
