import * as THREE from 'three';
import { TANK } from './game.js';

const rand = (a, b) => a + Math.random() * (b - a);

/** Seeded-enough jitter for rock surfaces: pushes vertices along their normal so faces stay watertight. */
function roughen(geo, amount) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) { k = 1 + (Math.random() - 0.5) * amount; seen.set(key, k); }
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

const ROCK_MATS = ['#6f6b66', '#7d7368', '#5f6266', '#8a8078'].map((c) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, flatShading: true }));

export function rock(size, squash = 0.75) {
  const geo = roughen(new THREE.IcosahedronGeometry(size, 1), 0.45);
  const m = new THREE.Mesh(geo, ROCK_MATS[Math.floor(Math.random() * ROCK_MATS.length)]);
  m.scale.set(rand(0.85, 1.2), squash, rand(0.85, 1.2));
  m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  m.position.y = size * squash * 0.55;
  return m;
}

/** Arch cave: a half torus of stone with rubble at the feet. Hide zone matches TANK.cave. */
export function cave() {
  const g = new THREE.Group();
  const r = TANK.cave.radius;
  const arch = new THREE.Mesh(roughen(new THREE.TorusGeometry(r * 0.72, r * 0.34, 8, 14, Math.PI), 0.18), ROCK_MATS[0]);
  arch.rotation.z = 0;
  arch.position.y = r * 0.2;
  arch.scale.set(1, 1.15, 1.2);
  g.add(arch);
  for (const [x, z, s] of [[-r * 0.8, r * 0.55, 0.45], [r * 0.85, r * 0.5, 0.4], [-r * 0.6, -r * 0.7, 0.35], [r * 0.55, -r * 0.75, 0.3]]) {
    const m = rock(s, 0.7);
    m.position.x = x;
    m.position.z = z;
    g.add(m);
  }
  return g;
}

const LEAF_MAT = new THREE.MeshStandardMaterial({ color: '#3f9a4c', roughness: 0.75, side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
const LEAF_MAT_LIGHT = new THREE.MeshStandardMaterial({ color: '#7fcf6a', roughness: 0.75, side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
const RIBBON_MAT = new THREE.MeshStandardMaterial({ color: '#5cb85c', roughness: 0.7, side: THREE.DoubleSide });
const MOSS_MAT = new THREE.MeshStandardMaterial({ color: '#2f7a3a', roughness: 1, flatShading: true });

function leafGeometry(h, w) {
  /* A pointed leaf, bent backwards along its length. */
  const geo = new THREE.PlaneGeometry(w, h, 2, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + h / 2; // 0..h
    const t = y / h;
    const width = Math.sin(t * Math.PI) * 0.5 + 0.5 * (1 - t); // widest low-mid, pointy tip
    pos.setX(i, pos.getX(i) * width);
    pos.setY(i, y);
    pos.setZ(i, Math.pow(t, 2) * h * 0.35); // curl over
  }
  geo.computeVertexNormals();
  return geo;
}

/** Broad-leaf plant (like an Amazon sword). */
export function broadLeafPlant(scale = 1) {
  const g = new THREE.Group();
  const n = 6 + Math.floor(rand(0, 3));
  const leaves = [];
  for (let k = 0; k < n; k++) {
    const h = rand(1.2, 2.2) * scale;
    const leaf = new THREE.Mesh(leafGeometry(h, 0.42 * scale), k % 2 ? LEAF_MAT : LEAF_MAT_LIGHT);
    const holder = new THREE.Group();
    holder.rotation.y = (k / n) * Math.PI * 2 + rand(-0.2, 0.2);
    holder.rotation.x = rand(-0.15, -0.05);
    holder.add(leaf);
    g.add(holder);
    leaves.push({ holder, phase: rand(0, 6), amp: rand(0.03, 0.07), base: holder.rotation.x });
  }
  g.userData.sway = leaves;
  return g;
}

/** Tall ribbon grass (like Vallisneria). */
export function ribbonGrass(scale = 1) {
  const g = new THREE.Group();
  const n = 5 + Math.floor(rand(0, 4));
  const blades = [];
  for (let k = 0; k < n; k++) {
    const h = rand(1.8, 3.4) * scale;
    const geo = new THREE.PlaneGeometry(0.14 * scale, h, 1, 10);
    const pos = geo.attributes.position;
    const twist = rand(0.6, 1.4);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + h / 2;
      const t = y / h;
      pos.setY(i, y);
      pos.setZ(i, Math.sin(t * twist * Math.PI) * 0.18 * scale);
      pos.setX(i, pos.getX(i) * (1 - t * 0.5));
    }
    geo.computeVertexNormals();
    const blade = new THREE.Mesh(geo, RIBBON_MAT);
    const holder = new THREE.Group();
    holder.position.set(rand(-0.15, 0.15), 0, rand(-0.15, 0.15));
    holder.rotation.y = rand(0, Math.PI * 2);
    holder.add(blade);
    g.add(holder);
    blades.push({ holder, phase: rand(0, 6), amp: rand(0.05, 0.1), base: 0 });
  }
  g.userData.sway = blades;
  return g;
}

/** Moss ball (Marimo). */
export function mossBall(r = 0.35) {
  const m = new THREE.Mesh(roughen(new THREE.IcosahedronGeometry(r, 2), 0.16), MOSS_MAT);
  m.position.y = r * 0.9;
  return m;
}

const WOOD_MAT = new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.9 });

/** Driftwood: a tapering curved branch with two twigs. */
export function driftwood() {
  const g = new THREE.Group();
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.4, 0.15, 0), new THREE.Vector3(-0.6, 0.5, 0.2), new THREE.Vector3(0.3, 0.75, -0.1), new THREE.Vector3(1.2, 1.35, 0.15), new THREE.Vector3(1.6, 1.9, 0.3),
  ]);
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const a = i / segs;
    const b = (i + 1) / segs;
    const part = new THREE.CatmullRomCurve3([spine.getPoint(a), spine.getPoint((a + b) / 2), spine.getPoint(b)]);
    const radius = 0.16 * (1 - a * 0.6);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(part, 4, radius, 7, false), WOOD_MAT));
  }
  const twig = (from, to, r) => {
    const c = new THREE.LineCurve3(from, to);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 1, r, 6, false), WOOD_MAT));
  };
  twig(spine.getPoint(0.45), spine.getPoint(0.45).clone().add(new THREE.Vector3(-0.2, 0.7, 0.5)), 0.06);
  twig(spine.getPoint(0.75), spine.getPoint(0.75).clone().add(new THREE.Vector3(0.5, 0.4, -0.55)), 0.05);
  const knots = [0.2, 0.6, 0.85];
  for (const t of knots) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.19 * (1 - t * 0.5), 8, 6), WOOD_MAT);
    k.position.copy(spine.getPoint(t));
    g.add(k);
  }
  return g;
}

