/**
 * Occupancy-to-color mapping matching SFMTA thresholds:
 *   0-59%  = Green (Available)
 *  60-79%  = Yellow (Moderate)
 *  80-100% = Red (Difficult)
 *  No data = Gray
 */

const GREEN: [number, number, number] = [34, 197, 94]; // #22c55e
const YELLOW: [number, number, number] = [234, 179, 8]; // #eab308
const RED: [number, number, number] = [239, 68, 68]; // #ef4444
const GRAY: [number, number, number] = [107, 114, 128]; // #6b7280
const BLUE: [number, number, number] = [59, 130, 246]; // #3b82f6 - free parking

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

/** Returns [r, g, b] for an occupancy ratio (0-1). Returns gray for no data (< 0). */
export function occupancyToRgb(occupancy: number): [number, number, number] {
  if (occupancy < 0) return GRAY;
  if (occupancy <= 0.59) {
    // Pure green, fade brightness slightly with occupancy
    const t = occupancy / 0.59;
    return lerp3(GREEN, GREEN, t);
  }
  if (occupancy <= 0.79) {
    const t = (occupancy - 0.6) / 0.2;
    return lerp3(GREEN, YELLOW, t);
  }
  const t = (occupancy - 0.8) / 0.2;
  return lerp3(YELLOW, RED, Math.min(t, 1));
}

/** Returns [r, g, b, a] for deck.gl layers */
export function occupancyToColor(occupancy: number, enforced = true): [number, number, number, number] {
  if (!enforced) {
    if (occupancy <= 0) return [...BLUE, 60]; // blue for free parking, no data
    // Desaturated colors for pressure-based data
    const rgb = occupancyToRgb(occupancy);
    return [rgb[0], rgb[1], rgb[2], 140];
  }
  if (occupancy <= 0) return [...GRAY, 100]; // dim gray for no data
  const rgb = occupancyToRgb(occupancy);
  return [rgb[0], rgb[1], rgb[2], 200];
}

/** CSS color string for use in HTML/SVG elements */
export function occupancyToCss(occupancy: number, enforced = true): string {
  if (!enforced && occupancy <= 0) return "rgb(59, 130, 246)"; // blue
  if (!enforced && occupancy > 0) {
    // Desaturated via lower opacity approximation
    const [r, g, b] = occupancyToRgb(occupancy);
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0.55)`;
  }
  if (occupancy <= 0) return "rgb(107, 114, 128)";
  const [r, g, b] = occupancyToRgb(occupancy);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Occupancy label for accessibility and tooltips */
export function occupancyLabel(occupancy: number, enforced = true): string {
  if (!enforced) {
    if (occupancy <= 0) return "Free Parking";
    if (occupancy <= 0.59) return "Low pressure";
    if (occupancy <= 0.79) return "Moderate pressure";
    return "High pressure";
  }
  if (occupancy <= 0) return "No data";
  if (occupancy <= 0.59) return "Available";
  if (occupancy <= 0.79) return "Moderate";
  return "Difficult";
}
