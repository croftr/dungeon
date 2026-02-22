import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CELL, dungeonMap, CELL_FLOOR } from './map.js';
import { Tween, Easing } from '@tweenjs/tween.js';
import { tweenGroup, isInFrontOfPlayer, player } from './player.js';
import { showMessage } from './minimap.js';
import { getItemDef } from './items.js';
import { party, resurrectAll } from './party.js';
import { playHealSound, playBoneSound, playPortalSound } from './audio.js';

export const objects = [];

let objectsGroup = new THREE.Group();

export function clearObjects(scene) {
    scene.remove(objectsGroup);
    objectsGroup = new THREE.Group();
    scene.add(objectsGroup);
}

export function initObjects(scene, camera) {
    const gltfLoader = new GLTFLoader();
    scene.add(objectsGroup);

    spawnObjectsForLevel(gltfLoader);

    window.addEventListener('click', (e) => {
        // Raycast
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(objectsGroup.children, true);

        for (let hit of intersects) {
            let obj = hit.object;
            if (obj.userData.isButton) {
                // Check if player is facing the wall at (8, 8) from (8, 7)
                if (isInFrontOfPlayer(8, 8, 1)) {
                    // Small button press animation
                    new Tween(obj.position)
                        .to({ x: 0.01 }, 100)
                        .easing(Easing.Quadratic.Out)
                        .chain(new Tween(obj.position).to({ x: 0.04 }, 100).easing(Easing.Quadratic.In))
                        .start();
                    // Hardcoded portcullis open
                    const p = objects.find(o => o.name === 'Portcullis');
                    if (p) openPortcullis(p);
                } else {
                    showMessage("You can't reach that from here.");
                }
                break;
            } else if (obj.userData.isChest) {
                // Check if player is standing on the same square as the chest
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);

                if (isOnSameSquare) {
                    openChestModal(obj);
                } else {
                    showMessage("Stand on the chest to open it.");
                }
                break;
            } else if (obj.userData.isCrystal) {
                // Check if player is standing on the same square as the crystal
                const isOnSameSquare = (player.gridRow === obj.userData.gridRow && player.gridCol === obj.userData.gridCol);

                if (isOnSameSquare) {
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
                    showMessage("Stand on the crystals to feel their power.");
                }
                break;
            } else if (obj.userData.isBonePile) {
                // Check if player is near the bone pile
                if (isInFrontOfPlayer(obj.userData.gridRow, obj.userData.gridCol, 1)) {
                    playBoneSound();
                    const messages = [
                        "A pile of bleached human bones. It seems this adventurer didn't make it far.",
                        "These bones are old and brittle. A rusted dagger lies nearby, long ago surrendered.",
                        "You find a tattered leather pouch among the ribs, but it's empty.",
                        "The skull has a clean indentation. Something powerful struck this poor soul."
                    ];
                    showMessage(messages[Math.floor(Math.random() * messages.length)]);
                } else {
                    showMessage("A grim pile of bones lies just out of reach.");
                }
            } else if (obj.userData.isPortal) {
                const distRow = Math.abs(player.gridRow - obj.userData.gridRow);
                const distCol = Math.abs(player.gridCol - obj.userData.gridCol);
                if (distRow <= 1 && distCol <= 1) {
                    showMessage("You step into the swirling blue portal...");
                    playPortalSound();
                    if (window.loadLevel) window.loadLevel(obj.userData.targetLevel);
                } else {
                    showMessage("Step closer to the portal to enter.");
                }
                break;
            }
        }
    });

    // Modal Close Logic
    const closeBtn = document.getElementById('chest-close');
    if (closeBtn) {
        closeBtn.onclick = () => {
            document.getElementById('chest-overlay').classList.add('chest-hidden');
        };
    }
}

