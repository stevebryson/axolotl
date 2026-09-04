import {
  LOCI, MUTATION_RATE, phenotype, makeGenotype, cloneGenotype, isValidGenotype, offspring, punnettDistribution, camouflage,
} from './genetics.js';
import { pickName } from './names.js';

export const TANK = Object.freeze({
  width: 12, depth: 7, height: 5,
  margin: 0.6,
  cave: { x: -3.9, z: -1.9, radius: 1.35 },
});

export const SUBSTRATES = Object.freeze([
  { id: 'gravel', name: 'Tank gravel', hex: '#b9a98c', deep: '#8d7b5e', pond: false },
  { id: 'mud',    name: 'Dark mud',    hex: '#2f2a24', deep: '#1b1714', pond: true },
  { id: 'sand',   name: 'Pale sand',   hex: '#dccba5', deep: '#b8a47a', pond: true },
  { id: 'pebble', name: 'Grey pebbles',hex: '#7b7e84', deep: '#55585e', pond: true },
  { id: 'weed',   name: 'Green weeds', hex: '#3f5a30', deep: '#25391b', pond: true },
]);

export const LIMITS = Object.freeze({
  population: 14,
  clutch: 6,
  growSeconds: 90,
  hungerSeconds: 75,
  heronMinSeconds: 40,
  heronMaxSeconds: 60,
  heronWarnSeconds: 4,
});

const SAVE_VERSION = 2;

/**
 * Progression. Each level reveals more genes; everything outside the current level's gene list
 * is fixed to strong-strong and never shown, so nothing confusing leaks through early on.
 * A level is passed with `needed` correct predictions, which brings the next level's arrivals.
 */
export const LEVELS = Object.freeze([
  { id: 1, name: 'One gene', genes: ['D'], choices: 2, needed: 2, punnett: true, odds: false,
    intro: 'Every axolotl has two beads for the Pink gene: one from Mum, one from Dad. A big D is strong. Pink only shows when BOTH beads are small.',
    task: 'Breed your pair and guess the colour of most babies. Get it right twice to unlock the next gene.' },
  { id: 2, name: 'Two genes', genes: ['D', 'A'], choices: 3, needed: 2, punnett: false, odds: false,
    intro: 'Two new axolotls just arrived from the shop. One is golden: it has two small a beads. Golden is stronger than pink: an albino body can\'t make ANY colour, so pink is hidden underneath.',
    task: 'Breed the golden one and guess again. Which colour wins when a baby gets both?',
    arrivals: [
      { sex: 'F', genotype: { A: [0, 0], D: [1, 0] } },
      { sex: 'M', genotype: { A: [1, 0], D: [1, 0] } },
    ] },
  { id: 3, name: 'Secret carriers', genes: ['D', 'A', 'M', 'AX'], choices: 4, needed: 2, punnett: false, odds: true,
    intro: 'Meet the Black gene and the Grey gene. Some axolotls look wild but secretly carry small beads. Now you can see the real odds for each colour.',
    task: 'Find the secret carriers on their cards and pair them up to reveal hidden colours.',
    arrivals: [
      { sex: 'M', genotype: { M: [0, 0], AX: [1, 0] } },
      { sex: 'F', genotype: { M: [1, 0], AX: [1, 0], D: [1, 0] } },
    ] },
  { id: 4, name: 'A different rule', genes: ['D', 'A', 'M', 'AX', 'G'], choices: 4, needed: 2, punnett: false, odds: true,
    intro: 'The Glow gene breaks the rule: it is strong, not hidden. ONE big G is enough to glow green under UV light. The UV lamp is now yours.',
    task: 'Breed the glowing newcomer and switch on the lamp to see who inherited the glow.',
    arrivals: [
      { sex: 'M', genotype: { G: [1, 0], D: [1, 0] } },
    ] },
  { id: 5, name: 'Mutations', genes: ['D', 'A', 'M', 'AX', 'G', 'CU'], choices: 4, needed: 2, punnett: false, odds: true, mutation: true,
    intro: 'Very rarely a bead flips on its own when an egg is made. That is a mutation, and it is how brand-new colours first appeared in nature. The Copper gene has also arrived.',
    task: 'Keep breeding. Watch for the purple "mutation!" tag on a baby.',
    arrivals: [
      { sex: 'F', genotype: { CU: [0, 0], M: [1, 0] } },
    ] },
  { id: 6, name: 'Wild pond', genes: ['D', 'A', 'M', 'AX', 'G', 'CU'], choices: 4, needed: 0, punnett: false, odds: true, mutation: true, pond: true,
    intro: 'The Wild pond is open. A heron hunts every minute or so. Axolotls that match the pond floor are hard to spot; bright ones get eaten. Survivors have the babies.',
    task: 'Pick a pond floor, press Next generation a few times, and watch the colours shift. That is evolution.' },
]);

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Axolotl {
  constructor(o) {
    this.id = o.id;
    this.name = o.name;
    this.sex = o.sex; // 'F' | 'M'
    this.genotype = o.genotype;
    this.generation = o.generation ?? 0;
    this.parents = o.parents ?? null;
    this.age = o.age ?? 1; // 0 baby .. 1 adult
    this.hunger = o.hunger ?? 0.3; // 0 full .. 1 starving
    this.x = o.x ?? 0;
    this.z = o.z ?? 0;
    this.heading = o.heading ?? 0;
    this.vx = 0;
    this.vz = 0;
    this.target = null;
    this.thinkTimer = rand(0, 2);
    this.control = null; // { dx, dz } from joystick while controlled
    this.eatFlash = 0;
    this.pheno = phenotype(this.genotype);
  }

  get adult() {
    return this.age >= 1;
  }

  get scale() {
    return 0.35 + 0.65 * clamp(this.age, 0, 1);
  }

  get speed() {
    return (this.adult ? 2.1 : 1.5) * (1 - 0.35 * (1 - this.age));
  }

  get inCave() {
    return Math.hypot(this.x - TANK.cave.x, this.z - TANK.cave.z) <= TANK.cave.radius;
  }

  toJSON() {
    return {
      id: this.id, name: this.name, sex: this.sex, genotype: this.genotype, generation: this.generation,
      parents: this.parents, age: +this.age.toFixed(3), hunger: +this.hunger.toFixed(3),
      x: +this.x.toFixed(2), z: +this.z.toFixed(2), heading: +this.heading.toFixed(3),
    };
  }
}

