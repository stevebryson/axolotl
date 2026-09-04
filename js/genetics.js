/**
 * Axolotl colour genetics.
 *
 * Alleles are stored as 1 (dominant / "strong") or 0 (recessive / "hidden").
 * A genotype is { [locusId]: [allele, allele] }.
 *
 * Real axolotl morphs used here:
 *   D  leucistic  - d/d removes skin pigment cells: pale pink body, dark eyes
 *   A  albino     - a/a removes melanin: golden or white body, pink eyes
 *   M  melanoid   - m/m removes shiny iridophores, extra black pigment
 *   AX axanthic   - ax/ax removes yellow pigment: grey body
 *   CU copper     - cu/cu reduces melanin to a tan/copper tone
 *   G  GFP        - a single G makes the axolotl glow green under UV light (dominant)
 */

export const LOCI = Object.freeze([
  { id: 'D',  big: 'D',  small: 'd',  name: 'Pink gene',   morph: 'Leucistic', kind: 'recessive',
    story: 'Two small d genes switch off skin colour cells. The axolotl turns pale pink but keeps dark eyes.' },
  { id: 'A',  big: 'A',  small: 'a',  name: 'Golden gene', morph: 'Albino',    kind: 'recessive',
    story: 'Two small a genes stop the body making black pigment. Golden body, pink eyes.' },
  { id: 'M',  big: 'M',  small: 'm',  name: 'Black gene',  morph: 'Melanoid',  kind: 'recessive',
    story: 'Two small m genes remove the shiny gold flecks and add extra black. Deep, velvety dark.' },
  { id: 'AX', big: 'X',  small: 'x',  name: 'Grey gene',   morph: 'Axanthic',  kind: 'recessive',
    story: 'Two small x genes remove yellow pigment, leaving a cool grey.' },
  { id: 'CU', big: 'C',  small: 'c',  name: 'Copper gene', morph: 'Copper',    kind: 'recessive',
    story: 'Two small c genes turn black pigment to warm copper-brown.' },
  { id: 'G',  big: 'G',  small: 'g',  name: 'Glow gene',   morph: 'GFP',       kind: 'dominant',
    story: 'Just ONE big G makes the axolotl glow green under a UV lamp. This one is strong, not hidden!' },
]);

/** Mutation chance per allele per gamete. */
export const MUTATION_RATE = 0.02;

/** Static morph catalogue. Order matters only for display. */
export const MORPHS = Object.freeze([
  { key: 'wild',           name: 'Wild type',        body: '#4b5a39', spot: '#242a1c', fleck: '#d9c46a', gill: '#6d4b4e', eye: '#111111' },
  { key: 'melanoid',       name: 'Melanoid',         body: '#1d1c21', spot: null,      fleck: null,      gill: '#2a2430', eye: '#050505' },
  { key: 'axanthic',       name: 'Axanthic',         body: '#7d858f', spot: '#3d4249', fleck: '#c9ced3', gill: '#6b6f78', eye: '#111111' },
  { key: 'axanthic_mel',   name: 'Axanthic melanoid',body: '#2c2f36', spot: null,      fleck: null,      gill: '#33363d', eye: '#050505' },
  { key: 'copper',         name: 'Copper',           body: '#b57a45', spot: '#6f4424', fleck: '#e8c98a', gill: '#a35c58', eye: '#3a1e12' },
  { key: 'leucistic',      name: 'Leucistic',        body: '#f5d2d5', spot: null,      fleck: null,      gill: '#ef8aa0', eye: '#111111' },
  { key: 'golden',         name: 'Golden albino',    body: '#f0c24c', spot: null,      fleck: '#fff0b0', gill: '#ff7f8f', eye: '#e0506a' },
  { key: 'white_albino',   name: 'White albino',     body: '#f7f3ee', spot: null,      fleck: null,      gill: '#ff8593', eye: '#e0506a' },
  { key: 'mel_albino',     name: 'Melanoid albino',  body: '#efe1b5', spot: null,      fleck: null,      gill: '#ff7f8f', eye: '#e0506a' },
]);

const MORPH_BY_KEY = new Map(MORPHS.map((m) => [m.key, m]));

const isRecessive = (g, id) => g[id][0] === 0 && g[id][1] === 0;

/**
 * Resolve a genotype to a visible morph.
 * @returns {{key:string, name:string, morph:object, gfp:boolean, dexKey:string}}
 */
