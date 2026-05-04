// ─────────────────────────────────────────────────────────────────────────────
//  HELP PAGES — long-form lore-styled help screens accessed via NPC dialogue.
//  Pages are registered in this module and listed for an NPC via NPC_HELP_TOPICS.
//  Render targets: a tome-style modal with a parchment interior.
// ─────────────────────────────────────────────────────────────────────────────

import { ELEMENTS } from './elements.js';
import RULES from './data/combat-rules.json';
import { asset } from './assets.js';

// Which NPCs offer which help topics (in display order).
const NPC_HELP_TOPICS = {
    'weapons-merchant': ['combat', 'magic'],
};

export function getHelpTopicsForNpc(npcId) {
    return NPC_HELP_TOPICS[npcId] ?? [];
}

// ── Page registry ────────────────────────────────────────────────────────────

const PAGES = {
    combat: {
        id: 'combat',
        listLabel: 'Tell me about combat',
        bookTitle: "The Warrior's Codex",
        subtitle: 'On steel, sinew, and the shape of battle',
        accent: '#c8a84a',         // warm amber for the warrior tome
        accentSoft: 'rgba(200, 168, 74, 0.35)',
        // PLACEHOLDER IMAGE — see notes at the bottom of this file for guidance
        // on what to generate. Until the file exists the modal hides the image.
        image: '/images/combat.webp',
        imageAlt: 'A grim warrior braced behind a battered shield, blade raised against the dark.',
        build: buildCombatHtml,
    },
    magic: {
        id: 'magic',
        listLabel: 'Tell me about magic',
        bookTitle: 'Grimoire of the Six Elements',
        subtitle: 'On the woven arts and the elements that bind them',
        accent: '#a86bd6',         // arcane violet for the magic tome
        accentSoft: 'rgba(168, 107, 214, 0.35)',
        image: '/images/magic.webp',
        imageAlt: 'A robed mage with elemental motes orbiting outstretched hands.',
        build: buildMagicHtml,
    },
};

export function getHelpPage(id) { return PAGES[id]; }

// ── Public: open a page modal ────────────────────────────────────────────────

export function openHelpPage(id) {
    const page = PAGES[id];
    if (!page) return;
    showHelpPageModal(page);
}

// ── Modal lifecycle ──────────────────────────────────────────────────────────

let _overlayEl = null;

