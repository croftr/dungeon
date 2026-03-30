// ─────────────────────────────────────────────
//  SKILL TREE SYSTEM
//
//  Node-based character progression. Each level-up
//  awards 1 node pick. Players traverse the graph
//  one hop at a time, acquiring stat or skill benefits.
// ─────────────────────────────────────────────

import SKILLS_DATA from './data/skills.json';
import { hydrateSkill } from './leveling.js';
import { playSoundByUrl } from './audio.js';

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
 * Render a skill tree graph into a container element with zoom + pan support.
 * Mouse wheel zooms (around cursor), drag pans. Auto-fits on first render.
 * Zoom/pan state is preserved across re-renders (e.g. node selection clicks).
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

  // Compute canvas bounds from positions
  const positions = tree.positions;
  const xs = Object.values(positions).map(([x]) => x);
  const ys = Object.values(positions).map(([, y]) => y);
  const PAD = 60;
  const canvasW = Math.max(...xs) + PAD;
  const canvasH = Math.max(...ys) + PAD;

  // Preserve pan/zoom from previous render (re-renders happen on node clicks)
  const prevViewport = container.querySelector('.tree-viewport');
  const savedTX  = prevViewport?._tx  ?? null;
  const savedTY  = prevViewport?._ty  ?? null;
  const savedScale = prevViewport?._scale ?? null;

  container.innerHTML = '';

  // ── Viewport: fills container, clips content ──
  const viewport = document.createElement('div');
  viewport.className = 'tree-viewport';
  container.appendChild(viewport);

  // ── Canvas: the transformable layer ──
  const canvas = document.createElement('div');
  canvas.style.cssText = `position:absolute;width:${canvasW}px;height:${canvasH}px;transform-origin:0 0;`;
  viewport.appendChild(canvas);

  // ── SVG edges ──
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', canvasW);
  svg.setAttribute('height', canvasH);
  svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';

  // Lava glow filter for acquired edges
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <filter id="lava-glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  svg.appendChild(defs);

  const mkLine = (x1, y1, x2, y2, stroke, width, dash, filter) => {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', stroke);
    l.setAttribute('stroke-width', width);
    l.setAttribute('stroke-linecap', 'round');
    if (dash) l.setAttribute('stroke-dasharray', dash);
    if (filter) l.setAttribute('filter', filter);
    return l;
  };

  for (const node of tree.nodes) {
    const [x1, y1] = positions[node.id];
    for (const edgeId of node.edges) {
      const pos2 = positions[edgeId];
      if (!pos2) continue;
      const [x2, y2] = pos2;
      const pendingId = m.pendingNodeChoice;
      const bothAcquired = (acquired.has(node.id) && acquired.has(edgeId))
        || (pendingId && ((node.id === pendingId && acquired.has(edgeId))
                       || (edgeId === pendingId && acquired.has(node.id))));
      const fromAcquiredToAvail = acquired.has(node.id) && availableIds.has(edgeId);

      if (bothAcquired) {
        // Three-layer lava: dark base → orange glow → bright core
        svg.appendChild(mkLine(x1, y1, x2, y2, '#6b1a00', 6));
        svg.appendChild(mkLine(x1, y1, x2, y2, '#e84800', 3.5, null, 'url(#lava-glow)'));
        svg.appendChild(mkLine(x1, y1, x2, y2, '#ffd060', 1.2));
      } else {
        svg.appendChild(mkLine(x1, y1, x2, y2,
          fromAcquiredToAvail ? '#4a8a4a' : '#333', 1, '3 3'));
      }
    }
  }
  canvas.appendChild(svg);

  // ── Node elements ──
  for (const node of tree.nodes) {
    const [x, y] = positions[node.id];
    const isAcquired = acquired.has(node.id);
    const isSelected = m.pendingNodeChoice === node.id;
    const isAvailable = isPending && availableIds.has(node.id);

    const div = document.createElement('div');
    div.className = 'tree-node';
    div.style.left = x + 'px';
    div.style.top  = y + 'px';

    if (isAcquired)         div.classList.add('tree-node--acquired');
    else if (isSelected)    div.classList.add('tree-node--selected');
    else if (isAvailable)   div.classList.add('tree-node--available');
    else                    div.classList.add('tree-node--locked');

    // Detail-focus highlight: node was clicked to inspect but isn't the pending choice
    const isFocused = m.detailFocusNodeId === node.id;
    if (isFocused && !isAcquired && !isSelected && isAvailable) {
      // Available node focused — it already shows fire via --selected once chosen;
      // while just browsing (no pending choice yet set) mark it detail-view-available
      div.classList.add('tree-node--detail-view-available');
    } else if (isFocused && !isAcquired && !isSelected && !isAvailable) {
      // Locked or available-without-picks: thin white focus ring
      div.classList.add('tree-node--detail-view');
    }

    const icon = document.createElement('div');
    icon.className = 'tree-node-icon';

    if (node.type === 'start') {
      icon.textContent = '★';
    } else if (node.icon) {
      // Explicit icon in tree JSON takes precedence over all auto-derived icons
      const img = document.createElement('img');
      img.src = node.icon;
      icon.appendChild(img);
    } else if (node.type === 'stat') {
      // Fallback: auto-derive stat icon from benefit keys
      const stats = Object.keys(node.benefit);
      const iconPath = stats.length > 1
        ? '/skills/stats-increase/mixed_stat_increase.webp'
        : `/skills/stats-increase/${stats[0]}_increase.webp`;
      const img = document.createElement('img');
      img.src = iconPath;
      icon.appendChild(img);
    } else if (node.type === 'skill') {
      // Fallback: auto-derive from skills.json
      const skillDef = SKILLS_DATA[node.benefit.skill];
      if (skillDef?.icon) {
        const img = document.createElement('img');
        img.src = skillDef.icon;
        icon.appendChild(img);
      } else {
        icon.textContent = '⚔';
      }
    }
    div.appendChild(icon);

    const label = document.createElement('div');
    label.className = 'tree-node-label';
    label.textContent = node.label;
    div.appendChild(label);

    // Node selection is handled via pointerup (see viewport pointerup below)
    // because pointerdown calls setPointerCapture + preventDefault which
    // suppresses the 'click' event entirely.
    div.dataset.nodeId = node.id;

    canvas.appendChild(div);
  }

  // ── Transform helpers (declared first so button handlers can reference them) ──
  const applyTransform = () => {
    canvas.style.transform = `translate(${viewport._tx}px,${viewport._ty}px) scale(${viewport._scale})`;
  };

  const zoomBy = (factor, cx, cy) => {
    const vw = viewport.offsetWidth;
    const vh = viewport.offsetHeight;
    const mx = cx ?? vw / 2;
    const my = cy ?? vh / 2;
    const newScale = Math.min(Math.max((viewport._scale ?? 1) * factor, 0.2), 4.0);
    const ratio = newScale / viewport._scale;
    viewport._tx = mx - (mx - viewport._tx) * ratio;
    viewport._ty = my - (my - viewport._ty) * ratio;
    viewport._scale = newScale;
    applyTransform();
  };

  const fitToView = (animate = false) => {
    const vw = viewport.offsetWidth;
    const vh = viewport.offsetHeight;
    if (!vw || !vh) return;
    const fitScale = Math.min(vw / canvasW, vh / canvasH, 1.0);
    viewport._scale = fitScale;
    viewport._tx = (vw - canvasW * fitScale) / 2;
    viewport._ty = (vh - canvasH * fitScale) / 2;
    if (animate) {
      canvas.style.transition = 'transform 0.25s ease';
      applyTransform();
      setTimeout(() => { canvas.style.transition = ''; }, 260);
    } else {
      applyTransform();
    }
  };

  const initTransform = () => {
    if (savedScale !== null) {
      viewport._tx = savedTX;
      viewport._ty = savedTY;
      viewport._scale = savedScale;
      applyTransform();
    } else {
      // Start zoomed in ~5 zoom-in button presses past the fit scale (1.25^5 ≈ 3.05×),
      // with the start node at top-centre of the viewport
      const vw = viewport.offsetWidth;
      const vh = viewport.offsetHeight;
      const fitScale = Math.min(vw / canvasW, vh / canvasH, 1.0);
      const initScale = Math.min(fitScale * Math.pow(1.25, 5), 4.0);
      const [startX, startY] = positions['start'] ?? [canvasW / 2, 0];
      viewport._scale = initScale;
      viewport._tx = vw / 2 - startX * initScale;
      viewport._ty = 130 - startY * initScale;
      applyTransform();
    }
  };

  // Wait one frame so viewport has been laid out and offsetWidth/Height are valid
  requestAnimationFrame(initTransform);

  // ── Controls toolbar (zoom in / zoom out / fit) ──
  const toolbar = document.createElement('div');
  toolbar.className = 'tree-toolbar';
  toolbar.innerHTML =
    '<button class="tree-ctrl-btn" data-action="zoomin"  title="Zoom in">+</button>' +
    '<button class="tree-ctrl-btn" data-action="zoomout" title="Zoom out">−</button>' +
    '<button class="tree-ctrl-btn tree-ctrl-fit" data-action="fit" title="Fit to view">⊡</button>';
  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'zoomin')  zoomBy(1.25);
    if (btn.dataset.action === 'zoomout') zoomBy(1 / 1.25);
    if (btn.dataset.action === 'fit')     fitToView(true);
  });
  viewport.appendChild(toolbar);

  // ── Zoom (mouse wheel) ──
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = viewport.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  // ── Pan (pointer drag with capture — skip if clicking a button) ──
  // NOTE: pointerdown calls preventDefault() which suppresses 'click' events.
  // Node selection is therefore handled here in pointerup when no drag occurred.
  let dragStartX = 0, dragStartY = 0, dragStartTX = 0, dragStartTY = 0;
  let dragOriginNode = null; // the .tree-node element where the pointer went down

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return; // let button clicks through
    dragOriginNode = e.target.closest('.tree-node'); // remember node under pointer
    viewport.setPointerCapture(e.pointerId);
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartTX = viewport._tx ?? 0;
    dragStartTY = viewport._ty ?? 0;
    viewport._didDrag = false;
    viewport.classList.add('dragging');
    e.preventDefault();
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!viewport.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) viewport._didDrag = true;
    viewport._tx = dragStartTX + dx;
    viewport._ty = dragStartTY + dy;
    applyTransform();
  });

  viewport.addEventListener('pointerup', (e) => {
    if (!viewport.hasPointerCapture(e.pointerId)) return;
    viewport.releasePointerCapture(e.pointerId);
    viewport.classList.remove('dragging');

    // If the pointer didn't move (not a drag), treat as a node click
    if (!viewport._didDrag && dragOriginNode) {
      const nodeId = dragOriginNode.dataset.nodeId;
      const node = tree.nodes.find(n => n.id === nodeId);
      if (node) {
        const isAcq = acquired.has(nodeId);
        const isAvail = isPending && availableIds.has(nodeId);
        // Track which node is being detail-viewed (for highlight ring)
        m.detailFocusNodeId = nodeId;
        if (isAvail && !isAcq) {
          m.pendingNodeChoice = nodeId;
          playSoundByUrl('/sounds/actions/skills/skill-choose.mp3', 0.8);
        }
        // Always re-render so detail-focus and pending classes update
        renderSkillTree(m, container, onNodeClick);
        if (onNodeClick) onNodeClick(node);
      }
    }
    dragOriginNode = null;
  });

  viewport.addEventListener('pointercancel', () => {
    viewport.classList.remove('dragging');
    dragOriginNode = null;
  });

  // ── Arrow-key pan (active while this tree is in the DOM) ──
  const PAN_STEP = 40;
  const onKeyDown = (e) => {
    if (!viewport.isConnected) { document.removeEventListener('keydown', onKeyDown); return; }
    // Only handle arrows when the char-dev modal is open and no text input is focused
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft')  dx =  PAN_STEP;
    if (e.key === 'ArrowRight') dx = -PAN_STEP;
    if (e.key === 'ArrowUp')    dy =  PAN_STEP;
    if (e.key === 'ArrowDown')  dy = -PAN_STEP;
    if (!dx && !dy) return;
    // Only consume arrows when the skill tree section is visible
    const overlay = document.getElementById('char-dev-overlay');
    if (!overlay || overlay.classList.contains('char-dev-hidden')) return;
    e.preventDefault();
    viewport._tx = (viewport._tx ?? 0) + dx;
    viewport._ty = (viewport._ty ?? 0) + dy;
    applyTransform();
  };
  document.addEventListener('keydown', onKeyDown);
}
