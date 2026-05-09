// ─────────────────────────────────────────────────────────────────────────────
//  QUEST SYSTEM — quest state, NPC quest dialog, quest log (L key)
// ─────────────────────────────────────────────────────────────────────────────

import { asset } from './assets.js';
import { playSoundByUrl, playQuestAudio, playItemSound, playSuccessSound } from './audio.js';
import { party, addGold } from './party.js';
import { getItemDef } from './items.js';
import { showMessage } from './minimap.js';
import { addItemToInventory, consumeItemAt } from './equipment.js';
import QUESTS from './data/quests.json';
import { getHelpTopicsForNpc, getHelpPage, openHelpPage } from './help-pages.js';

// ── State ────────────────────────────────────────────────────────────────────
// questId → 'available' | 'accepted' | 'completed'
const _questLog = {};

let _questDialogOpen = false;
let _questLogOpen = false;
let _npcChoiceOpen = false;
let _pendingNpcChoiceCallback = null; // { talk, trade }
let _completionAudioEndPromise = Promise.resolve(); // resolves when completion audio finishes

// ── Public getters / setters (for save/restore) ─────────────────────────────

export function getQuestLog() {
    return { ..._questLog };
}

export function setQuestLog(data) {
    Object.keys(_questLog).forEach(k => delete _questLog[k]);
    if (data) Object.assign(_questLog, data);
}

export function isQuestModalOpen() {
    const completeOpen = !document.getElementById('quest-complete-overlay')?.classList.contains('chest-hidden');
    return _questDialogOpen || _questLogOpen || _npcChoiceOpen || completeOpen;
}

// ── Reward items ─────────────────────────────────────────────────────────────

function _giveRewardItems(itemNames) {
    for (const name of itemNames) {
        let placed = false;
        for (let i = 0; i < party.length; i++) {
            if (party[i].isEmpty) continue;
            if (addItemToInventory(i, name, 1)) { placed = true; break; }
        }
        if (placed) {
            playItemSound(name);
            showMessage(`Received: ${name}`);
        } else {
            showMessage(`No room for ${name}!`);
        }
    }
}

// ── NPC choice panel (Talk / Trade) ─────────────────────────────────────────

export function showNpcChoice(talkCb, tradeCb) {
    _pendingNpcChoiceCallback = { talk: talkCb, trade: tradeCb };
    document.getElementById('npc-choice-overlay').classList.remove('chest-hidden');
    _npcChoiceOpen = true;
}

function _closeNpcChoice() {
    document.getElementById('npc-choice-overlay').classList.add('chest-hidden');
    _npcChoiceOpen = false;
    _pendingNpcChoiceCallback = null;
}

// ── Quest Dialog (NPC quest panel) ──────────────────────────────────────────

export function renderMerchantQuestPanel(npcId) {
    const container = document.getElementById('merchant-quest-body');
    if (!container) return;
    const npcQuests = QUESTS.filter(q => q.giver === npcId);
    const helpTopics = getHelpTopicsForNpc(npcId);
    if (!npcQuests.length && !helpTopics.length) {
        container.innerHTML = '<div class="merchant-quest-empty">No quests available.</div>';
        return;
    }
    _renderQuestList(container, npcQuests, npcId);
}

export function openQuestDialog(npcId) {
    const npcQuests = QUESTS.filter(q => q.giver === npcId);
    if (!npcQuests.length) return;

    const overlay = document.getElementById('quest-dialog-overlay');
    const body = document.getElementById('quest-dialog-body');

    _renderQuestList(body, npcQuests, npcId);

    overlay.classList.remove('chest-hidden');
    _questDialogOpen = true;
}

function _closeQuestDialog() {
    document.getElementById('quest-dialog-overlay').classList.add('chest-hidden');
    _questDialogOpen = false;
}

