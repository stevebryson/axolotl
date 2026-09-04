const DRAG_THRESHOLD = 10; // px before a press becomes a joystick
const JOY_RADIUS = 56;   // px for full deflection

/**
 * One finger does everything:
 *  - tap an axolotl      -> select it
 *  - tap the floor       -> selected axolotl swims there
 *  - press and drag      -> floating joystick steers the selected axolotl
 */
export class Controls {
  constructor({ canvas, joystickEl, game, tank }) {
    this.canvas = canvas;
    this.joy = joystickEl;
    this.knob = joystickEl.querySelector('.knob');
    this.game = game;
    this.tank = tank;
    this.pointerId = null;
    this.start = null;
    this.dragging = false;

    canvas.addEventListener('pointerdown', this.onDown, { passive: false });
    canvas.addEventListener('pointermove', this.onMove, { passive: false });
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onDown = (e) => {
    if (this.pointerId !== null) return; // ignore extra fingers
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.start = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.dragging = false;
    this.canvas.setPointerCapture(e.pointerId);
  };

  onMove = (e) => {
    if (e.pointerId !== this.pointerId || !this.start) return;
    e.preventDefault();
    const dx = e.clientX - this.start.x;
    const dy = e.clientY - this.start.y;
    if (!this.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!this.game.selected) return;
      this.dragging = true;
      this.joy.hidden = false;
      this.joy.style.left = `${this.start.x}px`;
      this.joy.style.top = `${this.start.y}px`;
    }
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len / JOY_RADIUS);
    const nx = (dx / len) * k;
    const ny = (dy / len) * k;
    this.knob.style.transform = `translate(${nx * JOY_RADIUS}px, ${ny * JOY_RADIUS}px)`;
    const sel = this.game.selected;
    if (sel) {
      /* Screen up = away from camera (-z), screen right = +x. */
      sel.control = { dx: nx, dz: ny };
      this.game.tryEatNearby(sel);
    }
  };

  onUp = (e) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    const start = this.start;
    this.start = null;
    if (this.dragging) {
      this.dragging = false;
      this.joy.hidden = true;
      this.knob.style.transform = '';
      const sel = this.game.selected;
      if (sel) sel.control = null;
      return;
    }
    if (!start || performance.now() - start.t > 600) return;
    const id = this.tank.pickAxolotl(e.clientX, e.clientY);
    if (id !== null) {
      this.game.select(id === this.game.selectedId ? null : id);
      return;
    }
    const sel = this.game.selected;
    if (!sel) return;
    const p = this.tank.pickFloor(e.clientX, e.clientY);
    if (p) {
      sel.control = null;
      sel.target = { x: p.x, z: p.z };
      this.game.emit('sendTo', { axolotl: sel, x: p.x, z: p.z });
    }
  };

  /** Called each frame so a held joystick keeps feeding the sim and can eat en route. */
  tick() {
    const sel = this.game.selected;
    if (sel && sel.target && !sel.target.pellet) this.game.tryEatNearby(sel);
  }
}
