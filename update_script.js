const fs = require('fs');
let code = fs.readFileSync('dungeon-crawler/src/equipment.js', 'utf8');

const search = `      } else {
        choosable.forEach(skill => {
          const def = SKILLS_DATA[skill.name];
          const card = document.createElement('div');
          card.className = 'skill-card skill-card--choosable';
          card.dataset.skillName = skill.name;
          if (m.pendingSkillChoice === skill.name) card.classList.add('skill-card--chosen');

          renderItemIcon({ icon: skill.icon }, card);

          // Type badge (Passive / Active)
          const typeBadge = document.createElement('span');
          typeBadge.className = 'skill-level-badge';
          typeBadge.textContent = def?.isPassive ? 'P' : 'A';
          card.appendChild(typeBadge);

          card.addEventListener('click', () => {
            m.pendingSkillChoice = skill.name;
            _showSkillDetail(skill, m, card);
            renderCharDevModal(memberIndex);
          });
          availEl.appendChild(card);
        });
      }`;

const replace = `      } else {
        choosable.forEach((skill, index) => {
          const def = SKILLS_DATA[skill.name];
          const card = document.createElement('div');
          card.className = 'skill-card skill-card--choosable';
          card.dataset.skillName = skill.name;

          if (m.pendingSkillChoice === skill.name && m.pendingSkillChoiceIndex === index) {
            card.classList.add('skill-card--chosen');
          } else if (m.pendingSkillChoice === skill.name && m.pendingSkillChoiceIndex === undefined) {
            // Backward compatibility or first click sets the index properly if it was missing
            m.pendingSkillChoiceIndex = index;
            card.classList.add('skill-card--chosen');
          }

          renderItemIcon({ icon: skill.icon }, card);

          // Type badge (Passive / Active)
          const typeBadge = document.createElement('span');
          typeBadge.className = 'skill-level-badge';
          typeBadge.textContent = def?.isPassive ? 'P' : 'A';
          card.appendChild(typeBadge);

          card.addEventListener('click', () => {
            m.pendingSkillChoice = skill.name;
            m.pendingSkillChoiceIndex = index;
            _showSkillDetail(skill, m, card);
            renderCharDevModal(memberIndex);
          });
          availEl.appendChild(card);
        });
      }`;

if (code.includes(search)) {
  code = code.replace(search, replace);

  // also clear pendingSkillChoiceIndex when pendingSkillChoice is cleared
  const searchClear = `      m.pendingSkillChoice = null;`;
  const replaceClear = `      m.pendingSkillChoice = null;\n      m.pendingSkillChoiceIndex = undefined;`;
  code = code.replace(searchClear, replaceClear);

  fs.writeFileSync('dungeon-crawler/src/equipment.js', code);
  console.log("Success");
} else {
  console.log("Search block not found");
}
