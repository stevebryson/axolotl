import { LOCI, allDexEntries, MORPHS } from './genetics.js';
import { SUBSTRATES, LIMITS, LEVELS } from './game.js';
import { Tips } from './tips.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sexIcon = (s) => (s === 'F' ? '♀' : '♂');
const pct = (p) => `${Math.round(p * 100)}%`;
const LOCUS = Object.fromEntries(LOCI.map((l) => [l.id, l]));
/** Morph that appears when a recessive locus is homozygous small (nothing else masking it). */
const RECESSIVE_MORPH = { D: 'leucistic', A: 'golden', M: 'melanoid', AX: 'axanthic', CU: 'copper' };

function swatch(morph, gfp, cls = '') {
  return `<span class="swatch ${gfp ? 'glow' : ''} ${cls}" style="background:${morph.body}"></span>`;
}

function bead(locus, v) {
  const cls = locus.kind === 'dominant' ? (v ? 'glow-on' : 'small') : (v ? 'big' : 'small');
  return `<i class="bead ${cls}">${v ? locus.big : locus.small}</i>`;
}

/**
 * Gene bead rows for the loci the player can see.
 * byParent keeps the stored order (mother's bead, father's bead) and labels them; otherwise big beads sort first.
 */
function geneBeads(genotype, loci, { byParent = false } = {}) {
  return `<div class="genes ${byParent ? 'by-parent' : ''}">${loci.map((l) => {
    const pair = byParent ? genotype[l.id] : [...genotype[l.id]].sort((x, y) => y - x);
    const beads = byParent
      ? `<span class="beads"><span class="from"><small>♀</small>${bead(l, pair[0])}</span><span class="from"><small>♂</small>${bead(l, pair[1])}</span></span>`
      : `<span class="beads">${bead(l, pair[0])}${bead(l, pair[1])}</span>`;
    return `<div class="gene"><span>${l.name}</span>${beads}</div>`;
  }).join('')}</div>`;
}

function legend(loci) {
  const first = loci[0];
  const hasGlow = loci.some((l) => l.kind === 'dominant');
  return `<p class="legend">${bead(first, 1)} strong, ${bead(first, 0)} hidden. A hidden colour only shows when BOTH beads are small.${
    hasGlow ? ` ${bead(LOCUS.G, 1)} glow is strong: one is enough.` : ''}</p>`;
}

/** 2×2 Punnett square for a single locus: mother's beads across the top, father's down the side. */
function punnettSquare(locus, mother, father, dist) {
  const m = mother.genotype[locus.id];
  const f = father.genotype[locus.id];
  const cell = (a, b) => `<td class="${a === 0 && b === 0 ? 'shows' : ''}">${bead(locus, a)}${bead(locus, b)}</td>`;
  const rec = dist.find((d) => d.dexKey === RECESSIVE_MORPH[locus.id]);
  return `<div class="punnett">
    <h3>Why?</h3>
    <table>
      <tr><th></th><th><small>Mum</small>${bead(locus, m[0])}</th><th><small>Mum</small>${bead(locus, m[1])}</th></tr>
      <tr><th><small>Dad</small>${bead(locus, f[0])}</th>${cell(m[0], f[0])}${cell(m[1], f[0])}</tr>
      <tr><th><small>Dad</small>${bead(locus, f[1])}</th>${cell(m[0], f[1])}${cell(m[1], f[1])}</tr>
    </table>
    <p>Each baby takes one bead from Mum and one from Dad. The four boxes are the four ways that can happen.${
      rec ? ` Only a box with two small beads comes out ${esc(rec.name.toLowerCase())}: about ${pct(rec.p)} of babies.` : ''}</p>
  </div>`;
}

