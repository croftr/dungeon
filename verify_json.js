const fs = require('fs');
const files = [
  'dungeon-crawler/src/data/monsters.json',
  'dungeon-crawler/src/data/items.json',
  'dungeon-crawler/src/data/spells.json',
  'dungeon-crawler/src/data/status-effects.json',
  'dungeon-crawler/src/data/characters.json',
  'dungeon-crawler/src/data/potions.json'
];

files.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    JSON.parse(content);
    console.log(file + ' is valid JSON.');
  } catch (e) {
    console.error('Error parsing ' + file + ':', e.message);
    process.exit(1);
  }
});
