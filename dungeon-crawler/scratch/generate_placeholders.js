import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const outputDir = 'c:/Users/rob/projects/dungeon/dungeon-crawler/public/icons';

const items = [
  {
    name: 'demonhide_drape',
    category: 'cloak',
    svg: `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <!-- Black Background -->
  <rect width="128" height="128" fill="black" />
  
  <defs>
    <!-- Soft Red/Orange Glow -->
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ff3300" stop-opacity="0.45" />
      <stop offset="100%" stop-color="#ff3300" stop-opacity="0" />
    </radialGradient>
  </defs>
  
  <!-- Radial Glow Background -->
  <circle cx="64" cy="64" r="50" fill="url(#glow)" />
  
  <!-- Demonhide Drape Cloak Drawing -->
  <path d="M 44,35 Q 64,20 84,35 L 96,65 L 86,110 L 64,98 L 42,110 L 32,65 Z" 
        fill="#1c0505" stroke="#ff4500" stroke-width="3" stroke-linejoin="round" />
  
  <!-- Hot Ember veins -->
  <path d="M 52,45 Q 64,60 56,85" stroke="#ffaa00" stroke-width="2" fill="none" opacity="0.8" />
  <path d="M 76,45 Q 64,65 72,90" stroke="#ffaa00" stroke-width="2" fill="none" opacity="0.8" />
  <path d="M 64,30 Q 64,55 64,75" stroke="#ff3300" stroke-width="1.5" fill="none" opacity="0.6" />
  
  <!-- Sparks -->
  <circle cx="34" cy="45" r="2" fill="#ffaa00" opacity="0.8" />
  <circle cx="94" cy="40" r="1.5" fill="#ffaa00" opacity="0.8" />
  <circle cx="48" cy="98" r="2.5" fill="#ff4500" opacity="0.9" />
  <circle cx="80" cy="95" r="1.8" fill="#ff3300" opacity="0.9" />
</svg>
`
  },
  {
    name: 'lodestone_greatshield',
    category: 'shields',
    svg: `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <!-- Black Background -->
  <rect width="128" height="128" fill="black" />
  
  <defs>
    <!-- Cyan/Blue Magnetic Glow -->
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00d2ff" stop-opacity="0.45" />
      <stop offset="100%" stop-color="#0066ff" stop-opacity="0" />
    </radialGradient>
  </defs>
  
  <!-- Radial Glow Background -->
  <circle cx="64" cy="64" r="50" fill="url(#glow)" />
  
  <!-- Tower Shield Border -->
  <path d="M 36,25 L 92,25 L 92,75 Q 92,95 64,115 Q 36,95 36,75 Z" 
        fill="#151a22" stroke="#00a2ff" stroke-width="3.5" stroke-linejoin="round" />
  
  <!-- Inner Shield Detailing -->
  <path d="M 44,32 L 84,32 L 84,72 Q 84,87 64,103 Q 44,87 44,72 Z" 
        fill="#0d1117" stroke="#0044ff" stroke-width="2" />
        
  <!-- Lodestone Heart Core -->
  <polygon points="64,42 74,54 64,66 54,54" fill="#00d2ff" stroke="#ffffff" stroke-width="1.5" />
  
  <!-- Electric Sparks -->
  <path d="M 64,54 L 48,50 M 64,54 L 80,48 M 64,54 L 56,72 M 64,54 L 72,70" 
        stroke="#00ffff" stroke-width="1.5" opacity="0.8" stroke-linecap="round" />
        
  <!-- Lightning Bolts around shield -->
  <path d="M 24,40 L 32,45 L 28,55" fill="none" stroke="#00ffff" stroke-width="2" />
  <path d="M 104,40 L 96,45 L 100,55" fill="none" stroke="#00ffff" stroke-width="2" />
</svg>
`
  },
  {
    name: 'stormcore_relic',
    category: 'relic',
    svg: `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <!-- Black Background -->
  <rect width="128" height="128" fill="black" />
  
  <defs>
    <!-- Lightning/Storm Glow -->
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffff00" stop-opacity="0.4" />
      <stop offset="100%" stop-color="#00ffff" stop-opacity="0" />
    </radialGradient>
  </defs>
  
  <!-- Radial Glow Background -->
  <circle cx="64" cy="64" r="50" fill="url(#glow)" />
  
  <!-- Magnetic Metallic Core (Cylinder) -->
  <rect x="48" y="28" width="32" height="72" rx="6" ry="6"
        fill="#2c3e50" stroke="#7f8c8d" stroke-width="3" />
  
  <!-- Inner Lodestone cylinder glow -->
  <rect x="54" y="34" width="20" height="60" rx="3" ry="3"
        fill="#111" stroke="#00ffff" stroke-width="1.5" opacity="0.6" />
        
  <!-- Copper Coils wrapped diagonally -->
  <path d="M 45,40 Q 64,50 83,40" fill="none" stroke="#d35400" stroke-width="4.5" stroke-linecap="round" />
  <path d="M 45,55 Q 64,65 83,55" fill="none" stroke="#e67e22" stroke-width="4.5" stroke-linecap="round" />
  <path d="M 45,70 Q 64,80 83,70" fill="none" stroke="#d35400" stroke-width="4.5" stroke-linecap="round" />
  <path d="M 45,85 Q 64,95 83,85" fill="none" stroke="#e67e22" stroke-width="4.5" stroke-linecap="round" />
  
  <!-- Yellow Caged Lightning sparks -->
  <path d="M 30,60 L 42,58 L 38,70" fill="none" stroke="#ffff00" stroke-width="2" />
  <path d="M 98,64 L 86,60 L 92,72" fill="none" stroke="#ffff00" stroke-width="2" />
  <path d="M 64,20 L 64,28 M 64,100 L 64,108" stroke="#00ffff" stroke-width="2" stroke-dasharray="3,3" />
</svg>
`
  },
  {
    name: 'corvid_talon_ring',
    category: 'rings',
    svg: `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <!-- Black Background -->
  <rect width="128" height="128" fill="black" />
  
  <defs>
    <!-- Shadow/Purple Magic Glow -->
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#9b59b6" stop-opacity="0.45" />
      <stop offset="100%" stop-color="#4a0082" stop-opacity="0" />
    </radialGradient>
  </defs>
  
  <!-- Radial Glow Background -->
  <circle cx="64" cy="64" r="50" fill="url(#glow)" />
  
  <!-- Ring Band -->
  <ellipse cx="64" cy="88" rx="26" ry="12"
           fill="none" stroke="#34495e" stroke-width="4" />
  <ellipse cx="64" cy="88" rx="26" ry="12"
           fill="none" stroke="#5b2c6f" stroke-width="2.5" />
           
  <!-- Obsidian Shard Gem -->
  <polygon points="64,28 74,52 64,72 54,52" 
           fill="#1a0033" stroke="#8e44ad" stroke-width="2.5" />
  <!-- Highlight facet -->
  <polygon points="64,28 64,72 54,52" fill="#2d004d" opacity="0.8" />
  
  <!-- Crow Talon gripping upward -->
  <path d="M 38,82 Q 44,52 56,44" fill="none" stroke="#1b2631" stroke-width="4.5" stroke-linecap="round" />
  <path d="M 90,82 Q 84,52 72,44" fill="none" stroke="#1b2631" stroke-width="4.5" stroke-linecap="round" />
  <path d="M 64,88 L 64,70" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round" />
  
  <!-- Claws tips -->
  <path d="M 56,44 L 59,40" stroke="#f1c40f" stroke-width="2.5" stroke-linecap="round" />
  <path d="M 72,44 L 69,40" stroke="#f1c40f" stroke-width="2.5" stroke-linecap="round" />
</svg>
`
  },
  {
    name: 'nightcaw_staff',
    category: 'weapons',
    svg: `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <!-- Black Background -->
  <rect width="128" height="128" fill="black" />
  
  <defs>
    <!-- Fire/Shadow Hybrid Purple-Red Glow -->
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8e44ad" stop-opacity="0.5" />
      <stop offset="60%" stop-color="#e74c3c" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
  </defs>
  
  <!-- Radial Glow Background -->
  <circle cx="64" cy="64" r="50" fill="url(#glow)" />
  
  <!-- Twisted Wooden Staff Shaft -->
  <path d="M 60,118 Q 66,80 62,45 L 68,45 Q 72,80 66,118 Z" 
        fill="#3e2723" stroke="#21100b" stroke-width="1.5" />
        
  <!-- Crow Feathers clustering below head -->
  <path d="M 52,50 Q 40,58 36,74 Q 48,68 58,58" fill="#1a1a24" stroke="#111" stroke-width="1.5" />
  <path d="M 76,50 Q 88,58 92,74 Q 80,68 70,58" fill="#1a1a24" stroke="#111" stroke-width="1.5" />
  <path d="M 58,54 Q 46,65 44,80 Q 54,74 62,64" fill="#0d0d13" stroke="#111" stroke-width="1.5" />
  <path d="M 70,54 Q 82,65 84,80 Q 74,74 66,64" fill="#0d0d13" stroke="#111" stroke-width="1.5" />
  
  <!-- Capping Obsidian Bird Beak (Downward curved) -->
  <path d="M 64,22 Q 78,25 76,40 Q 64,48 64,54 Q 64,48 52,40 Q 50,25 64,22 Z" 
        fill="#1a0a2a" stroke="#8e44ad" stroke-width="2" />
  
  <!-- Glowing eye/rune on beak -->
  <circle cx="64" cy="32" r="2.5" fill="#e74c3c" />
  
  <!-- Magic Aura Orbs floating -->
  <circle cx="64" cy="14" r="3.5" fill="#d87093" opacity="0.9" />
  <circle cx="50" cy="18" r="1.5" fill="#8e44ad" opacity="0.7" />
  <circle cx="78" cy="18" r="1.5" fill="#e74c3c" opacity="0.7" />
</svg>
`
  }
];

async function run() {
  for (const item of items) {
    const destDir = path.join(outputDir, item.category);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    const destPath = path.join(destDir, `${item.name}.webp`);
    
    try {
      await sharp(Buffer.from(item.svg))
        .webp({ quality: 90 })
        .toFile(destPath);
      console.log(`Successfully generated ${destPath}`);
    } catch (err) {
      console.error(`Failed to generate ${item.name}: `, err);
    }
  }
}

run();