export function phenotype(g) {
  const albino = isRecessive(g, 'A');
  const leucistic = isRecessive(g, 'D');
  const melanoid = isRecessive(g, 'M');
  const axanthic = isRecessive(g, 'AX');
  const copper = isRecessive(g, 'CU');
  const gfp = g.G[0] === 1 || g.G[1] === 1;

  let key;
  if (albino) key = axanthic ? 'white_albino' : melanoid ? 'mel_albino' : 'golden';
  else if (leucistic) key = 'leucistic';
  else if (melanoid) key = axanthic ? 'axanthic_mel' : 'melanoid';
  else if (axanthic) key = 'axanthic';
  else if (copper) key = 'copper';
  else key = 'wild';

  const morph = MORPH_BY_KEY.get(key);
  return {
    key,
    gfp,
    morph,
    dexKey: gfp ? `${key}+gfp` : key,
    name: gfp ? `GFP ${morph.name.toLowerCase()}` : morph.name,
  };
}

/** All dex entries: every morph with and without GFP. */
export function allDexEntries() {
  const out = [];
  for (const m of MORPHS) {
    out.push({ dexKey: m.key, name: m.name, morph: m, gfp: false });
    out.push({ dexKey: `${m.key}+gfp`, name: `GFP ${m.name.toLowerCase()}`, morph: m, gfp: true });
  }
  return out;
}

/**
 * Build a genotype from a compact spec like { D: [1,0], ... }.
 * Missing loci default to "trait absent": strong-strong for recessive morphs, none-none for the dominant GFP transgene.
 */
export function makeGenotype(spec = {}) {
  const g = {};
  for (const l of LOCI) {
    const v = spec[l.id];
    g[l.id] = v ? [v[0], v[1]] : l.kind === 'dominant' ? [0, 0] : [1, 1];
  }
  return g;
}

export function cloneGenotype(g) {
  const out = {};
  for (const l of LOCI) out[l.id] = [g[l.id][0], g[l.id][1]];
  return out;
}

/** Validate a stored genotype (from persistence). */
export function isValidGenotype(g) {
  if (!g || typeof g !== 'object') return false;
  return LOCI.every((l) => Array.isArray(g[l.id]) && g[l.id].length === 2 && g[l.id].every((a) => a === 0 || a === 1));
}

/**
 * Produce one gamete (one allele per locus), with random mutation.
 * @param {() => number} rng
 * @returns {{alleles: Record<string, number>, mutated: string[]}}
 */
export function gamete(g, rng = Math.random, mutationRate = MUTATION_RATE) {
  const alleles = {};
  const mutated = [];
  for (const l of LOCI) {
    let a = g[l.id][rng() < 0.5 ? 0 : 1];
    if (rng() < mutationRate) {
      a = a === 1 ? 0 : 1;
      mutated.push(l.id);
    }
    alleles[l.id] = a;
  }
  return { alleles, mutated };
}

/** Combine two gametes into a child genotype. */
export function offspring(motherG, fatherG, rng = Math.random, mutationRate = MUTATION_RATE) {
  const m = gamete(motherG, rng, mutationRate);
  const f = gamete(fatherG, rng, mutationRate);
  const g = {};
  for (const l of LOCI) g[l.id] = [m.alleles[l.id], f.alleles[l.id]];
  return { genotype: g, mutated: [...new Set([...m.mutated, ...f.mutated])] };
}

/**
 * Exact Punnett distribution of visible morphs, ignoring mutation.
 * @returns {Array<{dexKey:string, name:string, morph:object, gfp:boolean, p:number}>} sorted by probability desc
 */
export function punnettDistribution(motherG, fatherG) {
  const combos = LOCI.map((l) => {
    const pairs = new Map(); // "a,b" -> probability
    for (const ma of motherG[l.id]) {
      for (const fa of fatherG[l.id]) {
        const k = `${ma},${fa}`;
        pairs.set(k, (pairs.get(k) || 0) + 0.25);
      }
    }
    return [...pairs.entries()].map(([k, p]) => ({ pair: k.split(',').map(Number), p }));
  });

  const acc = new Map();
  const walk = (i, g, p) => {
    if (i === LOCI.length) {
      const ph = phenotype(g);
      const cur = acc.get(ph.dexKey);
      if (cur) cur.p += p;
      else acc.set(ph.dexKey, { dexKey: ph.dexKey, name: ph.name, morph: ph.morph, gfp: ph.gfp, p });
      return;
    }
    const id = LOCI[i].id;
    for (const c of combos[i]) {
      g[id] = c.pair;
      walk(i + 1, g, p * c.p);
    }
  };
  walk(0, {}, 1);
  return [...acc.values()].sort((a, b) => b.p - a.p);
}

/** Returns the recessive morph traits this genotype secretly carries (heterozygous). */
export function hiddenCarriers(g) {
  return LOCI.filter((l) => l.kind === 'recessive' && g[l.id][0] !== g[l.id][1]);
}

/** Euclidean RGB distance normalised to 0..1. */
export function colourDistance(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return Math.min(1, d / 441.67);
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Camouflage score 0..1 (1 = perfectly hidden) for a body colour on a substrate colour. */
export function camouflage(bodyHex, substrateHex) {
  return 1 - colourDistance(bodyHex, substrateHex);
}
