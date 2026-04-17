let contents = [
    { name: "Iron Sword", quantity: 1 },
    "Potion",
    { name: "Gold Coins", quantity: 100 },
    null
];

const items = contents.filter(item => {
    if (!item) return false;
    if (typeof item === 'string') return true;
    if (typeof item === 'object' && item.name) return true;
    return false;
});

items.sort((a, b) => {
    const nameA = typeof a === 'string' ? a : a.name;
    const nameB = typeof b === 'string' ? b : b.name;
    const pa = 1; 
    const pb = 1; 
    if (pa !== pb) return pa - pb;
    return nameA.localeCompare(nameB);
});

for (let i = 0; i < contents.length; i++) {
    contents[i] = items[i] ?? null;
}

console.log(contents);
