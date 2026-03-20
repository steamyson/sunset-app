# Phase 1: Globe - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-20
**Phase:** 01-globe
**Areas discussed:** Continent art style, Cloud behavior on rotation, Zoom depth

---

## Continent Art Style

| Option | Description | Selected |
|--------|-------------|----------|
| Soft blue-white | ~rgba(180,220,255,0.7) — star atlas / NASA globe feel | ✓ |
| Amber / ember | Warm amber matching app's ember color | |
| Pure white | ~60% opacity white — crisp, clinical | |

**Stroke weight:**

| Option | Selected |
|--------|----------|
| Thin and subtle (~0.8–1px) | |
| Medium weight (~1.5–2px) | ✓ |
| Bold (~2.5–3px) | |

**Detail level:**

| Option | Selected |
|--------|----------|
| Simplified blobs (recognizable, smoothed) | ✓ |
| Moderate coastlines | |
| Accurate detail | |

**Fill:**

| Option | Selected |
|--------|----------|
| Outlines only | |
| Fill + outline | ✓ |

**Glow:**

| Option | Selected |
|--------|----------|
| No glow | ✓ |
| Subtle glow | |

**Fade-in animation:**

| Option | Selected |
|--------|----------|
| Fade in with globe | ✓ |
| Render immediately | |

**Fill color:**

| Option | Selected |
|--------|----------|
| Slightly lighter fill (#1e4a72) | ✓ |
| Same as ocean | |
| Warmer tint | |

**Notes:** User wants the feel of "a star atlas or NASA globe" — evocative over cartographic. Fill+outline gives a subtle elevation cue.

---

## Cloud Behavior on Rotation

| Option | Description | Selected |
|--------|-------------|----------|
| Stay fixed on screen | Globe spins beneath; clouds stay in screen positions | |
| Rotate with the globe | Clouds pinned to lon/lat, orbit with globe rotation (current) | ✓ |

**Ambient drift:**

| Option | Selected |
|--------|----------|
| Keep ambient drift (cloudOrbitLon) | ✓ |
| No drift | |

**Clouds behind globe:**

| Option | Selected |
|--------|----------|
| Fade out (z < 0 → 35% opacity) | |
| Hide completely | ✓ |

**Room tap transition:**

| Option | Selected |
|--------|----------|
| Same as current (close globe, navigate) | |
| Zoom-into-cloud from globe | Selected then deferred |

**Notes:** User selected zoom-into-cloud but agreed to defer it to Phase 2 (SKY-03) when prompted about scope overlap.

---

## Zoom Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Moderate ~2x closer (min 0.18) | Globe ~2x larger at max zoom | ✓ |
| Deep — fill screen (min 0.10) | Globe fills viewport | |
| Unlimited | No lower bound | |

**Snap-back trigger:**

| Option | Selected |
|--------|----------|
| Keep current pinch-out to 0.78+ | ✓ |
| Tap hint only | |
| Both pinch-out and hint | |

**Globe scale behavior:**

| Option | Selected |
|--------|----------|
| Globe grows — scales up with zoom | ✓ |
| Globe stays same size | |

---

## Claude's Discretion

- Exact SVG path data for simplified continent blobs
- `globeScale` interpolation range extension for min zoom 0.18
- How continent paths are clipped to the globe sphere

## Deferred Ideas

- **Zoom-into-cloud from globe** — Phase 2 delivers this for both sky canvas and globe taps (SKY-03)
