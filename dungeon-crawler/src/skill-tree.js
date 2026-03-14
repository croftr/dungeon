// ─────────────────────────────────────────────
//  SKILL TREE SYSTEM
//
//  Node-based character progression. Each level-up
//  awards 1 node pick. Players traverse the graph
//  one hop at a time, acquiring stat or skill benefits.
// ─────────────────────────────────────────────

import SKILLS_DATA from './data/skills.json';
import { hydrateSkill } from './leveling.js';

import elrondTree from './data/skill-trees/elrond.json';
import alaricTree from './data/skill-trees/alaric.json';
import thorekTree from './data/skill-trees/thorek.json';
import merlinTree from './data/skill-trees/merlin.json';
import korgTree from './data/skill-trees/korg.json';
import baldurTree from './data/skill-trees/baldur.json';
import lumniTree from './data/skill-trees/lumni.json';
import seraphinaTree from './data/skill-trees/seraphina.json';

const TREES = {
  elrond: elrondTree,
  alaric: alaricTree,
  thorek: thorekTree,
  merlin: merlinTree,
  korg: korgTree,
  baldur: baldurTree,
  lumni: lumniTree,
  seraphina: seraphinaTree,
};

/** Returns the tree definition for a given tree ID, or null. */
export function getSkillTree(treeId) {
  return TREES[treeId] ?? null;
}

/**
 * Returns node objects adjacent to any acquired node that aren't yet acquired.
 * @param {object} tree - tree definition
 * @param {string[]} acquiredNodes - array of acquired node IDs
 * @returns {object[]} array of available node objects
 */
export function getAvailableNodes(tree, acquiredNodes) {
  const acquired = new Set(acquiredNodes);
  const available = new Set();
  for (const node of tree.nodes) {
    if (!acquired.has(node.id)) continue;
    for (const edgeId of node.edges) {
      if (!acquired.has(edgeId)) available.add(edgeId);
    }
  }
  return tree.nodes.filter(n => available.has(n.id));
}

/**
 * Apply a node's benefit to a party member.
 * - stat nodes: add to m.statBonuses
 * - skill nodes: hydrate and push to m.skills, auto-equip if slot free
 * @param {object} m - party member
 * @param {object} node - skill tree node definition
 */
export function applyNodeBenefit(m, node) {
  if (node.type === 'stat') {
    if (!m.statBonuses) m.statBonuses = { strength: 0, dexterity: 0, vitality: 0, intelligence: 0, resilience: 0 };
    for (const [stat, val] of Object.entries(node.benefit)) {
      m.statBonuses[stat] = (m.statBonuses[stat] ?? 0) + val;
    }
  } else if (node.type === 'skill') {
    const skillName = node.benefit.skill;
    const skill = hydrateSkill(skillName);
    if (!m.skills) m.skills = [];
    m.skills.push(skill);

    // Auto-equip in skill slot if it's empty and skill is active
    const def = SKILLS_DATA[skillName];
    if (m.equipment && !m.equipment.skill && def && !def.isPassive) {
      m.equipment.skill = { name: skillName, slot: 'skill', icon: skill.icon ?? null };
    }
  }
  // start nodes have no benefit
}

/**
 * Render a skill tree graph into a container element.
 * Draws SVG edges beneath absolutely-positioned node divs.
 *
 * @param {object} m - party member
 * @param {HTMLElement} container - target element (will be cleared)
 * @param {function} onNodeClick - called with (node) when any node is clicked
 */
export function renderSkillTree(m, container, onNodeClick) {
  const tree = getSkillTree(m.skillTreeId);
  if (!tree) {
    container.innerHTML = '<p style="padding:12px; color:#888; font-size:12px;">No skill tree data.</p>';
    return;
  }

  const acquired = new Set(m.acquiredNodes ?? ['start']);
  const availableNodes = getAvailableNodes(tree, Array.from(acquired));
  const availableIds = new Set(availableNodes.map(n => n.id));
  const isPending = (m.pendingNodePicks ?? 0) > 0;

  // Compute SVG canvas size
  const positions = tree.positions;
  const xs = Object.values(positions).map(([x]) => x);
  const ys = Object.values(positions).map(([, y]) => y);
  const canvasW = Math.max(...xs) + 60;
  const canvasH = Math.max(...ys) + 50;

  container.innerHTML = '';

  // Inner canvas wrapper — naturally sized by tree content; container scrolls it
  const canvas = document.createElement('div');
  canvas.style.cssText = `position:relative; width:${canvasW}px; min-height:${canvasH}px;`;
  container.appendChild(canvas);

  // SVG for edges
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', canvasW);
  svg.setAttribute('height', canvasH);
  svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';

  for (const node of tree.nodes) {
    const [x1, y1] = positions[node.id];
    for (const edgeId of node.edges) {
      const pos2 = positions[edgeId];
      if (!pos2) continue;
      const [x2, y2] = pos2;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      const bothAcquired = acquired.has(node.id) && acquired.has(edgeId);
      const fromAcquiredToAvail = acquired.has(node.id) && availableIds.has(edgeId);
      line.setAttribute('stroke', bothAcquired ? '#c8a84a' : fromAcquiredToAvail ? '#4a8a4a' : '#333');
      line.setAttribute('stroke-width', bothAcquired ? '2' : '1');
      line.setAttribute('stroke-dasharray', bothAcquired ? '' : '3 3');
      svg.appendChild(line);
    }
  }

  canvas.appendChild(svg);

  // Node elements
  for (const node of tree.nodes) {
    const [x, y] = positions[node.id];
    const isAcquired = acquired.has(node.id);
    const isSelected = m.pendingNodeChoice === node.id;
    const isAvailable = isPending && availableIds.has(node.id);

    const div = document.createElement('div');
    div.className = 'tree-node';
    div.style.left = x + 'px';
    div.style.top = y + 'px';

    if (isAcquired) {
      div.classList.add('tree-node--acquired');
    } else if (isSelected) {
      div.classList.add('tree-node--selected');
    } else if (isAvailable) {
      div.classList.add('tree-node--available');
    } else {
      div.classList.add('tree-node--locked');
    }

    // Icon symbol
    const icon = document.createElement('span');
    icon.className = 'tree-node-icon';
    if (node.type === 'start') icon.textContent = '★';
    else if (node.type === 'skill') icon.textContent = '⚔';
    else icon.textContent = '⬆';
    div.appendChild(icon);

    // Label below the node
    const label = document.createElement('div');
    label.className = 'tree-node-label';
    label.textContent = node.label;
    div.appendChild(label);

    // Click handler
    div.addEventListener('click', () => {
      if (isPending && isAvailable && !isAcquired) {
        m.pendingNodeChoice = node.id;
        renderSkillTree(m, container, onNodeClick); // re-render selection state
      }
      if (onNodeClick) onNodeClick(node);
    });

    canvas.appendChild(div);
  }
}