function _renderQuestList(body, npcQuests, npcId = null) {
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'quest-list';

    npcQuests.forEach(q => {
        const status = _questLog[q.id] || 'available';
        const locked = status === 'available' && _isQuestLocked(q);
        const row = document.createElement('div');
        row.className = 'quest-list-item';

        const name = document.createElement('span');
        name.className = 'quest-list-name';
        name.textContent = q.name;

        const badge = document.createElement('span');
        badge.className = 'quest-list-badge';
        if (locked) {
            badge.textContent = ' (locked)';
            badge.classList.add('quest-locked-badge');
            row.classList.add('quest-list-item-locked');
        } else if (status === 'accepted') {
            badge.textContent = ' (accepted)';
            badge.classList.add('quest-accepted-badge');
        } else if (status === 'completed') {
            badge.textContent = ' (completed)';
            badge.classList.add('quest-completed-badge');
        }

        row.appendChild(name);
        row.appendChild(badge);

        if (!locked) {
            row.addEventListener('click', () => _showQuestDetail(body, npcQuests, q, npcId));
        }
        list.appendChild(row);
    });

    body.appendChild(list);

    // Append help-page entries (lore topics) for this NPC, if any.
    const helpTopics = npcId ? getHelpTopicsForNpc(npcId) : [];
    if (helpTopics.length) {
        const header = document.createElement('div');
        header.className = 'merchant-quest-panel-label help-topic-section-label';
        header.textContent = 'Lore & Knowledge';
        body.appendChild(header);

        const helpList = document.createElement('div');
        helpList.className = 'quest-list help-topic-list';
        helpTopics.forEach(topicId => {
            const page = getHelpPage(topicId);
            if (!page) return;
            const row = document.createElement('div');
            row.className = 'quest-list-item help-topic-item';
            row.style.setProperty('--help-accent', page.accent);

            const mark = document.createElement('span');
            mark.className = 'help-topic-mark';
            mark.textContent = topicId === 'magic' ? '✦' : '⚔';
            mark.style.color = page.accent;

            const name = document.createElement('span');
            name.className = 'quest-list-name';
            name.textContent = page.listLabel;

            row.appendChild(mark);
            row.appendChild(name);
            row.addEventListener('click', () => openHelpPage(topicId));
            helpList.appendChild(row);
        });
        body.appendChild(helpList);
    }
}

function _showQuestDetail(body, npcQuests, quest, npcId = null) {
    const status = _questLog[quest.id] || 'available';
    const met = status === 'accepted' && _checkQuestRequirements(quest);
    const useCompletion = met || status === 'completed';

    // Play completion audio if requirements met or already completed, otherwise quest audio
    const audioPath = useCompletion && quest.completionAudio ? quest.completionAudio : quest.audio;
    if (audioPath) {
        if (useCompletion && quest.completionAudio) {
            _completionAudioEndPromise = playQuestAudio(asset(audioPath), 0.8).then(src => {
                if (!src) return;
                return new Promise(resolve => { src.onended = resolve; });
            });
        } else {
            playQuestAudio(asset(audioPath), 0.8);
            if (status === 'available' && quest.video) {
                window.playNectarQuestVideo?.();
            }
        }
    }

    body.innerHTML = '';

    const detail = document.createElement('div');
    detail.className = 'quest-detail';

    const title = document.createElement('h3');
    title.className = 'quest-detail-title';
    title.textContent = quest.name;
    detail.appendChild(title);

    const text = document.createElement('p');
    text.className = 'quest-detail-text';
    text.textContent = useCompletion && quest.completionText ? quest.completionText : quest.text;
    detail.appendChild(text);

    // Buttons row — declared before status checks so Complete button can append to it
    const btnRow = document.createElement('div');
    btnRow.className = 'quest-detail-buttons';

    if (status === 'accepted') {
        const note = document.createElement('div');
        note.className = 'quest-detail-note';
        note.textContent = met ? 'You have everything I need!' : 'Quest accepted — check your Quest Log (L) for details.';
        detail.appendChild(note);

        if (met) {
            const completeBtn = document.createElement('button');
            completeBtn.className = 'quest-btn quest-btn-accept';
            completeBtn.textContent = 'Complete Quest';
            completeBtn.addEventListener('click', () => {
                completeBtn.disabled = true;
                _completeQuest(body, npcQuests, quest, npcId);
            });
            btnRow.appendChild(completeBtn);
        }
    } else if (status === 'completed') {
        const note = document.createElement('div');
        note.className = 'quest-detail-note';
        note.textContent = 'Quest completed.';
        detail.appendChild(note);
    }

    if (status === 'available') {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'quest-btn quest-btn-accept';
        acceptBtn.textContent = 'Accept';
        acceptBtn.addEventListener('click', () => {
            _questLog[quest.id] = 'accepted';
            playSoundByUrl(asset('/sounds/quest-accepted.mp3'), 0.8);
            // Give reward items to first party member with space
            if (quest.rewardItems?.length) {
                _giveRewardItems(quest.rewardItems);
            }
            // Re-render the list so badge updates
            _renderQuestList(body, npcQuests, npcId);
        });
        btnRow.appendChild(acceptBtn);

        const declineBtn = document.createElement('button');
        declineBtn.className = 'quest-btn quest-btn-decline';
        declineBtn.textContent = 'Decline';
        declineBtn.addEventListener('click', () => {
            _renderQuestList(body, npcQuests, npcId);
        });
        btnRow.appendChild(declineBtn);
    } else {
        const backBtn = document.createElement('button');
        backBtn.className = 'quest-btn quest-btn-decline';
        backBtn.textContent = 'Back';
        backBtn.addEventListener('click', () => {
            _renderQuestList(body, npcQuests, npcId);
        });
        btnRow.appendChild(backBtn);
    }

    detail.appendChild(btnRow);
    body.appendChild(detail);
}

