export type FilterName = "original" | "golden" | "dusk" | "ember" | "haze" | "velvet" | "ash" | "bloom";

export const FILTER_NAMES: FilterName[] = [
  "original", "golden", "dusk", "ember", "haze", "velvet", "ash", "bloom",
];

export const FILTER_LABELS: Record<FilterName, string> = {
  original: "Original",
  golden:   "Golden",
  dusk:     "Dusk",
  ember:    "Ember",
  haze:     "Haze",
  velvet:   "Velvet",
  ash:      "Ash",
  bloom:    "Bloom",
};

export type Adjustments = {
  brightness: number;
  contrast:   number;
  saturation: number;
  warmth:     number;
  fade:       number;
};

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast:   0,
  saturation: 0,
  warmth:     0,
  fade:       0,
};

export function hasAdjustments(adj: Adjustments): boolean {
  return Object.values(adj).some((v) => v !== 0);
}
