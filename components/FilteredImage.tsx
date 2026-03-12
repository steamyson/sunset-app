import { Image, View } from "react-native";
import type { FilterName, Adjustments } from "../utils/filters";

type RNFilter =
  | { brightness: number }
  | { contrast: number }
  | { saturate: number }
  | { hueRotate: string }
  | { grayscale: number }
  | { sepia: number };

// Preset filters as RN filter arrays (applied in order)
export const FILTER_PRESETS: Record<FilterName, RNFilter[]> = {
  original: [],
  golden:   [{ saturate: 1.4 },  { brightness: 1.06 }, { contrast: 1.08 }, { sepia: 0.15 }],
  dusk:     [{ hueRotate: "-30deg" }, { saturate: 1.35 }, { contrast: 1.2 }, { brightness: 0.95 }],
  ember:    [{ saturate: 1.6 },  { contrast: 1.4 },  { brightness: 0.93 }, { hueRotate: "8deg" }],
  haze:     [{ saturate: 0.4 },  { contrast: 0.82 }, { brightness: 1.18 }, { sepia: 0.1 }],
  velvet:   [{ hueRotate: "-25deg" }, { saturate: 1.3 }, { contrast: 1.25 }, { brightness: 0.87 }],
  ash:      [{ grayscale: 0.85 }, { contrast: 0.95 }, { brightness: 1.05 }],
  bloom:    [{ brightness: 1.22 }, { contrast: 0.83 }, { saturate: 1.2 }],
};

function buildFilters(filter: FilterName, adj?: Adjustments | null): RNFilter[] {
  const filters: RNFilter[] = [...(FILTER_PRESETS[filter] ?? [])];

  if (adj?.brightness) filters.push({ brightness: 1 + adj.brightness / 100 });
  if (adj?.contrast)   filters.push({ contrast:   1 + adj.contrast   / 100 });
  if (adj?.saturation) filters.push({ saturate:   1 + adj.saturation / 100 });

  if (adj?.warmth) {
    const w = adj.warmth;
    if (w > 0) {
      // warm: sepia tint + saturation boost
      filters.push({ sepia: (w / 100) * 0.45 });
      filters.push({ saturate: 1 + (w / 100) * 0.25 });
    } else {
      // cool: hue shift + slight desaturate
      filters.push({ hueRotate: `${Math.abs(w) * 0.6}deg` });
      filters.push({ saturate: 1 - (Math.abs(w) / 100) * 0.25 });
    }
  }

  if (adj?.fade && adj.fade > 0) {
    const f = adj.fade / 100;
    filters.push({ brightness: 1 + f * 0.14 });
    filters.push({ contrast:   1 - f * 0.38 });
    filters.push({ saturate:   1 - f * 0.22 });
  }

  return filters;
}

interface Props {
  uri: string;
  filter?: string | null;
  adjustments?: Adjustments | null;
  width: number;
  height: number;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
}

export function FilteredImage({ uri, filter, adjustments, width, height, resizeMode = "cover" }: Props) {
  const name = (filter as FilterName) ?? "original";
  const filters = buildFilters(name, adjustments);

  if (filters.length === 0) {
    return <Image source={{ uri }} style={{ width, height }} resizeMode={resizeMode} />;
  }

  // Apply filters on a View wrapper — confirmed supported in RN 0.76+
  return (
    <View style={[{ width, height, overflow: "hidden" }, { filter: filters } as any]}>
      <Image source={{ uri }} style={{ width, height }} resizeMode={resizeMode} />
    </View>
  );
}
