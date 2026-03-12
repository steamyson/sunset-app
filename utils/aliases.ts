const ADJECTIVES = [
  "Amber", "Dusty", "Golden", "Crimson", "Velvet",
  "Coral", "Burnt", "Rosy", "Gilded", "Hazy",
  "Misty", "Lilac", "Copper", "Russet", "Ochre",
  "Sienna", "Faded", "Warm", "Soft", "Pale",
];

const NOUNS = [
  "Horizon", "Peak", "Crest", "Shore", "Ridge",
  "Vale", "Ember", "Tide", "Mesa", "Bluff",
  "Cloud", "Haze", "Dusk", "Glow", "Dawn",
  "Light", "Bloom", "Drift", "Veil", "Flame",
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getAlias(deviceId: string): string {
  const h = hash(deviceId);
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(h / ADJECTIVES.length) % NOUNS.length];
  return `${adj} ${noun}`;
}
