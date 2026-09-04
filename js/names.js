const NAMES = [
  'Bubbles', 'Pickle', 'Noodle', 'Mochi', 'Pebble', 'Splash', 'Gilly', 'Waffles', 'Tofu', 'Ziggy',
  'Nugget', 'Pudding', 'Squish', 'Blip', 'Marble', 'Dumpling', 'Wiggles', 'Kelp', 'Toast', 'Bean',
  'Sprout', 'Frankie', 'Ripple', 'Otto', 'Puddle', 'Mango', 'Fig', 'Pip', 'Coral', 'Dizzy',
  'Lumen', 'Biscuit', 'Nimbus', 'Flick', 'Ember', 'Slinky', 'Boba', 'Tadpole', 'Comet', 'Ollie',
];

/** Pick a name not already used; falls back to a numbered variant when the list is exhausted. */
export function pickName(taken, rng = Math.random) {
  const free = NAMES.filter((n) => !taken.has(n));
  if (free.length) return free[Math.floor(rng() * free.length)];
  const base = NAMES[Math.floor(rng() * NAMES.length)];
  let i = 2;
  while (taken.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}