const STONE_MAT = new THREE.MeshStandardMaterial({ color: '#c9c0b0', roughness: 0.85 });
const STONE_DARK = new THREE.MeshStandardMaterial({ color: '#8f877a', roughness: 0.9 });
const ROOF_MAT = new THREE.MeshStandardMaterial({ color: '#c0503f', roughness: 0.8 });
const DOOR_MAT = new THREE.MeshStandardMaterial({ color: '#2b1d12', roughness: 1 });

/** Aquarium castle: three towers, walls, a doorway. */
export function castle() {
  const g = new THREE.Group();
  const tower = (x, z, h, r) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 12), STONE_MAT);
    t.position.set(x, h / 2, z);
    g.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.3, r * 1.6, 12), ROOF_MAT);
    roof.position.set(x, h + r * 0.8, z);
    g.add(roof);
    /* Crenel ring. */
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(r * 0.35, r * 0.35, r * 0.35), STONE_DARK);
      const a = (i / 8) * Math.PI * 2;
      c.position.set(x + Math.cos(a) * r, h - r * 0.1, z + Math.sin(a) * r);
      g.add(c);
    }
    /* Windows. */
    for (const a of [0.6, 2.6]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 0.5, 0.05), DOOR_MAT);
      w.position.set(x + Math.cos(a) * r, h * 0.55, z + Math.sin(a) * r);
      w.lookAt(x, h * 0.55, z);
      g.add(w);
    }
  };
  tower(-0.7, 0.2, 1.6, 0.32);
  tower(0.7, 0.1, 1.3, 0.28);
  tower(0, -0.6, 2.1, 0.36);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.5), STONE_MAT);
  wall.position.set(0, 0.42, 0.25);
  g.add(wall);
  const door = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12, 1, false, 0, Math.PI), DOOR_MAT);
  door.rotation.x = Math.PI / 2;
  door.rotation.z = Math.PI;
  door.position.set(0, 0.3, 0.5);
  g.add(door);
  const doorBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.06), DOOR_MAT);
  doorBody.position.set(0, 0.15, 0.5);
  g.add(doorBody);
  return g;
}

