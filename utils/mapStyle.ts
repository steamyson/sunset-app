// Cartoonish illustrated map style — warm sunset palette
const mapStyle = [
  // ── Land base ──────────────────────────────────────────
  { elementType: "geometry", stylers: [{ color: "#F2E0C0" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5C3822" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#F2E0C0" }, { weight: 4 }] },

  // ── Local roads — clean white ──────────────────────────
  { featureType: "road.local", elementType: "geometry.fill", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.local", elementType: "geometry.stroke", stylers: [{ color: "#DCC4A0" }, { weight: 1.5 }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#9A7050" }] },

  // ── Arterial roads — warm amber ────────────────────────
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#FFD97D" }] },
  { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ color: "#C89030" }, { weight: 2 }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#7A4A10" }] },

  // ── Highways — bold ember orange ───────────────────────
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#F5A623" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#C07010" }, { weight: 3 }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#C07010" }, { weight: 3 }] },

  // ── Water — flat cartoon blue ──────────────────────────
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#8CC4E0" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3A6E9A" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#8CC4E0" }] },

  // ── Parks — flat sage green ────────────────────────────
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#C0D8A0" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },

  // ── Hide most POIs ─────────────────────────────────────
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", stylers: [{ visibility: "on" }] },

  // ── Transit — hidden ───────────────────────────────────
  { featureType: "transit", stylers: [{ visibility: "off" }] },

  // ── State borders — visible warm stroke ───────────────
  {
    featureType: "administrative.province",
    elementType: "geometry.stroke",
    stylers: [{ color: "#C07840" }, { weight: 2 }, { visibility: "on" }],
  },
  {
    featureType: "administrative.country",
    elementType: "geometry.stroke",
    stylers: [{ color: "#8A4820" }, { weight: 3 }, { visibility: "on" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#7A4820" }],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9A6840" }],
  },

  // ── Natural landscape ──────────────────────────────────
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#E4D0A8" }] },
  { featureType: "landscape.natural.terrain", elementType: "geometry", stylers: [{ color: "#D8C498" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#EDD8B8" }] },
];

export default mapStyle;