export class Game {
  constructor() {
    this.population = [];
    this.pellets = [];
    this.dex = new Set();
    this.history = []; // pond generations: { gen, counts: { dexKey: n } }
    this.generation = 0;
    this.nextId = 1;
    this.mode = 'tank'; // 'tank' | 'pond'
    this.substrate = 'gravel';
    this.quiz = { asked: 0, correct: 0 };
    this.tutorialSeen = false;
    this.settings = { sound: true, tipsSeen: [] };
    this.level = 1;
    this.levelCorrect = 0;
    this.selectedId = null;
    this.heron = { phase: 'idle', timer: rand(LIMITS.heronMinSeconds, LIMITS.heronMaxSeconds), progress: 0 };
    this.listeners = new Map();
  }

  /* ---------- events ---------- */
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type).delete(fn);
  }

  emit(type, payload) {
    const set = this.listeners.get(type);
    if (set) for (const fn of set) fn(payload);
  }

  /* ---------- setup ---------- */
  newGame() {
    this.population = [];
    this.pellets = [];
    this.dex = new Set();
    this.history = [];
    this.generation = 0;
    this.nextId = 1;
    this.mode = 'tank';
    this.substrate = 'gravel';
    this.quiz = { asked: 0, correct: 0 };
    this.level = 1;
    this.levelCorrect = 0;
    this.settings = { sound: this.settings.sound, tipsSeen: [] };
    this.selectedId = null;
    /* Level 1 starter pair: both carry one hidden Pink bead, so the first clutch is a clean 3:1. */
    this.addAxolotl({ sex: 'F', x: -2, z: 0.5, age: 1, genotype: makeGenotype({ D: [1, 0] }) });
    this.addAxolotl({ sex: 'M', x: 2, z: -0.5, age: 1, genotype: makeGenotype({ D: [1, 0] }) });
    this.emit('population');
  }

  addAxolotl(o) {
    const taken = new Set(this.population.map((a) => a.name));
    const a = new Axolotl({
      id: this.nextId++,
      name: o.name ?? pickName(taken),
      sex: o.sex ?? (Math.random() < 0.5 ? 'F' : 'M'),
      genotype: o.genotype,
      generation: o.generation ?? 0,
      parents: o.parents ?? null,
      age: o.age ?? 0,
      hunger: o.hunger ?? 0.3,
      x: o.x ?? rand(-3, 3),
      z: o.z ?? rand(-2, 2),
      heading: o.heading ?? rand(0, Math.PI * 2),
    });
    this.population.push(a);
    const isNew = !this.dex.has(a.pheno.dexKey);
    this.dex.add(a.pheno.dexKey);
    this.emit('added', { axolotl: a, newMorph: isNew });
    return a;
  }

  removeAxolotl(id) {
    const i = this.population.findIndex((a) => a.id === id);
    if (i < 0) return;
    const [a] = this.population.splice(i, 1);
    if (this.selectedId === id) this.selectedId = null;
    this.emit('removed', a);
    this.emit('population');
  }

  get(id) {
    return this.population.find((a) => a.id === id) ?? null;
  }

  get selected() {
    return this.get(this.selectedId);
  }

  select(id) {
    if (this.selectedId === id) return;
    const prev = this.selected;
    if (prev) { prev.control = null; prev.target = null; }
    this.selectedId = id;
    this.emit('selected', this.selected);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'pond' && !this.pondUnlocked) return;
    this.mode = mode;
    if (mode === 'pond' && !SUBSTRATES.find((s) => s.id === this.substrate)?.pond) this.substrate = 'mud';
    if (mode === 'tank') this.substrate = 'gravel';
    this.heron = { phase: 'idle', timer: rand(LIMITS.heronMinSeconds, LIMITS.heronMaxSeconds), progress: 0 };
    this.emit('mode', mode);
    this.emit('substrate', this.substrateInfo);
  }

  setSubstrate(id) {
    if (!SUBSTRATES.find((s) => s.id === id)) return;
    this.substrate = id;
    this.emit('substrate', this.substrateInfo);
  }

  get substrateInfo() {
    return SUBSTRATES.find((s) => s.id === this.substrate);
  }

  camo(a) {
    return camouflage(a.pheno.morph.body, this.substrateInfo.hex);
  }

  /* ---------- progression ---------- */
  get levelInfo() {
    return LEVELS[Math.min(this.level, LEVELS.length) - 1];
  }

  /** Loci the player is allowed to see at the current level. */
  get visibleLoci() {
    const ids = new Set(this.levelInfo.genes);
    return LOCI.filter((l) => ids.has(l.id));
  }

  get maxLevel() {
    return this.level >= LEVELS.length;
  }

  get pondUnlocked() {
    return Boolean(this.levelInfo.pond);
  }

  get uvUnlocked() {
    return this.levelInfo.genes.includes('G');
  }

  get mutationRate() {
    return this.levelInfo.mutation ? MUTATION_RATE : 0;
  }

  /** Advance to the next level and bring its arrivals. Returns the new level info. */
  levelUp() {
    if (this.maxLevel) return null;
    this.level++;
    this.levelCorrect = 0;
    const info = this.levelInfo;
    const arrivals = [];
    for (const spec of info.arrivals ?? []) {
      const side = arrivals.length % 2 ? -1 : 1;
      arrivals.push(this.addAxolotl({
        sex: spec.sex, genotype: makeGenotype(spec.genotype), age: 1, hunger: 0.3,
        x: side * 4.6, z: 2.4, heading: side > 0 ? -Math.PI / 2 : Math.PI / 2,
      }));
    }
    this.emit('population');
    this.emit('levelUp', { info, arrivals });
    return info;
  }

  /** Called after a scored prediction. */
  recordPrediction(correct) {
    this.quiz.asked++;
    if (!correct) return false;
    this.quiz.correct++;
    if (this.maxLevel) return false;
    this.levelCorrect++;
    if (this.levelCorrect >= this.levelInfo.needed) {
      this.levelUp();
      return true;
    }
    return false;
  }

  /* ---------- feeding ---------- */
  dropPellet() {
    if (this.pellets.length >= 8) return null;
    const p = { id: this.nextId++, x: rand(-4.5, 4.5), z: rand(-2.5, 2.5), y: TANK.height - 0.3, claimed: null };
    this.pellets.push(p);
    this.emit('pellet', p);
    return p;
  }

  /* ---------- breeding ---------- */
  canBreed(a, b) {
    if (!a || !b || a.id === b.id) return { ok: false, reason: 'Pick two different axolotls.' };
    if (!a.adult || !b.adult) return { ok: false, reason: 'Both need to be grown up first.' };
    if (a.sex === b.sex) return { ok: false, reason: 'Breeding needs one female and one male.' };
    if (this.population.length + LIMITS.clutch > LIMITS.population) {
      return { ok: false, reason: `Tank is full. Release some axolotls first (max ${LIMITS.population}).` };
    }
    return { ok: true };
  }

  partnersFor(a) {
    return this.population.filter((b) => b.id !== a.id && b.adult && b.sex !== a.sex);
  }

  predict(a, b) {
    return punnettDistribution(a.genotype, b.genotype);
  }

  /**
   * Hatch a clutch. Returns the babies and whether the guess was right.
   * @param {Axolotl} a
   * @param {Axolotl} b
   * @param {string|null} guessDexKey
   */
  breed(a, b, guessDexKey = null) {
    const check = this.canBreed(a, b);
    if (!check.ok) throw new Error(check.reason);
    const mother = a.sex === 'F' ? a : b;
    const father = a.sex === 'F' ? b : a;
    const babies = [];
    const counts = new Map();
    const mutationRate = this.mutationRate;
    for (let i = 0; i < LIMITS.clutch; i++) {
      const child = offspring(mother.genotype, father.genotype, Math.random, mutationRate);
      const ang = (i / LIMITS.clutch) * Math.PI * 2;
      const baby = this.addAxolotl({
        genotype: child.genotype,
        generation: Math.max(mother.generation, father.generation) + 1,
        parents: [mother.id, father.id],
        age: 0,
        hunger: 0.6,
        x: clamp(mother.x + Math.cos(ang) * 0.9, -5, 5),
        z: clamp(mother.z + Math.sin(ang) * 0.9, -2.8, 2.8),
      });
      baby.mutated = child.mutated;
      babies.push(baby);
      counts.set(baby.pheno.dexKey, (counts.get(baby.pheno.dexKey) || 0) + 1);
    }
    const max = Math.max(...counts.values());
    const winners = [...counts.entries()].filter(([, n]) => n === max).map(([k]) => k);
    const correct = guessDexKey != null && winners.includes(guessDexKey);
    const leveledUp = guessDexKey != null ? this.recordPrediction(correct) : false;
    this.emit('population');
    return { babies, correct, winners, mother, father, leveledUp };
  }

  /* ---------- pond: selection and generations ---------- */
  get heronReady() {
    return this.mode === 'pond' && this.population.length > 2;
  }

  /** Heron strike: each visible axolotl risks being eaten in proportion to its contrast with the substrate. */
  heronStrike() {
    const victims = [];
    const safe = [];
    const floor = 2;
    const order = [...this.population].sort(() => Math.random() - 0.5);
    for (const a of order) {
      if (this.population.length - victims.length <= floor) break;
      if (a.inCave) { safe.push(a); continue; }
      const contrast = 1 - this.camo(a);
      const p = 0.75 * Math.pow(contrast, 1.4);
      if (Math.random() < p) victims.push(a);
    }
    for (const v of victims) this.removeAxolotl(v.id);
    const summary = { victims, hidden: safe.length, survivors: this.population.length };
    this.emit('heron', summary);
    return summary;
  }

  canAdvanceGeneration() {
    const adults = this.population.filter((a) => a.adult);
    const f = adults.some((a) => a.sex === 'F');
    const m = adults.some((a) => a.sex === 'M');
    if (!f || !m) return { ok: false, reason: 'Need at least one grown-up female and one grown-up male.' };
    return { ok: true };
  }

  /**
   * Survivors pair up and breed; the old generation retires to the river.
   * Records morph frequencies so the kid can watch the population shift.
   */
  advanceGeneration() {
    const check = this.canAdvanceGeneration();
    if (!check.ok) throw new Error(check.reason);
    const adults = this.population.filter((a) => a.adult);
    const females = adults.filter((a) => a.sex === 'F');
    const males = adults.filter((a) => a.sex === 'M');
    const nextGen = this.generation + 1;
    const children = [];
    const perPair = Math.max(2, Math.floor(LIMITS.population / Math.max(females.length, 1)));
    for (const mother of females) {
      const father = males[Math.floor(Math.random() * males.length)];
      for (let i = 0; i < perPair && children.length < LIMITS.population; i++) {
        const child = offspring(mother.genotype, father.genotype, Math.random, this.mutationRate);
        children.push({ genotype: child.genotype, parents: [mother.id, father.id] });
      }
    }
    const retiring = [...this.population];
    for (const a of retiring) this.removeAxolotl(a.id);
    for (const c of children) {
      this.addAxolotl({ genotype: c.genotype, parents: c.parents, generation: nextGen, age: 1, hunger: 0.3 });
    }
    this.generation = nextGen;
    this.recordHistory();
    this.heron = { phase: 'idle', timer: rand(LIMITS.heronMinSeconds, LIMITS.heronMaxSeconds), progress: 0 };
    this.emit('population');
    this.emit('generation', { generation: nextGen, retired: retiring.length, born: children.length });
    return { retired: retiring.length, born: children.length };
  }

  recordHistory() {
    const counts = {};
    for (const a of this.population) counts[a.pheno.dexKey] = (counts[a.pheno.dexKey] || 0) + 1;
    this.history.push({ gen: this.generation, substrate: this.substrate, counts });
    if (this.history.length > 12) this.history.shift();
  }

  /* ---------- simulation ---------- */
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.updatePellets(dt);
    for (const a of this.population) this.updateAxolotl(a, dt);
    this.separate();
    if (this.mode === 'pond') this.updateHeron(dt);
  }

  updatePellets(dt) {
    for (const p of this.pellets) p.y = Math.max(0.12, p.y - 1.6 * dt);
  }

  updateAxolotl(a, dt) {
    if (!a.adult) {
      a.age = Math.min(1, a.age + dt / LIMITS.growSeconds);
      if (a.adult) this.emit('grownUp', a);
    }
    a.hunger = Math.min(1, a.hunger + dt / LIMITS.hungerSeconds);
    if (a.eatFlash > 0) a.eatFlash -= dt;

    let dx = 0;
    let dz = 0;
    let moving = false;

    if (a.control) {
      dx = a.control.dx;
      dz = a.control.dz;
      moving = Math.hypot(dx, dz) > 0.05;
      a.target = null;
    } else {
      if (a.id !== this.selectedId) this.think(a, dt);
      if (a.target) {
        const tx = a.target.x - a.x;
        const tz = a.target.z - a.z;
        const d = Math.hypot(tx, tz);
        if (d < 0.18) {
          if (a.target.pellet) this.eat(a, a.target.pellet);
          a.target = null;
        } else {
          dx = tx / d;
          dz = tz / d;
          moving = true;
        }
      }
    }

    if (moving) {
      const s = a.speed;
      a.vx += (dx * s - a.vx) * Math.min(1, dt * 6);
      a.vz += (dz * s - a.vz) * Math.min(1, dt * 6);
    } else {
      a.vx *= Math.max(0, 1 - dt * 5);
      a.vz *= Math.max(0, 1 - dt * 5);
    }
    a.x += a.vx * dt;
    a.z += a.vz * dt;

    const hx = TANK.width / 2 - TANK.margin;
    const hz = TANK.depth / 2 - TANK.margin;
    if (a.x < -hx || a.x > hx) { a.x = clamp(a.x, -hx, hx); a.vx = 0; }
    if (a.z < -hz || a.z > hz) { a.z = clamp(a.z, -hz, hz); a.vz = 0; }

    const sp = Math.hypot(a.vx, a.vz);
    if (sp > 0.05) {
      const want = Math.atan2(a.vx, a.vz);
      let diff = want - a.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.heading += diff * Math.min(1, dt * 7);
    }
  }

  think(a, dt) {
    if (a.hunger > 0.35 && this.pellets.length) {
      const p = this.nearestPellet(a);
      if (p && (!a.target || !a.target.pellet)) {
        p.claimed = a.id;
        a.target = { x: p.x, z: p.z, pellet: p };
        return;
      }
    }
    a.thinkTimer -= dt;
    if (a.thinkTimer > 0) return;
    if (Math.random() < 0.45) {
      a.target = null;
      a.thinkTimer = rand(1.5, 4);
    } else {
      const hx = TANK.width / 2 - TANK.margin - 0.3;
      const hz = TANK.depth / 2 - TANK.margin - 0.3;
      a.target = { x: clamp(a.x + rand(-3, 3), -hx, hx), z: clamp(a.z + rand(-2, 2), -hz, hz) };
      a.thinkTimer = rand(3, 6);
    }
  }

  nearestPellet(a) {
    let best = null;
    let bd = Infinity;
    for (const p of this.pellets) {
      if (p.claimed && p.claimed !== a.id && this.get(p.claimed)) continue;
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  eat(a, pellet) {
    const i = this.pellets.indexOf(pellet);
    if (i < 0) return;
    this.pellets.splice(i, 1);
    a.hunger = Math.max(0, a.hunger - 0.55);
    if (!a.adult) {
      a.age = Math.min(1, a.age + 0.08);
      if (a.adult) this.emit('grownUp', a);
    }
    a.eatFlash = 0.8;
    this.emit('ate', { axolotl: a, pellet });
  }

  /** Player-controlled axolotls can eat by walking over a pellet. */
  tryEatNearby(a) {
    for (const p of this.pellets) {
      if (p.y <= 0.13 && Math.hypot(p.x - a.x, p.z - a.z) < 0.4) { this.eat(a, p); return true; }
    }
    return false;
  }

  separate() {
    const n = this.population.length;
    for (let i = 0; i < n; i++) {
      const a = this.population[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.population[j];
        const min = 0.45 * (a.scale + b.scale);
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz) || 0.001;
        if (d < min) {
          const push = (min - d) * 0.5;
          const ux = dx / d;
          const uz = dz / d;
          a.x -= ux * push; a.z -= uz * push;
          b.x += ux * push; b.z += uz * push;
        }
      }
    }
  }

  updateHeron(dt) {
    const h = this.heron;
    if (h.phase === 'idle') {
      if (!this.heronReady) return;
      h.timer -= dt;
      if (h.timer <= 0) {
        h.phase = 'warning';
        h.progress = 0;
        this.emit('heronWarning');
      }
    } else if (h.phase === 'warning') {
      h.progress += dt / LIMITS.heronWarnSeconds;
      if (h.progress >= 1) {
        h.phase = 'strike';
        h.progress = 0;
        this.heronStrike();
      }
    } else if (h.phase === 'strike') {
      h.progress += dt / 1.2;
      if (h.progress >= 1) {
        h.phase = 'idle';
        h.timer = rand(LIMITS.heronMinSeconds, LIMITS.heronMaxSeconds);
      }
    }
  }

  /* ---------- persistence ---------- */
  toJSON() {
    return {
      version: SAVE_VERSION,
      mode: this.mode,
      substrate: this.substrate,
      generation: this.generation,
      nextId: this.nextId,
      population: this.population.map((a) => a.toJSON()),
      dex: [...this.dex],
      history: this.history,
      quiz: this.quiz,
      tutorialSeen: this.tutorialSeen,
      settings: this.settings,
      level: this.level,
      levelCorrect: this.levelCorrect,
    };
  }

  /** @returns {boolean} true when a valid save was restored */
  load(data) {
    if (!data || !Array.isArray(data.population)) return false;
    if (data.version !== SAVE_VERSION && data.version !== 1) return false;
    /* v1 saves predate levels: they already had every gene, so they continue fully unlocked. */
    const level = data.version === 1 ? LEVELS.length : Number.isInteger(data.level) ? Math.min(Math.max(data.level, 1), LEVELS.length) : 1;
    const pop = data.population.filter((p) => isValidGenotype(p.genotype) && (p.sex === 'F' || p.sex === 'M'));
    if (pop.length === 0) return false;
    this.population = pop.map((p) => new Axolotl({ ...p, genotype: cloneGenotype(p.genotype) }));
    this.pellets = [];
    this.dex = new Set(Array.isArray(data.dex) ? data.dex : []);
    for (const a of this.population) this.dex.add(a.pheno.dexKey);
    this.history = Array.isArray(data.history) ? data.history : [];
    this.generation = Number.isInteger(data.generation) ? data.generation : 0;
    this.nextId = Math.max(Number.isInteger(data.nextId) ? data.nextId : 1, ...this.population.map((a) => a.id + 1));
    this.mode = data.mode === 'pond' ? 'pond' : 'tank';
    this.substrate = SUBSTRATES.some((s) => s.id === data.substrate) ? data.substrate : 'gravel';
    this.quiz = data.quiz && Number.isInteger(data.quiz.asked) ? data.quiz : { asked: 0, correct: 0 };
    this.tutorialSeen = Boolean(data.tutorialSeen);
    this.settings = {
      sound: data.settings?.sound !== false,
      tipsSeen: Array.isArray(data.settings?.tipsSeen) ? data.settings.tipsSeen.filter((t) => typeof t === 'string') : [],
    };
    this.level = level;
    this.levelCorrect = Number.isInteger(data.levelCorrect) ? data.levelCorrect : 0;
    if (this.mode === 'pond' && !this.pondUnlocked) { this.mode = 'tank'; this.substrate = 'gravel'; }
    this.selectedId = null;
    this.emit('population');
    return true;
  }
}
