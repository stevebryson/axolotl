/**
 * One-time contextual tips. Each tip is a speech bubble anchored to a control, shown once,
 * dismissed by tapping anywhere (or "Got it"), and remembered in the save so it never nags.
 * Tips never stack: while one is showing, others wait in a short queue.
 */
const AUTO_HIDE_MS = 15000;
const GAP = 10; // px between bubble and anchor

export const TIPS = Object.freeze({
  breed:     { anchor: '#card-breed',   text: 'Try it! Tap Breed to make babies.' },
  feedBabies:{ anchor: '#btn-feed',     text: 'Babies are tiny. Drop worms so they grow up faster.' },
  pellet:    { anchor: '#btn-feed',     text: 'Hungry axolotls swim to the worm. Or steer yours over it.' },
  grownUp:   { anchor: null,            text: 'All grown up! Grown-ups can breed.' },
  uv:        { anchor: '#btn-uv',       text: 'New: the UV lamp. Tap it to see who glows.' },
  dex:       { anchor: '#btn-dex',      text: 'A new colour! It is saved in your Morph book.' },
  levelPill: { anchor: '#level-pill',   text: 'Tap here any time to read your task again.' },
  pondCave:  { anchor: '#hint',         text: 'The glowing ring is the cave. It is the safe spot.' },
  heron:     { anchor: '#hint',         text: 'Heron! Steer your axolotl into the cave, fast!' },
  nextGen:   { anchor: '#btn-next-gen', text: 'Now press Next generation and watch the colours change.' },
  dirty:     { anchor: '#btn-clean',    text: 'The water is getting murky. Tap the sponge and scrub!' },
  crowded:   { anchor: null,            text: 'Too many grown-ups! They nip the babies. Release some grown-ups to the wild.' },
  gulp:      { anchor: null,            text: 'Axolotls swim up to gulp a bubble of air, then sink back down.' },
});

export class Tips {
  constructor({ game, root }) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'tip';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    this.el.innerHTML = '<div class="tip-arrow"></div><p></p><button type="button" class="btn small tip-ok">Got it</button>';
    root.appendChild(this.el);
    this.queue = [];
    this.current = null;
    this.timer = 0;
    this.el.querySelector('.tip-ok').addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });
    document.addEventListener('pointerdown', (e) => { if (this.current && !this.el.contains(e.target)) this.hide(); }, { capture: true });
    window.addEventListener('resize', () => this.reposition());
  }

  get seen() {
    return this.game.settings.tipsSeen;
  }

  /** Ask for a tip. Skips if already seen; waits if another tip is showing or the anchor is hidden. */
  show(id, { delay = 400, text = null } = {}) {
    const tip = TIPS[id];
    if (!tip || this.seen.includes(id) || this.queue.some((q) => q.id === id) || this.current === id) return;
    this.queue.push({ id, text: text ?? tip.text });
    setTimeout(() => this.flush(), delay);
  }

  flush() {
    if (this.current || !this.queue.length) return;
    if (document.querySelector('dialog[open]')) { setTimeout(() => this.flush(), 800); return; }
    const { id, text } = this.queue[0];
    const tip = TIPS[id];
    const anchor = tip.anchor ? document.querySelector(tip.anchor) : null;
    if (tip.anchor && (!anchor || anchor.hidden || !anchor.offsetParent)) {
      /* Anchor not on screen yet (e.g. card closed). Try again shortly; give up after a while so the queue can't jam. */
      const tries = (this.retries = (this.retries || 0) + 1);
      if (tries > 20) { this.queue.shift(); this.retries = 0; this.flush(); return; }
      setTimeout(() => this.flush(), 700);
      return;
    }
    this.retries = 0;
    this.queue.shift();
    this.current = id;
    this.seen.push(id);
    this.game.emit('settings');
    this.el.querySelector('p').textContent = text;
    this.el.hidden = false;
    this.el.classList.remove('show');
    this.reposition();
    requestAnimationFrame(() => this.el.classList.add('show'));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
  }

  reposition() {
    if (!this.current) return;
    const tip = TIPS[this.current];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(300, vw - 24);
    this.el.style.width = `${w}px`;
    const h = this.el.offsetHeight || 80;
    const arrow = this.el.querySelector('.tip-arrow');
    if (!tip.anchor) {
      /* Free-floating: centred, just under the top bar. */
      arrow.hidden = true;
      this.el.classList.remove('above');
      this.el.style.top = `${Math.round(vh * 0.28)}px`;
      this.el.style.left = `${Math.round((vw - w) / 2)}px`;
      return;
    }
    arrow.hidden = false;
    const anchor = document.querySelector(tip.anchor);
    if (!anchor) return;
    const a = anchor.getBoundingClientRect();
    const below = a.bottom + GAP + h < vh - 12;
    const top = below ? a.bottom + GAP : a.top - GAP - h;
    const cx = a.left + a.width / 2;
    const left = Math.max(12, Math.min(vw - w - 12, cx - w / 2));
    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
    this.el.classList.toggle('above', !below);
    arrow.style.left = `${Math.max(16, Math.min(w - 16, cx - left))}px`;
  }

  hide() {
    if (!this.current) return;
    clearTimeout(this.timer);
    this.current = null;
    this.el.classList.remove('show');
    this.el.hidden = true;
    setTimeout(() => this.flush(), 600);
  }
}
