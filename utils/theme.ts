export const colors = {
  ember: "#E8642A",
  amber: "#F5A623",
  dusk: "#C2478C",
  magenta: "#D4547A",
  plum: "#7B4F8C",
  lavender: "#A882C4",
  mist: "#EDD9C0",
  cream: "#FAF3E8",
  sky: "#D8EAF8",
  ash: "#B8A99A",
  charcoal: "#3D2E2E",
};

// Cloud-shaped border radius variants — each corner differs slightly for an organic, puffy feel
const cloudShapes = [
  { borderTopLeftRadius: 28, borderTopRightRadius: 22, borderBottomLeftRadius: 20, borderBottomRightRadius: 30 },
  { borderTopLeftRadius: 20, borderTopRightRadius: 32, borderBottomLeftRadius: 28, borderBottomRightRadius: 18 },
  { borderTopLeftRadius: 32, borderTopRightRadius: 24, borderBottomLeftRadius: 18, borderBottomRightRadius: 28 },
  { borderTopLeftRadius: 30, borderTopRightRadius: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 32 },
  { borderTopLeftRadius: 18, borderTopRightRadius: 30, borderBottomLeftRadius: 32, borderBottomRightRadius: 22 },
];

export function cloudShape(seed: string | number = 0) {
  const n = typeof seed === "string"
    ? seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
    : seed;
  return cloudShapes[Math.abs(n) % cloudShapes.length];
}

export const gradients = {
  sunset: ["#E8642A", "#D4547A", "#7B4F8C"],
  dusk: ["#F5A623", "#C2478C", "#A882C4"],
  dawn: ["#FAF3E8", "#EDD9C0", "#F5A623"],
  horizon: ["#D4547A", "#7B4F8C", "#3D2E2E"],
};

export const typography = {
  heading: {
    fontSize: 32,
    fontWeight: "700" as const,
    color: colors.charcoal,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: colors.charcoal,
  },
  body: {
    fontSize: 15,
    color: colors.charcoal,
    lineHeight: 22,
  },
  caption: {
    fontSize: 12,
    color: colors.ash,
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: 13,
    color: colors.ash,
    fontStyle: "italic" as const,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  full: 9999,
};

export const shadows = {
  soft: {
    shadowColor: colors.charcoal,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  warm: {
    shadowColor: colors.ember,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
};
