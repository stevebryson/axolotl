/**
 * Tiny synth for feedback sounds. No audio files, so nothing to download or cache.
 * Mobile browsers only allow audio after a user gesture; `unlock()` is wired to the first pointerdown.
 */
export class Sound {
  #ctx = null;
  #master = null;
  enabled = true;

  unlock() {
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') this.#ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.#ctx = new AC();
    this.#master = this.#ctx.createGain();
    this.#master.gain.value = 0.35;
    this.#master.connect(this.#ctx.destination);
  }

  #tone({ freq, to = freq, type = 'sine', dur = 0.15, delay = 0, gain = 1, attack = 0.005 }) {
    if (!this.enabled || !this.#ctx || this.#ctx.state !== 'running') return;
    const t0 = this.#ctx.currentTime + delay;
    const osc = this.#ctx.createOscillator();
    const g = this.#ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.#master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Soft bubble pop: selecting, dropping food. */
  pop() {
    this.#tone({ freq: 520, to: 880, dur: 0.09, gain: 0.5 });
  }

  /** Munch: pellet eaten. */
  eat() {
    this.#tone({ freq: 260, to: 120, type: 'triangle', dur: 0.12, gain: 0.6 });
    this.#tone({ freq: 220, to: 100, type: 'triangle', dur: 0.12, delay: 0.09, gain: 0.5 });
  }

  /** Eggs cracking: a rising cluster of pops. */
  hatch(count = 6) {
    for (let i = 0; i < count; i++) this.#tone({ freq: 500 + i * 70, to: 900 + i * 90, dur: 0.1, delay: i * 0.16, gain: 0.5 });
  }

  /** Correct prediction. */
  chime() {
    [523, 659, 784, 1047].forEach((f, i) => this.#tone({ freq: f, dur: 0.35, delay: i * 0.1, gain: 0.5 }));
  }

  /** New morph in the book. */
  sparkle() {
    [1319, 1568, 2093].forEach((f, i) => this.#tone({ freq: f, dur: 0.25, delay: i * 0.07, gain: 0.35, type: 'triangle' }));
  }

  /** Heron incoming: two low warning tones. */
  alarm() {
    this.#tone({ freq: 196, dur: 0.5, type: 'sawtooth', gain: 0.35 });
    this.#tone({ freq: 175, dur: 0.6, delay: 0.55, type: 'sawtooth', gain: 0.35 });
  }

  /** Heron snap. */
  snap() {
    this.#tone({ freq: 900, to: 90, type: 'square', dur: 0.14, gain: 0.5 });
  }

  /** Generation turnover: gentle descending flourish. */
  whoosh() {
    this.#tone({ freq: 700, to: 150, type: 'sine', dur: 0.7, gain: 0.4 });
  }
}
