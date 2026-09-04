import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

/*
 * Shared geometry, built once and reused by every axolotl.
 * Model faces +Z. Origin sits at the body's centre; the belly rests at y ≈ -0.3.
 * Lathe UVs: u wraps around the body with u = 0 at the belly and u = 0.5 on the back,
 * v runs snout → tail. The texture painter relies on that layout for belly shading.
 */
const GEO = (() => {
  /* Body profile: (radius, position along axis). Wide flat head, soft neck, chubby body, tapering rump. */
  const profile = [
    [0.02, 1.02], [0.16, 0.99], [0.30, 0.93], [0.40, 0.82], [0.45, 0.66], [0.44, 0.48],
    [0.37, 0.34], [0.34, 0.20], [0.36, 0.00], [0.36, -0.22], [0.31, -0.42], [0.24, -0.56], [0.17, -0.66], [0.10, -0.72],
  ].map(([r, z]) => new THREE.Vector2(r, z)).reverse(); // Lathe wants increasing y for outward faces
  const body = new THREE.LatheGeometry(profile, 36);
  body.rotateX(Math.PI / 2); // axis Y → Z; belly at -y
  body.scale(1.12, 0.78, 1);
  body.computeVertexNormals();

  /* Tail: a tapering lathe core plus a translucent fin. */
  const tailProfile = [[0.16, 0.02], [0.14, -0.30], [0.10, -0.62], [0.05, -0.95], [0.01, -1.12]]
    .map(([r, z]) => new THREE.Vector2(r, z)).reverse();
  const tailCore = new THREE.LatheGeometry(tailProfile, 20);
  tailCore.rotateX(Math.PI / 2);
  tailCore.scale(1, 0.75, 1);
  tailCore.computeVertexNormals();

  const finShape = new THREE.Shape();
  finShape.moveTo(0.0, -0.06);
  finShape.lineTo(0.0, 0.34);
  finShape.bezierCurveTo(0.45, 0.52, 0.85, 0.42, 1.12, 0.14);
  finShape.bezierCurveTo(1.22, 0.02, 1.18, -0.16, 1.02, -0.22);
  finShape.bezierCurveTo(0.75, -0.30, 0.35, -0.24, 0.0, -0.06);
  const tailFin = new THREE.ShapeGeometry(finShape, 12);
  tailFin.rotateY(Math.PI / 2); // x → -z

  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0, 0.20);
  dorsalShape.bezierCurveTo(0.25, 0.40, 0.55, 0.36, 0.72, 0.24);
  dorsalShape.lineTo(0.72, 0.12);
  dorsalShape.lineTo(0, 0.20);
  const dorsal = new THREE.ShapeGeometry(dorsalShape, 8);
  dorsal.rotateY(Math.PI / 2);

  /* Eyes: big cartoon eye with a white catch-light. */
  const eye = new THREE.SphereGeometry(0.095, 20, 14);
  const shine = new THREE.SphereGeometry(0.032, 10, 8);

  /* Smile: lower half of a thin torus. */
  const mouth = new THREE.TorusGeometry(0.14, 0.014, 6, 24, Math.PI);
  mouth.rotateZ(Math.PI); // ∪

  /* Gill: curved stalk (tube) with alternating feathery filaments, merged into one draw call. */
  const stalkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.22, 0.06, -0.06), new THREE.Vector3(0.44, 0.10, -0.18), new THREE.Vector3(0.58, 0.10, -0.32),
  ]);
  const gillParts = [new THREE.TubeGeometry(stalkCurve, 12, 0.034, 7, false)];
  const filaments = 22;
  for (let k = 0; k < filaments; k++) {
    const t = 0.08 + (k / (filaments - 1)) * 0.9;
    const p = stalkCurve.getPoint(t);
    /* Soft fringe: short rounded nubs, longest mid-stalk, alternating above/below, swept slightly back. */
    const len = 0.03 + 0.07 * Math.sin(Math.min(1, t / 0.85) * Math.PI);
    const up = k % 2 ? 1 : -1;
    const f = new THREE.CapsuleGeometry(0.022, len, 3, 6);
    f.translate(0, len / 2 + 0.015, 0);
    f.rotateX(-0.45 - 0.3 * t);
    f.rotateZ((k % 3 - 1) * 0.15);
    if (up < 0) f.rotateZ(Math.PI);
    f.translate(p.x, p.y, p.z);
    gillParts.push(f);
  }
  const gill = mergeGeometries(gillParts);
  for (const g of gillParts) g.dispose();

  /* Leg: stubby capsule with four little toes, merged. */
  const legParts = [new THREE.CapsuleGeometry(0.075, 0.28, 4, 10)];
  legParts[0].translate(0, -0.14, 0);
  for (let t = 0; t < 4; t++) {
    const toe = new THREE.CapsuleGeometry(0.03, 0.07, 3, 6);
    toe.rotateX(Math.PI / 2);
    toe.rotateY((t - 1.5) * 0.35);
    toe.translate((t - 1.5) * 0.045, -0.31, 0.08);
    legParts.push(toe);
  }
  const leg = mergeGeometries(legParts);
  for (const g of legParts) g.dispose();

  const pellet = new THREE.SphereGeometry(0.09, 10, 8);
  return { body, tailCore, tailFin, dorsal, eye, shine, mouth, gill, leg, pellet };
})();

