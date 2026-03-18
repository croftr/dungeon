import json
import os

gear = {
    'head.json': {
        "name": "Ironpeak Dwarf Helm",
        "slot": "head",
        "icon": "/icons/dwarf_helm.png",
        "description": "A powerful dwarf warrior helmet forged from thick iron and bronze. It bears the mark of the Ironpeak clan.",
        "defence": 5,
        "value": 1100,
        "weight": 4.0,
        "statBonuses": {"resilience": 2, "strength": 1}
    },
    'chest.json': {
        "name": "Ironpeak Dwarf Cuirass",
        "slot": "chest",
        "icon": "/icons/dwarf_cuirass.png",
        "description": "A powerful dwarf warrior cuirass adorned with ornate gold trim over impenetrable iron plates.",
        "defence": 8,
        "value": 1800,
        "weight": 8.0,
        "statBonuses": {"resilience": 3, "strength": 2}
    },
    'hands.json': {
        "name": "Ironpeak Dwarf Gauntlets",
        "slot": "hands",
        "icon": "/icons/dwarf_gauntlets.png",
        "description": "Thick iron gauntlets that reinforce a dwarf's grip and shield against mighty blows.",
        "defence": 3,
        "value": 850,
        "weight": 2.5,
        "statBonuses": {"strength": 2}
    },
    'legs.json': {
        "name": "Ironpeak Dwarf Greaves",
        "slot": "legs",
        "icon": "/icons/dwarf_greaves.png",
        "description": "Heavy iron greaves designed to protect a dwarf warrior in the thickest of melee.",
        "defence": 4,
        "value": 1100,
        "weight": 4.0,
        "statBonuses": {"resilience": 2}
    },
    'feet.json': {
        "name": "Ironpeak Dwarf Sabatons",
        "slot": "feet",
        "icon": "/icons/dwarf_sabatons.png",
        "description": "Thick iron sabatons, grounding a dwarf so strongly that they are almost impossible to knock over.",
        "defence": 3,
        "value": 850,
        "weight": 2.5,
        "statBonuses": {"resilience": 1, "strength": 1}
    },
    'weapons.json': {
        "name": "Ironpeak Battleaxe",
        "slot": "hand",
        "type": "weapon",
        "attackType": "swipe",
        "baseDamage": 14,
        "icon": "/icons/dwarf_battleaxe.png",
        "description": "A heavy, double-bladed dwarf battleaxe inscribed with glowing iron runes of power.",
        "value": 2200,
        "weight": 6.0,
        "scaling": {"strength": 0.8},
        "statBonuses": {"strength": 2}
    },
    'shields.json': {
        "name": "Ironpeak Round Shield",
        "slot": "hand",
        "type": "weapon",
        "attackType": "shield-bash",
        "baseDamage": 5,
        "icon": "/icons/dwarf_shield.png",
        "description": "A powerful dwarf round shield tightly bound in iron, featuring a heavy steel boss capable of crushing skulls.",
        "defence": 5,
        "blockChance": 0.15,
        "value": 1400,
        "weight": 4.0,
        "statBonuses": {"resilience": 2}
    },
    'cloak.json': {
        "name": "Ironpeak Bear Cloak",
        "slot": "cloak",
        "icon": "/icons/dwarf_cloak.png",
        "description": "A heavy cloak woven from the fur of a dire bear, bound with large iron clasps. Provides warmth and protection.",
        "defence": 2,
        "value": 750,
        "weight": 1.5,
        "statBonuses": {"resilience": 1, "strength": 1}
    }
}

for filename, item_data in gear.items():
    filepath = os.path.join("src", "data", "items", filename)
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        data.append(item_data)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        print(f"Updated {filename}")
    else:
        print(f"File not found: {filepath}")
