import * as THREE from 'three';
import { TANK } from './game.js';

const H = TANK.height;

/**
 * A stylised grey heron. Flies in from the left during the warning phase,
 * stabs at the water on strike, then lifts away. Driven by game.heron each frame.
 */
export function buildHeron() {
  const mat = new THREE.MeshStandardMaterial({ color: '#5d6a78', roughness: 0.8, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a323b', roughness: 0.8, flatShading: true });
  const beakMat = new THREE.MeshStandardMaterial({ color: '#e0b04a', roughness: 0.6 });

  const root = new THREE.Group();
  root.visible = false;

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), mat);
  body.scale.set(1.6, 0.8, 0.9);
  root.add(body);

  const neck = new THREE.Group();
  neck.position.set(0.7, 0.25, 0);
  root.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.4, 6), mat);
  neckMesh.position.y = 0.7;
  neck.add(neckMesh);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat);
  head.position.set(0.15, 1.45, 0);
  neck.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7, 6), beakMat);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.6, 1.42, 0);
  neck.add(beak);
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 5), dark);
  crest.rotation.z = Math.PI / 2 + 0.4;
  crest.position.set(-0.2, 1.5, 0);
  neck.add(crest);

  const wingGeo = new THREE.PlaneGeometry(1.2, 2.4, 1, 3);
  wingGeo.translate(0, 1.2, 0);
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.1, 0.35, s * 0.35);
    const w = new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: '#4a5563', roughness: 0.85, side: THREE.DoubleSide }));
    w.rotation.x = s * Math.PI / 2;
    pivot.add(w);
    root.add(pivot);
    wings.push({ pivot, s });
  }

  const legGeo = new THREE.CylinderGeometry(0.035, 0.03, 1.3, 5);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(-0.3, -0.9, s * 0.18);
    leg.rotation.z = 0.35;
    root.add(leg);
  }

  /**
   * @param {{phase:string, progress:number}} heron
   * @param {number} t elapsed seconds
   */
  const update = (heron, t) => {
    if (heron.phase === 'idle') { root.visible = false; return; }
    root.visible = true;
    const flap = Math.sin(t * 9);
    let x; let y; let neckDip = 0; let flapAmp = 0.55;
    if (heron.phase === 'warning') {
      const p = heron.progress;
      const ease = 1 - Math.pow(1 - p, 3);
      x = -14 + ease * 12;
      y = H + 0.5 - ease * 0.6 + Math.sin(t * 2) * 0.12;
    } else {
      const p = heron.progress; // strike: 0..1 over ~1.2s
      x = -2 + Math.sin(p * Math.PI) * 0.4;
      const stab = Math.sin(Math.min(1, p * 2) * Math.PI); // down and back up in the first half
      y = H - 0.1 - stab * 1.3;
      neckDip = stab * 1.5;
      flapAmp = 0.25 + p * 0.5;
      if (p > 0.6) { x += (p - 0.6) * 16; y += (p - 0.6) * 3; }
    }
    root.position.set(x, y, Math.sin(heron.progress * 2.2) * 1.2);
    neck.rotation.z = -neckDip;
    for (const w of wings) w.pivot.rotation.x = flap * flapAmp * w.s;
  };

  return { group: root, update };
}
