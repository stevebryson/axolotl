import * as THREE from 'three';
import { TANK } from './game.js';
import { buildAxolotl, buildPellet, disposeAxolotl } from './axolotl3d.js';
import { buildHeron } from './heron3d.js';
import * as Decor from './decor3d.js';

const W = TANK.width;
const D = TANK.depth;
const H = TANK.height;
const rand = (a, b) => a + Math.random() * (b - a);

export class Tank3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.timer = new THREE.Timer();
    this.entities = new Map(); // axolotl id -> { rig, ... }
    this.pelletMeshes = new Map();
    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.uv = false;
    /* Camera rig: home framing (whole tank) and a follow framing for the selected axolotl, eased between. */
    this.homePos = new THREE.Vector3();
    this.homeTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.portrait = false;
    this.camInit = false;

    this.buildLights();
    this.buildEnvironment();
    this.resize();
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight('#dff6ff', '#4a3a2a', 1.1);
    this.sun = new THREE.DirectionalLight('#fff4e0', 1.6);
    this.sun.position.set(4, 9, 6);
    this.fill = new THREE.DirectionalLight('#8fd8ff', 0.5);
    this.fill.position.set(-6, 4, -3);
    this.uvLight = new THREE.PointLight('#5a3cff', 0, 30);
    this.uvLight.position.set(0, H + 0.5, 1);
    this.scene.add(this.hemi, this.sun, this.fill, this.uvLight);
  }

  buildEnvironment() {
    const env = new THREE.Group();
    this.scene.add(env);
    this.env = env;

    this.floorMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    env.add(floor);

    /* Glass walls: barely-there tint plus crisp edges. */
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#bfefff', transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), glass);
    box.position.y = H / 2;
    box.renderOrder = 5;
    env.add(box);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.02, H + 0.02, D + 0.02)),
      new THREE.LineBasicMaterial({ color: '#cfeeff', transparent: true, opacity: 0.55 }));
    edges.position.y = H / 2;
    env.add(edges);
    this.glassBox = box;
    this.glassEdges = edges;

    /* Water volume tint. */
    this.waterMat = new THREE.MeshBasicMaterial({ color: '#3fb7d8', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.BackSide });
    const water = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, H - 0.4, D - 0.05), this.waterMat);
    water.position.y = (H - 0.4) / 2;
    water.renderOrder = 4;
    env.add(water);

    /* Water surface. */
    this.surfaceMat = new THREE.MeshStandardMaterial({ color: '#9fe3ff', transparent: true, opacity: 0.35, roughness: 0.15, side: THREE.DoubleSide });
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.05, D - 0.05, 24, 14), this.surfaceMat);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = H - 0.4;
    env.add(surface);
    this.surface = surface;
    this.surfaceBase = surface.geometry.attributes.position.array.slice();

    /* Backdrop behind the tank. */
    this.backdropMat = new THREE.MeshBasicMaterial({ map: Decor.backdropTexture(false) });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(W * 2.2, H * 2.4), this.backdropMat);
    backdrop.position.set(0, H * 0.9, -D / 2 - 1.2);
    env.add(backdrop);
    this.backdrop = backdrop;

    /* Cave: the hiding spot. */
    const caveGroup = Decor.cave();
    caveGroup.position.set(TANK.cave.x, 0, TANK.cave.z);
    caveGroup.rotation.y = -0.4;
    env.add(caveGroup);
    this.caveRing = new THREE.Mesh(new THREE.RingGeometry(TANK.cave.radius - 0.06, TANK.cave.radius, 40),
      new THREE.MeshBasicMaterial({ color: '#7ff0c8', transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    this.caveRing.rotation.x = -Math.PI / 2;
    this.caveRing.position.set(TANK.cave.x, 0.02, TANK.cave.z);
    env.add(this.caveRing);

    /* Shared furniture: rocks, wood, plants. */
    this.swayers = [];
    const place = (obj, x, z, ry = 0) => { obj.position.set(x, obj.position.y, z); obj.rotation.y = ry; env.add(obj); return obj; };
    for (const [x, z, sz] of [[-1.2, -3.0, 0.5], [2.9, 3.0, 0.42], [5.4, 0.4, 0.38], [-5.5, 1.1, 0.34], [0.2, 3.1, 0.3]]) place(Decor.rock(sz), x, z);
    place(Decor.driftwood(), 0.6, -2.5, 0.35);
    for (const [x, z, sc] of [[5.1, 2.3, 1.0], [-5.2, 2.6, 0.9], [2.3, -2.9, 0.8]]) this.swayers.push(place(Decor.broadLeafPlant(sc), x, z, rand(0, 6)));
    for (const [x, z] of [[5.4, -2.8], [-1.8, -3.1], [-5.4, -0.4], [4.3, -3.0]]) this.swayers.push(place(Decor.ribbonGrass(1), x, z, rand(0, 6)));
    for (const [x, z, r] of [[1.9, 2.6, 0.32], [-2.3, 2.9, 0.26]]) place(Decor.mossBall(r), x, z);

    /* Tank-only and pond-only decor. */
    this.tankDecor = new THREE.Group();
    const castle = Decor.castle();
    castle.position.set(3.6, 0, -2.0);
    castle.rotation.y = -0.5;
    this.tankDecor.add(castle);
    env.add(this.tankDecor);

    this.pondDecor = new THREE.Group();
    for (const [x, z, r, flower] of [[2.2, 1.6, 0.6, true], [-0.9, 2.4, 0.45, false], [4.2, -0.8, 0.5, false], [-2.6, 0.2, 0.4, true]]) {
      const pad = Decor.lilyPad(r, flower);
      pad.position.set(x, H - 0.38, z);
      pad.rotation.y = rand(0, 6);
      this.pondDecor.add(pad);
    }
    for (const [x, z] of [[5.5, -3.2], [-5.5, -3.0], [5.3, 3.0], [-4.6, 3.2]]) {
      const r = Decor.reeds(1);
      r.position.set(x, 0, z);
      this.pondDecor.add(r);
      this.swayers.push(r);
    }
    this.pondDecor.visible = false;
    env.add(this.pondDecor);

    /* Caustic light dancing on the floor. */
    this.caustic = Decor.causticTexture();
    this.floorMat.emissive = new THREE.Color('#9fd8ff');
    this.floorMat.emissiveMap = this.caustic;
    this.floorMat.emissiveIntensity = 0.16;

    /* Bubbles. */
    const count = 36;
    const pos = new Float32Array(count * 3);
    this.bubbleSeeds = [];
    for (let i = 0; i < count; i++) {
      const seed = { x: -5.6 + Math.random() * 0.4, z: -3 + Math.random() * 2.5, y: Math.random() * H, s: 0.4 + Math.random() * 0.7 };
      this.bubbleSeeds.push(seed);
      pos.set([seed.x, seed.y, seed.z], i * 3);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: '#e8fbff', size: 0.09, transparent: true, opacity: 0.7, depthWrite: false }));
    env.add(this.bubbles);

    /* Heron shadow. */
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.03;
    this.shadow.scale.set(1.6, 1, 1);
    env.add(this.shadow);

    this.heron = buildHeron();
    env.add(this.heron.group);
  }

  setSubstrate(sub) {
    if (this.floorMat.map) this.floorMat.map.dispose();
    this.floorMat.map = Decor.substrateTexture(sub);
    this.floorMat.needsUpdate = true;
  }

  setMode(mode) {
    const pond = mode === 'pond';
    this.glassBox.visible = !pond;
    this.glassEdges.visible = !pond;
    this.waterMat.color.set(pond ? '#5c9b6a' : '#3fb7d8');
    this.waterMat.opacity = pond ? 0.18 : 0.12;
    this.surfaceMat.color.set(pond ? '#a9d9a0' : '#9fe3ff');
    this.caveRing.material.opacity = pond ? 0.6 : 0;
    this.hemi.groundColor.set(pond ? '#2e3a24' : '#4a3a2a');
    this.tankDecor.visible = !pond;
    this.pondDecor.visible = pond;
    if (this.backdropMat.map) this.backdropMat.map.dispose();
    this.backdropMat.map = Decor.backdropTexture(pond);
    this.backdropMat.needsUpdate = true;
  }

  setUv(on) {
    this.uv = on;
    this.hemi.intensity = on ? 0.12 : 1.1;
    this.sun.intensity = on ? 0.08 : 1.6;
    this.fill.intensity = on ? 0.05 : 0.5;
    this.uvLight.intensity = on ? 18 : 0;
    this.floorMat.emissiveIntensity = on ? 0.04 : 0.16;
    this.renderer.toneMappingExposure = on ? 0.9 : 1.05;
    for (const e of this.entities.values()) e.rig.setGlow(on);
  }

  /* ---------- entities ---------- */
  syncPopulation(game) {
    const seen = new Set();
    for (const a of game.population) {
      seen.add(a.id);
      if (!this.entities.has(a.id)) {
        const rig = buildAxolotl(a.pheno);
        for (const m of rig.hit) m.userData.axolotlId = a.id;
        rig.setGlow(this.uv);
        this.scene.add(rig.group);
        this.entities.set(a.id, { rig, a, pop: 0 });
      }
    }
    for (const [id, e] of this.entities) {
      if (!seen.has(id)) {
        this.scene.remove(e.rig.group);
        disposeAxolotl(e.rig);
        this.entities.delete(id);
      }
    }
    const pelletIds = new Set(game.pellets.map((p) => p.id));
    for (const p of game.pellets) {
      if (!this.pelletMeshes.has(p.id)) {
        const m = buildPellet();
        this.scene.add(m);
        this.pelletMeshes.set(p.id, m);
      }
    }
    for (const [id, m] of this.pelletMeshes) {
      if (!pelletIds.has(id)) {
        this.scene.remove(m);
        m.material.dispose();
        this.pelletMeshes.delete(id);
      }
    }
  }

  popIn(id) {
    const e = this.entities.get(id);
    if (e) e.pop = 1;
  }

  /* ---------- picking ---------- */
  setPointer(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 2 - 1;
    const y = -((clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
  }

  pickAxolotl(clientX, clientY) {
    this.setPointer(clientX, clientY);
    const meshes = [];
    for (const e of this.entities.values()) meshes.push(...e.rig.hit);
    const hits = this.raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0].object.userData.axolotlId : null;
  }

  pickFloor(clientX, clientY) {
    this.setPointer(clientX, clientY);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, p)) return null;
    return { x: p.x, z: p.z };
  }

  /* ---------- frame ---------- */
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    /* Fit the whole tank in view on any aspect ratio, portrait included. */
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const portrait = this.camera.aspect < 1;
    /* Portrait phones look down more steeply so the floor (where taps land) fills the screen. */
    const elev = THREE.MathUtils.degToRad(portrait ? 36 : 26);
    const distW = (W / 2 + 0.35) / Math.tan(hfov / 2);
    const distH = (H / 2 + (portrait ? 1.2 : 2.8)) / Math.tan(vfov / 2);
    const dist = Math.max(distW, distH);
    this.portrait = portrait;
    this.homePos.set(0, Math.sin(elev) * dist + 0.8, Math.cos(elev) * dist);
    this.homeTarget.set(0, H * 0.42, 0);
    if (!this.camInit) {
      this.camPos.copy(this.homePos);
      this.camTarget.copy(this.homeTarget);
      this.camInit = true;
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Ease the camera toward the selected axolotl (or back home). In portrait the look target is
   * pushed down so the axolotl sits in the top half of the screen, clear of the bottom sheet.
   */
  updateCamera(sel, dt) {
    const wantPos = new THREE.Vector3();
    const wantTarget = new THREE.Vector3();
    if (sel) {
      /* Medium shot: axolotl about a quarter of the screen tall, floor around it still tappable. */
      if (this.portrait) {
        wantTarget.set(sel.x, -2.6, sel.z);
        wantPos.set(sel.x * 0.9, 6.2, sel.z + 7.6);
      } else {
        /* Landscape docks the info sheet on the right, so frame the axolotl left of centre. */
        wantTarget.set(sel.x + 1.6, 0.1, sel.z);
        wantPos.set(sel.x * 0.9 + 1.6, 4.8, sel.z + 6.6);
      }
    } else {
      wantPos.copy(this.homePos);
      wantTarget.copy(this.homeTarget);
    }
    const k = 1 - Math.exp(-dt * 3.2);
    this.camPos.lerp(wantPos, k);
    this.camTarget.lerp(wantTarget, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  render(game, dt) {
    this.timer.update();
    const t = this.timer.getElapsed();
    this.updateCamera(game.selected, dt);
    for (const e of this.entities.values()) {
      const a = e.a;
      const speed = Math.hypot(a.vx, a.vz);
      const s = a.scale;
      if (e.pop > 0) e.pop = Math.max(0, e.pop - dt * 1.6);
      const popScale = 1 + Math.sin((1 - e.pop) * Math.PI) * 0.35 * e.pop;
      e.rig.group.scale.setScalar(s * popScale);
      const bob = Math.sin(t * 1.6 + a.id) * 0.03;
      e.rig.group.position.set(a.x, 0.3 * s + bob + Math.min(0.25, speed * 0.08), a.z);
      e.rig.group.rotation.y = a.heading;
      e.rig.group.rotation.z = -Math.sin(t * 1.6 + a.id) * 0.02;
      e.rig.update(t + a.id * 0.7, speed);
    }
    for (const [id, m] of this.pelletMeshes) {
      const p = game.pellets.find((q) => q.id === id);
      if (p) m.position.set(p.x, p.y, p.z);
    }

    /* Selection halo. */
    if (!this.halo) {
      this.halo = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
      this.halo.rotation.x = -Math.PI / 2;
      this.halo.position.y = 0.02;
      this.scene.add(this.halo);
    }
    const sel = game.selected;
    this.halo.visible = Boolean(sel);
    if (sel) {
      this.halo.position.set(sel.x, 0.02, sel.z);
      const hs = sel.scale * (1 + Math.sin(t * 4) * 0.06);
      this.halo.scale.set(hs, hs, hs);
    }

    /* Ambient motion. */
    Decor.animateSway(this.swayers, t);
    this.caustic.offset.set(t * 0.012, Math.sin(t * 0.15) * 0.05);
    const bp = this.bubbles.geometry.attributes.position;
    for (let i = 0; i < this.bubbleSeeds.length; i++) {
      const sd = this.bubbleSeeds[i];
      sd.y += dt * sd.s;
      if (sd.y > H - 0.45) sd.y = 0.1;
      bp.setXYZ(i, sd.x + Math.sin(t * 2 + i) * 0.05, sd.y, sd.z);
    }
    bp.needsUpdate = true;
    const sp = this.surface.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = this.surfaceBase[i * 3];
      const y = this.surfaceBase[i * 3 + 1];
      sp.setZ(i, Math.sin(x * 1.3 + t * 1.4) * 0.05 + Math.cos(y * 1.7 + t) * 0.04);
    }
    sp.needsUpdate = true;

    /* Heron: bird overhead plus its shadow on the floor. */
    const h = game.mode === 'pond' ? game.heron : { phase: 'idle', progress: 0 };
    this.heron.update(h, t);
    if (h.phase !== 'idle') {
      this.shadow.position.x = this.heron.group.position.x;
      this.shadow.position.z = this.heron.group.position.z;
      const near = 1 - Math.min(1, Math.max(0, (this.heron.group.position.y - H) / 4));
      this.shadow.material.opacity = 0.2 + near * 0.45;
      this.shadow.visible = true;
    } else {
      this.shadow.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