const materialCache = new Map();

function lighten(hex, amount) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#fff6e8'), amount);
  return `#${c.getHexString()}`;
}

/**
 * Paint the skin: belly lighter (u near 0 and 1), back darker, spots concentrated on the back,
 * shimmer flecks everywhere. 512px so close-ups stay crisp.
 */
function skinTexture(morph) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const belly = lighten(morph.body, morph.key === 'melanoid' || morph.key === 'axanthic_mel' ? 0.18 : 0.42);
  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0.0, belly);
  grad.addColorStop(0.22, morph.body);
  grad.addColorStop(0.78, morph.body);
  grad.addColorStop(1.0, belly);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const dot = (colour, count, rMin, rMax, alpha, backOnly) => {
    ctx.fillStyle = colour;
    for (let i = 0; i < count; i++) {
      const x = backOnly ? size * (0.2 + Math.random() * 0.6) : Math.random() * size;
      const y = Math.random() * size;
      const r = rMin + Math.random() * (rMax - rMin);
      ctx.globalAlpha = alpha * (0.6 + Math.random() * 0.4);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.7 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  if (morph.spot) dot(morph.spot, 140, 4, 14, 0.5, true);
  if (morph.fleck) dot(morph.fleck, 420, 1.2, 3.6, 0.9, false);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  tex.anisotropy = 4;
  return tex;
}

/** Materials are shared per morph so a tank of 12 stays cheap on mobile GPUs. */
function materialsFor(morph) {
  let m = materialCache.get(morph.key);
  if (m) return m;
  const map = skinTexture(morph);
  const gillColour = new THREE.Color(morph.gill);
  m = {
    skin: new THREE.MeshPhysicalMaterial({ map, roughness: 0.55, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.35 }),
    fin: new THREE.MeshPhysicalMaterial({ map, roughness: 0.6, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, clearcoat: 0.3 }),
    gill: new THREE.MeshStandardMaterial({ color: gillColour, roughness: 0.6, emissive: gillColour, emissiveIntensity: 0.08 }),
    eye: new THREE.MeshPhysicalMaterial({ color: morph.eye, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    mouth: new THREE.MeshStandardMaterial({ color: morph.key.includes('albino') || morph.key === 'leucistic' ? '#b45a6c' : '#1a1418', roughness: 0.8 }),
  };
  materialCache.set(morph.key, m);
  return m;
}

const GLOW = new THREE.Color('#5cff7a');

/**
 * Build an axolotl. Returns { group, hit, update(t, speed), setGlow(bool) }.
 * GFP individuals clone the skin/fin materials so only they can glow.
 */
export function buildAxolotl(pheno) {
  const base = materialsFor(pheno.morph);
  const skin = pheno.gfp ? base.skin.clone() : base.skin;
  const fin = pheno.gfp ? base.fin.clone() : base.fin;

  const group = new THREE.Group();
  const hit = [];
  const add = (geo, mat, parent = group) => {
    const mesh = new THREE.Mesh(geo, mat);
    parent.add(mesh);
    return mesh;
  };

  const body = add(GEO.body, skin);
  hit.push(body);

  /* Face. */
  for (const s of [-1, 1]) {
    /* Sit the eye on the head surface (head is 1.12 wide × 0.78 tall at this point). */
    const eye = add(GEO.eye, base.eye);
    eye.position.set(s * 0.40, 0.22, 0.74);
    const shine = add(GEO.shine, base.shine);
    shine.position.set(s * 0.40 - s * 0.035, 0.27, 0.82);
  }
  const mouth = add(GEO.mouth, base.mouth);
  mouth.position.set(0, -0.03, 1.02);
  mouth.rotation.x = 0.3;

  /* Gills: three per side, fanning back from the head. */
  const gills = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.position.set(s * 0.40, 0.12 - i * 0.05, 0.62 - i * 0.14);
      g.rotation.y = s * (0.15 + i * 0.28);
      g.rotation.z = s * (0.55 - i * 0.18);
      if (s < 0) g.scale.x = -1;
      add(GEO.gill, base.gill, g);
      group.add(g);
      gills.push({ group: g, side: s, i, baseZ: g.rotation.z });
    }
  }

  /* Legs. */
  const legs = [];
  const legSpots = [[-0.34, 0.30], [0.34, 0.30], [-0.32, -0.36], [0.32, -0.36]];
  legSpots.forEach(([x, z], idx) => {
    const l = new THREE.Group();
    l.position.set(x, -0.10, z);
    l.rotation.z = x < 0 ? 0.7 : -0.7;
    add(GEO.leg, skin, l);
    group.add(l);
    legs.push({ group: l, phase: idx % 2 ? Math.PI : 0 });
  });

  /* Tail. */
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, -0.6);
  group.add(tailPivot);
  const tailCore = add(GEO.tailCore, skin, tailPivot);
  const tailFin = add(GEO.tailFin, fin, tailPivot);
  tailFin.position.z = 0.02;
  hit.push(tailCore, tailFin);
  const dorsal = add(GEO.dorsal, fin);
  dorsal.position.set(0, 0.02, 0.12);

  const setGlow = (on) => {
    if (!pheno.gfp) return;
    const c = on ? GLOW : new THREE.Color(0x000000);
    skin.emissive.copy(c);
    fin.emissive.copy(c);
    skin.emissiveIntensity = on ? 0.9 : 0;
    fin.emissiveIntensity = on ? 0.9 : 0;
  };

  const update = (t, speed) => {
    const wag = 0.12 + Math.min(1, speed / 2) * 0.5;
    const beat = t * (3.5 + speed * 2);
    tailPivot.rotation.y = Math.sin(beat) * wag;
    for (const g of gills) {
      g.group.rotation.z = g.baseZ + g.side * Math.sin(t * 2.0 + g.i * 0.9) * 0.09;
      g.group.rotation.x = Math.sin(t * 1.6 + g.i * 1.3 + g.side) * 0.05;
    }
    const step = Math.min(1, speed / 1.5);
    for (const l of legs) l.group.rotation.x = Math.sin(t * 7 + l.phase) * 0.5 * step;
  };

  return { group, hit, update, setGlow, skin, fin, ownsMaterials: pheno.gfp };
}

