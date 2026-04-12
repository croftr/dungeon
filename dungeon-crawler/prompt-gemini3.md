Task: Refactor the Choose Your Party screen to follow a "Grimdark/Diablo" aesthetic and update the data-fetching logic.

1. Data Logic (Skill Tree Integration):

Access src\data\skill-trees.

For the selected character, parse their skill tree to identify Master Skills.

If a Master Skill exists for a specific weapon (e.g., Alaric has "Mace and Shield" mastery), extract this as the Weapon Expertise.

2. Component Clean-up:

Remove: All ProgressBar components and long Description text blocks.

Add: A HighlightFeatures component that displays three prominent slots: Race, Job, and Weapon Skills. Use large, high-quality icon placeholders for these.

3. Visual Styling (Diablo Style):

Stats: Display character stats (STR, DEX, etc.) using large, bold, high-contrast typography. Use a Gothic or Serif font stack.

Typography: Numbers should be significantly larger than labels. Use color coding: Strength (Red), Dexterity (Green), Intelligence (Blue).

Layout: Ensure the character video/model remains central, but move the stats to a high-visibility sidebar with a semi-transparent dark stone background texture.

There is also a section that shows selected party memebers which has an enter dungeon button above it. feel free to redesign this place this wherever you feel is best