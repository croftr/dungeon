<<<<<<< SEARCH
      } else {
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
      }
=======
      } else {
        choosable.forEach((skill, index) => {
          const def = SKILLS_DATA[skill.name];
          const card = document.createElement('div');
          card.className = 'skill-card skill-card--choosable';
          card.dataset.skillName = skill.name;

          if (m.pendingSkillChoice === skill.name) {
            if (m.pendingSkillChoiceIndex === index) {
              card.classList.add('skill-card--chosen');
            } else if (m.pendingSkillChoiceIndex === undefined) {
              m.pendingSkillChoiceIndex = index;
              card.classList.add('skill-card--chosen');
            }
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
      }
>>>>>>> REPLACE
