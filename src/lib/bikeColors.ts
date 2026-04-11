/**
 * Bike demand color system - teal/cyan palette distinct from parking's green-yellow-red.
 *
 * Demand scale (departure demand, 0-1):
 *   0-0.3  = Light teal (bikes likely available)
 *   0.3-0.6 = Teal (moderate activity)
 *   0.6-1.0 = Deep teal/blue (bikes scarce, high departure demand)
 */

const LIGHT_TEAL: [number, number, number] = [94, 234, 212];  // #5eead4
const TEAL: [number, number, number] = [20, 184, 166];        // #14b8a6
const DEEP_TEAL: [number, number, number] = [15, 118, 110];   // #0f766e
const DARK_CYAN: [number, number, number] = [8, 75, 82];      // #084b52

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

/** Returns [r, g, b] for a demand value (0-1). */
export function demandToRgb(demand: number): [number, number, number] {
  if (demand <= 0) return [107, 114, 128]; // gray for no data
  if (demand <= 0.3) {
    const t = demand / 0.3;
    return lerp3(LIGHT_TEAL, TEAL, t);
  }
  if (demand <= 0.6) {
    const t = (demand - 0.3) / 0.3;
    return lerp3(TEAL, DEEP_TEAL, t);
  }
  const t = (demand - 0.6) / 0.4;
  return lerp3(DEEP_TEAL, DARK_CYAN, Math.min(t, 1));
}

/** Returns [r, g, b, a] for deck.gl layers */
export function demandToColor(demand: number): [number, number, number, number] {
  if (demand <= 0) return [107, 114, 128, 80];
  const rgb = demandToRgb(demand);
  return [rgb[0], rgb[1], rgb[2], 200];
}

/** CSS color string for legends and UI */
export function demandToCss(demand: number): string {
  if (demand <= 0) return "rgb(107, 114, 128)";
  const [r, g, b] = demandToRgb(demand);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Demand label for tooltips */
export function demandLabel(demand: number): string {
  if (demand <= 0) return "No data";
  if (demand <= 0.3) return "Quiet";
  if (demand <= 0.6) return "Moderate";
  if (demand <= 0.85) return "Busy";
  return "Peak";
}

/**
 * Correlation color: "bike alternative score"
 * Score = parkingOccupancy * (1 - bikeDemand)
 * High = parking hard AND bikes available = green ("bike instead")
 * Low = parking easy or bikes scarce = gray ("no advantage")
 */
export function correlationToColor(
  parkingOcc: number,
  bikeDemand: number,
): [number, number, number, number] {
  if (parkingOcc <= 0 && bikeDemand <= 0) return [107, 114, 128, 60]; // no data

  const score = parkingOcc * (1 - bikeDemand);

  if (score <= 0.1) return [107, 114, 128, 100]; // gray - no advantage
  if (score <= 0.3) {
    // Muted green
    const t = (score - 0.1) / 0.2;
    return [107 + (34 - 107) * t, 114 + (197 - 114) * t, 128 + (94 - 128) * t, 120];
  }
  if (score <= 0.6) {
    // Green
    return [34, 197, 94, 160];
  }
  // Bright green - strong bike alternative
  return [34, 230, 110, 200];
}

/** CSS color for correlation legend */
export function correlationToCss(score: number): string {
  if (score <= 0.1) return "rgb(107, 114, 128)";
  if (score <= 0.3) {
    const t = (score - 0.1) / 0.2;
    const r = Math.round(107 + (34 - 107) * t);
    const g = Math.round(114 + (197 - 114) * t);
    const b = Math.round(128 + (94 - 128) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (score <= 0.6) return "rgb(34, 197, 94)";
  return "rgb(34, 230, 110)";
}
