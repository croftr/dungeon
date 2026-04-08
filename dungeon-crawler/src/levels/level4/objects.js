import { asset } from '../../assets.js';

// ─────────────────────────────────────────────────────────────────────────────
//  LEVEL 4 – The Forgotten Vault
//  Object/container/portal placement.
//  Called by spawnObjectsForLevel() in objects.js with a ctx containing all
//  helper functions and level-state flags.
// ─────────────────────────────────────────────────────────────────────────────

export function spawnLevel4Objects(ctx) {
    const {
        group, loader,
        addPortal, addTrap1, addChest, addCustomNPC
    } = ctx;

    // ── Blue Portal ───────────────────────────────────────────────────────────
    // Moved to the south wall of the entry room — nudged south towards the wall.
    // Transports party to level 0 (col 11, row 13), facing north.
    addPortal(group, loader, 5, 10, 0, 0, 0, 0.4, 13, 11, 0);

    // ── Otter NPC ─────────────────────────────────────────────────────────────
    // Stands next to the blue portal, plays audio when clicked.
    addCustomNPC(group, loader, 4, 10, asset('/npcs/otter/Meshy_AI_Animation_Idle_withSkin.glb'), null, 0.55, -Math.PI / 2, 0, 0, null, 2, asset('/npcs/otter/post-minotaur.mp3'), asset('/npcs/otter/talking.glb'), asset('/npcs/otter/post-mino-bark.mp3'));

    // ── Trap ──────────────────────────────────────────────────────────────────
    // Centre of the narrow passage — guards the route to the vault.
    addTrap1(group, loader, 5, 5);

    // ── Chest ─────────────────────────────────────────────────────────────────
    // North-east corner of the vault room — contains Aether-Glass Silt.
    addChest(group, loader, 8, 1, 0, -0.8, ['Aether-Glass Silt']);
    
    // ── Decorations ───────────────────────────────────────────────────────────
    if (ctx.addDecoration) {
        // Skull column in the demon's room — nudged south-east within its cell.
        ctx.addDecoration(group, loader, 14, 5, 0, asset('/items/skull-column.glb'), 0.65, true, 0.5, 0.5, 0);

        // Torture statue — nudged west and slightly further north within the cell.
        ctx.addDecoration(group, loader, 1, 1, Math.PI / 3, asset('/items/torture-statue.glb'), 0.65, true, -0.3, -0.3, 0);

        // Cauldron in the centre of the lizard-man vault room, shifted back from the passage entrance.
        ctx.addDecoration(group, loader, 5, 2, 0, asset('/items/cauldron.glb'), 0.5, true, 0, -0.5, 0);
    }
}
