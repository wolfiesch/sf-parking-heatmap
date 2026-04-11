import type { TransportMode } from "../types";

/**
 * Isochrone color system - smooth multi-stop gradients per transport mode.
 *
 * Each mode has a rich color ramp from vivid (inner/close) to faint (outer/far).
 * Modeled after the parking occupancy gradient (many stops for smooth blending)
 * but using mode-specific hue ranges:
 *   - driving:  cyan-blue spectrum
 *   - cycling:  emerald-teal spectrum
 *   - walking:  amber-orange spectrum
 */

interface ColorStop {
  r: number;
  g: number;
  b: number;
}

// Rich multi-stop gradients per mode (inner -> outer)
const MODE_RAMPS: Record<TransportMode, ColorStop[]> = {
  driving: [
    { r: 147, g: 197, b: 253 }, // light sky blue (2 min - very close)
    { r: 96, g: 165, b: 250 },
    { r: 59, g: 130, b: 246 },  // blue-500 (core)
    { r: 37, g: 99, b: 235 },
    { r: 29, g: 78, b: 216 },   // blue-700
    { r: 30, g: 64, b: 175 },
    { r: 30, g: 58, b: 138 },   // fading into deep
    { r: 23, g: 37, b: 84 },
    { r: 15, g: 23, b: 42 },    // near-black blue (edge)
    { r: 15, g: 23, b: 42 },
  ],
  cycling: [
    { r: 134, g: 239, b: 172 }, // light mint
    { r: 74, g: 222, b: 128 },
    { r: 34, g: 197, b: 94 },   // green-500
    { r: 22, g: 163, b: 74 },
    { r: 21, g: 128, b: 61 },
    { r: 20, g: 110, b: 65 },
    { r: 13, g: 90, b: 56 },
    { r: 5, g: 70, b: 48 },
    { r: 2, g: 44, b: 34 },     // deep forest
    { r: 2, g: 44, b: 34 },
  ],
  walking: [
    { r: 253, g: 224, b: 71 },  // warm yellow
    { r: 250, g: 204, b: 21 },
    { r: 245, g: 158, b: 11 },  // amber-500
    { r: 217, g: 119, b: 6 },
    { r: 180, g: 83, b: 9 },
    { r: 146, g: 64, b: 14 },
    { r: 120, g: 53, b: 15 },
    { r: 92, g: 38, b: 10 },
    { r: 69, g: 26, b: 3 },     // deep copper
    { r: 69, g: 26, b: 3 },
  ],
};

// Alpha curve: vivid center fading to translucent edge
// This creates the "glow from center" effect
// Floor raised so outermost bands remain visible against dark basemap
const ALPHA_CURVE = [
  170, // 2 min  - vivid
  155, // 4 min
  140, // 6 min
  125, // 8 min
  110, // 10 min
  90,  // 12 min
  72,  // 14 min
  56,  // 16 min
  42,  // 18 min
  30,  // 20 min - still perceptible
];

// Stroke colors: brighter version of the mode color
const MODE_STROKES: Record<TransportMode, [number, number, number]> = {
  driving: [147, 197, 253],
  cycling: [134, 239, 172],
  walking: [253, 224, 71],
};

/** Contour levels rendered (every 2 min, 10 bands) */
export const CONTOUR_LEVELS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20] as const;

/** Get fill color [r,g,b,a] for a contour band */
export function contourFillColor(
  mode: TransportMode,
  bandIndex: number,
): [number, number, number, number] {
  const ramp = MODE_RAMPS[mode];
  const stop = ramp[Math.min(bandIndex, ramp.length - 1)];
  const alpha = ALPHA_CURVE[Math.min(bandIndex, ALPHA_CURVE.length - 1)];
  return [stop.r, stop.g, stop.b, alpha];
}

/** Get stroke color for major contour lines (5, 10, 15, 20 min) */
export function contourStrokeColor(
  mode: TransportMode,
  minutes: number,
): [number, number, number, number] {
  const base = MODE_STROKES[mode];
  // Major lines (5, 10, 15, 20) are bright; minor are subtle
  const isMajor = minutes % 5 === 0;
  return [...base, isMajor ? 140 : 30];
}

/** Glow halo color for the outermost ring */
export function glowColor(mode: TransportMode): [number, number, number, number] {
  const ramp = MODE_RAMPS[mode];
  const mid = ramp[2]; // use the core color
  return [mid.r, mid.g, mid.b, 12]; // very faint
}

/** Origin marker colors */
export function originColors(mode: TransportMode) {
  const ramp = MODE_RAMPS[mode];
  const core = ramp[2];
  const light = ramp[0];
  return {
    dot: [core.r, core.g, core.b, 240] as [number, number, number, number],
    ring: [light.r, light.g, light.b, 100] as [number, number, number, number],
    glow: [core.r, core.g, core.b, 25] as [number, number, number, number],
    pulse: [light.r, light.g, light.b, 50] as [number, number, number, number],
  };
}

/** CSS gradient string for legend */
export function legendGradientCss(mode: TransportMode): string {
  const ramp = MODE_RAMPS[mode];
  const stops = ramp.map((stop, i) => {
    const alpha = ALPHA_CURVE[i] / 255;
    const pct = Math.round((i / (ramp.length - 1)) * 100);
    return `rgba(${stop.r},${stop.g},${stop.b},${alpha.toFixed(2)}) ${pct}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** Mode accent color as CSS for UI elements */
export function modeAccentCss(mode: TransportMode): string {
  const ramp = MODE_RAMPS[mode];
  const core = ramp[2];
  return `rgb(${core.r},${core.g},${core.b})`;
}