function ensureOverlay() {
    if (_overlayEl) return _overlayEl;
    const overlay = document.createElement('div');
    overlay.id = 'help-page-overlay';
    overlay.className = 'help-page-hidden';
    overlay.innerHTML = `
        <div id="help-page-tome">
            <button id="help-page-close" title="Close (Esc)">×</button>
            <div id="help-page-header">
                <div id="help-page-icon"></div>
                <div id="help-page-titles">
                    <h1 id="help-page-title"></h1>
                    <div id="help-page-subtitle"></div>
                </div>
            </div>
            <div id="help-page-body"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeHelpPage();
    });
    overlay.querySelector('#help-page-close').addEventListener('click', closeHelpPage);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _overlayEl && !_overlayEl.classList.contains('help-page-hidden')) {
            e.stopPropagation();
            closeHelpPage();
        }
    }, true);
    _overlayEl = overlay;
    return overlay;
}

function closeHelpPage() {
    if (!_overlayEl) return;
    _overlayEl.classList.add('help-page-hidden');
}

function showHelpPageModal(page) {
    const overlay = ensureOverlay();
    const tome = overlay.querySelector('#help-page-tome');
    const titleEl = overlay.querySelector('#help-page-title');
    const subEl = overlay.querySelector('#help-page-subtitle');
    const bodyEl = overlay.querySelector('#help-page-body');
    const iconEl = overlay.querySelector('#help-page-icon');

    tome.style.setProperty('--help-accent', page.accent);
    tome.style.setProperty('--help-accent-soft', page.accentSoft);
    titleEl.textContent = page.bookTitle;
    subEl.textContent = page.subtitle;

    const heroImg = page.image
        ? `<div class="help-page-hero">
             <img src="${asset(page.image)}" alt="${page.imageAlt ?? ''}"
                  onerror="this.parentElement.classList.add('help-page-hero-missing'); this.remove();" />
             <div class="help-page-hero-fallback">
               <div class="help-page-hero-fallback-mark">${page.id === 'magic' ? '✦' : '⚔'}</div>
               <div class="help-page-hero-fallback-cap">${page.imageAlt ?? ''}</div>
             </div>
           </div>`
        : '';

    bodyEl.innerHTML = heroImg + page.build();
    iconEl.textContent = page.id === 'magic' ? '✦' : '⚔';
    bodyEl.scrollTop = 0;
    overlay.classList.remove('help-page-hidden');
}

// ── Shared HTML helpers ──────────────────────────────────────────────────────

function pct(v) { return `${Math.round(v * 100)}%`; }

function elementChip(elementId) {
    const el = ELEMENTS[elementId];
    if (!el) return elementId;
    return `<span class="help-chip" style="
        background: ${el.color}22;
        border-color: ${el.color};
        color: ${el.color};">
        <span class="help-chip-symbol">${el.symbol}</span>${el.name}</span>`;
}

function elementDot(elementId) {
    const el = ELEMENTS[elementId];
    if (!el) return '';
    return `<span class="help-dot" style="background:${el.color}"></span>`;
}

// ── Vital pool formulas (mirrored from equipment.js) ─────────────────────────
const HP_PER_VIT = 8;
const MP_PER_INT = 4;
const SP_PER_RES = 10;

// ── Page: COMBAT ─────────────────────────────────────────────────────────────

function buildCombatHtml() {
    const baseHit = pct(RULES.basePlayerHitChance);
    const baseMonsterHit = pct(RULES.baseMonsterHitChance);
    const dexMod = `${(RULES.dexHitModifier * 100).toFixed(1)}%`;
    const minHit = pct(RULES.minHitChance);
    const maxHit = pct(RULES.maxHitChance);
    const critChance = pct(RULES.critChance);
    const critMult = `${RULES.critMultiplier}×`;
    const monsterBase = RULES.monsterBaseAttack;
    const mitK = RULES.mitigationK;
    const dexCritPct = `${(RULES.critPerDex * 100).toFixed(1)}%`;
    const dexCritCapPct = `${(RULES.critMaxBonusFromDex * 100).toFixed(0)}%`;
    const stunChance = pct(RULES.shieldBashStunChance);
    const stunDuration = `${(RULES.shieldBashStunDurationMs / 1000).toFixed(0)}s`;

    return `
    <p class="help-lede">
      Steel decides what spell and tongue cannot. The Codex below is the sum of a hundred
      campaigns — read it well, and your party will outlast the dungeon.
    </p>

    <h2 class="help-h2">⚔ The Formation</h2>
    <p>
      Your four heroes hold a 2×2 square. The <b>front row</b> (slots 1 &amp; 2) takes
      the brunt of melee blows; the <b>back row</b> (slots 3 &amp; 4) is shielded so long
      as their partner above stands. When a front-row hero falls, their back-row
      partner steps forward to fill the gap — both in dealing melee blows and in
      drawing enemy attention.
    </p>
    <div class="help-formation">
      <div class="help-formation-grid">
        <div class="help-cell help-cell-front">Slot 1<br><small>Front-Left</small></div>
        <div class="help-cell help-cell-front">Slot 2<br><small>Front-Right</small></div>
        <div class="help-cell help-cell-back">Slot 3<br><small>Back-Left</small></div>
        <div class="help-cell help-cell-back">Slot 4<br><small>Back-Right</small></div>
      </div>
      <div class="help-formation-cap">
        Monsters strike the face of the formation they approach from. Position
        archers and casters in the back row — they will only be exposed if their
        guardian falls.
      </div>
    </div>

    <h2 class="help-h2">⚔ The Roll to Hit</h2>
    <p>
      Every swing is a wager. A hero begins with a base chance of <b>${baseHit}</b>
      to land a blow; a monster begins with <b>${baseMonsterHit}</b>. Each point of
      <b>Dexterity</b> advantage shifts the chance by <b>${dexMod}</b> — and the same
      against you, when the beast is the swifter. No swing is ever certain (capped
      at <b>${maxHit}</b>) and none are ever hopeless (floored at <b>${minHit}</b>).
    </p>

    <h2 class="help-h2">⚔ The Critical Strike</h2>
    <p>
      One blow in <b>${Math.round(1 / RULES.critChance)}</b> finds the gap in the
      armour — a critical hit lands for <b>${critMult} damage</b>. Both you and the
      enemy share this <b>${critChance}</b> base chance. <b>Dexterity</b> sharpens
      it further: every point of DEX above 10 adds <b>${dexCritPct}</b> to the
      crit chance, capped at <b>+${dexCritCapPct}</b>. Train Dexterity to land
      both more <i>and</i> more vicious strikes, and Strength to make them hurt.
    </p>
    <p class="help-aside">
      Critical strikes multiply the <b>whole blow</b>, including any elemental
      rider — a flame dagger that crits sees its fire damage tripled too.
    </p>

    <h2 class="help-h2">⚔ How Damage is Reckoned</h2>
    <p>
      A weapon's <b>baseDamage</b> is added to a stat bonus drawn from the wielder.
      Most blades favour <b>Strength</b>; daggers and bows lean on <b>Dexterity</b>;
      a forge-mastered weapon (HQ) carries an extra bite. Family-bane weapons grant
      bonus damage to their named foes. The defender then subtracts mitigation:
    </p>
    <table class="help-table">
      <tr><th>Source</th><th>Effect</th></tr>
      <tr><td>Weapon baseDamage</td><td>Flat starting damage of the weapon.</td></tr>
      <tr><td>Stat weight (STR / DEX / INT)</td><td>Each weapon weights stats differently.</td></tr>
      <tr><td>HQ forging</td><td>Permanent bonus stamped at the anvil.</td></tr>
      <tr><td>Family bonus</td><td>Extra damage vs. a named monster family.</td></tr>
      <tr><td>Target damageReduction</td><td>Armour plating — % cut applied to physical only.</td></tr>
      <tr><td>Target VIT</td><td>Multiplicative soak via <span class="help-mono">${mitK} / (${mitK} + VIT)</span>. (Body mass soaks blades; diminishing returns.)</td></tr>
      <tr><td>Target Defence</td><td>Subtracted flat from the remainder.</td></tr>
      <tr><td>Stance multiplier</td><td>Final ×, e.g. Holy Stance vs. Undead.</td></tr>
    </table>
    <p class="help-aside">
      <b>Minimum damage is always 1.</b> A scratch is still a scratch — even the
      mightiest hide must yield <i>something</i>. Note that <b>Resilience</b>
      does not soak blades — it is reserved for magical wards (see the Grimoire).
    </p>

    <h2 class="help-h2">⚔ Monster Damage to You</h2>
    <p>
      A beast's blow begins at its <b>Strength + ${monsterBase}</b>. The hero's
      <b>Vitality</b> alone soaks the blow — by the same curve a monster suffers
      from your strikes — <span class="help-mono">${mitK} / (${mitK} + VIT)</span>.
      Equipped armour's <b>Defence</b> is then subtracted flat. Elemental attacks
      pass through one final filter: your gear's resistance to that element.
      <b>Resilience</b> is the magical ward — it does not stand between you and
      a sword, only between you and a spell or affliction.
    </p>

    <h2 class="help-h2">⚔ The Shield &amp; the Stun</h2>
    <p>
      A shield is more than a wall. With one in hand a hero may <b>Bash</b> for
      a <b>${stunChance}</b> chance to stun the foe for <b>${stunDuration}</b>. A
      stunned monster cannot strike, cannot cast — a precious window to bring it
      down. Shields also unlock the <i>Shield Master</i> passive's flat damage bonus.
    </p>

    <h2 class="help-h2">⚔ On-Hit Afflictions</h2>
    <p>
      Many weapons and beasts carry <b>poison, frost, fear, sleep,</b> and worse.
      A target's Resilience halves the chance of suffering them — formally,
      <span class="help-mono">raw × (${RULES.onHitEffectBase} / (${RULES.onHitEffectBase} + RES))</span>
      — and gear-borne resistances cut that further. Yet nothing is ever truly
      proof: a floor of <b>${pct(RULES.onHitEffectMinChance)}</b> always remains.
    </p>

    <h2 class="help-h2">⚔ The Three Pools — HP, SP, MP</h2>
    <p>
      A hero's three vital pools are forged directly from raw stats. Each point
      of the governing stat permanently raises its pool's maximum:
    </p>
    <table class="help-table">
      <tr><th>Pool</th><th>Stat</th><th>Per Point</th><th>Example at 20</th></tr>
      <tr>
        <td><b style="color:#c83a3a;">❤ Health (HP)</b></td>
        <td>Vitality</td>
        <td><span class="help-mono">VIT × ${HP_PER_VIT}</span></td>
        <td>${20 * HP_PER_VIT} HP</td>
      </tr>
      <tr>
        <td><b style="color:#d8c060;">⚡ Stamina (SP)</b></td>
        <td>Resilience</td>
        <td><span class="help-mono">RES × ${SP_PER_RES}</span></td>
        <td>${20 * SP_PER_RES} SP</td>
      </tr>
      <tr>
        <td><b style="color:#5a8fd0;">✦ Mana (MP)</b></td>
        <td>Intelligence</td>
        <td><span class="help-mono">INT × ${MP_PER_INT}</span></td>
        <td>${20 * MP_PER_INT} MP</td>
      </tr>
    </table>
    <p class="help-aside">
      Items that grant +Vitality, +Resilience or +Intelligence raise the matching
      pool's maximum the moment they're equipped — and a level-up node that adds
      to one of these stats is the same as adding to the pool itself.
    </p>

    <h2 class="help-h2">⚔ Stamina &amp; the Cost of Steel</h2>
    <p>
      Every physical strike spends <b>Stamina (SP)</b> — heavier weapons drain more.
      With a max SP of <span class="help-mono">RES × ${SP_PER_RES}</span>, a sturdier
      hero swings longer before tiring. SP refills naturally between fights, but
      adopting a stance halts that regeneration. Weapon-mastery passives (Mace,
      Axe, Dagger, Bow, Crossbow, Two-Handed) shave the cost of their chosen weapon.
    </p>

    <h2 class="help-h2">⚔ The Stat Pillars</h2>
    <table class="help-table">
      <tr><th>Stat</th><th>What it earns you</th></tr>
      <tr><td><b>Strength</b></td><td>Heavier blows with most weapons. Scales melee damage.</td></tr>
      <tr><td><b>Dexterity</b></td><td>More hits land, more dodges of theirs. Scales bows &amp; daggers.</td></tr>
      <tr><td><b>Intelligence</b></td><td>+${MP_PER_INT} max MP per point. The fuel of the mage — see the Grimoire.</td></tr>
      <tr><td><b>Vitality</b></td><td>+${HP_PER_VIT} max HP per point. Soaks <b>physical</b> damage via <span class="help-mono">${mitK} / (${mitK} + VIT)</span>.</td></tr>
      <tr><td><b>Resilience</b></td><td>+${SP_PER_RES} max SP per point. Soaks <b>magic</b> damage via <span class="help-mono">${mitK} / (${mitK} + RES)</span> and walls against status effects.</td></tr>
    </table>

    <h2 class="help-h2">⚔ A Word on Stances</h2>
    <p>
      A hero can adopt a martial stance — <i>Viper</i>, <i>Ghost</i>,
      <i>Inquisitor</i>, <i>Holy</i> and others — at the cost of natural SP/MP
      regeneration. Each stance bends the rules of combat in a small way: more
      poison, fewer enemy hits, harder to afflict, more burn against the undead.
      Think of stance as a vow: trade healing-by-rest for an edge in the fight.
    </p>

    <h2 class="help-h2">⚔ Loadouts &amp; Quick Slots</h2>
    <p>
      Each hero carries an <b>active</b> set of weapons and a <b>second loadout (B)</b>.
      Press <span class="help-key">1</span>–<span class="help-key">4</span> to swap a hero's
      whole kit between A and B in an instant — a sword-and-board for melee, a bow
      for the next breath. The <b>Quick Slot</b> beside it holds a potion or skill,
      ready for the press of a key.
    </p>

    <p class="help-closing">— Now go. The dungeon does not read books.</p>
    `;
}

// ── Page: MAGIC ──────────────────────────────────────────────────────────────

function buildMagicHtml() {
    const ids = ['fire', 'ice', 'lightning', 'water', 'holy', 'dark'];

    const elementGrid = ids.map(id => {
        const el = ELEMENTS[id];
        if (!el) return '';
        return `
        <div class="help-element-card" style="border-color:${el.color}; box-shadow: 0 0 18px ${el.color}33;">
          <div class="help-element-symbol" style="color:${el.color}; text-shadow: 0 0 12px ${el.color}99;">
            ${el.symbol}
          </div>
          <div class="help-element-name" style="color:${el.color};">${el.name}</div>
          <div class="help-element-flavour">${ELEMENT_FLAVOUR[id] ?? ''}</div>
        </div>`;
    }).join('');

    return `
    <p class="help-lede">
      Six threads weave through every spell, every rune, every torch in the dark.
      Learn their colours and you will know which arrow to nock and which scroll
      to unfurl.
    </p>

    <h2 class="help-h2">✦ The Six Elements</h2>
    <div class="help-element-grid">${elementGrid}</div>

    <h2 class="help-h2">✦ Resistance &amp; Vulnerability</h2>
    <p>
      Every monster — and every hero — answers each element on a five-step ladder.
      A foe may be <b>Immune</b> (no damage at all), <b>Resistant</b> (half),
      <b>Normal</b>, <b>Weak</b> (1.5×), or <b>Vulnerable</b> (2×). A spell that
      hammers a vulnerable beast strikes twice as hard as the same spell against
      its kin. Choose your element well.
    </p>
    <table class="help-table">
      <tr><th>Status</th><th>Damage Multiplier</th></tr>
      <tr><td>Immune</td><td>×0 — the spell rolls off entirely.</td></tr>
      <tr><td>Resist</td><td>×0.5</td></tr>
      <tr><td>Normal</td><td>×1.0</td></tr>
      <tr><td>Weak</td><td>×1.5</td></tr>
      <tr><td>Vulnerable</td><td>×2.0</td></tr>
    </table>
    <p class="help-aside">
      Your party's resistances are gathered from gear, buffs, and stances. They
      are summed and capped at <b>90% reduction</b> — no mortal armour will turn
      a flame entirely, but very little need pass through.
    </p>

    <h2 class="help-h2">✦ How Spell Damage is Reckoned</h2>
    <p>
      A spell's raw damage is born of <b>Intelligence</b> (most direct-damage spells
      use a formula like <span class="help-mono">INT × 1.5</span>). To that the caster's
      worn item bonuses, the <i>Pyromancer</i> passive, and other modifiers add
      their share. The total then meets the target:
    </p>
    <table class="help-table">
      <tr><th>Step</th><th>What happens</th></tr>
      <tr><td>1. Base</td><td>Stat formula (typically scaled INT) + item bonuses.</td></tr>
      <tr><td>2. Mitigation</td><td>Multiplicative soak via <span class="help-mono">${RULES.mitigationK} / (${RULES.mitigationK} + RES)</span>. Magic ignores armour and physical Defence entirely.</td></tr>
      <tr><td>3. Element</td><td>Multiplied <i>after</i> mitigation by the target's elemental factor (×0 immune to ×2 vulnerable). Holy Stance &amp; kin layer a further element multiplier here.</td></tr>
      <tr><td>4. Result</td><td>Minimum 1 damage on a successful non-immune cast. Immune targets take <b>0</b>.</td></tr>
    </table>
    <p class="help-aside">
      Why the order matters: the element multiplier is applied <b>after</b> soak,
      so a "vulnerable" creature truly takes double the damage that gets through
      — its weakness is no longer eaten by mitigation. This is what makes a
      construct of pure iron melt before a flame, even with high RES.
    </p>

    <h2 class="help-h2">✦ Will the Spell Even Land?</h2>
    <p>
      Aye — even a Fireball can miss. A direct-damage spell is a contest of
      <b>minds</b>, not footwork: caster <b>Intelligence</b> against target
      Intelligence. Begin at a base of <b>${pct(RULES.basePlayerHitChance)}</b>,
      shifted by <b>${(RULES.intHitModifier * 100).toFixed(1)}%</b> for every point
      of INT advantage (or disadvantage), floored at
      <b>${pct(RULES.minHitChance)}</b> and capped at <b>${pct(RULES.maxHitChance)}</b>.
      A quick-witted lich will turn aside your bolt; a witless slime stands
      gawping at it.
    </p>
    <p>
      The <i>Pyromancer</i> passive grants a flat accuracy bonus to all
      <b>fire-element</b> spells on top of its damage gift. AoE and debuff spells like
      <b>Sleep</b> are different beasts altogether — they do not
      use this INT roll directly. Each monster rolls its own resistance based on
      <b>Resilience</b>, gated by the spell's own
      <span class="help-mono">hitChance</span> — but the caster's <b>INT vs the
      monster's INT</b> now tilts that base chance by <b>${(RULES.intHitModifier * 100).toFixed(1)}%</b>
      per point, capped at <b>±20%</b>. A brilliant archmage chips through where
      a half-trained novice bounces off; RES is still the primary wall.
    </p>
    <p class="help-aside">
      A miss still <b>spends MP and triggers cast delay</b>. Train Intelligence on
      your casters, or pick your targets — and remember that a missed spell will
      still consume any one-shot effects (Runic Scholar &amp; the like).
    </p>

    <h2 class="help-h2">✦ The Critical Cast</h2>
    <p>
      A spell can crit just like a sword-stroke — every successful cast carries
      the same <b>${pct(RULES.critChance)}</b> base chance to land for
      <b>${RULES.critMultiplier}× damage</b>. The passive
      <b>Arcane Focus</b> is the caster's road to more: each rank adds <b>+5%</b>
      crit chance on top of the base, applied to all damaging spells. Stack it
      with elemental-mastery passives (Pyromancer &amp; kin) for casters who
      seek the <i>perfect cast</i>.
    </p>

    <h2 class="help-h2">✦ Elemental Riders on Weapons</h2>
    <p>
      Many weapons and arrows carry an <b>elemental rider</b> — a flame axe deals
      ${elementChip('fire')}; an ice arrow ${elementChip('ice')}. Riders are calculated
      <i>separately</i> from the physical blow and ignore armour and Defence — but
      the target's elemental status (immune, weak, vulnerable…) still applies. A
      flame axe cleaving a fire-immune drake will deal only its physical part.
    </p>

    <h2 class="help-h2">✦ Schools of Spellcraft</h2>
    <table class="help-table">
      <tr><th>Type</th><th>Examples</th><th>Notes</th></tr>
      <tr>
        <td><b>Direct Damage</b></td>
        <td>${elementDot('fire')}Fireball, ${elementDot('fire')}Incinerate, ${elementDot('ice')}Frostbolt, ${elementDot('water')}Waterbolt, ${elementDot('lightning')}Lightningbolt, ${elementDot('holy')}Holybolt, ${elementDot('holy')}Banishment, ${elementDot('dark')}Darkbolt</td>
        <td>Scale with INT and the target's element factor.</td>
      </tr>
      <tr>
        <td><b>Healing</b></td>
        <td>Heal, Regeneration, Cure Poison, Rejuvenate</td>
        <td>Scale with INT (+ Vitality on Regeneration). Lifewarden &amp; Holy Stance boost them.</td>
      </tr>
      <tr>
        <td><b>Buff</b></td>
        <td>Shell, Resist-fire/ice/lightning/water/poison/fear</td>
        <td>Temporary protection. Stack with worn resistances up to the 90% cap.</td>
      </tr>
      <tr>
        <td><b>Debuff</b></td>
        <td>Sleep</td>
        <td>Resilience reduces incoming chance — see the Codex on afflictions.</td>
      </tr>
    </table>

    <h2 class="help-h2">✦ MP, Delay &amp; the Cost of Power</h2>
    <p>
      Each spell drains <b>MP</b> when cast and imposes a <b>delay</b> before the next
      action. A caster's maximum MP is forged directly from <b>Intelligence</b> —
      <span class="help-mono">INT × ${MP_PER_INT}</span>. So Intelligence is twice
      blessed: it deepens your damage <i>and</i> widens the well you draw it from.
      MP regenerates outside of stance; in stance, only rest at a shrine or a
      quaffed potion will restore it. Plan your salvos: a wasted Fireball can be
      the difference between an empty corridor and an empty grave.
    </p>
    <p class="help-aside">
      Reminder of the three pools (see the Codex for the full table):
      <b style="color:#c83a3a;">HP</b> = VIT × ${HP_PER_VIT},
      <b style="color:#d8c060;">SP</b> = RES × ${SP_PER_RES},
      <b style="color:#5a8fd0;">MP</b> = INT × ${MP_PER_INT}.
    </p>

    <h2 class="help-h2">✦ Status Effects on Cast</h2>
    <p>
      Some spells and bolts carry afflictions — frostbolts may <b>freeze</b>,
      lightning may <b>stun</b>, dark magic may inspire <b>fear</b>. The same
      Resilience-versus-floor formula in physical combat applies, capped by gear
      resistance and never reaching zero.
    </p>

    <h2 class="help-h2">✦ The Caster's Stat Pillars</h2>
    <table class="help-table">
      <tr><th>Stat</th><th>Why it matters to a mage</th></tr>
      <tr><td><b>Intelligence</b></td><td>Triple-blessed for the mage: damage &amp; healing magnitude, +${MP_PER_INT} max MP per point, <b>and</b> the chance your spell lands at all.</td></tr>
      <tr><td><b>Vitality</b></td><td>+${HP_PER_VIT} max HP per point. Boosts Regeneration; keeps you alive long enough to cast.</td></tr>
      <tr><td><b>Resilience</b></td><td>+${SP_PER_RES} max SP per point. <b>The</b> stat for magic mitigation — soaks hostile spells via <span class="help-mono">${RULES.mitigationK} / (${RULES.mitigationK} + RES)</span> and walls against on-hit afflictions.</td></tr>
      <tr><td><b>Dexterity</b></td><td>Helps you dodge enemy blows while you incant. (Spell <i>accuracy</i> is INT, not DEX.)</td></tr>
    </table>

    <p class="help-closing">— Speak softly. The elements are listening.</p>
    `;
}

const ELEMENT_FLAVOUR = {
    fire: 'Roars through dry tinder and dragonkin alike. Often spurned by wyrms.',
    ice: 'Slows the swift and shatters the brittle. Freezes weak foes outright.',
    lightning: 'Strikes the swift before they move. Stuns metal-bound beasts.',
    water: 'Drowns flame and rusts the unlucky. Often the bane of fire-born kin.',
    holy: 'Burns the undead like sunlight on rotten flesh. Heals as readily as it harms.',
    dark: 'Withers the living, instills fear. Tread carefully — the price is high.',
};

// ─────────────────────────────────────────────────────────────────────────────
//  IMAGE GENERATION GUIDANCE
// ─────────────────────────────────────────────────────────────────────────────
//  The two pages above reference these placeholder images:
//    public/images/help-combat.png
//    public/images/help-magic.png
//
//  Until they exist, the modal shows a stylised symbol fallback (no broken icon).
//  When you're ready, generate them with these prompts (Diablo-style art):
//
//  help-combat.png  (suggest 1024×512, 16:9 letterboxed banner):
//    "Dark fantasy oil painting in the style of Diablo II concept art.
//     A grizzled armoured warrior braced behind a battered iron shield in a
//     dimly torchlit dungeon corridor, sword raised mid-swing against an
//     unseen foe. Heavy chiaroscuro, deep amber torchlight, scratched
//     plate armour, blood-flecked stone. Painterly, ominous, no text, no UI."
//
//  help-magic.png  (suggest 1024×512, 16:9 letterboxed banner):
//    "Dark fantasy oil painting in the style of Diablo II concept art.
//     A robed sorcerer in a ruined arcane library, hands outstretched with
//     six glowing motes orbiting them — flame, ice shard, lightning, water,
//     gold holy radiance, violet dark — each casting coloured light onto the
//     hood and stone walls. Heavy chiaroscuro, painterly, mysterious. No
//     text, no UI."
//
//  Save the resulting PNGs into public/images/ with the names above and the
//  modal will pick them up automatically (no code change needed).
// ─────────────────────────────────────────────────────────────────────────────
