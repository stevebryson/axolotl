import { Game } from './game.js';
import { Tank3D } from './tank3d.js';
import { Controls } from './controls.js';
import { UI } from './ui.js';
import { SaveStore } from './storage.js';
import { Sound } from './audio.js';

function boot() {
  const canvas = document.getElementById('scene');
  const store = new SaveStore();
  const game = new Game();
  const tank = new Tank3D(canvas);

  if (!game.load(store.load())) game.newGame();

  const sound = new Sound();
  sound.enabled = game.settings.sound;
  const unlock = () => sound.unlock();
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock, { passive: true });

  const ui = new UI({
    game, tank, store, sound,
    onReset: () => {
      store.clear();
      game.newGame();
      game.tutorialSeen = true;
      tank.syncPopulation(game);
      ui.applyMode(game.mode);
      ui.applyLevel();
      ui.renderCard(null);
      save();
      ui.openLevel(game.levelInfo, []);
    },
  });
  const controls = new Controls({ canvas, joystickEl: document.getElementById('joystick'), game, tank });

  tank.syncPopulation(game);
  ui.updateDirtButton();
  for (const ev of ['added', 'removed', 'hatched']) game.on(ev, () => tank.syncPopulation(game));
  game.on('pellet', () => tank.syncPopulation(game));
  game.on('ate', () => tank.syncPopulation(game));

  /* Persistence: debounced on change, immediate when the page hides. */
  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = 0;
    store.save(game.toJSON());
  };
  const scheduleSave = () => { if (!saveTimer) saveTimer = setTimeout(save, 1500); };
  for (const ev of ['population', 'mode', 'substrate', 'generation', 'settings']) game.on(ev, scheduleSave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', save);
  setInterval(scheduleSave, 15000); // ages, hunger and positions drift continuously

  /* Loop. Pauses in the background so nothing gets eaten while the tablet is asleep. */
  let last = performance.now();
  let running = true;
  const frame = (now) => {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.update(dt);
    controls.tick();
    tank.render(game, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });

  const onResize = () => tank.resize();
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);

  if (!game.tutorialSeen) {
    ui.openHelp(() => ui.openLevel(game.levelInfo, []));
    game.tutorialSeen = true;
    scheduleSave();
  }

  /* Dev hook: open ./index.html?debug to poke at the sim from the console or a test runner. */
  if (new URLSearchParams(location.search).has('debug')) window.axolab = { game, tank, ui, controls };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { /* offline mode unavailable; app still works */ }));
  }
}

try {
  boot();
} catch (err) {
  document.body.insertAdjacentHTML('beforeend',
    `<p class="nojs">This device could not start the 3D tank. ${err && err.message ? String(err.message).replace(/[<>]/g, '') : ''}</p>`);
  throw err;
}