function _isQuestLocked(quest) {
    const prereqs = quest.prerequisiteQuests;
    if (!prereqs || prereqs.length === 0) return false;
    return prereqs.some(id => _questLog[id] !== 'completed');
}

function _checkQuestRequirements(quest) {
    if (!quest.requiredItems || quest.requiredItems.length === 0) return true;

    // For each required item, check if ANY party member has it in inventory
    for (const reqItemName of quest.requiredItems) {
        let found = false;
        for (const m of party) {
            if (m.isEmpty) continue;
            if (m.inventory.some(it => it && it.name === reqItemName)) {
                found = true;
                break;
            }
        }
        if (!found) return false;
    }
    return true;
}

function _completeQuest(body, npcQuests, quest, npcId = null) {
    // 1. Remove required items (unless quest flags them as kept).
    //    Stacked items are decremented by 1 rather than having the whole stack removed.
    if (quest.requiredItems && !quest.keepRequiredItems) {
        for (const reqItemName of quest.requiredItems) {
            for (const m of party) {
                if (m.isEmpty) continue;
                const idx = m.inventory.findIndex(it => it && it.name === reqItemName);
                if (idx !== -1) {
                    consumeItemAt(m, idx, 1);
                    break;
                }
            }
        }
    }

    // 2. Set status
    _questLog[quest.id] = 'completed';

    // 3. Close the quest dialog immediately and discard any pending audio wait
    _closeQuestDialog();
    _completionAudioEndPromise = Promise.resolve();

    // 4. Re-render the list view (handles merchant quest tab where dialog doesn't close)
    if (body && body.isConnected) {
        _renderQuestList(body, npcQuests, npcId);
    }

    // 5. Give rewards and show modal immediately
    {
        const itemNames = [];
        let gold = 0;
        if (quest.completionRewards) {
            quest.completionRewards.forEach(reward => {
                if (typeof reward === 'string') {
                    itemNames.push(reward);
                } else if (reward.name === 'Gold Coins') {
                    gold += (reward.quantity || 0);
                } else {
                    itemNames.push(reward.name);
                }
            });
        }
        if (itemNames.length > 0) _giveRewardItems(itemNames);
        if (gold > 0) addGold(gold);
        _showQuestCompleteModal(itemNames, gold);
    }
}

function _showQuestCompleteModal(itemNames, gold) {
    const overlay = document.getElementById('quest-complete-overlay');
    const itemsEl = document.getElementById('quest-complete-items');
    itemsEl.innerHTML = '';

    for (const name of itemNames) {
        const def = getItemDef(name);
        const row = document.createElement('div');
        row.className = 'quest-complete-item';
        if (def?.icon) {
            const iconWrap = document.createElement('div');
            iconWrap.className = 'merch-slot';
            iconWrap.style.width = '64px';
            iconWrap.style.height = '64px';
            iconWrap.style.flexShrink = '0';
            const img = document.createElement('img');
            img.src = asset(def.icon);
            img.alt = name;
            iconWrap.appendChild(img);
            row.appendChild(iconWrap);
        }
        const label = document.createElement('span');
        label.className = 'quest-complete-item-name';
        label.textContent = name;
        row.appendChild(label);
        itemsEl.appendChild(row);
    }
    if (gold > 0) {
        const row = document.createElement('div');
        row.className = 'quest-complete-item';
        const iconWrap = document.createElement('div');
        iconWrap.className = 'merch-slot';
        iconWrap.style.width = '64px';
        iconWrap.style.height = '64px';
        iconWrap.style.flexShrink = '0';
        const img = document.createElement('img');
        img.src = asset('/icons/gold_coins.webp');
        img.alt = 'Gold';
        iconWrap.appendChild(img);
        row.appendChild(iconWrap);
        const label = document.createElement('span');
        label.className = 'quest-complete-item-name';
        label.textContent = `${gold} Gold`;
        row.appendChild(label);
        itemsEl.appendChild(row);
    }

    overlay.classList.remove('chest-hidden');
    playSoundByUrl(asset('/sounds/quest-complete.mp3'), 0.8);

    document.getElementById('quest-complete-ok').onclick = () => {
        overlay.classList.add('chest-hidden');
    };
}