const EGG_JELLY = new THREE.MeshPhysicalMaterial({ color: '#dff6ff', transparent: true, opacity: 0.55, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1, depthWrite: false });
const EGG_GEO = new THREE.SphereGeometry(0.17, 14, 10);
const EMBRYO_GEO = new THREE.SphereGeometry(0.07, 8, 6);
const EGG_SHINE = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 });
const EGG_SHINE_GEO = new THREE.SphereGeometry(0.03, 6, 5);

/** Jelly egg with a tinted embryo inside (its future morph colour). Returns { group, update(hatchIn, t) }. */
export function buildEgg(pheno) {
  const group = new THREE.Group();
  const embryo = new THREE.Mesh(EMBRYO_GEO, new THREE.MeshStandardMaterial({ color: pheno.morph.body, roughness: 0.6 }));
  embryo.scale.set(1, 0.7, 1.3);
  group.add(embryo);
  const jelly = new THREE.Mesh(EGG_GEO, EGG_JELLY);
  jelly.renderOrder = 3;
  group.add(jelly);
  const shine = new THREE.Mesh(EGG_SHINE_GEO, EGG_SHINE);
  shine.position.set(-0.06, 0.09, 0.08);
  group.add(shine);
  const update = (hatchIn, t) => {
    /* Wobble harder as hatching approaches. */
    const urgency = Math.max(0, 1 - hatchIn / 4);
    const wob = Math.sin(t * (6 + urgency * 14)) * (0.04 + urgency * 0.22);
    group.rotation.z = wob;
    group.rotation.x = Math.cos(t * 5) * 0.05 * (0.5 + urgency);
    const squish = 1 + Math.abs(wob) * 0.4;
    group.scale.set(1 / Math.sqrt(squish), squish, 1 / Math.sqrt(squish));
    embryo.rotation.y = t * 0.8;
  };
  return { group, update, dispose: () => embryo.material.dispose() };
}

export function buildPellet() {
  const mat = new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: 0.9 });
  return new THREE.Mesh(GEO.pellet, mat);
}

/** Only GFP individuals own cloned materials; shared morph materials live for the session. */
export function disposeAxolotl(a) {
  if (!a.ownsMaterials) return;
  a.skin.dispose();
  a.fin.dispose();
}