const PAD_MAT = new THREE.MeshStandardMaterial({ color: '#4e9a3f', roughness: 0.8, side: THREE.DoubleSide });
const FLOWER_MAT = new THREE.MeshStandardMaterial({ color: '#f6d6e8', roughness: 0.6, emissive: '#f6d6e8', emissiveIntensity: 0.15 });
const REED_MAT = new THREE.MeshStandardMaterial({ color: '#7a9a3f', roughness: 0.85 });
const CATTAIL_MAT = new THREE.MeshStandardMaterial({ color: '#5a3a24', roughness: 0.95 });

/** Lily pad floating at the surface, optional flower. */
export function lilyPad(r = 0.55, flower = false) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.absarc(0, 0, r, 0.25, Math.PI * 2 - 0.25, false);
  shape.lineTo(0, 0);
  const pad = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), PAD_MAT);
  pad.rotation.x = -Math.PI / 2;
  g.add(pad);
  if (flower) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r * 0.3, r * 0.45, 7, 1, true), FLOWER_MAT);
    f.rotation.x = Math.PI;
    f.position.y = r * 0.2;
    g.add(f);
    const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.1, 6, 5), new THREE.MeshStandardMaterial({ color: '#f5c542' }));
    core.position.y = r * 0.25;
    g.add(core);
  }
  return g;
}

/** Reed clump with cattail heads. */
export function reeds(scale = 1) {
  const g = new THREE.Group();
  const n = 4 + Math.floor(rand(0, 3));
  const sway = [];
  for (let k = 0; k < n; k++) {
    const h = rand(4.5, 6.5) * scale;
    const holder = new THREE.Group();
    holder.position.set(rand(-0.25, 0.25), 0, rand(-0.25, 0.25));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, h, 6), REED_MAT);
    stem.position.y = h / 2;
    holder.add(stem);
    if (k % 2 === 0) {
      const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), CATTAIL_MAT);
      head.position.y = h - 0.3;
      holder.add(head);
    }
    holder.rotation.z = rand(-0.08, 0.08);
    g.add(holder);
    sway.push({ holder, phase: rand(0, 6), amp: 0.025, base: holder.rotation.z, axis: 'z' });
  }
  g.userData.sway = sway;
  return g;
}

/** Apply gentle sway to any decor group with userData.sway. */
export function animateSway(groups, t) {
  for (const g of groups) {
    const list = g.userData.sway;
    if (!list) continue;
    for (const s of list) {
      const v = s.base + Math.sin(t * 0.9 + s.phase) * s.amp;
      if (s.axis === 'z') s.holder.rotation.z = v;
      else s.holder.rotation.x = v;
    }
  }
}

/** Painted gravel/sand/mud with shaded pebbles. */
export function substrateTexture(sub) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = sub.hex;
  ctx.fillRect(0, 0, size, size);
  const pebbles = sub.id === 'gravel' || sub.id === 'pebble' ? 520 : 260;
  const rMax = sub.id === 'gravel' || sub.id === 'pebble' ? 11 : 6;
  for (let i = 0; i < pebbles; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 2 + Math.random() * rMax;
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    grad.addColorStop(0, lighten(sub.hex, 0.32));
    grad.addColorStop(0.7, i % 3 ? sub.hex : lighten(sub.deep, 0.2));
    grad.addColorStop(1, sub.deep);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.55 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.7 + Math.random() * 0.4), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1.8);
  tex.anisotropy = 4;
  return tex;
}

/** Soft caustic pattern used as an animated light map on the floor. */
export function causticTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.filter = 'blur(2px)';
  for (let i = 0; i < 18; i++) {
    ctx.lineWidth = 3 + Math.random() * 4;
    ctx.globalAlpha = 0.18 + Math.random() * 0.25;
    ctx.beginPath();
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r = 25 + Math.random() * 40;
    for (let k = 0; k <= 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const rr = r * (0.75 + Math.random() * 0.5);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.6, 1);
  return tex;
}

/** Aquarium backdrop: deep blue gradient with faint distant plants. */
export function backdropTexture(pond) {
  const w = 1024;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (pond) { grad.addColorStop(0, '#6db08a'); grad.addColorStop(1, '#1c3a2a'); } else { grad.addColorStop(0, '#2c6f9c'); grad.addColorStop(1, '#0b2440'); }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.28;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w;
    const ph = 120 + Math.random() * 300;
    ctx.fillStyle = pond ? '#2e5f3c' : '#1d4c72';
    ctx.beginPath();
    ctx.moveTo(x - 8, h);
    ctx.quadraticCurveTo(x + rand(-40, 40), h - ph * 0.6, x, h - ph);
    ctx.quadraticCurveTo(x + rand(-40, 40), h - ph * 0.6, x + 8, h);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function lighten(hex, amount) {
  const col = new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), amount);
  return `#${col.getHexString()}`;
}
