
const fs = require('fs');
const path = require('path');

const dataDir = './src/data';
const itemsDir = path.join(dataDir, 'items');

// Craftable items
const forgeRes = JSON.parse(fs.readFileSync(path.join(dataDir, 'forge.json'), 'utf8'));
const craftableItems = new Set(forgeRes.map(r => r.name));

// Hall of Heroes items
const hallOfHeroesItems = new Set([
    'Aethelgard Archmage Hood',
    'Aethelgard Archmage Robe',
    'Aethelgard Archmage Cuffs',
    'Aethelgard Archmage Leggings',
    'Aethelgard Archmage Slippers',
    'Aethelgard Grand Staff',
    'Aethelgard Archmage Mantle',
    'Seraphic Grace Cowl',
    'Seraphic Grace Gown',
    'Seraphic Grace Mitts',
    'Seraphic Grace Skirt',
    'Seraphic Grace Sandals',
    'Seraphic Grace Scepter',
    'Seraphic Grace Stole',
    'Seraphic Spellbook',
    'Mountain Stalker Hood',
    'Mountain Stalker Trenchcoat',
    'Mountain Stalker Gloves',
    'Mountain Stalker Trousers',
    'Mountain Stalker Boots',
    'Mountain Stalker Crossbow',
    'Mountain Stalker Heavy Cloak',
    'Sylvan Elderwood Hood',
    'Sylvan Elderwood Tunic',
    'Sylvan Elderwood Bracers',
    'Sylvan Elderwood Leggings',
    'Sylvan Elderwood Boots',
    'Sylvan Elderwood Bow',
    'Sylvan Elderwood Cloak',
    'Celestial Vindicator Helm',
    'Celestial Vindicator Cuirass',
    'Celestial Vindicator Gauntlets',
    'Celestial Vindicator Leggings',
    'Celestial Vindicator Sabatons',
    'Celestial Vindicator Greatmace',
    'Celestial Vindicator Cloak',
    'Ironpeak Dwarf Helm',
    'Ironpeak Dwarf Cuirass',
    'Ironpeak Dwarf Gauntlets',
    'Ironpeak Dwarf Greaves',
    'Ironpeak Dwarf Sabatons',
    'Ironpeak Battleaxe',
    'Ironpeak Round Shield',
    'Ironpeak Bear Cloak',
    'Amethyst Wardancer Helm',
    'Amethyst Wardancer Cuirass',
    'Amethyst Wardancer Bracers',
    'Amethyst Wardancer Leggings',
    'Amethyst Wardancer Sabatons',
    'Amethyst Wardancer Dagger',
    'Amethyst Wardancer Cloak',
    'Storm-Reaver Helmet',
    'Storm-Reaver Harness',
    'Storm-Reaver Bracers',
    'Storm-Reaver Greaves',
    'Storm-Reaver Sabatons',
    'Storm-Reaver Greataxe',
    'Storm-Reaver Pelt'
]);

const categories = [
    'weapons.json',
    'chest.json',
    'head.json',
    'legs.json',
    'feet.json',
    'hands.json',
    'shields.json',
    'cloak.json',
    'belt.json',
    'neck.json',
    'rings.json',
    'ammo.json'
];

let allStock = [];

categories.forEach(file => {
    const filePath = path.join(itemsDir, file);
    if (fs.existsSync(filePath)) {
        const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        items.forEach(item => {
            if (!craftableItems.has(item.name) && !hallOfHeroesItems.has(item.name)) {
                allStock.push(item.name);
            }
        });
    }
});

// Remove duplicates and sort
allStock = [...new Set(allStock)].sort();

console.log(JSON.stringify({ stock: allStock }, null, 4));
