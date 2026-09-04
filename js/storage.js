/**
 * Persistent save slot. Uses localStorage when available; otherwise keeps an
 * in-memory copy so the game still runs (private browsing, sandboxed previews).
 */
const KEY = 'axolotl-genetics-lab:v1';

function probe() {
  try {
    const k = `${KEY}:probe`;
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export class SaveStore {
  #memory = null;
  #available = probe();

  get persistent() {
    return this.#available;
  }

  load() {
    if (!this.#available) return this.#memory;
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  save(data) {
    this.#memory = data;
    if (!this.#available) return false;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  clear() {
    this.#memory = null;
    if (!this.#available) return;
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* nothing to clean */
    }
  }
}