function stars(v) {
  const n = Math.round(v * 5);
  return `<span class="stars">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
}

export class UI {
  constructor({ game, tank, store, sound, onReset }) {
    this.game = game;
    this.tank = tank;
    this.store = store;
    this.sound = sound;
    this.onReset = onReset;
    this.uv = false;
    this.pendingLevel = null;
    this.toastEl = $('#toast');
    this.card = $('#card');
    this.hint = $('#hint');
    this.pondBar = $('#pond-bar');
    this.levelPill = $('#level-pill');
    this.dlg = {
      breed: $('#dlg-breed'), dex: $('#dlg-dex'), stats: $('#dlg-stats'), menu: $('#dlg-menu'), help: $('#dlg-help'), level: $('#dlg-level'),
    };
    this.tips = new Tips({ game, root: $('#hud') });
    this.idleTimer = 0;
    this.bind();
    this.renderSubstrateChips();
    this.applyMode(game.mode);
    this.applyLevel();
    this.armIdleNudge();
  }

  /** After 20 s with nothing picked up, pulse the hint so a stuck player knows where to start. */
  armIdleNudge() {
    clearTimeout(this.idleTimer);
    this.hint.classList.remove('pulse');
    this.idleTimer = setTimeout(() => { if (!this.game.selected && !document.querySelector('dialog[open]')) this.hint.classList.add('pulse'); }, 20000);
  }

  bind() {
    const g = this.game;
    for (const b of document.querySelectorAll('.seg [data-mode]')) {
      b.addEventListener('click', () => this.switchMode(b.dataset.mode));
    }
    $('#btn-feed').addEventListener('click', () => {
      const p = g.dropPellet();
      if (p) { this.sound.pop(); this.tips.show('pellet', { delay: 900 }); }
      this.toast(p ? 'Worm pellet dropped' : 'Plenty of food in there already', p ? '' : 'warn');
    });
    $('#btn-uv').addEventListener('click', () => this.setUv(!this.uv));
    $('#btn-dex').addEventListener('click', () => this.openDex());
    $('#btn-stats').addEventListener('click', () => this.openStats());
    $('#btn-menu').addEventListener('click', () => this.openMenu());
    $('#btn-next-gen').addEventListener('click', () => this.nextGeneration());
    this.levelPill.addEventListener('click', () => this.openLevel(g.levelInfo, []));

    for (const d of Object.values(this.dlg)) {
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    }

    g.on('selected', (a) => { if (a) this.sound.pop(); this.renderCard(a); this.armIdleNudge(); });
    g.on('population', () => this.renderCard(g.selected));
    g.on('added', ({ axolotl, newMorph }) => {
      if (newMorph && axolotl.generation > 0) { this.sound.sparkle(); this.toast(`New morph discovered: ${axolotl.pheno.name}!`, 'good'); this.tips.show('dex', { delay: 1500 }); }
      this.tank.popIn(axolotl.id);
    });
    g.on('ate', ({ axolotl }) => { this.sound.eat(); if (axolotl.id === g.selectedId) this.renderCard(axolotl); });
    g.on('heronWarning', () => { this.sound.alarm(); this.toast('A heron is coming! Hide in the cave!', 'warn'); this.tips.show('heron', { delay: 100 }); });
    g.on('heron', (s) => {
      this.sound.snap();
      if (s.victims.length === 0) this.toast(`The heron left hungry. ${s.hidden ? `${s.hidden} hid in the cave.` : 'Everyone blended in!'}`, 'good');
      else {
        const names = s.victims.map((v) => `${v.name} (${v.pheno.name.toLowerCase()})`).join(', ');
        this.toast(`The heron spotted ${names} on the ${g.substrateInfo.name.toLowerCase()}.`, 'bad', 5000);
      }
      this.updateNextGenButton();
      this.tips.show('nextGen', { delay: 2500 });
    });
    g.on('grownUp', (a) => {
      if (a.id === g.selectedId) this.renderCard(a);
      this.tips.show('grownUp', { delay: 600, text: `${a.name} is all grown up and can breed now!` });
    });
    g.on('generation', ({ generation, born }) => {
      this.sound.whoosh();
      this.toast(`Generation ${generation}: ${born} babies grew up and the old ones swam off to the river.`, 'good', 5000);
    });
    g.on('levelUp', ({ info, arrivals }) => {
      this.pendingLevel = { info, arrivals };
      this.applyLevel();
    });
  }

  /* ---------- toasts ---------- */
  toast(msg, kind = '', ms = 3200) {
    const el = document.createElement('div');
    el.className = `toast-item ${kind}`;
    el.textContent = msg;
    this.toastEl.appendChild(el);
    while (this.toastEl.children.length > 3) this.toastEl.firstChild.remove();
    setTimeout(() => el.remove(), ms);
  }

  /* ---------- levels ---------- */
  applyLevel() {
    const g = this.game;
    const info = g.levelInfo;
    const dots = g.maxLevel ? '' : `<span class="dots">${Array.from({ length: info.needed }, (_, i) => `<i class="${i < g.levelCorrect ? 'on' : ''}"></i>`).join('')}</span>`;
    this.levelPill.innerHTML = `<b>Level ${info.id}</b> ${esc(info.name)} ${dots}`;
    $('#btn-uv').hidden = !g.uvUnlocked;
    if (!g.uvUnlocked && this.uv) this.setUv(false);
    const pondTab = $('.seg [data-mode="pond"]');
    pondTab.classList.toggle('locked', !g.pondUnlocked);
    pondTab.setAttribute('aria-disabled', String(!g.pondUnlocked));
    this.renderCard(g.selected);
  }

  openLevel(info, arrivals) {
    const d = this.dlg.level;
    const g = this.game;
    const loci = g.visibleLoci;
    const previous = new Set(LEVELS[info.id - 2]?.genes ?? []);
    const newGenes = loci.filter((l) => info.genes.includes(l.id) && !previous.has(l.id) && info.id > 1);
    d.innerHTML = `<div class="dlg-body">
      <p class="eyebrow">Level ${info.id} of ${LEVELS.length}</p>
      <h2>${esc(info.name)}</h2>
      <p class="story">${esc(info.intro)}</p>
      ${arrivals.length ? `<div class="partners">${arrivals.map((a) => `
        <div class="partner arrival">${swatch(a.pheno.morph, a.pheno.gfp)}<span><b>${esc(a.name)} ${sexIcon(a.sex)}</b><br><small>${esc(a.pheno.name)}</small></span>${geneBeads(a.genotype, loci)}</div>`).join('')}</div>` : ''}
      ${newGenes.map((l) => `<p class="legend">${bead(l, 1)}${bead(l, 0)} ${esc(l.name)}: ${esc(l.story)}</p>`).join('')}
      <h3>Your task</h3>
      <p>${esc(info.task)}</p>
      ${g.maxLevel ? '' : `<p class="score">Get ${info.needed} predictions right to unlock level ${info.id + 1}.</p>`}
      <div class="row"><button type="button" class="btn" data-close>Let's go</button></div>
    </div>`;
    $('[data-close]', d).addEventListener('click', () => {
      d.close();
      if (info.id === 2) this.tips.show('levelPill', { delay: 800 });
      if (info.genes.includes('G') && !LEVELS[info.id - 2]?.genes.includes('G')) this.tips.show('uv', { delay: 800 });
    });
    d.showModal();
  }

  /* ---------- mode ---------- */
  switchMode(mode) {
    if (mode === this.game.mode) return;
    if (mode === 'pond' && !this.game.pondUnlocked) {
      this.toast(`The Wild pond opens at level ${LEVELS.length}. Keep predicting!`, 'warn');
      return;
    }
    this.game.setMode(mode);
    this.applyMode(mode);
    if (mode === 'pond') {
      this.toast('Wild pond: a heron visits. Colours that match the floor survive.', 'warn', 4500);
      this.tips.show('pondCave', { delay: 1500 });
    }
  }

  applyMode(mode) {
    document.body.dataset.mode = mode;
    for (const b of document.querySelectorAll('.seg [data-mode]')) b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    this.pondBar.hidden = mode !== 'pond';
    $('#btn-stats').hidden = mode !== 'pond';
    this.tank.setMode(mode);
    this.tank.setSubstrate(this.game.substrateInfo);
    this.renderSubstrateChips();
    this.updateNextGenButton();
    this.renderCard(this.game.selected);
  }

  renderSubstrateChips() {
    const wrap = $('#substrate-chips');
    wrap.innerHTML = SUBSTRATES.filter((s) => s.pond).map((s) => `
      <button type="button" class="chip" role="radio" data-sub="${s.id}" aria-checked="${s.id === this.game.substrate}">
        <span class="sw" style="background:${s.hex}"></span>${esc(s.name)}
      </button>`).join('');
    for (const b of wrap.querySelectorAll('.chip')) {
      b.addEventListener('click', () => {
        this.game.setSubstrate(b.dataset.sub);
        this.tank.setSubstrate(this.game.substrateInfo);
        this.renderSubstrateChips();
        this.renderCard(this.game.selected);
      });
    }
  }

  updateNextGenButton() {
    const btn = $('#btn-next-gen');
    const c = this.game.canAdvanceGeneration();
    btn.disabled = !c.ok;
    btn.title = c.ok ? '' : c.reason;
  }

  nextGeneration() {
    const c = this.game.canAdvanceGeneration();
    if (!c.ok) { this.toast(c.reason, 'warn'); return; }
    this.game.advanceGeneration();
    this.updateNextGenButton();
    this.openStats();
  }

  setUv(on) {
    this.uv = on;
    document.body.dataset.uv = on ? 'on' : 'off';
    $('#btn-uv').setAttribute('aria-pressed', String(on));
    this.tank.setUv(on);
    if (on) {
      const glowers = this.game.population.filter((a) => a.pheno.gfp).length;
      this.toast(glowers ? `UV lamp on: ${glowers} glowing!` : 'UV lamp on. Nobody glows yet: breed in the glow gene!', glowers ? 'good' : '');
    }
  }

  /* ---------- selected card ---------- */
  renderCard(a) {
    if (!a) {
      this.card.hidden = true;
      this.hint.hidden = false;
      this.hint.textContent = 'Tap an axolotl to pick it up';
      return;
    }
    this.hint.hidden = true;
    const g = this.game;
    const loci = g.visibleLoci;
    const tags = [
      a.adult ? '' : `<span class="tag baby">Baby ${Math.round(a.age * 100)}%</span>`,
      a.hunger > 0.6 ? '<span class="tag hungry">Hungry</span>' : '',
      a.mutated?.length ? '<span class="tag new">Mutation!</span>' : '',
      `<span class="tag">Gen ${a.generation}</span>`,
    ].join('');
    const pond = g.mode === 'pond';
    const camo = pond ? `<p class="camo">Camouflage on ${esc(g.substrateInfo.name.toLowerCase())}: ${stars(g.camo(a))}${a.inCave ? ' · hiding in the cave' : ''}</p>` : '';
    const breedable = a.adult && g.partnersFor(a).length > 0 && !pond;
    this.card.innerHTML = `
      <button type="button" class="close" aria-label="Put down">✕</button>
      <div class="sheet-head">
        ${swatch(a.pheno.morph, a.pheno.gfp)}
        <div class="sheet-title">
          <h2>${esc(a.name)} ${sexIcon(a.sex)}</h2>
          <p>${esc(a.pheno.name)} ${tags}</p>
        </div>
      </div>
      ${geneBeads(a.genotype, loci)}
      ${legend(loci)}
      ${camo}
      <div class="sheet-actions">
        <button type="button" class="btn" id="card-breed" ${breedable ? '' : 'disabled'}>Breed</button>
        <button type="button" class="btn quiet" id="card-story">About this morph</button>
        <button type="button" class="btn danger small" id="card-release">Release</button>
      </div>
      <p class="how">Tap the floor to send ${esc(a.name)} there, or press and drag to steer.</p>`;
    $('.close', this.card).addEventListener('click', () => g.select(null));
    $('#card-breed', this.card).addEventListener('click', () => this.openBreed(a));
    $('#card-story', this.card).addEventListener('click', () => this.openStory(a));
    $('#card-release', this.card).addEventListener('click', () => {
      if (g.population.length <= 2) { this.toast('Keep at least two, or the tank gets lonely.', 'warn'); return; }
      g.removeAxolotl(a.id);
      this.toast(`${a.name} swam off to a new home.`);
    });
    if (breedable && g.quiz.asked === 0) this.tips.show('breed');
    if (!breedable && a.adult && !pond) {
      const btn = $('#card-breed', this.card);
      btn.title = g.population.length + LIMITS.clutch > LIMITS.population ? 'Tank full' : `No grown-up ${a.sex === 'F' ? 'male' : 'female'} to breed with`;
    }
    this.card.hidden = false;
  }

  openStory(a) {
    const d = this.dlg.menu;
    const loci = this.game.visibleLoci;
    const hidden = loci.filter((l) => l.kind === 'recessive' && a.genotype[l.id][0] !== a.genotype[l.id][1]);
    const active = loci.filter((l) => {
      const [x, y] = a.genotype[l.id];
      return l.kind === 'recessive' ? x === 0 && y === 0 : x === 1 || y === 1;
    });
    d.innerHTML = `<div class="dlg-body">
      <h2>${esc(a.name)} is ${esc(a.pheno.name.toLowerCase())}</h2>
      ${active.length ? active.map((l) => `<p class="story"><b>${esc(l.morph)}</b> — ${esc(l.story)}</p>`).join('') : '<p class="story"><b>Wild type</b> — all strong genes showing. Dark olive with gold flecks, just like axolotls in Mexican lakes.</p>'}
      ${hidden.length ? `<h3>Secret carrier</h3><p>${esc(a.name)} secretly carries ${hidden.map((l) => `<b>${esc(l.morph.toLowerCase())}</b>`).join(', ')}. It doesn't show, but babies might get it if the other parent carries it too.</p>` : ''}
      <div class="row"><button type="button" class="btn quiet" data-close>Close</button></div>
    </div>`;
    $('[data-close]', d).addEventListener('click', () => d.close());
    d.showModal();
  }

  /* ---------- breeding flow ---------- */
  openBreed(a) {
    const d = this.dlg.breed;
    const partners = this.game.partnersFor(a);
    d.innerHTML = `<div class="dlg-body">
      <h2>Who should ${esc(a.name)} breed with?</h2>
      <p>Pick a grown-up ${a.sex === 'F' ? 'male' : 'female'}.</p>
      <div class="partners">${partners.map((p) => `
        <button type="button" class="partner" data-id="${p.id}">
          ${swatch(p.pheno.morph, p.pheno.gfp)}
          <span><b>${esc(p.name)} ${sexIcon(p.sex)}</b><br><small>${esc(p.pheno.name)}</small></span>
        </button>`).join('')}</div>
      <div class="row"><button type="button" class="btn quiet" data-close>Cancel</button></div>
    </div>`;
    $('[data-close]', d).addEventListener('click', () => d.close());
    for (const b of d.querySelectorAll('.partner')) {
      b.addEventListener('click', () => this.predictStep(a, this.game.get(Number(b.dataset.id))));
    }
    d.showModal();
  }

  /** Morphs that can exist at this level, used to pad the quiz with sensible distractors. */
  reachableMorphs() {
    const ids = new Set(this.game.visibleLoci.map((l) => l.id));
    return MORPHS.filter((m) => {
      switch (m.key) {
        case 'wild': return true;
        case 'leucistic': return ids.has('D');
        case 'golden': return ids.has('A');
        case 'melanoid': return ids.has('M');
        case 'axanthic': return ids.has('AX');
        case 'copper': return ids.has('CU');
        default: return ids.has('A') && ids.has('M') && ids.has('AX');
      }
    });
  }

  predictStep(a, b) {
    const d = this.dlg.breed;
    const g = this.game;
    const info = g.levelInfo;
    const loci = g.visibleLoci;
    const dist = g.predict(a, b);
    const options = dist.slice(0, info.choices);
    const used = new Set(options.map((o) => o.dexKey));
    for (const m of this.reachableMorphs()) {
      if (options.length >= info.choices) break;
      if (!used.has(m.key)) { options.push({ dexKey: m.key, name: m.name, morph: m, gfp: false, p: 0 }); used.add(m.key); }
    }
    options.sort(() => Math.random() - 0.5);
    let guess = null;
    const parentCard = (p) => `<div class="parent">
      <div class="sheet-head">${swatch(p.pheno.morph, p.pheno.gfp)}<div class="sheet-title"><h2>${esc(p.name)} ${sexIcon(p.sex)}</h2><p>${esc(p.pheno.name)}</p></div></div>
      ${geneBeads(p.genotype, loci)}
    </div>`;
    d.innerHTML = `<div class="dlg-body">
      <h2>Look at the gene beads</h2>
      <div class="parents">${parentCard(a)}${parentCard(b)}</div>
      ${legend(loci)}
      <h3>Which colour will MOST of the babies be?</h3>
      <div class="choices">${options.map((o) => `
        <button type="button" class="choice" data-key="${o.dexKey}" aria-pressed="false">${swatch(o.morph, o.gfp)}${esc(o.name)}</button>`).join('')}</div>
      <div class="row">
        <button type="button" class="btn quiet" data-back>Back</button>
        <button type="button" class="btn" data-hatch disabled>Hatch ${LIMITS.clutch} eggs</button>
      </div>
    </div>`;
    for (const c of d.querySelectorAll('.choice')) {
      c.addEventListener('click', () => {
        guess = c.dataset.key;
        for (const o of d.querySelectorAll('.choice')) o.setAttribute('aria-pressed', String(o === c));
        $('[data-hatch]', d).disabled = false;
      });
    }
    $('[data-back]', d).addEventListener('click', () => this.openBreed(a));
    $('[data-hatch]', d).addEventListener('click', () => this.hatchStep(a, b, guess, options, dist));
  }

  hatchStep(a, b, guess, options, dist) {
    const d = this.dlg.breed;
    const g = this.game;
    const info = g.levelInfo; // captured before breed() may level up
    const loci = g.visibleLoci;
    let result;
    try {
      result = g.breed(a, b, guess);
    } catch (err) {
      this.toast(err.message, 'warn');
      d.close();
      return;
    }
    const pOf = (k) => dist.find((x) => x.dexKey === k)?.p ?? 0;
    const showBeads = loci.length <= 2;
    const winnerNames = result.winners.map((k) => dist.find((x) => x.dexKey === k)?.name ?? k).join(' / ').toLowerCase();
    d.innerHTML = `<div class="dlg-body">
      <h2>${result.correct ? 'You predicted it!' : 'Surprise clutch!'}</h2>
      <p>${result.correct
        ? 'Most babies came out the colour you guessed. The gene beads told the truth.'
        : `Most babies came out ${esc(winnerNames)}. Genes are a lottery: ${info.odds ? 'the percentages show the odds.' : 'look at which beads each baby got.'}`}</p>
      <div class="eggs ${showBeads ? 'with-beads' : ''}">${result.babies.map((baby, i) => `
        <div class="egg"><div class="inner" style="--d:${i * 160}ms">${swatch(baby.pheno.morph, baby.pheno.gfp)}<b>${esc(baby.name)}</b>${esc(baby.pheno.name)}${
          baby.mutated?.length ? '<span class="mut">mutation!</span>' : ''}${showBeads ? geneBeads(baby.genotype, loci, { byParent: true }) : ''}</div></div>`).join('')}</div>
      ${info.punnett ? punnettSquare(loci[0], result.mother, result.father, dist) : ''}
      ${info.odds ? `<h3>The real odds</h3>
      <div class="choices">${options.map((o) => `
        <div class="choice ${o.dexKey === guess ? (result.correct ? 'right' : 'wrong') : ''}">${swatch(o.morph, o.gfp)}${esc(o.name)}<span class="pct">${pct(pOf(o.dexKey))}</span></div>`).join('')}</div>` : ''}
      <p class="score">Predictions right: ${g.quiz.correct} of ${g.quiz.asked}${result.leveledUp ? ' · Level up!' : ''}</p>
      <div class="row"><button type="button" class="btn" data-close>${result.leveledUp ? "See what's new" : 'Meet the babies'}</button></div>
    </div>`;
    $('[data-close]', d).addEventListener('click', () => {
      d.close();
      if (this.pendingLevel) {
        const { info: next, arrivals } = this.pendingLevel;
        this.pendingLevel = null;
        this.openLevel(next, arrivals);
      }
      this.tips.show('feedBabies', { delay: 1200 });
    });
    this.sound.hatch(result.babies.length);
    if (result.correct) setTimeout(() => this.sound.chime(), result.babies.length * 160);
    this.tank.syncPopulation(g);
    for (const baby of result.babies) this.tank.popIn(baby.id);
  }

  /* ---------- morph book ---------- */
  openDex() {
    const d = this.dlg.dex;
    const found = this.game.dex;
    const glowKnown = this.game.uvUnlocked;
    const visible = allDexEntries().filter((e) => !e.gfp || glowKnown);
    d.innerHTML = `<div class="dlg-body">
      <h2>Morph book</h2>
      <p>${found.size} of ${visible.length} found. Breed hidden genes together to unlock the rest.</p>
      <div class="dex">${visible.map((e) => `
        <div class="entry ${found.has(e.dexKey) ? '' : 'locked'}">${swatch(e.morph, e.gfp && found.has(e.dexKey))}${found.has(e.dexKey) ? esc(e.name) : '???'}</div>`).join('')}</div>
      <div class="row"><button type="button" class="btn quiet" data-close>Close</button></div>
    </div>`;
    $('[data-close]', d).addEventListener('click', () => d.close());
    d.showModal();
  }

  /* ---------- population chart ---------- */
  openStats() {
    const d = this.dlg.stats;
    const g = this.game;
    const current = {};
    for (const a of g.population) current[a.pheno.dexKey] = (current[a.pheno.dexKey] || 0) + 1;
    const cols = [...g.history, { gen: g.generation, counts: current, live: true }];
    const keys = [...new Set(cols.flatMap((c) => Object.keys(c.counts)))];
    const entry = Object.fromEntries(allDexEntries().map((e) => [e.dexKey, e]));
    const colour = (k) => entry[k]?.morph.body ?? '#999';
    d.innerHTML = `<div class="dlg-body">
      <h2>Who survives on ${esc(g.substrateInfo.name.toLowerCase())}?</h2>
      <p>Each bar is one generation. When the heron eats the ones that stand out, the survivors have more babies like themselves. That's natural selection.</p>
      <div class="bars">${cols.map((c) => {
        const total = Object.values(c.counts).reduce((s, n) => s + n, 0) || 1;
        return `<div class="bar" title="Generation ${c.gen}">${keys.map((k) => c.counts[k] ? `<span style="height:${(c.counts[k] / total) * 100}%;background:${colour(k)}"></span>` : '').join('')}</div>`;
      }).join('')}</div>
      <div class="bar-labels">${cols.map((c) => `<span>${c.live ? 'now' : `G${c.gen}`}</span>`).join('')}</div>
      <div class="key">${keys.map((k) => `<span><i class="sw" style="background:${colour(k)}"></i>${esc(entry[k]?.name ?? k)}</span>`).join('')}</div>
      <div class="row"><button type="button" class="btn quiet" data-close>Close</button></div>
    </div>`;
    $('[data-close]', d).addEventListener('click', () => d.close());
    d.showModal();
  }

  /* ---------- menu & help ---------- */
  openMenu() {
    const d = this.dlg.menu;
    const g = this.game;
    d.innerHTML = `<div class="dlg-body">
      <h2>Axolotl Gene Lab</h2>
      <p class="score">Level ${g.level} of ${LEVELS.length} · Morphs found: ${g.dex.size} · Predictions right: ${g.quiz.correct} of ${g.quiz.asked}${g.pondUnlocked ? ` · Pond generation: ${g.generation}` : ''}</p>
      ${this.store.persistent ? '' : '<p class="story">Saving is off in this browser, so progress resets when you close the page.</p>'}
      <div class="row">
        <button type="button" class="btn quiet" data-help>How to play</button>
        <button type="button" class="btn quiet" data-level>This level</button>
      </div>
      <div class="row">
        <button type="button" class="btn quiet" data-sound aria-pressed="${this.sound.enabled}">Sound: ${this.sound.enabled ? 'on' : 'off'}</button>
        <button type="button" class="btn danger" data-reset>Start over</button>
      </div>
      <div class="row"><button type="button" class="btn quiet" data-close>Close</button></div>
    </div>`;
    $('[data-close]', d).addEventListener('click', () => d.close());
    $('[data-help]', d).addEventListener('click', () => { d.close(); this.openHelp(); });
    $('[data-level]', d).addEventListener('click', () => { d.close(); this.openLevel(g.levelInfo, []); });
    $('[data-sound]', d).addEventListener('click', (e) => {
      this.sound.enabled = !this.sound.enabled;
      g.settings.sound = this.sound.enabled;
      g.emit('settings');
      e.currentTarget.textContent = `Sound: ${this.sound.enabled ? 'on' : 'off'}`;
      e.currentTarget.setAttribute('aria-pressed', String(this.sound.enabled));
      if (this.sound.enabled) this.sound.pop();
    });
    $('[data-reset]', d).addEventListener('click', () => {
      if (window.confirm('Start over with a fresh tank? Your levels and morph book will be cleared.')) { d.close(); this.onReset(); }
    });
    d.showModal();
  }

  /** Three short cards, one idea each, stepped with Next. */
  openHelp(onDone = null) {
    const d = this.dlg.help;
    const cards = [
      { pic: '👆', title: 'Pick up an axolotl', text: 'Tap one to pick it up. Tap the floor to send it there, or press and drag to steer. Swim over a worm to eat it.' },
      { pic: `${bead(LOCUS.D, 1)}${bead(LOCUS.D, 0)}`, title: 'Read the beads', text: 'Every axolotl has two beads for each gene: one from Mum, one from Dad. Big = strong. Small = hidden. A hidden colour only shows when BOTH are small.' },
      { pic: '🥚', title: 'Guess, then hatch', text: 'Breed a female and a male, guess the colour most babies will be, then hatch six eggs and see. Two right guesses unlock the next level.' },
    ];
    let i = 0;
    const render = () => {
      const c = cards[i];
      d.innerHTML = `<div class="dlg-body help">
        <div class="pic">${c.pic}</div>
        <h2>${esc(c.title)}</h2>
        <p>${esc(c.text)}</p>
        <p class="steps">${cards.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</p>
        <div class="row">
          ${i > 0 ? '<button type="button" class="btn quiet" data-prev>Back</button>' : ''}
          <button type="button" class="btn" data-next>${i < cards.length - 1 ? 'Next' : "Let's go"}</button>
        </div>
      </div>`;
      $('[data-prev]', d)?.addEventListener('click', () => { i--; render(); });
      $('[data-next]', d).addEventListener('click', () => {
        if (i < cards.length - 1) { i++; render(); return; }
        d.close();
        if (onDone) onDone();
      });
    };
    render();
    d.showModal();
  }
}