export function spawnObjectsForLevel() {
    const gltfLoader = new GLTFLoader();
    const level = window.currentLevel || 1;
    objects.length = 0; // clear logical array

    if (level === 1) {
        // Chest in the starter room
        addChest(objectsGroup, gltfLoader, 11, 13, 0, 0.7, ['Leather Boots', 'Steel Arrows', 'Poison Arrows']);
        // New Chest at the end of the long passage
        addChest(objectsGroup, gltfLoader, 7, 1, 0, -0.7, []);
        // Crystals in the starter room
        addCrystals(objectsGroup, gltfLoader, 9, 11, 0, -0.7);
        // Bone pile in the passage
        addBonePile(objectsGroup, gltfLoader, 1, 27);
        // Bone pile in the starter room area
        addBonePile(objectsGroup, gltfLoader, 11, 12);

        // Portal to Level 2
        // Positioned at col 13, row 13 against the East wall.
        // It's on an East wall, so rotate it Math.PI / 2 radians to face West (inward to the room).
        addPortal(objectsGroup, gltfLoader, 13, 13, 2, Math.PI / 2, 0.85, 0);

        // Portcullis: Row 7, Col 7.
        const portcullis = {
            name: 'Portcullis',
            path: '/items/Meshy_AI_Iron_Portcullis_0221184348_texture.glb',
            gridRow: 7,
            gridCol: 7,
            x: 7 * CELL,
            z: 7 * CELL,
            scale: 0.8,
            isOpen: false
        };
        gltfLoader.load(portcullis.path, (gltf) => {
            const model = gltf.scene;
            model.scale.set(1.15, 0.9, 1.15); // scaled to fit the corridor
            model.position.set(portcullis.x, 1.1, portcullis.z);
            objectsGroup.add(model);
            portcullis.mesh = model;
        });
        objects.push(portcullis);

        // Button for portcullis
        const buttonContainer = new THREE.Group();
        const plateGeo = new THREE.BoxGeometry(0.05, 0.3, 0.2);
        const plateMat = new THREE.MeshLambertMaterial({ color: 0x443322 });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        buttonContainer.add(plate);

        const btnGeo = new THREE.BoxGeometry(0.08, 0.12, 0.12);
        const btnMat = new THREE.MeshLambertMaterial({ color: 0xaa2222 });
        const btn = new THREE.Mesh(btnGeo, btnMat);
        btn.position.x = 0.04;
        btn.userData = { isButton: true, target: 'portcullis' };
        buttonContainer.add(btn);

        buttonContainer.position.set(8 * CELL - 1.0, 1.25, 8 * CELL);
        objectsGroup.add(buttonContainer);

    } else if (level === 2) {
        // Only a portal back to Level 1
        addPortal(objectsGroup, gltfLoader, 3, 3, 1);
    }
}

function addPortal(scene, loader, col, row, targetLevel, rotY = 0, offsetX = 0, offsetZ = 0) {
    loader.load('/items/Meshy_AI_Blue_Portal_0222102604_texture.glb', (gltf) => {
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
            }
        });

        scene.add(model);
    });
}

function addChest(scene, loader, col, row, rotY, offsetZ = 0, contents = []) {
    loader.load('/items/Meshy_AI_Treasure_Chest_0221184131_texture.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.3);
        model.position.set(col * CELL, 0.23, row * CELL + offsetZ);
        model.rotation.y = rotY;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isChest = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.contents = contents; // Link contents to the chest object
            }
        });

        scene.add(model);
    });
}

function addCrystals(scene, loader, col, row, rotY, offsetX = 0) {
    loader.load('/items/Meshy_AI_Crystals_0221193313_texture.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(0.7);
        // Positioned at 0.5 to touch the floor
        model.position.set(col * CELL + offsetX, 0.5, row * CELL);
        model.rotation.y = rotY;

        // Add a mystical light source at the crystals
        const light = new THREE.PointLight(0x00ffff, 5, 3);
        light.position.set(col * CELL + offsetX, 0.8, row * CELL);
        scene.add(light);

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isCrystal = true;
                child.userData.gridRow = row;
                child.userData.gridCol = col;
                child.userData.light = light; // Store light reference for animation

                if (child.material) {
                    // Give them a nice cyan mystical glow
                    child.material.emissive = new THREE.Color(0x00ffff);
                    child.material.emissiveIntensity = 0.5;
                }
            }
        });

        scene.add(model);
    });
}

function openPortcullis(p) {
    if (p.isOpen) return;
    p.isOpen = true;
    showMessage("The portcullis slowly grinds open...");

    // Play a heavy grinding sound if available (simulated)
    const grindAudio = new Audio('/sounds/actions/bash.mp3'); // or a better sound if found
    grindAudio.volume = 0.5;
    grindAudio.play().catch(e => { });

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

function openChestModal(chestObj) {
    const overlay = document.getElementById('chest-overlay');
    overlay.classList.remove('chest-hidden');

    const slots = document.querySelectorAll('.chest-slot');
    const contents = chestObj.userData.contents || [];

    const firstMember = party.find(m => !m.isEmpty);

    slots.forEach((slot, i) => {
        slot.innerHTML = '';
        slot.classList.remove('occupied');
        slot.onclick = null; // Clear previous handlers

        if (!firstMember) return;

        const itemName = contents[i];
        if (itemName) {
            const itemDef = getItemDef(itemName);
            if (!itemDef) return;

            slot.classList.add('occupied');
            const img = document.createElement('img');
            img.src = itemDef.icon;
            img.title = itemDef.name;
            slot.appendChild(img);

            slot.onclick = () => {
                import('./equipment.js').then(m => {
                    const success = m.addItemToInventory(firstMember.id, itemDef.name);
                    if (success) {
                        showMessage(`${firstMember.name} picks up ${itemDef.name}.`);
                        // Remove from chest data
                        contents[i] = null;
                        // Update UI
                        slot.innerHTML = '';
                        slot.classList.remove('occupied');
                        slot.onclick = null;
                        overlay.classList.add('chest-hidden');
                    } else {
                        showMessage("Inventory is full!");
                    }
                });
            };
        }
    });
}

function addBonePile(scene, loader, col, row) {
    loader.load('/items/Meshy_AI_Bone_pile_0221211647_texture.glb', (gltf) => {
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
            }
        });

        scene.add(model);
    });
}
