import * as THREE from 'three';
import { gltfLoader as _gltfLoader } from './gltf-loader.js';
import { CELL, dungeonMap, CELL_FLOOR, CELL_PORTCULLIS, cellToWorld, buildLevel, level2Map } from './map.js';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup, isInFrontOfPlayer, player, FACING_ANGLES, setPlayerFrozen } from './player.js';
import { showMessage, drawMinimap, updateStatus } from './minimap.js';
import { getItemDef } from './items.js';
import { party, drawPortrait, resurrectAll, partyGold, removeGold, addGold, refreshPartyCards, setHp, applyStatusEffect } from './party.js';
import { addLogEntry } from './battle-log.js';
import { playHealSound, playBoneSound, playPortalSound, playShopkeeperSound, playAlchemySound, playAlchemyFailSound, playAnvilSound, playKeyLockSound, playGateOpeningSound, playItemSound, playChestOpenSound, playWeaponRackSound, playSpellCabinetSound, playButtonClickSound, playTrapSound, playSuccessSound, playSoundByUrl } from './audio.js';
import MERCHANT_DATA from './data/merchant.json';
import POTION_MERCHANT_DATA from './data/potion-merchant.json';
import POTIONS_DATA from './data/items/potions.json';
import FORGE_DATA from './data/forge.json';
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
import { showNpcChoice, openQuestDialog, renderMerchantQuestPanel } from './quest.js';

export const objects = [];
export const interactables = [];

const _clickRaycaster = new THREE.Raycaster();
const _clickMouse = new THREE.Vector2();

const _mixers = [];
const _intervals = [];

export function updateObjects(dt) {
    for (const mixer of _mixers) mixer.update(dt);
}

// ─────────────────────────────────────────────
//  SARCOPHAGUS STATE
// ─────────────────────────────────────────────
let _mummyGateOpened = false;
let _starterGateOpened = false; // persists across level reloads — once open, never re-closes
let _starterPortalEnabled = false;
// Crystal shrine state: 0=empty, 1=red crystal placed, 2=red+blue placed
let _crystalShrineState = 0;
let _crystalShrineMesh = null;
let _crystalShrineScene = null;
let _crystalShrineLoader = null;
let _crystalShrineParams = null;
let _disabledPortalMesh = null;
let _partyConfirmNPCModel = null; // true once the player confirms — prevents re-triggering
let _starterGate = null; // portcullis behind the party-confirm NPC; opens only via dialogue
let _level2PortcullisOpened = false;
let _level2GiantPortcullisOpened = false;
let _level2HoleClosed = false;
let _npcMixer = null;
let _npcIdleAction = null;
let _npcTalkAction = null;

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
const MERCHANT_STOCK = MERCHANT_DATA.stock;
const POTION_MERCHANT_STOCK = POTION_MERCHANT_DATA.stock;

// Items still available for sale (items bought are removed permanently)
let _merchantAvailable = [...MERCHANT_STOCK];
let _potionMerchantAvailable = [...POTION_MERCHANT_STOCK];

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

const FORGE_SLOTS = 9; // 8 materials + 1 result
const _forgeContents = Array(FORGE_SLOTS).fill(null);
let _forgeModalOpen = false;

// ─────────────────────────────────────────────
//  SAVE GAME — container tracking
// ─────────────────────────────────────────────
let _nextContainerId = 0;
let _pendingContainerOverrides = null;

