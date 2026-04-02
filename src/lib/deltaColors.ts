/**
 * Diverging color scale for comparison mode.
 * Blue = less busy than reference, Red = more busy than reference.
 * Saturates at 30% absolute difference.
 */

const BLUE: [number, number, number] = [59, 130, 246]; // less busy
const NEUTRAL: [number, number, number] = [148, 163, 184]; // no change (slate-400)
const RED: [number, number, number] = [239, 68, 68]; // more busy
const GRAY: [number, number, number] = [75, 85, 99]; // no data

const SATURATION_THRESHOLD = 0.3; // saturate at 30% difference

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Returns [r, g, b, a] for a delta value (-1 to +1) */
export function deltaToColor(delta: number, hasData: boolean): [number, number, number, number] {
  if (!hasData) return [...GRAY, 100];

  const clamped = Math.max(-SATURATION_THRESHOLD, Math.min(SATURATION_THRESHOLD, delta));
  const t = clamped / SATURATION_THRESHOLD; // -1 to +1

  let rgb: [number, number, number];
  if (t < 0) {
    rgb = lerp3(NEUTRAL, BLUE, -t);
  } else {
    rgb = lerp3(NEUTRAL, RED, t);
  }

  return [rgb[0], rgb[1], rgb[2], 200];
}

/** CSS color string for delta value */
export function deltaToCss(delta: number, hasData: boolean): string {
  if (!hasData) return "rgb(75, 85, 99)";

  const clamped = Math.max(-SATURATION_THRESHOLD, Math.min(SATURATION_THRESHOLD, delta));
  const t = clamped / SATURATION_THRESHOLD;

  let rgb: [number, number, number];
  if (t < 0) {
    rgb = lerp3(NEUTRAL, BLUE, -t);
  } else {
    rgb = lerp3(NEUTRAL, RED, t);
  }

  return `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`;
}

/** Format delta as "+36%" or "-12%" */
export function formatDelta(delta: number): string {
  const pct = Math.round(delta * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}