// ── Quest Log Modal (L key) ─────────────────────────────────────────────────

export function openQuestLogModal() {
    const overlay = document.getElementById('quest-log-overlay');
    const body = document.getElementById('quest-log-body');

    body.innerHTML = '';

    const accepted = QUESTS.filter(q => _questLog[q.id] === 'accepted');
    const completed = QUESTS.filter(q => _questLog[q.id] === 'completed');

    if (accepted.length === 0 && completed.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'quest-log-empty';
        empty.textContent = 'No active quests.';
        body.appendChild(empty);
    } else {
        if (accepted.length > 0) {
            const header = document.createElement('h3');
            header.className = 'quest-log-section-header';
            header.textContent = 'Active Quests';
            body.appendChild(header);

            accepted.forEach(q => {
                const entry = document.createElement('div');
                entry.className = 'quest-log-entry';

                const name = document.createElement('div');
                name.className = 'quest-log-entry-name';
                name.textContent = q.name;
                entry.appendChild(name);

                const text = document.createElement('div');
                text.className = 'quest-log-entry-text';
                text.textContent = q.text;
                entry.appendChild(text);

                body.appendChild(entry);
            });
        }

        if (completed.length > 0) {
            const header = document.createElement('h3');
            header.className = 'quest-log-section-header';
            header.textContent = 'Completed Quests';
            body.appendChild(header);

            completed.forEach(q => {
                const entry = document.createElement('div');
                entry.className = 'quest-log-entry quest-log-completed';

                const name = document.createElement('div');
                name.className = 'quest-log-entry-name';
                name.textContent = q.name;
                entry.appendChild(name);

                body.appendChild(entry);
            });
        }
    }

    overlay.classList.remove('chest-hidden');
    _questLogOpen = true;
}

function _closeQuestLogModal() {
    document.getElementById('quest-log-overlay').classList.add('chest-hidden');
    _questLogOpen = false;
}

// ── Init (keyboard + button listeners) ──────────────────────────────────────

export function initQuests() {
    // NPC choice buttons
    document.getElementById('npc-choice-talk').addEventListener('click', () => {
        const cb = _pendingNpcChoiceCallback;
        _closeNpcChoice();
        if (cb?.talk) cb.talk();
    });
    document.getElementById('npc-choice-trade').addEventListener('click', () => {
        const cb = _pendingNpcChoiceCallback;
        _closeNpcChoice();
        if (cb?.trade) cb.trade();
    });

    // Quest dialog close
    document.getElementById('quest-dialog-close').addEventListener('click', _closeQuestDialog);
    document.getElementById('quest-dialog-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('quest-dialog-overlay')) _closeQuestDialog();
    });

    // Quest log close
    document.getElementById('quest-log-close').addEventListener('click', _closeQuestLogModal);
    document.getElementById('quest-log-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('quest-log-overlay')) _closeQuestLogModal();
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const completeOverlay = document.getElementById('quest-complete-overlay');
            if (completeOverlay && !completeOverlay.classList.contains('chest-hidden')) {
                completeOverlay.classList.add('chest-hidden');
                return;
            }
            if (_npcChoiceOpen) { _closeNpcChoice(); return; }
            if (_questDialogOpen) { _closeQuestDialog(); return; }
            if (_questLogOpen) { _closeQuestLogModal(); return; }
        }
        if (e.key === 'l' || e.key === 'L') {
            // Don't open if any modal is open — check common modal states
            if (_questLogOpen) { _closeQuestLogModal(); return; }
            if (_questDialogOpen || _npcChoiceOpen) return;
            // Check if other modals are open (merchant, inventory, etc.)
            const merchantOpen = !document.getElementById('merchant-overlay').classList.contains('merchant-hidden');
            const chestOpen = !document.getElementById('chest-overlay').classList.contains('chest-hidden');
            const equipOpen = !document.getElementById('equip-overlay')?.classList.contains('equip-hidden');
            if (merchantOpen || chestOpen || equipOpen) return;
            openQuestLogModal();
        }
    });
}