// ─────────────────────────────────────────────
//  TRAP STATE
// ─────────────────────────────────────────────
// Stores "row,col" keys of traps that have been disarmed
const _trapDisarmedSet = new Set();
let _activeTrapObj = null; // the trap mesh currently showing the disarm modal

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
            (shrineLootOverlay && !shrineLootOverlay.classList.contains('chest-hidden'))
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
                        const trapDoor = objects.find(o => o.name === 'Portcullis' && o.gridRow === 1 && o.gridCol === 10);
                        if (trapDoor) openPortcullis(trapDoor);
                    } else {
                        showMessage("You can't reach that from here.");
                    }
                } else if (obj.userData.target === 'demon_room') {
                    // Player at (18, 3) facing west presses button on east face of col-2 wall
                    if (isInFrontOfPlayer(18, 2, 1)) {
                        playButtonClickSound();
                        _animateButtonPress(obj);
                        const vaultDoor = objects.find(o => o.name === 'Portcullis' && o.gridRow === 17 && o.gridCol === 2);
                        if (vaultDoor) openPortcullis(vaultDoor);
                    } else {
                        showMessage("You can't reach that from here.");
                    }
                } else if (obj.userData.target === 'close_hole') {
                    if (isInFrontOfPlayer(16, 28, 1)) {
                        playButtonClickSound();
                        if (!_level2HoleClosed) {
                            _animateButtonPress(obj);
                            _level2HoleClosed = true;
                            dungeonMap[17][23] = CELL_FLOOR;
                            level2Map[17][23] = CELL_FLOOR;
                            buildLevel(objectsGroup.parent);
                            showMessage("You hear mechanisms grinding. The pit is closed.");
                        } else {
                            showMessage("The hole is already closed.");
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
                } else {
                    // Check if player is facing the wall at (8, 8) from (8, 7)
                    if (isInFrontOfPlayer(8, 8, 1)) {
                        playButtonClickSound();
                        _animateButtonPress(obj);
                        // Hardcoded portcullis open
                        const p = objects.find(o => o.name === 'Portcullis' && o.gridRow === 7 && o.gridCol === 7);
                        if (p) openPortcullis(p);
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
                    // Check live minotaur state — works whether it died this session
                    // or was already dead when the level loaded.
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
                    openShrineLootModal(obj);
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

                    const isTreemanTransition = (targetLevel === 2 && window.currentLevel === 0);
                    const isMinotaurTransition = (targetLevel === 3 && window.currentLevel === 1);

                    showMessage("You step into the swirling blue portal...");
                    playPortalSound();

                    // Transport the player immediately
                    if (window.loadLevel) window.loadLevel(targetLevel);

                    if (isTreemanTransition) {
                        // Go straight to Treeman cutscene — no portal video for the starter room portal
                        if (window.playTreemanVideo && !window.hasSeenTreemanVideo) {
                            window.playTreemanVideo();
                        }
                    } else if (isMinotaurTransition && window.playPortalVideo) {
                        // Play the portal animation when leaving level 1 for level 3
                        window.playPortalVideo();
                    }
                } else {
                    showMessage("Step closer to the portal to enter.");
                }
                break;
            } else if (obj.userData.isShop) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    if (obj.userData.greetingCallback) {
                        obj.userData.greetingCallback();
                    } else {
                        playShopkeeperSound();
                    }
                    openMerchantModal(obj.userData.shopType || 'weapons', obj.userData.questNpcId || null);
                } else {
                    showMessage("The merchant watches you from behind the counter.");
                }
                break;
            } else if (obj.userData.isDialogueNPC) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 3 && distCol <= 3) {
                    showMessage(obj.userData.dialogue || '...');
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
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    openAlchemyModal();
                } else {
                    showMessage("You can't reach the workshop from here.");
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
                            if (p.gridRow === 15 && p.gridCol === 9) {
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
                                        _level2GiantPortcullisOpened = true;
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

                            let keyFound = false;
                            for (let i = 0; i < party.length; i++) {
                                if (party[i] && !party[i].isEmpty && party[i].inventory) {
                                    const invIndex = party[i].inventory.findIndex(item => item && item.name === 'Bronze Key');
                                    if (invIndex !== -1) {
                                        keyFound = true;
                                        party[i].inventory[invIndex] = null;
                                        break;
                                    }
                                }
                            }

                            if (keyFound) {
                                showMessage("You use the Bronze Key. The portcullis grinds open.");
                                playKeyLockSound();
                                setTimeout(() => {
                                    openPortcullis(p);
                                    if (window.currentLevel === 2 && p.gridRow === 8 && p.gridCol === 7) {
                                        _level2PortcullisOpened = true;
                                    }
                                }, 400);
                                refreshPartyCards();
                            } else {
                                showMessage("The portcullis is locked. It needs a key.");
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
                    if (_mummyGateOpened) break;

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
                    if (_crystalShrineState === 2) {
                        showMessage("The shrine radiates with brilliant red and blue energy.");
                    } else if (_crystalShrineState === 1) {
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
                            _crystalShrineState = 2;
                            _swapCrystalShrine();
                            showMessage("The portal opens!");
                            if (window.playCrystalShrineRedBlueVideo) {
                                window.playCrystalShrineRedBlueVideo(() => _activateStarterPortal());
                            } else {
                                _activateStarterPortal();
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
                            _crystalShrineState = 1;
                            _swapCrystalShrine();
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
                    const audio = new Audio(asset('/sounds/npcs/welcome-adventure.mp3'));
                    audio.volume = 0.7;
                    audio.play().catch(e => console.error("Audio play failed:", e));
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
                    if (partyFull) {
                        const npcAudio = new Audio(asset('/sounds/npcs/party-chosen.mp3'));
                        npcAudio.volume = 0.8;
                        npcAudio.addEventListener('loadedmetadata', () => {
                            const delay = Math.max(0, (npcAudio.duration - 0.8) * 1000);
                            setTimeout(() => {
                                const overlay = document.getElementById('party-confirm-overlay');
                                if (overlay) overlay.classList.remove('chest-hidden');
                            }, delay);
                        });
                        npcAudio.play().catch(e => console.warn("NPC audio failed:", e));
                    } else {
                        const npcAudio = new Audio(asset('/sounds/npcs/incomplete-party.mp3'));
                        npcAudio.volume = 0.8;
                        npcAudio.play().catch(e => console.warn("NPC audio failed:", e));
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
            _mummyGateOpened = true;

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

            _starterGateOpened = true;
            if (window.playBattlePrepVideo) {
                window.playBattlePrepVideo(() => {
                    if (_starterGate) openPortcullis(_starterGate);
                });
            } else {
                if (_starterGate) openPortcullis(_starterGate);
            }
            // Also ensure the drop button is hidden immediately for good measure
            if (equip.hideDropButton) {
                equip.hideDropButton();
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

}

export function addChest(scene, loader, col, row, rotY, offsetZ = 0, contents = [], modelPath = asset('/items/Meshy_AI_Treasure_Chest_0221184131_texture.glb'), interactive = true, offsetX = 0, title = 'Chest', scale = 0.3) {
    const cid = interactive ? _nextContainerId++ : -1;
    if (interactive && _pendingContainerOverrides && cid in _pendingContainerOverrides) {
        contents = _pendingContainerOverrides[cid];
    }
    loader.load(modelPath, (gltf) => {
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
                    child.userData.title = title;
                    child.userData.containerId = cid;
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
    loader.load(modelPath, (gltf) => {
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
    const modelPath = _crystalShrineState === 2
        ? asset('/items/crystal-shrine/crysta-temple-red-and-blue.glb')
        : _crystalShrineState === 1
            ? asset('/items/crystal-shrine/crysta-temple-red.glb')
            : asset('/items/crystal-shrine/crystal-temple-empty.glb');

    _crystalShrineScene = scene;
    _crystalShrineLoader = loader;
    _crystalShrineParams = { col, row, rotY, scale, offsetX, offsetZ, offsetY };

    loader.load(modelPath, (gltf) => {
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
    _starterPortalEnabled = true;
    if (_disabledPortalMesh) {
        _disabledPortalMesh.traverse((child) => {
            const idx = interactables.indexOf(child);
            if (idx !== -1) interactables.splice(idx, 1);
        });
        if (_disabledPortalMesh.parent) _disabledPortalMesh.parent.remove(_disabledPortalMesh);
        _disabledPortalMesh = null;
    }
    addPortal(objectsGroup, _gltfLoader, 13, 13, 2, Math.PI / 2, 0.85, 0);
    showMessage("The crystal shrine blazes with power — a portal has opened!");
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
    party.forEach((m, i) => {
        if (m.isEmpty || m.isDead) return;
        const dmg = Math.floor(dmgRange.min + Math.random() * (dmgRange.max - dmgRange.min + 1));
        const before = m.hp;
        setHp(i, before - dmg);
        damageMessage += `${m.name} takes ${dmg} damage. `;
    });

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
    _nextContainerId = 0; // reset container IDs for deterministic save/load

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
        addStatue, addPortalActivatorStatue, addPartyConfirmNPC, addDialogueNPC,
        addAnvil, addAlchemyWorkshop, addDroppedTorch, addEtherealEgg, addStairs,
        addTrap1, createWallButton, addArmourStand,
        // Level 1 state flags
        starterPortalEnabled: _starterPortalEnabled,
        starterGateOpened: _starterGateOpened,
        mummyGateOpened: _mummyGateOpened,
        // Level 2 state flags
        level2PortcullisOpened: _level2PortcullisOpened,
        level2GiantPortcullisOpened: _level2GiantPortcullisOpened,
        level2HoleClosed: _level2HoleClosed,
        // Level 3 state flags
        minotaurDead,
        crystalShrineState: _crystalShrineState,
        // State setters (values written back to objects.js module scope)
        setStarterGate: (g) => { _starterGate = g; },
        // Shared refs for custom object loading code in level files
        interactables,
    };

    if (level === 0) spawnLevel0Objects(ctx);
    else if (level === 1) spawnLevel1Objects(ctx);
    else if (level === 2) spawnLevel2Objects(ctx);
    else if (level === 3) spawnLevel3Objects(ctx);
    else if (level === 4) spawnLevel4Objects(ctx);
    else if (level === 5) spawnLevel5Objects(ctx);
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
    else              btn.position.x = protrusionDir * 0.04;
    btn.position.y = -0.2;
    btn.userData = { isButton: true, animAxis: axis, animDir: protrusionDir, ...userData,
                     pressTarget: btn, glowMeshes: [] };
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
    // If starting open, make the cell passable on the map
    if (startOpen && dungeonMap[row]?.[col] === CELL_PORTCULLIS) {
        dungeonMap[row][col] = CELL_FLOOR;
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

function addKeyhole(scene, loader, col, row, rotY, offsetX = 0, offsetZ = 0, targetRow = null, targetCol = null) {
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

function addPortal(scene, loader, col, row, targetLevel, rotY = 0, offsetX = 0, offsetZ = 0) {
    loader.load(asset('/items/Meshy_AI_Blue_Portal_0222102604_texture.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        model.position.set(col * CELL + offsetX, 0.6, row * CELL + offsetZ);
        model.rotation.y = rotY;

        // Add a gentle rotation animation to the portal? Not directly supported here unless we put it in an update loop.
        // We can just add a light for atmosphere.
        const light = new THREE.PointLight(0x0088ff, 4, 4);
        light.position.set(col * CELL + offsetX, 0.6, row * CELL + offsetZ);
        scene.add(light);

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = false;
                child.userData.isPortal = true;
                child.userData.targetLevel = targetLevel;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                interactables.push(child);

                // Fix pixelation by ensuring smooth filtering and max texture resolution across all material maps
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

function addDisabledPortal(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0) {
    loader.load(asset('/items/disabled-portal.glb'), (gltf) => {
        const model = gltf.scene;
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
        _disabledPortalMesh = model;
    });
}

function addPortalActivatorStatue(scene, loader, col, row, rotY = 0, scale = 0.45, initialContents = ['Red Crystal']) {
    _statueGridCells.add(`${row},${col}`); // block player movement through this cell
    const cid = _nextContainerId++;
    let contents = [...initialContents];
    if (_pendingContainerOverrides && cid in _pendingContainerOverrides) {
        contents = _pendingContainerOverrides[cid];
    }
    loader.load(asset('/items/statue1.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(scale);
        model.position.set(col * CELL, 0.02, row * CELL);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isPortalActivatorStatue = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.containerId = cid;
                child.userData.contents = contents;
                interactables.push(child);
            }
        });

        scene.add(model);
    });
}

function addShop(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0, shopType = 'weapons', modelPath = null, options = {}) {
    _shopGridCells.add(`${row},${col}`); // block player movement through this cell
    loader.load(modelPath ?? asset('/npcs/merchant1/merchant-idle.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.5);
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
            loader.load(options.greetingModel, (greetGltf) => {
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

        const greetingCallback = (options.greetingAudio?.length || options.greetingModel) ? () => {
            if (options.greetingAudio?.length) {
                playSoundByUrl(options.greetingAudio[audioIndex % options.greetingAudio.length]);
                audioIndex++;
            }
            if (mixer && idleAction && greetingAction) {
                idleAction.stop();
                greetingAction.reset().play();
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

        scene.add(model);
    });
}





function addWeaponRack(scene, loader, col, row, rotY, offsetX = 0, offsetZ = 0, contents = []) {
    const cid = _nextContainerId++;
    if (_pendingContainerOverrides && cid in _pendingContainerOverrides) {
        contents = _pendingContainerOverrides[cid];
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
                child.userData.containerId = cid;
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
    const cid = _nextContainerId++;
    if (_pendingContainerOverrides && cid in _pendingContainerOverrides) {
        contents = _pendingContainerOverrides[cid];
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
                child.userData.containerId = cid;
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

function addEtherealEgg(scene, loader, col, row, rotY = 0, isActive = false) {
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

function addAnvil(scene, loader, col, row, rotY = 0, offsetX = 0, offsetZ = 0, contents = []) {
    const cid = _nextContainerId++;
    if (_pendingContainerOverrides && cid in _pendingContainerOverrides) {
        contents = _pendingContainerOverrides[cid];
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
                child.userData.containerId = cid;
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
        scene.add(model);
    });
}

function addDialogueNPC(scene, loader, col, row, dialogue, rotY = 0, offsetX = 0, offsetZ = 0) {
    loader.load(asset('/npcs/otter/Meshy_AI_Animation_Idle_withSkin.glb'), (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.55);
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
            mixer.clipAction(gltf.animations[0]).setLoop(THREE.LoopRepeat).play();
            _mixers.push(mixer);
        }

        scene.add(model);
    });
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
                const img = document.createElement('img');
                img.src = asset(def.icon);
                slot.appendChild(img);

                // Left-click → deposit into chest
                slot.addEventListener('click', () => {
                    if (!_activeChestContents) return;
                    // Scan all 25 chest positions (array may be shorter than 25 if not all slots used)
                    const CHEST_SIZE = 25;
                    let freeIdx = -1;
                    for (let ci = 0; ci < CHEST_SIZE; ci++) {
                        if (_activeChestContents[ci] == null) { freeIdx = ci; break; }
                    }
                    if (freeIdx === -1) {
                        showMessage('The stash is full!');
                        return;
                    }
                    _activeChestContents[freeIdx] = item.name;
                    m.inventory[invIdx] = null;
                    equip.updateEffectiveStats(m);
                    refreshPartyCards();
                    _bindChestSlots(equip, _activeChestSlots, _activeChestContents);
                    _renderChestPartyInv();
                });

                equip.attachTooltipListeners(slot, () => ({ name: item.name }));
            }
        }
        gridEl.appendChild(slot);
    });
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
                });

                equip.attachTooltipListeners(slot, () => ({ name: item.name }));
            }
        }
        gridEl.appendChild(slot);
    });
}

export function openChestModal(chestObj) {
    playChestOpenSound();
    _activeSentLabelId = 'chest-sent-label';
    const overlay = document.getElementById('chest-overlay');
    overlay.classList.remove('chest-hidden');
    document.getElementById('chest-sent-label').textContent = '';
    document.getElementById('chest-title').textContent = chestObj.userData.title || 'Chest';

    const slots = document.querySelectorAll('.chest-slot');
    const contents = chestObj.userData.contents || [];
    _activeChestContents = contents;
    _activeChestSlots = slots;

    // Default to first non-empty party member
    _chestPartyMemberIdx = party.findIndex(m => !m.isEmpty);
    if (_chestPartyMemberIdx === -1) _chestPartyMemberIdx = 0;

    {
        _bindChestSlots(equip, slots, contents);
    }
    _renderChestPartyInv();
}


export function openWeaponRackModal(rackObj) {
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
    loader.load(modelPath, (gltf) => {
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
        for (let i = 0; i < 8; i++) _forgeContents[i] = null;
        _forgeContents[8] = matchedResult;
        showForgeMessage(`Forging complete! You crafted a ${matchedResult}.`, 'success');
        playSuccessSound();
    } else {
        showForgeMessage('These materials cannot be forged into anything.', 'fail');
        playAnvilSound();
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

        const itemName = _forgeContents[i];
        if (!itemName) {
            if (i < 8) {
                slot.onclick = (e) => _showForgeItemPicker(e.clientX, e.clientY, i);
                equip.attachTooltipListeners(slot, () => ({ name: "Empty Material Slot", description: "Click to select a material from your party's inventory." }));
            }
            return;
        }

        const itemDef = getItemDef(itemName);
        if (!itemDef) return;

        slot.classList.add('occupied');
        const img = document.createElement('img');
        img.src = asset(itemDef.icon);
        slot.appendChild(img);

        // Left-click → return to first available party member
        slot.onclick = () => {
            const defaultIdx = party.findIndex(m => !m.isEmpty);
            if (defaultIdx !== -1) {
                const success = equip.addItemToInventory(defaultIdx, itemName);
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
            _showForgeCtxMenu(e.clientX, e.clientY, equip, i, itemDef);
        };

        if (i === 8) {
            equip.attachTooltipListeners(slot, () => _forgeContents[8]
                ? { name: _forgeContents[8], description: 'Click to take into your inventory. Right-click to choose who receives it.' }
                : null);
        } else {
            equip.attachTooltipListeners(slot, () => _forgeContents[i]
                ? { name: _forgeContents[i], description: 'Click to return to inventory. Right-click to choose who receives it.' }
                : null);
        }
    });
}

function _showForgeCtxMenu(x, y, equip, slotIdx, itemDef) {
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
            const success = equip.addItemToInventory(targetIdx, itemDef.name);
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

            const owner = document.createElement('div');
            owner.className = 'picker-slot-owner';
            const canvas = document.createElement('canvas');
            canvas.width = 14;
            canvas.height = 14;
            drawPortrait(canvas, member);
            owner.appendChild(canvas);
            slot.appendChild(owner);

            slot.onclick = () => {
                _forgeContents[slotIdx] = itemName;
                member.inventory[invIdx] = null;
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
    _activeMerchantAvailable = shopType === 'potions' ? _potionMerchantAvailable : _merchantAvailable;
    const title = shopType === 'potions' ? 'Apothecary' : 'Merchant';
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
    _switchMerchantTab('buy');
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

function _renderMerchantShop() {
    const grid = document.getElementById('merchant-grid');
    grid.innerHTML = '';

    {
        _activeMerchantAvailable
            .filter(name => !_merchantBasket.includes(name))
            .forEach(name => {
                const itemDef = getItemDef(name);
                if (!itemDef) return;

                const slot = document.createElement('div');
                slot.className = 'merch-slot';

                const img = document.createElement('img');
                img.src = asset(itemDef.icon);
                slot.appendChild(img);

                const price = document.createElement('div');
                price.className = 'merch-price';
                price.textContent = `${getItemDef(name)?.value ?? '?'}g`;
                slot.appendChild(price);

                slot.addEventListener('click', () => {
                    playItemSound(name);
                    _merchantBasket.push(name);
                    _renderMerchantShop();
                    _renderMerchantBasket();
                    _updateMerchantTotals();
                });

                equip.attachTooltipListeners(slot, () => ({ name }));

                grid.appendChild(slot);
            });
    }
}

function _renderMerchantBasket() {
    const grid = document.getElementById('merchant-basket-grid');
    grid.innerHTML = '';

    {
        _merchantBasket.forEach((name, idx) => {
            const itemDef = getItemDef(name);
            if (!itemDef) return;

            const slot = document.createElement('div');
            slot.className = 'merch-slot';

            const img = document.createElement('img');
            img.src = asset(itemDef.icon);
            slot.appendChild(img);

            const price = document.createElement('div');
            price.className = 'merch-price';
            price.textContent = `${getItemDef(name)?.value ?? '?'}g`;
            slot.appendChild(price);

            // Click basket item → return it to the shop
            slot.addEventListener('click', () => {
                playItemSound(name);
                _merchantBasket.splice(idx, 1);
                _renderMerchantShop();
                _renderMerchantBasket();
                _updateMerchantTotals();
            });

            equip.attachTooltipListeners(slot, () => ({ name }));

            grid.appendChild(slot);
        });
    }
}

function _updateMerchantTotals() {
    const total = _merchantBasket.reduce((sum, name) => sum + (getItemDef(name)?.value ?? 0), 0);

    document.getElementById('merchant-total-val').textContent = total;
    document.getElementById('merchant-gold-val').textContent = partyGold;

    const buyBtn = document.getElementById('merchant-buy-btn');
    buyBtn.disabled = _merchantBasket.length === 0 || partyGold < total;
}

function _buyItems() {
    const total = _merchantBasket.reduce((sum, name) => sum + (getItemDef(name)?.value ?? 0), 0);
    if (partyGold < total) return;

    {
        const boughtItems = [];
        const failedItems = [];

        // Try to add each item to inventory
        for (const itemName of _merchantBasket) {
            let added = false;
            // Try to find a slot in any party member's inventory
            for (let i = 0; i < 4; i++) {
                if (party[i].isEmpty) continue;
                if (equip.addItemToInventory(i, itemName)) {
                    added = true;
                    boughtItems.push(itemName);
                    break;
                }
            }
            if (!added) {
                failedItems.push(itemName);
            }
        }

        // Calculate cost of successfully bought items
        const spent = boughtItems.reduce((sum, name) => sum + (getItemDef(name)?.value ?? 0), 0);

        if (spent > 0) {
            removeGold(spent);
            showMessage(`Bought ${boughtItems.length} items for ${spent} gold.`);
        }

        if (failedItems.length > 0) {
            showMessage(`Could not carry ${failedItems.length} items (inventory full).`);
        }

        // Remove bought items from available stock
        for (const item of boughtItems) {
            const stockIdx = _activeMerchantAvailable.indexOf(item);
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

function _getMerchantSellPrice(name) {
    const def = getItemDef(name);
    if (!def) return 0;
    // Offer 50% of merchant buy price if stocked; otherwise use item base value
    if (MERCHANT_STOCK.includes(name) || POTION_MERCHANT_STOCK.includes(name)) return Math.floor((def.value ?? 0) * 0.5);
    return def.value ?? 0;
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

                const sellPrice = _getMerchantSellPrice(item.name);

                const slot = document.createElement('div');
                slot.className = 'merch-slot';

                const tag = document.createElement('div');
                tag.className = 'merch-char-tag';
                tag.textContent = CHARACTER_LABELS[ci];
                slot.appendChild(tag);

                const img = document.createElement('img');
                img.src = asset(def.icon);
                slot.appendChild(img);

                const price = document.createElement('div');
                price.className = 'merch-price';
                price.textContent = `${sellPrice}g`;
                slot.appendChild(price);

                slot.addEventListener('click', () => {
                    playItemSound(item.name);
                    _merchantSellBasket.push({ charIndex: ci, invIndex: invIdx, name: item.name });
                    _renderMerchantPartyItems();
                    _renderMerchantSellBasket();
                    _updateMerchantSellTotals();
                });

                equip.attachTooltipListeners(slot, () => ({ name: item.name }));

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

            const sellPrice = _getMerchantSellPrice(entry.name);

            const slot = document.createElement('div');
            slot.className = 'merch-slot';

            const img = document.createElement('img');
            img.src = asset(def.icon);
            slot.appendChild(img);

            const price = document.createElement('div');
            price.className = 'merch-price';
            price.textContent = `${sellPrice}g`;
            slot.appendChild(price);

            // Click → return item to party panel
            slot.addEventListener('click', () => {
                playItemSound(entry.name);
                _merchantSellBasket.splice(idx, 1);
                _renderMerchantPartyItems();
                _renderMerchantSellBasket();
                _updateMerchantSellTotals();
            });

            equip.attachTooltipListeners(slot, () => ({ name: entry.name }));

            grid.appendChild(slot);
        });
    }
}

function _updateMerchantSellTotals() {
    const total = _merchantSellBasket.reduce((sum, e) => sum + _getMerchantSellPrice(e.name), 0);

    document.getElementById('merchant-sell-total-val').textContent = total;
    document.getElementById('merchant-sell-gold-val').textContent = partyGold;

    const sellBtn = document.getElementById('merchant-sell-btn');
    sellBtn.disabled = _merchantSellBasket.length === 0;
}

function _sellItems() {
    if (_merchantSellBasket.length === 0) return;

    const total = _merchantSellBasket.reduce((sum, e) => sum + _getMerchantSellPrice(e.name), 0);
    const soldNames = _merchantSellBasket.map(e => e.name);

    // Remove items from inventory (process in reverse index order per character to avoid index shifting)
    const byChar = {};
    for (const entry of _merchantSellBasket) {
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
    showMessage(`Sold ${soldNames.length} item${soldNames.length > 1 ? 's' : ''} for ${total} gold.`);

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
        if (itemName) {
            const itemDef = getItemDef(itemName);
            if (itemDef) {
                slot.classList.add('occupied');
                const img = document.createElement('img');
                img.src = asset(itemDef.icon);
                slot.appendChild(img);

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
        return;
    }

    const target = party[targetIdx];
    const success = equip.addItemToInventory(targetIdx, itemDef.name);
    if (success) {
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
        // Consume all ingredients only on success
        for (let i = 0; i < 8; i++) _alchemyContents[i] = null;
        _alchemyContents[8] = matchedResult;
        showAlchemyMessage(`Transmutation successful! You created a ${matchedResult}.`, 'success');
        playAlchemySound();
    } else {
        // Ingredients are preserved — nothing is consumed
        showAlchemyMessage('The ingredients do not react — nothing happens.', 'fail');
        playAlchemyFailSound();
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

            const itemName = _alchemyContents[i];
            if (!itemName) {
                // Empty slot hint
                if (i < 8) { // Only for ingredient slots, not result
                    slot.onclick = (e) => _showAlchemyItemPicker(e.clientX, e.clientY, i);
                    equip.attachTooltipListeners(slot, () => ({ name: "Empty Ingredient Slot", description: "Click to select an ingredient from your party's inventory." }));
                }
                return;
            }

            const itemDef = getItemDef(itemName);
            if (!itemDef) return;

            slot.classList.add('occupied');
            const img = document.createElement('img');
            img.src = asset(itemDef.icon);
            slot.appendChild(img);

            // Left-click → send to first available party member (remove from academy)
            slot.onclick = () => {
                const defaultIdx = party.findIndex(m => !m.isEmpty);
                if (defaultIdx !== -1) {
                    const success = equip.addItemToInventory(defaultIdx, itemName);
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
                _showAlchemyCtxMenu(e.clientX, e.clientY, equip, i, itemDef);
            };

            // Hover tooltip — result slot gets a "take it" hint
            if (i === 8) {
                equip.attachTooltipListeners(slot, () => _alchemyContents[8]
                    ? { name: _alchemyContents[8], description: 'Click to take into your inventory. Right-click to choose who receives it.' }
                    : null);
            } else {
                equip.attachTooltipListeners(slot, () => _alchemyContents[i]
                    ? { name: _alchemyContents[i], description: 'Click to return to inventory. Right-click to choose who receives it.' }
                    : null);
            }
        });
    }
}

/**
 * Shows a context menu to pick which party member takes the item from alchemy.
 */
function _showAlchemyCtxMenu(x, y, equip, slotIdx, itemDef) {
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
            const success = equip.addItemToInventory(targetIdx, itemDef.name);
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

                // Mini portrait of owner
                const owner = document.createElement('div');
                owner.className = 'picker-slot-owner';
                const canvas = document.createElement('canvas');
                canvas.width = 14;
                canvas.height = 14;
                drawPortrait(canvas, member);
                owner.appendChild(canvas);
                slot.appendChild(owner);

                slot.onclick = () => {
                    // Move item: store string name in alchemy, clear inventory slot
                    _alchemyContents[slotIdx] = itemName;
                    member.inventory[invIdx] = null;
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
    const cid = _nextContainerId++;
    if (_pendingContainerOverrides && cid in _pendingContainerOverrides) {
        contents = _pendingContainerOverrides[cid];
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
                child.userData.containerId = cid;
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
        img.src = asset('/icons/gold_coins.png');
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
        mummyGateOpened: _mummyGateOpened,
        starterGateOpened: _starterGateOpened,
        starterPortalEnabled: _starterPortalEnabled,
        level2PortcullisOpened: _level2PortcullisOpened,
        level2GiantPortcullisOpened: _level2GiantPortcullisOpened,
        level2HoleClosed: _level2HoleClosed,
        disarmedTraps: [..._trapDisarmedSet],
        crystalShrineState: _crystalShrineState,
    };
}

/** Restores gate/portal flags. Call BEFORE spawnObjectsForLevel(). */
export function setWorldFlags(flags) {
    if (!flags) return;
    _mummyGateOpened = flags.mummyGateOpened ?? false;
    _starterGateOpened = flags.starterGateOpened ?? false;
    _starterPortalEnabled = flags.starterPortalEnabled ?? false;
    _level2PortcullisOpened = flags.level2PortcullisOpened ?? false;
    _level2GiantPortcullisOpened = flags.level2GiantPortcullisOpened ?? false;
    _level2HoleClosed = flags.level2HoleClosed ?? false;
    _crystalShrineState = flags.crystalShrineState ?? 0;
    if (_level2HoleClosed) level2Map[17][23] = CELL_FLOOR;
    _trapDisarmedSet.clear();
    if (Array.isArray(flags.disarmedTraps)) {
        for (const key of flags.disarmedTraps) _trapDisarmedSet.add(key);
    }
}

/** Returns a snapshot of merchant stock. */
export function getMerchantStock() { return [..._merchantAvailable]; }

/** Restores merchant stock. */
export function setMerchantStock(stock) { if (stock) _merchantAvailable = [...stock]; }

/** Returns a snapshot of potion merchant stock. */
export function getPotionMerchantStock() { return [..._potionMerchantAvailable]; }

/** Restores potion merchant stock. */
export function setPotionMerchantStock(stock) { if (stock) _potionMerchantAvailable = [...stock]; }

/** Returns container contents keyed by containerId. */
export function getContainerStates() {
    const result = {};
    const seen = new Set();
    for (const obj of interactables) {
        const ud = obj.userData;
        if (ud.containerId === undefined || !ud.contents) continue;
        if (seen.has(ud.containerId)) continue;
        seen.add(ud.containerId);
        result[ud.containerId] = JSON.parse(JSON.stringify(ud.contents));
    }
    return result;
}

/** Sets container content overrides. Call BEFORE spawnObjectsForLevel(). */
export function setPendingContainerOverrides(overrides) {
    _pendingContainerOverrides = overrides ?? null;
}

// ─────────────────────────────────────────────
//  SAVE REGISTRY
// ─────────────────────────────────────────────
import { registerSaveHandler } from './save-registry.js';

registerSaveHandler('world', {
    serialize() {
        return {
            flags: getWorldFlags(),
            merchantStock: getMerchantStock(),
            potionMerchantStock: getPotionMerchantStock(),
        };
    },
    restore(data) {
        setWorldFlags(data.flags ?? null);
        if (data.merchantStock) setMerchantStock(data.merchantStock);
        if (data.potionMerchantStock) setPotionMerchantStock(data.potionMerchantStock);
    },
});
